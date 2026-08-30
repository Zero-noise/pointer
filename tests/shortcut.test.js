#!/usr/bin/env node
// Exercises the keyboard-shortcut guard and dispatch rules from content.js.
// content.js is far too entangled with the page to boot whole, so this slices out
// the self-contained shortcut block and runs it against a minimal DOM shim.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const contentSource = fs.readFileSync(path.join(projectRoot, 'content.js'), 'utf8');

const START = 'const TYPING_INPUT_TYPES = new Set([';
const END = '// Initialize extension';
const startIndex = contentSource.indexOf(START);
const endIndex = contentSource.indexOf(END, startIndex);
assert.ok(startIndex !== -1 && endIndex > startIndex, 'shortcut block not found in content.js');
const shortcutSource = contentSource.slice(startIndex, endIndex);

// ——— DOM shim ———
let allElements = [];

function el(tagName, attrs = {}) {
    const node = {
        nodeType: 1,
        tagName: tagName.toUpperCase(),
        attrs: { ...attrs },
        parentElement: null,
        shadowRoot: null,
        isContentEditable: Boolean(attrs.contenteditable),
        type: attrs.type,
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
        },
        hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attrs, name);
        },
        getRootNode() { return { host: null }; }
    };
    allElements.push(node);
    return node;
}

function chain(...nodes) {
    for (let i = 1; i < nodes.length; i++) nodes[i].parentElement = nodes[i - 1];
    return nodes[nodes.length - 1];
}

function makeContext(overrides = {}) {
    allElements = [];
    const body = el('body');
    const html = el('html');
    const context = {
        console,
        Date,
        Object,
        Boolean,
        String,
        Set,
        Promise,
        document: {
            body,
            documentElement: html,
            activeElement: body,
            designMode: 'off',
            hasFocus: () => true,
            querySelector(selector) {
                assert.equal(selector, '[role="application"]', 'shim only supports the application probe');
                return allElements.find((n) => n.getAttribute('role') === 'application') || null;
            }
        },
        location: { hostname: 'example.com' },
        // module-level state the block closes over
        shortcutEnabled: true,
        shortcutKey: 'KeyT',
        shortcutModifier: 'none',
        shortcutSiteOverrides: {},
        isActive: false,
        isChromeAPIAvailable: () => true,
        showTranslatorToast: () => {},
        debugLog: () => {},
        // Localized notice text comes back from the background worker.
        chrome: {
            runtime: {
                lastError: null,
                sendMessage: (_message, callback) => callback(undefined)
            }
        },
        Settings: { getSync: async () => ({}), setSync: async () => {} },
        ...overrides
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(shortcutSource, context);
    return context;
}

// Top-level `const` in a vm script lands in the context's global lexical
// environment rather than on the global object, so it is reachable by
// evaluating an expression in the same context but not as ctx.NAME.
function probe(context, expression) {
    return vm.runInContext(expression, context);
}

function keyEvent(props = {}) {
    return {
        isTrusted: true, code: 'KeyT', altKey: false, ctrlKey: false,
        metaKey: false, shiftKey: false, repeat: false, isComposing: false,
        keyCode: 84, defaultPrevented: false, ...props
    };
}

// Several checks are async. Collect what fn() returns, not just the name, so a
// rejected assertion fails the run through Promise.all rather than depending on
// Node treating an unhandled rejection as fatal.
const results = [];
const checkNames = [];
function check(name, fn) {
    checkNames.push(name);
    const outcome = fn();
    results.push(
        outcome && typeof outcome.then === 'function'
            ? outcome.then(undefined, (error) => {
                error.message = `${name}: ${error.message}`;
                throw error;
            })
            : outcome
    );
}

// ——— Mode resolution ———
check('global bare-key default resolves to none', () => {
    assert.equal(makeContext().getEffectiveShortcutMode(), 'none');
});

check('global alt setting resolves to alt', () => {
    assert.equal(makeContext({ shortcutModifier: 'alt' }).getEffectiveShortcutMode(), 'alt');
});

check('per-site override beats the global setting', () => {
    const ctx = makeContext({ shortcutSiteOverrides: { 'example.com': 'alt' } });
    assert.equal(ctx.getEffectiveShortcutMode(), 'alt');
});

check('per-site override can disable the shortcut entirely', () => {
    const ctx = makeContext({ shortcutSiteOverrides: { 'example.com': 'off' } });
    assert.equal(ctx.getEffectiveShortcutMode(), 'off');
});

check('www. is stripped when matching overrides', () => {
    const ctx = makeContext({
        location: { hostname: 'www.example.com' },
        shortcutSiteOverrides: { 'example.com': 'alt' }
    });
    assert.equal(ctx.getEffectiveShortcutMode(), 'alt');
});

check('a garbage override value falls back to the global setting', () => {
    const ctx = makeContext({ shortcutSiteOverrides: { 'example.com': 'nonsense' } });
    assert.equal(ctx.getEffectiveShortcutMode(), 'none');
});

check('an inherited Object property is not treated as an override', () => {
    const ctx = makeContext({ shortcutSiteOverrides: {} });
    assert.equal(ctx.getEffectiveShortcutMode(), 'none');
    // 'constructor' exists on Object.prototype; hasOwnProperty must reject it
    ctx.location.hostname = 'constructor';
    assert.equal(ctx.getEffectiveShortcutMode(), 'none');
});

// ——— Trigger conditions ———
check('bare mode accepts the plain key', () => {
    assert.equal(makeContext().isShortcutTrigger(keyEvent(), false), true);
});

check('bare mode rejects the key when Alt is held', () => {
    assert.equal(makeContext().isShortcutTrigger(keyEvent({ altKey: true }), false), false);
});

check('alt mode requires Alt', () => {
    const ctx = makeContext({ shortcutModifier: 'alt' });
    assert.equal(ctx.isShortcutTrigger(keyEvent(), true), false);
    assert.equal(ctx.isShortcutTrigger(keyEvent({ altKey: true }), true), true);
});

check('other modifiers are always rejected', () => {
    const ctx = makeContext();
    for (const mod of ['ctrlKey', 'metaKey', 'shiftKey']) {
        assert.equal(ctx.isShortcutTrigger(keyEvent({ [mod]: true }), false), false, mod);
    }
});

check('untrusted, repeated, composing and unfocused events are rejected', () => {
    const ctx = makeContext();
    assert.equal(ctx.isShortcutTrigger(keyEvent({ isTrusted: false }), false), false);
    assert.equal(ctx.isShortcutTrigger(keyEvent({ repeat: true }), false), false);
    assert.equal(ctx.isShortcutTrigger(keyEvent({ isComposing: true }), false), false);
    assert.equal(ctx.isShortcutTrigger(keyEvent({ keyCode: 229 }), false), false);
    ctx.document.hasFocus = () => false;
    assert.equal(ctx.isShortcutTrigger(keyEvent(), false), false);
});

check('the master switch and key binding are respected', () => {
    assert.equal(makeContext({ shortcutEnabled: false }).isShortcutTrigger(keyEvent(), false), false);
    assert.equal(makeContext().isShortcutTrigger(keyEvent({ code: 'KeyG' }), false), false);
});

check('typing contexts are rejected in both modes', () => {
    const ctx = makeContext();
    ctx.document.activeElement = el('input', { type: 'text' });
    assert.equal(ctx.isShortcutTrigger(keyEvent(), false), false);
    assert.equal(ctx.isShortcutTrigger(keyEvent({ altKey: true }), true), false);
});

// ——— Bare-key ownership guard ———
check('a page with nothing focused does not own the key', () => {
    assert.equal(makeContext().pageOwnsBareKey(), false);
});

check('plain links and buttons do not own the key', () => {
    const ctx = makeContext();
    for (const tag of ['a', 'button']) {
        ctx.document.activeElement = el(tag, { href: '#' });
        assert.equal(ctx.pageOwnsBareKey(), false, tag);
    }
});

check('author-focusable widgets own the key', () => {
    const ctx = makeContext();
    ctx.document.activeElement = el('div', { tabindex: '0' });
    assert.equal(ctx.pageOwnsBareKey(), true);
});

check('media and canvas own the key', () => {
    const ctx = makeContext();
    for (const tag of ['video', 'audio', 'canvas', 'summary']) {
        ctx.document.activeElement = el(tag);
        assert.equal(ctx.pageOwnsBareKey(), true, tag);
    }
});

check('an ARIA composite ancestor owns the key', () => {
    const ctx = makeContext();
    ctx.document.activeElement = chain(el('div', { role: 'grid' }), el('span'), el('em'));
    assert.equal(ctx.pageOwnsBareKey(), true);
});

check('a modal ancestor owns the key', () => {
    const ctx = makeContext();
    ctx.document.activeElement = chain(el('div', { 'aria-modal': 'true' }), el('span'));
    assert.equal(ctx.pageOwnsBareKey(), true);
});

check('an open dialog ancestor owns the key', () => {
    const ctx = makeContext();
    ctx.document.activeElement = chain(el('dialog', { open: '' }), el('span'));
    assert.equal(ctx.pageOwnsBareKey(), true);
});

check('designMode pages own the key', () => {
    const ctx = makeContext();
    ctx.document.designMode = 'on';
    assert.equal(ctx.pageOwnsBareKey(), true);
});

check('role=application anywhere owns the key even with nothing focused', () => {
    const ctx = makeContext();
    el('div', { role: 'application' });
    assert.equal(ctx.pageOwnsBareKey(), true);
});

check('a deep but ordinary ancestor chain does not own the key', () => {
    const ctx = makeContext();
    let node = el('div');
    for (let i = 0; i < 60; i++) node = chain(node, el('div'));
    ctx.document.activeElement = node;
    assert.equal(ctx.pageOwnsBareKey(), false);
});

// ——— Conflict self-healing ———
check('an override whose mode is invalid is ignored, not rendered as a chord', () => {
    const ctx = makeContext({ shortcutSiteOverrides: { 'example.com': 'ALT', 'other.com': 'off' } });
    // 'ALT' is not one of the three modes; the host falls through to the global
    // setting rather than resolving to something the options page could draw.
    assert.equal(ctx.getEffectiveShortcutMode(), 'none');
    assert.deepEqual(
        JSON.parse(JSON.stringify(ctx.normalizeShortcutSiteOverrides({ 'example.com': 'ALT', 'other.com': 'off' }))),
        { 'other.com': 'off' }
    );
});

check('the override map is capped and evicts the oldest entry', () => {
    const ctx = makeContext();
    const limit = probe(ctx, 'SHORTCUT_SITE_OVERRIDES_LIMIT');
    assert.equal(limit, 100);

    let overrides = {};
    for (let i = 0; i < limit; i++) {
        overrides = ctx.addShortcutSiteOverride(overrides, `site${i}.example`, 'alt');
    }
    assert.equal(Object.keys(overrides).length, limit);

    const overflowed = ctx.addShortcutSiteOverride(overrides, 'newcomer.example', 'alt');
    assert.equal(Object.keys(overflowed).length, limit);
    assert.equal(Object.prototype.hasOwnProperty.call(overflowed, 'site0.example'), false,
        'the oldest entry is the one evicted');
    assert.equal(Object.prototype.hasOwnProperty.call(overflowed, 'site1.example'), true);
    assert.equal(overflowed['newcomer.example'], 'alt');
    assert.equal(Object.keys(overflowed)[Object.keys(overflowed).length - 1], 'newcomer.example',
        'the newest entry sits at the back');
});

check('re-writing a host moves it to the back of the eviction order', () => {
    const ctx = makeContext();
    let overrides = ctx.addShortcutSiteOverride({}, 'first.example', 'alt');
    overrides = ctx.addShortcutSiteOverride(overrides, 'second.example', 'off');
    overrides = ctx.addShortcutSiteOverride(overrides, 'first.example', 'off');
    assert.deepEqual(Object.keys(overrides), ['second.example', 'first.example']);
    assert.equal(overrides['first.example'], 'off');
});

check('an unusable host or mode produces no write at all', () => {
    const ctx = makeContext();
    assert.equal(ctx.addShortcutSiteOverride({}, 'has space.example', 'alt'), null);
    assert.equal(ctx.addShortcutSiteOverride({}, 'example.com', 'sideways'), null);
    assert.equal(ctx.addShortcutSiteOverride({}, '', 'alt'), null);
});

check('three rapid undos downgrade the site to Alt', async () => {
    let written = null;
    const ctx = makeContext({
        Settings: {
            getSync: async () => ({ shortcutSiteOverrides: { 'other.com': 'off' } }),
            setSync: async (values) => { written = values; }
        }
    });

    for (let i = 0; i < 3; i++) {
        ctx.isActive = false;
        ctx.noteBareKeyToggle();   // activate
        ctx.isActive = true;
        ctx.noteBareKeyToggle();   // undo immediately
    }
    // The object is built inside the vm realm, so compare structurally rather
    // than with deepEqual, which also checks prototype identity.
    return Promise.resolve().then(() => {}).then(() => {}).then(() => {
        assert.deepEqual(JSON.parse(JSON.stringify(written)), {
            shortcutSiteOverrides: { 'other.com': 'off', 'example.com': 'alt' }
        });
    });
});

check('a failed save tells the user instead of only logging', async () => {
    const toasts = [];
    const errors = [];
    const realError = console.error;
    console.error = (...args) => { errors.push(args[0]); };
    const ctx = makeContext({
        showTranslatorToast: (message, tone) => toasts.push({ message, tone }),
        Settings: {
            getSync: async () => ({}),
            setSync: async () => { throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded'); }
        }
    });
    try {
        await ctx.downgradeShortcutForThisSite();
    } finally {
        console.error = realError;
    }
    assert.equal(toasts.length, 1, 'the user is told the exception could not be saved');
    assert.match(toasts[0].message, /could not save the exception/);
    assert.notEqual(toasts[0].tone, 'info', 'a failure is not styled as a neutral notice');
    assert.equal(errors.length, 1, 'and it is still logged for debugging');
});

check('a successful downgrade uses the background-localized text when available', async () => {
    const toasts = [];
    const ctx = makeContext({
        showTranslatorToast: (message, tone) => toasts.push({ message, tone }),
        chrome: {
            runtime: {
                lastError: null,
                sendMessage: (message, callback) => {
                    assert.equal(message.action, 'localizeMessage');
                    assert.equal(message.messageKey, 'shortcutConflictDowngraded');
                    assert.equal(message.params.key, 'T');
                    callback({ text: `LOCALIZED ${message.params.key}/${message.params.chord}` });
                }
            }
        },
        Settings: { getSync: async () => ({}), setSync: async () => {} }
    });
    await ctx.downgradeShortcutForThisSite();
    assert.deepEqual(toasts, [{ message: 'LOCALIZED T/Alt+T', tone: 'info' }]);
});

check('an unavailable background falls back to built-in English', async () => {
    const toasts = [];
    const ctx = makeContext({
        showTranslatorToast: (message, tone) => toasts.push({ message, tone }),
        chrome: {
            runtime: {
                lastError: { message: 'Receiving end does not exist' },
                sendMessage: (_message, callback) => callback(undefined)
            }
        },
        Settings: { getSync: async () => ({}), setSync: async () => {} }
    });
    await ctx.downgradeShortcutForThisSite();
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].message, /clashes on this site/);
    assert.equal(toasts[0].tone, 'info');
});

check('deliberate slow toggling never downgrades', async () => {
    let written = null;
    const ctx = makeContext({
        Settings: { getSync: async () => ({}), setSync: async (v) => { written = v; } }
    });
    const realNow = Date.now;
    let clock = 1_000_000;
    global.Date.now = () => clock;
    try {
        for (let i = 0; i < 6; i++) {
            ctx.isActive = false;
            ctx.noteBareKeyToggle();
            clock += 5000;             // well past the 1200ms undo window
            ctx.isActive = true;
            ctx.noteBareKeyToggle();
            clock += 5000;
        }
    } finally {
        global.Date.now = realNow;
    }
    return Promise.resolve().then(() => {
        assert.equal(written, null);
    });
});

check('key labels render for letters, digits and punctuation', () => {
    const ctx = makeContext();
    assert.equal(ctx.formatShortcutKeyLabel('KeyT'), 'T');
    assert.equal(ctx.formatShortcutKeyLabel('Digit4'), '4');
    assert.equal(ctx.formatShortcutKeyLabel('F7'), 'F7');
    assert.equal(ctx.formatShortcutKeyLabel('Slash'), '/');
    assert.equal(ctx.formatShortcutKeyLabel(''), 'T');
});

// ——— Platform labels ———
// Alt is Option on a Mac. Only the printed label changes: matching runs on
// e.code, so the same stored binding works on both platforms.
check('chord labels follow the platform', () => {
    const win = makeContext({ navigator: { platform: 'Win32' } });
    assert.equal(win.formatShortcutChord('T', true), 'Alt+T');
    assert.equal(win.formatShortcutChord('T', false), 'T', 'a bare key never shows a modifier');

    const mac = makeContext({ navigator: { platform: 'MacIntel' } });
    assert.equal(mac.formatShortcutChord('T', true), '\u2325T', 'Mac stacks the glyph, no separator');
    assert.equal(mac.formatShortcutChord('/', true), '\u2325/');
    assert.equal(mac.formatShortcutChord('', true), '\u2325T', 'falls back to the default key');

    // userAgentData is preferred but only exists on newer Chrome
    const macUAD = makeContext({ navigator: { userAgentData: { platform: 'macOS' }, platform: '' } });
    assert.equal(macUAD.formatShortcutChord('T', true), '\u2325T');

    // No navigator at all must not throw — it just reads as non-Mac.
    assert.equal(makeContext().formatShortcutChord('T', true), 'Alt+T');
});

// ——— Drift: content.js vs settings.js ———
// content.js hand-copies these helpers because the manifest injects only
// content.js into pages, so it can never reach PointerSettings. A copy that
// drifts is the whole risk, so pin every one of them to the shared original
// rather than trusting the comment that says to keep them synced.
function loadSharedSettings() {
    const settingsSource = fs.readFileSync(path.join(projectRoot, 'settings.js'), 'utf8');
    const sandbox = {
        console, TextEncoder, TextDecoder, Promise, Object, Array,
        String, Set, Math, JSON, Date, RegExp, Error, URL
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(settingsSource, sandbox, { filename: 'settings.js' });
    return sandbox.PointerSettings;
}

// Structural compare: the two objects are built in different vm realms, so
// deepEqual would fail on prototype identity alone.
const plain = (value) => (value === null ? null : JSON.parse(JSON.stringify(value)));

const HOST_CASES = [
    // browser-valid hostnames, exactly as location.hostname reports them
    'example.com', 'www.example.com', 'WWW.Example.COM', 'sub.domain.example.co.uk',
    'localhost', 'my-host.example', 'xn--fsq.xn--0zwm56d', 'a.b.c.d.e.f.example',
    'host123.example', '192.168.1.20', '127.0.0.1', '10.0.0.7',
    // IPv6 literals, bracketed the way location.hostname returns them
    '[::1]', '[fd12:3456::7]', '[FD12:3456::7]', '[2001:db8::1]', 'fd12:3456::7',
    // hosts that must normalize away
    '', '   ', 'has space.example', 'under_score.example', 'quote".example',
    'semi;colon.example', 'sla/sh.example', 'percent%20.example', 'x'.repeat(254),
    'wwwnotprefix.example', 'www..example', 'www.', 'UPPER.EXAMPLE',
    // non-string inputs
    null, undefined, 0, 42, true, {}, []
];

const MODE_CASES = [
    'none', 'alt', 'off',
    'NONE', 'Alt', 'OFF', 'on', '', ' alt', 'alt ', 'nonealt',
    null, undefined, 0, 1, true, false, {}, [], ['alt']
];

check('content.js and settings.js agree on host normalization', () => {
    const shared = loadSharedSettings();
    const embedded = makeContext();
    for (const host of HOST_CASES) {
        assert.equal(
            embedded.normalizeShortcutHost(host),
            shared.normalizeShortcutHost(host),
            `host normalization drift for ${JSON.stringify(host)}`
        );
    }
});

check('content.js and settings.js agree on which modes are valid', () => {
    const shared = loadSharedSettings();
    const embedded = makeContext();
    for (const mode of MODE_CASES) {
        assert.equal(
            embedded.normalizeShortcutMode(mode),
            shared.normalizeShortcutMode(mode),
            `mode validation drift for ${JSON.stringify(mode)}`
        );
    }
});

check('content.js and settings.js agree on override-map normalization', () => {
    const shared = loadSharedSettings();
    const embedded = makeContext();

    const maps = [
        {},
        { 'example.com': 'alt' },
        { 'WWW.Example.COM': 'ALT', 'other.example': 'off' },
        { 'www.example.com': 'none', 'example.com': 'alt' },
        { '[fd12:3456::7]': 'alt', '[::1]': 'off' },
        { 'has space.example': 'alt', 'good.example': 'alt' },
        { 'under_score.example': 'off' },
        { 'example.com': null, 'other.example': undefined, 'third.example': 'off' },
        { ['x'.repeat(254)]: 'alt' },
        null, undefined, 'nonsense', 42, ['alt'], [{ 'example.com': 'alt' }]
    ];
    for (const map of maps) {
        assert.deepEqual(
            plain(embedded.normalizeShortcutSiteOverrides(map)),
            plain(shared.normalizeShortcutSiteOverrides(map)),
            `override normalization drift for ${JSON.stringify(map)}`
        );
    }

    // Over-capacity maps must be trimmed identically, from the same end.
    const oversized = {};
    for (let i = 0; i < shared.SHORTCUT_SITE_OVERRIDES_LIMIT + 25; i++) {
        oversized[`site${i}.example`] = i % 2 ? 'alt' : 'off';
    }
    assert.equal(probe(embedded, 'SHORTCUT_SITE_OVERRIDES_LIMIT'), shared.SHORTCUT_SITE_OVERRIDES_LIMIT);
    assert.deepEqual(
        plain(embedded.normalizeShortcutSiteOverrides(oversized)),
        plain(shared.normalizeShortcutSiteOverrides(oversized))
    );
    assert.equal(
        Object.keys(embedded.normalizeShortcutSiteOverrides(oversized)).length,
        shared.SHORTCUT_SITE_OVERRIDES_LIMIT
    );
});

check('content.js and settings.js agree on insertion and eviction', () => {
    const shared = loadSharedSettings();
    const embedded = makeContext();
    const seeds = [{}, { 'seed.example': 'off' }, { 'example.com': 'none' }];
    for (const seed of seeds) {
        for (const host of HOST_CASES) {
            for (const mode of ['alt', 'off', 'bogus']) {
                assert.deepEqual(
                    plain(embedded.addShortcutSiteOverride(seed, host, mode)),
                    plain(shared.addShortcutSiteOverride(seed, host, mode)),
                    `insertion drift for ${JSON.stringify(host)} -> ${mode}`
                );
            }
        }
    }
});

check('content.js and settings.js agree on resolved shortcut mode', () => {
    const shared = loadSharedSettings();
    const overrideMaps = [
        {},
        { 'example.com': 'alt' },
        { 'example.com': 'off' },
        { 'example.com': 'bogus' },
        { 'other.example': 'alt' },
        { '[fd12:3456::7]': 'off' },
        null,
        ['alt']
    ];
    for (const hostname of ['example.com', 'www.example.com', '[fd12:3456::7]', 'has space.example', '']) {
        for (const modifier of ['none', 'alt', 'bogus', undefined]) {
            for (const overrides of overrideMaps) {
                const embedded = makeContext({
                    location: { hostname },
                    shortcutModifier: modifier,
                    shortcutSiteOverrides: overrides
                });
                assert.equal(
                    embedded.getEffectiveShortcutMode(),
                    shared.resolveShortcutMode(hostname, modifier, overrides),
                    `resolution drift for ${hostname} / ${modifier} / ${JSON.stringify(overrides)}`
                );
            }
        }
    }
});

check('content.js and settings.js agree on every chord', () => {
    const shared = loadSharedSettings();

    for (const nav of [
        { platform: 'MacIntel' },
        { platform: 'Win32' },
        { platform: 'Linux x86_64' },
        { userAgentData: { platform: 'macOS' } },
        { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    ]) {
        const embedded = makeContext({ navigator: nav });
        for (const key of ['T', '/', 'F7', '4']) {
            for (const withAlt of [true, false]) {
                assert.equal(
                    embedded.formatShortcutChord(key, withAlt),
                    shared.formatShortcutChord(key, withAlt, nav),
                    `chord drift for ${key} (alt=${withAlt}) on ${JSON.stringify(nav)}`
                );
            }
        }
    }
});

Promise.all(results).then(() => {
    console.log(`shortcut: ok (${checkNames.length} checks)`);
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
