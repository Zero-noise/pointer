#!/usr/bin/env node
// Decision-table coverage for options.js narrowLegacyHostPermission().
//
// The real browser check lives in tests/chrome-permission-smoke.js, but it needs
// a Chromium binary and cannot run everywhere. This runs the actual production
// function — sliced out of options.js, not reimplemented — against BOTH ways
// Chrome could plausibly behave, because the interaction between a host-wide
// grant and a port-scoped one for the same host is undocumented:
//
//   "union"   request() stores the narrow pattern alongside the broad one, so
//             removing the broad one leaves the narrow one standing.
//   "noop"    request() sees the broad grant already covers the narrow pattern
//             and stores nothing, so removing the broad one revokes everything.
//
// Whichever model holds, narrowing must never leave the extension with less
// access than it started with, and Verify must never be left un-runnable.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const optionsSource = fs.readFileSync(path.join(projectRoot, 'options.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(projectRoot, 'settings.js'), 'utf8');

// Slice a top-level-in-closure function (4-space indent) out of options.js by
// name, so this test exercises the shipped code rather than a copy of it.
function extractFunction(source, name) {
    const start = source.search(new RegExp(`^ {4}(?:async )?function ${name}\\(`, 'm'));
    assert.notEqual(start, -1, `options.js no longer defines ${name}()`);
    const end = source.indexOf('\n    }\n', start);
    assert.notEqual(end, -1, `could not find the end of ${name}()`);
    return source.slice(start, end + '\n    }\n'.length);
}

const PRODUCTION_FUNCTIONS = [
    'requestApiHostPermissionPattern',
    'containsApiHostPermissionPattern',
    'removeApiHostPermissionPattern',
    'narrowLegacyHostPermission'
].map((name) => extractFunction(optionsSource, name)).join('\n');

// ——— A match-pattern-aware fake of chrome.permissions ———
function parsePattern(pattern) {
    const match = /^(https?):\/\/(\[[^\]]+\]|[^/:]+)(?::(\d+|\*))?\/\*$/.exec(pattern);
    assert.ok(match, `the fake permissions store cannot parse ${pattern}`);
    return { scheme: match[1], host: match[2], port: match[3] || '*' };
}

// Does `granted` cover `wanted`? A pattern with no explicit port covers all
// ports, which is exactly the legacy-vs-exact relationship under test.
function covers(granted, wanted) {
    const g = parsePattern(granted);
    const w = parsePattern(wanted);
    return g.scheme === w.scheme && g.host === w.host && (g.port === '*' || g.port === w.port);
}

function createPermissionsFake({ model, granted = [], failRequests = false, log = [] }) {
    const store = new Set(granted);
    return {
        log,
        store,
        api: {
            request({ origins }, callback) {
                log.push(['request', ...origins]);
                if (failRequests) {
                    // What Chrome does when there is no user activation left.
                    callback(false);
                    return;
                }
                for (const origin of origins) {
                    const alreadyCovered = [...store].some((p) => covers(p, origin));
                    // The whole point of the two models: does an
                    // already-covered request actually store the pattern?
                    if (!alreadyCovered || model === 'union') store.add(origin);
                }
                callback(true);
            },
            contains({ origins }, callback) {
                log.push(['contains', ...origins]);
                callback(origins.every((origin) => [...store].some((p) => covers(p, origin))));
            },
            remove({ origins }, callback) {
                log.push(['remove', ...origins]);
                // permissions.remove() deletes the named pattern; it does not
                // subtract geometry from other patterns.
                let removed = false;
                for (const origin of origins) removed = store.delete(origin) || removed;
                callback(removed);
            }
        }
    };
}

function createHarness(options) {
    const permissions = createPermissionsFake(options);
    const context = {
        console,
        Promise,
        Boolean,
        Error,
        Set,
        Object,
        URL,
        TextEncoder,
        TextDecoder,
        JSON,
        Date,
        RegExp,
        String,
        Array,
        Math
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(settingsSource, context, { filename: 'settings.js' });
    context.Settings = context.PointerSettings;
    context.chrome = { permissions: permissions.api, runtime: { lastError: null } };
    vm.runInContext(PRODUCTION_FUNCTIONS, context, { filename: 'options.js (slice)' });
    return { context, permissions };
}

const EXACT = 'https://api.openai.com:443/*';
const LEGACY = 'https://api.openai.com/*';
const BASE_URL = 'https://api.openai.com/v1';

const checks = [];
async function check(name, fn) {
    await fn();
    checks.push(name);
}

async function run() {
    // The patterns the production code derives must be the ones this test
    // reasons about; otherwise the whole table is about the wrong strings.
    await check('the shared helpers derive the expected pattern pair', async () => {
        const { context } = createHarness({ model: 'union' });
        assert.equal(context.Settings.getHostPermissionPattern(BASE_URL), EXACT);
        assert.equal(context.Settings.getLegacyHostPermissionPattern(BASE_URL), LEGACY);
    });

    for (const model of ['union', 'noop']) {
        await check(`[${model}] an updating install is narrowed to the exact port`, async () => {
            const { context, permissions } = createHarness({ model, granted: [LEGACY] });
            // Verify requests the exact pattern first, exactly as the click does.
            await vm.runInContext(`requestApiHostPermissionPattern(${JSON.stringify(EXACT)})`, context);

            const result = await vm.runInContext(
                `narrowLegacyHostPermission(${JSON.stringify(BASE_URL)})`, context);
            assert.equal(result, 'narrowed', 'the migration must complete');

            // End state: exact port granted, no host-wide grant, no other port.
            const contains = (pattern) => vm.runInContext(
                `containsApiHostPermissionPattern(${JSON.stringify(pattern)})`, context);
            assert.equal(await contains(EXACT), true, 'the endpoint must still be reachable');
            assert.equal(await contains('https://api.openai.com:8443/*'), false,
                'narrowing must actually narrow');
            assert.equal(permissions.store.has(LEGACY), false, 'the legacy grant must be gone');
        });

        await check(`[${model}] a fresh install with only the exact grant is left alone`, async () => {
            const { context, permissions } = createHarness({ model, granted: [EXACT] });
            const result = await vm.runInContext(
                `narrowLegacyHostPermission(${JSON.stringify(BASE_URL)})`, context);
            assert.equal(result, 'unchanged');
            assert.deepEqual([...permissions.store], [EXACT]);
            assert.equal(
                permissions.log.some(([method]) => method === 'remove'),
                false,
                'nothing should be removed when there is no legacy grant'
            );
        });

        await check(`[${model}] no grant at all is left alone`, async () => {
            const { context, permissions } = createHarness({ model, granted: [] });
            const result = await vm.runInContext(
                `narrowLegacyHostPermission(${JSON.stringify(BASE_URL)})`, context);
            assert.equal(result, 'unchanged');
            assert.equal(permissions.store.size, 0);
        });
    }

    // An http endpoint on a non-default port: legacy and exact differ, so the
    // same migration applies.
    await check('a LAN endpoint on a custom port is narrowed too', async () => {
        const lanUrl = 'http://192.168.50.23:1234/v1';
        const { context, permissions } = createHarness({
            model: 'noop', granted: ['http://192.168.50.23/*']
        });
        await vm.runInContext(
            'requestApiHostPermissionPattern("http://192.168.50.23:1234/*")', context);
        const result = await vm.runInContext(
            `narrowLegacyHostPermission(${JSON.stringify(lanUrl)})`, context);
        assert.equal(result, 'narrowed');
        assert.deepEqual([...permissions.store], ['http://192.168.50.23:1234/*']);
    });

    // A default-port URL where legacy and exact would be identical strings is
    // impossible (the exact form always names the port), but an https URL that
    // already carries :443 explicitly must not double-migrate.
    await check('an endpoint already at the exact pattern is a no-op', async () => {
        const { context, permissions } = createHarness({ model: 'union', granted: [EXACT] });
        const result = await vm.runInContext(
            'narrowLegacyHostPermission("https://api.openai.com:443/v1")', context);
        assert.equal(result, 'unchanged');
        assert.deepEqual([...permissions.store], [EXACT]);
    });

    // ——— The failure the user must never experience ———
    await check('access is restored when the re-request cannot be granted', async () => {
        // 'noop' + failing requests is the worst case: removing the broad grant
        // revoked everything AND the browser will not hand anything back.
        const { context, permissions } = createHarness({ model: 'noop', granted: [LEGACY] });
        // The exact pattern is covered by the legacy grant but not stored.
        permissions.api.request = ((original) => function (details, callback) {
            // Fail only the recovery requests, not the initial one.
            permissions.log.push(['request(blocked)', ...details.origins]);
            callback(false);
        })(permissions.api.request);

        const result = await vm.runInContext(
            `narrowLegacyHostPermission(${JSON.stringify(BASE_URL)})`, context);
        assert.equal(result, 'lost',
            'the caller must be told access was lost so Verify can stop with a clear message');
        // And the caller does stop: options.js turns 'lost' into a thrown error.
        assert.match(optionsSource, /narrowResult === 'lost'/);
        assert.match(optionsSource, /Click Verify once more/);
    });

    await check('the broad grant is put back when only the exact re-request fails', async () => {
        const { context, permissions } = createHarness({ model: 'noop', granted: [LEGACY] });
        let seenExactRequest = false;
        const realRequest = permissions.api.request;
        permissions.api.request = function (details, callback) {
            if (details.origins.includes(EXACT) && !seenExactRequest) {
                seenExactRequest = true;
                callback(false); // Chrome refuses the narrow one
                return;
            }
            realRequest.call(this, details, callback);
        };

        const result = await vm.runInContext(
            `narrowLegacyHostPermission(${JSON.stringify(BASE_URL)})`, context);
        assert.equal(result, 'restored');
        assert.equal(permissions.store.has(LEGACY), true,
            'the user keeps the access they had before the attempt');
    });

    await check('the broad grant is never removed while the exact one is not held', async () => {
        // Legacy present, but contains(exact) answers false — a Chrome that does
        // not treat a port-less pattern as covering :443. Removing would be a
        // pure downgrade, so it must not happen.
        const { context, permissions } = createHarness({ model: 'union', granted: [LEGACY] });
        const realContains = permissions.api.contains;
        permissions.api.contains = function (details, callback) {
            if (details.origins.includes(EXACT)) {
                callback(false);
                return;
            }
            realContains.call(this, details, callback);
        };
        const result = await vm.runInContext(
            `narrowLegacyHostPermission(${JSON.stringify(BASE_URL)})`, context);
        assert.equal(result, 'unchanged');
        assert.equal(permissions.store.has(LEGACY), true);
        assert.equal(permissions.log.some(([method]) => method === 'remove'), false);
    });

    console.log(`permission-migration: ok (${checks.length} checks)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
