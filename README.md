# Pointer

A Chrome extension that translates the text you select, replacing it in place on
the page. It works with OpenAI-style endpoints that provide both `GET /models`
and `POST /chat/completions`, including gateways and local model servers.

## Use

Click the floating button or press `T` to turn translation on, then select some
text. The selection is replaced by its translation when the response comes
back. Click a translation to switch it back to the original, or long-press the
button to clear all of them.

The button can be dragged anywhere and resized. The interface language and the
target language are set separately. There are ten presets for each, and you can
enter a custom language code such as `zh-Hant`.

## Install

Clone the repository, open `chrome://extensions/`, turn on Developer mode, and
use Load unpacked to select the folder.

## Setup

Open the popup and click Advanced Settings. Enter your endpoint and, when the
server requires one, its API key. Click Verify to load the model list, then
choose a model.

Verify checks that the endpoint responds and binds the key to it. Chrome is only
asked for permission on that scheme, host, and port. If you change the address,
permission for the previous address is removed. The key is kept in
`chrome.storage.local`, so it stays on this device and is not synced.

### Local and LAN servers

You can leave the key blank for a server on localhost or a private LAN, in which
case no `Authorization` header is sent. HTTP is allowed for loopback and for
literal private addresses (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, and
`fc00::/7`). Public IPs and hostnames like `nas.local` still need HTTPS. There is
no separate LAN setting; Verify handles it.

Note that HTTP over a LAN is unencrypted, so anyone on that network can read or
change what you send. Only use it on a network you trust.

## Shortcut

The default shortcut is `T`. To change it, click the shortcut in Settings and
press a new key; hold Alt/Option while binding if you want to require that
modifier. Pointer avoids triggering the shortcut while you are typing or using
keyboard-driven controls. If a bare key repeatedly conflicts with a site,
Pointer switches that site to Alt/Option + key and lists the exception in
Settings.

## Privacy

Pointer sends API requests only to the endpoint you enter in Settings;
translation remains blocked until the current endpoint and key have been
verified together. A translation request contains the selected text, the
target-language instruction, and the chosen model; when a key is configured, it
is included as a bearer token. Model-list requests go to the same endpoint.
There is no analytics, telemetry, or server operated by Pointer.

| Permission | Why |
|---|---|
| `storage` | Settings (synced) and the API key (local) |
| `<all_urls>` content script | The button and selection handling have to work on whatever page you are reading |
| Optional hosts | Requested when you click Verify, for your endpoint only |

## Layout

| | |
|---|---|
| `manifest.json` | Entrypoints and permissions |
| `background.js` | Service worker: translation requests, options |
| `content.js` | In-page translation, the button, theme syncing |
| `popup.*`, `options.*` | Quick and advanced settings |
| `settings.js`, `i18n.js` | Storage helpers, interface translations |
| `theme.css` | The design tokens, read by both pages and the button's shadow root |
| `content.css` | Styles inside the button's closed shadow root (`theme.css` is prepended at injection) |
| `content-page.css` | Translated text and loading indicators. It cannot read `theme.css`, so the values are copied by hand |

The current implementation references are the
[visual-system rules](docs/FAB_UI_DESIGN.md),
[selection behavior](docs/SELECTION_CASES.md), and the
[manual regression checklist](docs/MANUAL_REGRESSION.md).

## Development

The tests need nothing installed:

```bash
node tests/security-regression.test.js    # request control, credentials
node tests/shortcut.test.js               # shortcut guards, overrides, drift
node tests/permission-migration.test.js   # narrowLegacyHostPermission()
node tests/packaging.test.js              # every loaded file exists and ships
```

`./package.sh` runs all four and then writes `dist/pointer-<version>.zip`.

There is also a browser probe, which has to be run separately because branded
Chrome no longer allows `--load-extension`:

```bash
CHROME_PATH=/path/to/chromium node tests/chrome-permission-smoke.js
```

## License

MIT.
