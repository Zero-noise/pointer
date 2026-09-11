#!/usr/bin/env node
// Exercise the shipped visibility/attachment helpers, including delayed CSS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const helpers = source.slice(source.indexOf('function syncContentFullscreenVisibility()'),
    source.indexOf('function isChromeAPIAvailable()'));

function fixture() {
    const properties = new Map();
    let resolveCss;
    const state = {
        document: { fullscreenElement: null },
        aiTranslatorContainer: { style: {
            getPropertyValue: key => properties.get(key) || '',
            setProperty: (key, value) => properties.set(key, value),
            removeProperty: key => properties.delete(key)
        } },
        translationButton: { classList: { remove() {} }, style: { removeProperty() {} } },
        showButton: true, isActive: true, isDragging: false,
        dragStartPending: false, pressStartTime: 0, buttonMoved: false,
        suppressSelectionAfterDrag: false,
        currentButtonPosition: 'custom', currentButtonX: 100, currentButtonY: 200,
        cancelled: 0, mounted: 0, restored: 0,
        cancelLongPress() { state.cancelled++; },
        positionButton(...args) { state.restoredPosition = args; },
        keepCustomButtonInViewport() { state.restored++; },
        _scheduleAdaptive() {},
        aiTranslatorShadow: { appendChild() { state.mounted++; } },
        cssLoadedPromise: new Promise(resolve => { resolveCss = resolve; })
    };
    vm.createContext(state);
    vm.runInContext(helpers, state);
    return { state, resolveCss, hidden: () => properties.get('display') === 'none' };
}

(async () => {
    const { state: s, hidden, resolveCss } = fixture();
    s.syncContentFullscreenVisibility();
    assert.equal(hidden(), false, 'normal page stays visible');
    s.attachButtonWhenStyled();
    s.document.fullscreenElement = { tagName: 'VIDEO' };
    s.isDragging = s.dragStartPending = true;
    s.syncContentFullscreenVisibility();
    assert.equal(hidden(), true);
    assert.equal(s.cancelled, 1, 'cancel any pending long press');
    assert.equal(s.isDragging, false);
    assert.equal(s.dragStartPending, false);
    assert.deepEqual(s.restoredPosition, ['custom', 100, 200]);
    assert.equal(s.isActive, true, 'translation stays active');
    assert.equal(s.showButton, true, 'saved display preference stays intact');
    resolveCss();
    await s.cssLoadedPromise;
    assert.equal(s.mounted, 1);
    assert.equal(hidden(), true, 'late CSS attachment cannot reveal the ball');
    s.document.fullscreenElement = { tagName: 'IFRAME' };
    s.syncContentFullscreenVisibility();
    assert.equal(hidden(), true, 'switching fullscreen elements stays hidden');
    s.document.fullscreenElement = null;
    s.syncContentFullscreenVisibility();
    assert.equal(hidden(), false);
    assert.equal(s.restored, 1);
    assert.equal(s.isActive, true);

    const off = fixture();
    off.state.showButton = false;
    off.state.document.fullscreenElement = {};
    off.state.syncContentFullscreenVisibility();
    off.state.document.fullscreenElement = null;
    off.state.syncContentFullscreenVisibility();
    off.state.attachButtonWhenStyled();
    off.resolveCss();
    await off.state.cssLoadedPromise;
    assert.equal(off.state.mounted, 0, 'exit must not mount a user-disabled ball');
    console.log('fullscreen: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
