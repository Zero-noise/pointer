#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const block = source.slice(source.indexOf('const TRANSLATION_IDLE_ALARM ='), source.indexOf('function openOptionsPage()'));
const settingsSource = fs.readFileSync(path.join(root, 'settings.js'), 'utf8');
const minute = 60_000;

function fixture(existing = {}) {
    const data = existing.data || { sync: { translationIdleEnabled: true, translationIdleMinutes: 6 }, local: { isActive: true } };
    const clock = existing.clock || { now: 1_000_000 };
    let alarm, onAlarm, onChanged, pauseRead;
    const writes = [];
    const context = vm.createContext({
        console, Date: class extends Date { static now() { return clock.now; } },
        waitForSecureLocalState: async () => {},
        chrome: {
            tabs: { query: async () => [] },
            alarms: {
                clear: async () => { alarm = undefined; },
                create: async (name, options) => { alarm = { name, ...options }; },
                onAlarm: { addListener(fn) { onAlarm = fn; } }
            },
            storage: { onChanged: { addListener(fn) { onChanged = fn; } } }
        }
    });
    vm.runInContext(settingsSource, context);
    context.Settings = {
        normalizeTranslationIdleMinutes: context.PointerSettings.normalizeTranslationIdleMinutes,
        getSync: async () => ({ ...data.sync }),
        getLocal: async () => { if (pauseRead) { const wait = pauseRead; pauseRead = null; await wait; } return { ...data.local }; },
        setLocal: async values => {
            writes.push(values);
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
                if (data.local[key] !== value) changes[key] = { oldValue: data.local[key], newValue: value };
            }
            Object.assign(data.local, values);
            onChanged(changes, 'local');
        },
        removeLocal: async keys => { keys.forEach(key => delete data.local[key]); },
        setSync: async values => {
            writes.push(values);
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
                if (data.sync[key] !== value) changes[key] = { oldValue: data.sync[key], newValue: value };
            }
            Object.assign(data.sync, values);
            onChanged(changes, 'sync');
        }
    };
    vm.runInContext(block, context);
    return {
        data, clock, writes, context,
        get alarm() { return alarm; },
        async drain() {
            let pending;
            do { pending = vm.runInContext('translationIdleQueue', context); await pending; }
            while (pending !== vm.runInContext('translationIdleQueue', context));
        },
        use() { return context.updateTranslationIdle(true); },
        fire() { onAlarm({ name: 'pointer-translation-idle' }); },
        change(values) { return Object.hasOwn(values, 'isActive')
            ? context.Settings.setLocal(values) : context.Settings.setSync(values); },
        pause(promise) { pauseRead = promise; }
    };
}

(async () => {
    const f = fixture();
    await f.drain();
    assert.equal(f.alarm.when, f.clock.now + 6 * minute, 'activation starts six-minute lease');
    f.clock.now += 5 * minute;
    await f.use(); // A request from any tab uses the same worker deadline.
    assert.equal(f.alarm.when, f.clock.now + 6 * minute);
    f.clock.now += minute;
    f.fire(); await f.drain();
    assert.equal(f.data.local.isActive, true, 'old alarm cannot expire recent translation');
    const restart = fixture(f);
    await restart.drain();
    assert.equal(restart.alarm.when, f.alarm.when, 'worker restart preserves the deadline');
    restart.clock.now = restart.alarm.when;
    restart.fire(); await restart.drain();
    assert.equal(restart.data.local.isActive, false);
    assert.equal(restart.alarm, undefined);
    assert.deepEqual(restart.data.local, { isActive: false });
    await restart.change({ isActive: true }); await restart.drain();
    assert.equal(restart.alarm.when, restart.clock.now + 6 * minute, 'explicit reactivation starts anew');
    await restart.change({ translationIdleEnabled: false }); await restart.drain();
    restart.clock.now += 20 * minute;
    restart.fire(); await restart.drain();
    assert.equal(restart.data.local.isActive, true, 'feature off never expires the mode');
    await restart.change({ translationIdleEnabled: true, translationIdleMinutes: 2 }); await restart.drain();
    assert.equal(restart.alarm.when, restart.clock.now + 2 * minute);
    restart.clock.now += 3 * minute;
    await restart.change({ translationIdleMinutes: 10 }); await restart.drain();
    assert.equal(restart.data.local.isActive, true, 'extending duration uses latest setting');
    await restart.change({ translationIdleMinutes: 1 }); await restart.drain();
    assert.equal(restart.data.local.isActive, false, 'shorter duration applies to existing idle time');
    await restart.use();
    assert.equal(restart.data.local.isActive, false, 'late request cannot reactivate expired mode');

    const race = fixture(); await race.drain();
    race.clock.now = race.alarm.when;
    let release;
    race.pause(new Promise(resolve => { release = resolve; }));
    race.fire();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const use = race.use(); release(); await use; await race.drain();
    assert.equal(race.data.local.isActive, true, 'activity during alarm storage read wins');
    assert.equal(race.writes.some(value => value.isActive === false), false);
    assert.equal(race.alarm.when, race.clock.now + 6 * minute);
    const otherDevice = fixture(); await otherDevice.drain();
    const localDeadline = otherDevice.alarm.when;
    await otherDevice.context.Settings.setSync({ isActive: false });
    await otherDevice.drain();
    assert.equal(otherDevice.data.local.isActive, true, 'remote legacy mode cannot stop local translation');
    assert.equal(otherDevice.alarm.when, localDeadline, 'remote mode cannot change local deadline');
    assert.equal(Object.hasOwn(race.data.sync, 'isActive'), false, 'local expiry never writes synced mode');

    const notified = [];
    const notificationErrors = [];
    otherDevice.context.console = { error: (...args) => notificationErrors.push(args) };
    otherDevice.context.chrome.tabs = {
        query: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
        sendMessage: async (id, message) => {
            notified.push({ id, action: message.action });
            if (id === 2) throw new Error('Could not establish connection. Receiving end does not exist.');
            if (id === 3) throw new Error('Cannot access contents of the page');
        }
    };
    await otherDevice.change({ isActive: false }); await otherDevice.drain();
    await new Promise(setImmediate);
    assert.deepEqual(notified.map(item => item.id), [1, 2, 3], 'local mode change notifies all tabs even with a missing receiver');
    assert.ok(notified.every(item => item.action === 'translationModeChanged'));
    assert.equal(notificationErrors.length, 1, 'only unexpected notification errors are logged');
    assert.equal(notificationErrors[0][1], 3);
    assert.equal(notificationErrors[0][2].message, 'Cannot access contents of the page');

    const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
    const pendingReads = [];
    const tab = vm.createContext({
        console,
        chrome: { runtime: { lastError: null, sendMessage: (request, reply) => pendingReads.push(reply) } },
        activateTranslationMode() { tab.active = true; },
        deactivateTranslationMode() { tab.active = false; }
    });
    vm.runInContext(content.slice(content.indexOf('function requestTranslationMode('),
        content.indexOf('function toggleTranslationMode()')), tab);
    const oldRead = tab.refreshTranslationMode();
    const newRead = tab.refreshTranslationMode();
    pendingReads[1]({ isActive: false }); await newRead;
    pendingReads[0]({ isActive: true }); await oldRead;
    assert.equal(tab.active, false, 'late startup read cannot overwrite a newer local mode notification');

    const enable = tab.setTranslationMode({ isActive: true });
    assert.equal(tab.active, false, 'selection stays disabled while saving activation');
    pendingReads[2]({ isActive: true }); await enable;
    assert.equal(tab.active, true, 'selection activates once worker acknowledges the saved mode');
    const lateEnable = tab.setTranslationMode({ isActive: true });
    const latestMode = tab.refreshTranslationMode();
    pendingReads[4]({ isActive: false }); await latestMode;
    pendingReads[3]({ isActive: true }); await lateEnable;
    assert.equal(tab.active, false, 'late write reply cannot override a newer mode refresh');

    let releaseTimer, dispatched = false;
    const timer = new Promise(resolve => { releaseTimer = resolve; });
    const requestContext = vm.createContext({
        console,
        validateTranslationRequest: () => ({ textSegments: ['text'], targetLang: 'zh', totalChars: 4 }),
        getVerifiedApiConfiguration: async () => ({}),
        Settings: { getLocal: async () => ({ isActive: true }) },
        consumeTranslationRateLimit() {},
        updateTranslationIdle: () => timer,
        MAX_CONCURRENT_REQUESTS: 1,
        mapWithConcurrencyLimit: async () => { dispatched = true; return ['translated']; },
        sendMessageError() { assert.fail('translation failed'); }
    });
    const start = source.indexOf('async function handleTranslateRequest(');
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), requestContext);
    const request = requestContext.handleTranslateRequest({}, { tab: { id: 1 } }, () => {});
    await new Promise(setImmediate);
    assert.equal(dispatched, true, 'translation dispatch does not wait for timer I/O');
    releaseTimer(); await request;
    for (const invalid of [0, -1, 121, 1.5, '6', null, NaN]) {
        assert.equal(race.context.Settings.normalizeTranslationIdleMinutes(invalid), 6);
    }
    console.log('translation-idle: ok (expiry, activity, shared timer, restart, settings, race, validation)');
})().catch(error => { console.error(error); process.exitCode = 1; });
