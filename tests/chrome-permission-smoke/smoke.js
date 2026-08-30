'use strict';

// Each step that calls permissions.request() is exposed separately so the CDP
// runner can drive it with its own userGesture — Chrome requires user
// activation for request(), and one activation is not guaranteed to survive a
// whole sequence of them.

const BROAD = 'https://smoke.pointer.test/*';
const EXACT = 'https://smoke.pointer.test:443/*';
const OTHER_PORT = 'https://smoke.pointer.test:8443/*';
const IPV6 = 'http://[fd12:3456::7]:1234/*';
const LAN = 'http://192.168.50.23:1234/*';

function request(origins) {
    return new Promise((resolve) => {
        try {
            chrome.permissions.request({ origins }, (granted) => {
                resolve(chrome.runtime.lastError
                    ? { ok: false, error: chrome.runtime.lastError.message }
                    : { ok: true, value: Boolean(granted) });
            });
        } catch (error) {
            resolve({ ok: false, error: String(error && error.message || error) });
        }
    });
}

function contains(origins) {
    return new Promise((resolve) => {
        try {
            chrome.permissions.contains({ origins }, (allowed) => {
                resolve(chrome.runtime.lastError
                    ? { ok: false, error: chrome.runtime.lastError.message }
                    : { ok: true, value: Boolean(allowed) });
            });
        } catch (error) {
            resolve({ ok: false, error: String(error && error.message || error) });
        }
    });
}

function remove(origins) {
    return new Promise((resolve) => {
        try {
            chrome.permissions.remove({ origins }, (removed) => {
                resolve(chrome.runtime.lastError
                    ? { ok: false, error: chrome.runtime.lastError.message }
                    : { ok: true, value: Boolean(removed) });
            });
        } catch (error) {
            resolve({ ok: false, error: String(error && error.message || error) });
        }
    });
}

function getAll() {
    return new Promise((resolve) => {
        chrome.permissions.getAll((permissions) => resolve(permissions.origins || []));
    });
}

// ——— Individual steps, each safe to call from its own Runtime.evaluate ———
const steps = {
    // Does Chrome accept these pattern shapes at all? A malformed pattern
    // rejects synchronously with "Invalid value for origins".
    async patternShapes() {
        return {
            exactPort: await request([EXACT]),
            ipv6WithPort: await request([IPV6]),
            lanWithPort: await request([LAN])
        };
    },

    async resetAll() {
        await remove([EXACT, OTHER_PORT, IPV6, LAN, BROAD]);
        return { origins: await getAll() };
    },

    async grantBroad() {
        return { granted: await request([BROAD]), origins: await getAll() };
    },

    // With the host-wide grant held, is the port-scoped form already contained?
    async containsExactUnderBroad() {
        return {
            exact: await contains([EXACT]),
            otherPort: await contains([OTHER_PORT]),
            broad: await contains([BROAD])
        };
    },

    // The migration itself, exactly as options.js performs it.
    async requestExactWhileBroadHeld() {
        return { granted: await request([EXACT]), origins: await getAll() };
    },

    async removeBroad() {
        return { removed: await remove([BROAD]), origins: await getAll() };
    },

    // THE decisive check: did the port-scoped grant survive removal of the
    // host-wide one?
    async containsExactAfterRemovingBroad() {
        return {
            exact: await contains([EXACT]),
            otherPort: await contains([OTHER_PORT]),
            broad: await contains([BROAD]),
            origins: await getAll()
        };
    },

    // The recovery path options.js falls back to when it did not survive.
    async reRequestExact() {
        return {
            granted: await request([EXACT]),
            exact: await contains([EXACT]),
            otherPort: await contains([OTHER_PORT]),
            origins: await getAll()
        };
    },

    async finalState() {
        return {
            exact: await contains([EXACT]),
            otherPort: await contains([OTHER_PORT]),
            broad: await contains([BROAD]),
            origins: await getAll()
        };
    }
};

// One-shot sequence for the manual (click-through) path.
async function runAll() {
    const report = {};
    for (const name of [
        'resetAll', 'patternShapes', 'resetAll', 'grantBroad', 'containsExactUnderBroad',
        'requestExactWhileBroadHeld', 'removeBroad', 'containsExactAfterRemovingBroad',
        'reRequestExact', 'finalState'
    ]) {
        report[`${Object.keys(report).length}_${name}`] = await steps[name]();
    }
    return report;
}

globalThis.pointerSmoke = { steps, runAll, patterns: { BROAD, EXACT, OTHER_PORT, IPV6, LAN } };

document.getElementById('run').addEventListener('click', async () => {
    document.getElementById('out').textContent = 'Running…';
    document.getElementById('out').textContent = JSON.stringify(await runAll(), null, 2);
});
document.getElementById('reset').addEventListener('click', async () => {
    document.getElementById('out').textContent = JSON.stringify(await steps.resetAll(), null, 2);
});
