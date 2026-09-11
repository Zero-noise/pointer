# Pointer Manual Regression Baseline

Run this checklist before refactors and after each completed step. Capture screenshots for popup, options, and the in-page FAB on both light and dark sites.

## Settings

1. Open popup and confirm the target-language combobox and show-button toggle render correctly.
2. Operate the language combobox with Arrow keys, Home/End, Enter, Escape, and Tab; confirm focus and selection stay in sync.
3. Choose Other, enter a valid code such as `zh-hant`, then an invalid code such as `x`; confirm only the valid value persists and the invalid value shows the error state.
4. With translation mode active in a tab, change the target language in the popup and confirm the next translation in that tab uses the new language without a reload.
5. Open options and confirm API, model, interface, shortcut, and both slider sections render correctly.
6. Verify both slider fills track their displayed values after storage loads and while dragging.
7. Verify `buttonSize`, `buttonThickness`, `uiLang`, and the `Alt` + configured-key shortcut persist after reopening popup/options.
   - On macOS the shortcut hint must read "hold Option to require Option" and the key cap `⌥T`; on Windows/Linux "Alt" and `Alt+T`. The binding itself is the same key on both.
8. Clear credentials, re-enter API settings, and verify model loading still works.
9. Confirm `availableModels` remains cached and reused until credentials change.

## Translation

1. Translate a single text selection inside one text node.
2. Translate a multi-inline selection inside one block element.
3. Translate a selection spanning multiple blocks.
4. Translate a mixed selection containing untranslated text plus existing translated spans.
5. Toggle a translated span between translated/original text.
6. Long-press the FAB and confirm all translated spans are cleared.

### Translation idle timeout

1. In Options → Interface, enable the idle timeout. Confirm the default is 6 minutes and only whole numbers from 1 to 120 can be saved; invalid or empty input must not change the saved duration.
2. Set 1 minute, activate translation, and do not translate: mode turns off after the deadline (Chrome can delay alarm delivery). The ball and existing translations remain. Selecting new text does not translate until mode is explicitly reactivated.
3. Translate shortly before expiry in a different tab: both tabs remain active until the new deadline. Scrolling and mouse movement must not extend it.
4. Stop the background service worker and let the deadline pass, then wake it: elapsed idle time is preserved. Check sleep/wake as well; alarms do not wake the computer.
5. Disable the feature while active: no automatic shutoff. Re-enable it: start a new timer. Change the duration while active: apply it to the last recorded activity, including immediate expiry when shortened below elapsed idle time.
6. Reopen Options and check the saved toggle/duration. Switch interface languages and verify the labels and controls remain legible.

## UI And Theme

1. Verify FAB hover, press, drag, and active states on a light page.
2. Verify FAB hover, press, drag, and active states on a dark page.
3. Confirm toolbar icon switches between light/dark variants based on page/system theme.
4. Confirm button visibility toggle hides the FAB and deactivates translation mode.

### Device-local translation mode

1. Open two tabs: toggling translation in either tab updates both; an idle expiry also turns both off. Refresh a tab and confirm it loads the current mode.
2. With Chrome Sync enabled on two devices, activate translation on both. Let one device expire while translating on the other: the active device must stay on.
3. Upgrade from a version with only `sync.isActive`: mode starts off on this device. Once enabled, restarting the worker preserves the local mode and deadline; later changes to the legacy synced key have no effect.
4. Navigate back to a cached page after another tab changes mode: it should show the latest local mode.
5. Simulate a missed mode notification: after the worker turns mode off, a stale tab must not send a new request to the translation API. Enable mode again and immediately select text: the first request should succeed once activation is acknowledged.

### Content fullscreen

1. Enter video/player fullscreen, including a cross-origin embedded player: the FAB hides. Exit: it returns with the same translation mode and saved position.
2. Enter fullscreen on the whole document: the FAB still hides even though its host is inside the fullscreen element.
3. Use F11 or macOS browser-window fullscreen without content fullscreen: the FAB remains available for reading. Theater mode and maximization also leave it visible.
4. Enter/exit content fullscreen while styles are loading or the page remounts its body: the FAB must not flash into view during fullscreen or stay hidden afterward.
5. Hide the FAB in settings while content is fullscreen, then exit: it stays disabled. Enable it during fullscreen: it appears only after exit.
6. Interrupt a FAB long press or drag with content fullscreen: no delayed translation clear or stuck drag, and no saved position change caused by hidden geometry.

## Resilience

1. Trigger translation, then mutate the page before the response returns; confirm no uncaught error and no broken DOM.
2. Reopen popup/options after settings changes and confirm text and controls remain aligned.

## Security Boundaries

1. Change the API base URL after verification and confirm translation is blocked until the new key/address pair is verified.
2. Confirm `http://localhost`, `http://127.0.0.1`, and a literal RFC1918 LAN address such as `http://192.168.1.20:1234/v1` are accepted without enabling another setting.
3. Confirm public HTTP, `http://nas.local`, `100.64.0.0/10`, `169.254.0.0/16`, and IPv6 link-local HTTP are rejected while the same remote host over HTTPS is accepted.
4. Verify a no-auth local/LAN server with the API Key field empty; confirm model loading and translation work and the server receives no `Authorization` header.
5. Inspect the Chrome permission prompt and confirm it names only the entered API host and port. Change the port or host, then clear API settings; confirm the old grant is removed.
6. On a page containing `#ai-translator-container` or `.ai-translator-highlight`, confirm Pointer neither reuses nor removes the page's elements.
7. Dispatch synthetic `keydown` and `mouseup` events from page JavaScript and confirm they do not activate or translate.
8. Run `node tests/security-regression.test.js` and confirm the global API concurrency peak remains at three.

## Permission scoping

Pointer requests permission for one scheme, host, and port. The compatibility
path in `options.js` also narrows any host-wide grant it encounters without
leaving the endpoint inaccessible.

`node tests/chrome-permission-smoke.js` checks the underlying Chrome behavior
with the isolated extension in `tests/chrome-permission-smoke/`. If the installed
browser cannot load or drive that extension automatically, point `CHROME_PATH`
at Chromium or a Chrome for Testing build, or run the same check manually:

1. Load `tests/chrome-permission-smoke/` unpacked at `chrome://extensions`, open
   `smoke.html`, click **Run all steps**, and grant every prompt. Confirm
   `final.exact` is `true`, and `final.otherPort` and `final.broad` are `false`.
2. In Pointer, verify an HTTPS endpoint and inspect its Site access entry in
   `chrome://extensions` → Details. Confirm the grant names the exact port
   (`:443` when the URL omits the default HTTPS port).
3. Change the endpoint host or port and confirm the previous grant is removed.
   Clear the API settings and confirm the current grant is removed as well.
4. Repeat with a LAN endpoint (`http://192.168.x.y:1234/v1`) and confirm the
   grant names that exact port.
5. Deny a new permission prompt and confirm Verify reports a clear error. Click
   Verify again, grant the prompt, and confirm model loading recovers.
