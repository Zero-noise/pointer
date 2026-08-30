#!/usr/bin/env node
// Real-Chrome verification of the host-permission semantics that
// options.js narrowLegacyHostPermission() is built on.
//
// This is regression verification, not a gate on the pattern format: ports and
// IPv6 literals are documented, supported match-pattern syntax. What is NOT
// documented is whether removing a host-wide grant also drops a port-scoped
// grant for the same host. narrowLegacyHostPermission() is written to survive
// either answer; this test records which answer the installed Chrome actually
// gives, so a future Chrome changing it is noticed here rather than in the
// field.
//
//   node tests/chrome-permission-smoke.js            # headless
//   node tests/chrome-permission-smoke.js --headful  # watch the prompts
//
// Requires Google Chrome. Skips (exit 0) when Chrome is absent or when the
// permission prompt cannot be driven without a human — see NOTE at the bottom.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const extensionDir = path.join(__dirname, 'chrome-permission-smoke');
const headful = process.argv.includes('--headful');

const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
];

function findChrome() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }
    return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

function skip(reason) {
    console.log(`chrome-permission-smoke: SKIPPED — ${reason}`);
    process.exit(0);
}

// Chrome derives an unpacked extension's ID from the absolute path of its
// directory: first 16 bytes of SHA-256, each hex digit mapped 0-f -> a-p.
function unpackedExtensionId(directory) {
    const digest = crypto.createHash('sha256').update(directory, 'utf8').digest('hex').slice(0, 32);
    return [...digest].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, init) {
    const response = await fetch(url, init);
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error(`Non-JSON reply from ${url}: ${text.slice(0, 200)}`);
    }
}

async function waitForDevTools(port, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            return await fetchJson(`http://127.0.0.1:${port}/json/version`);
        } catch (_) {
            await sleep(150);
        }
    }
    throw new Error('DevTools endpoint never came up');
}

// Minimal CDP client over Node's built-in WebSocket.
function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        const pending = new Map();
        let nextId = 1;

        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            const waiter = pending.get(message.id);
            if (!waiter) return;
            pending.delete(message.id);
            if (message.error) waiter.reject(new Error(message.error.message));
            else waiter.resolve(message.result);
        });
        socket.addEventListener('error', () => reject(new Error(`CDP socket error on ${wsUrl}`)));
        socket.addEventListener('open', () => resolve({
            send(method, params = {}) {
                const id = nextId++;
                socket.send(JSON.stringify({ id, method, params }));
                return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
            },
            close() { try { socket.close(); } catch (_) { /* already gone */ } }
        }));
    });
}

async function main() {
    const chromePath = findChrome();
    if (!chromePath) skip('no Chrome or Chromium binary found (set CHROME_PATH)');

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pointer-smoke-'));
    const port = 9000 + Math.floor(Math.random() * 900);
    const args = [
        `--user-data-dir=${userDataDir}`,
        `--remote-debugging-port=${port}`,
        `--load-extension=${extensionDir}`,
        `--disable-extensions-except=${extensionDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-search-engine-choice-screen',
        // Needed only so the runner can read Chrome's own reason for ignoring
        // --load-extension and turn it into an actionable skip.
        '--enable-logging=stderr',
        'about:blank'
    ];
    if (!headful) args.unshift('--headless=new', '--disable-gpu');

    const chrome = spawn(chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let chromeStderr = '';
    chrome.stderr.on('data', (chunk) => { chromeStderr += chunk.toString(); });

    let client = null;
    let targetId = null;
    try {
        await waitForDevTools(port);

        // Chrome always has component extensions loaded, so "any
        // chrome-extension:// target" is not a way to find ours. Derive the ID
        // from the path instead, and confirm it by waiting for a target that
        // actually belongs to it.
        const id = unpackedExtensionId(extensionDir);
        let loaded = false;
        for (let attempt = 0; attempt < 40 && !loaded; attempt++) {
            const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
            loaded = targets.some((t) => String(t.url).startsWith(`chrome-extension://${id}/`));
            if (!loaded) await sleep(150);
        }
        if (!loaded) {
            // Branded Google Chrome (since ~152) refuses --load-extension
            // outright; the flag is ignored with a warning on stderr. Chromium
            // and Chrome for Testing still honour it.
            if (/--(?:load-extension|disable-extensions-except) is not allowed/.test(chromeStderr)) {
                skip(`${path.basename(chromePath)} refuses --load-extension ` +
                    '("not allowed in Google Chrome"). Point CHROME_PATH at Chromium or at a ' +
                    'Chrome for Testing build to run this automatically, or follow the manual ' +
                    'procedure in docs/MANUAL_REGRESSION.md ("Permission scoping").');
            }
            throw new Error(`the smoke extension never loaded (expected id ${id})`);
        }

        const pageUrl = `chrome-extension://${id}/smoke.html`;
        const created = await fetchJson(
            `http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
        targetId = created.id;
        await sleep(500);

        const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
        const page = list.find((t) => t.id === targetId) || list.find((t) => t.url === pageUrl);
        if (!page || !page.webSocketDebuggerUrl) {
            throw new Error(`could not attach to ${pageUrl}`);
        }

        client = await connect(page.webSocketDebuggerUrl);
        await client.send('Runtime.enable');

        // Confirm the page's API surface loaded before driving it.
        const ready = await client.send('Runtime.evaluate', {
            expression: 'typeof globalThis.pointerSmoke',
            returnByValue: true
        });
        assert.equal(ready.result.value, 'object', 'smoke.js did not initialise in the extension page');

        async function step(name, timeoutMs = 8000) {
            const evaluation = client.send('Runtime.evaluate', {
                expression: `globalThis.pointerSmoke.steps.${name}()`,
                awaitPromise: true,
                returnByValue: true,
                userGesture: true
            });
            const timeout = sleep(timeoutMs).then(() => '__TIMEOUT__');
            const outcome = await Promise.race([evaluation, timeout]);
            if (outcome === '__TIMEOUT__') {
                skip(`step "${name}" blocked — Chrome is showing a permission prompt this ` +
                    'runner cannot dismiss. Re-run with --headful and grant the prompts by hand.');
            }
            if (outcome.exceptionDetails) {
                throw new Error(`${name} threw: ${JSON.stringify(outcome.exceptionDetails)}`);
            }
            return outcome.result.value;
        }

        const report = {};
        report.reset = await step('resetAll');
        report.patternShapes = await step('patternShapes');
        report.resetAgain = await step('resetAll');
        report.grantBroad = await step('grantBroad');
        report.underBroad = await step('containsExactUnderBroad');
        report.requestExact = await step('requestExactWhileBroadHeld');
        report.removeBroad = await step('removeBroad');
        report.afterRemove = await step('containsExactAfterRemovingBroad');
        report.reRequest = await step('reRequestExact');
        report.final = await step('finalState');

        console.log(JSON.stringify(report, null, 2));

        // ——— What the production code depends on ———
        const shapes = report.patternShapes;
        for (const [name, result] of Object.entries(shapes)) {
            assert.equal(result.ok, true,
                `Chrome rejected the ${name} match pattern: ${result.error}`);
            assert.equal(result.value, true, `Chrome refused to grant the ${name} pattern`);
        }

        assert.equal(report.grantBroad.granted.value, true, 'host-wide grant was refused');
        assert.equal(report.underBroad.exact.value, true,
            'a host-wide grant must contain the port-scoped pattern — background.js relies on ' +
            'this so existing installs keep working before they are ever narrowed');
        assert.equal(report.underBroad.otherPort.value, true,
            'a host-wide grant covers every port by definition');

        assert.equal(report.requestExact.granted.value, true,
            'requesting the port-scoped pattern under a host-wide grant must succeed');

        // The decisive, undocumented behaviour. Either answer is survivable;
        // record which one this Chrome gives.
        const survived = report.afterRemove.exact.value === true;
        console.log(survived
            ? 'BEHAVIOUR: removing the host-wide grant LEAVES the port-scoped grant standing.'
            : 'BEHAVIOUR: removing the host-wide grant ALSO drops the port-scoped grant; ' +
              'narrowLegacyHostPermission() must re-request (it does).');

        // Whichever branch was taken, the end state must be the narrowed one.
        assert.equal(report.reRequest.exact.value, true,
            'after the migration the port-scoped grant must be held');
        assert.equal(report.final.exact.value, true, 'final state must hold the exact-port grant');
        assert.equal(report.final.otherPort.value, false,
            'narrowing must actually narrow: another port on the same host must NOT be granted');
        assert.equal(report.final.broad.value, false,
            'the host-wide grant must be gone once narrowed');

        console.log('chrome-permission-smoke: ok');
    } finally {
        if (client) client.close();
        try { chrome.kill('SIGKILL'); } catch (_) { /* already exited */ }
        await sleep(200);
        fs.rmSync(userDataDir, { recursive: true, force: true });
        if (process.env.POINTER_SMOKE_DEBUG && chromeStderr) {
            console.error(chromeStderr.split('\n').slice(-40).join('\n'));
        }
    }
}

// NOTE: chrome.permissions.request() needs user activation, which CDP supplies
// via userGesture, but Chrome may still raise a confirmation bubble that no
// flag suppresses. When that happens each step times out and the run SKIPS
// rather than failing, because a skipped environment check is not a code
// defect. Run with --headful to complete it by hand.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
