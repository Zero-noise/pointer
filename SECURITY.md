# Security policy

Pointer handles an API key and reads the text you select on any page, so
security reports are welcome and taken seriously.

## Reporting a vulnerability

Please report privately, not as a public issue:

**GitHub → Security → Report a vulnerability** (private disclosure)

Include what you can — affected file and line, the browser and extension
version, and a minimal reproduction. A working proof of concept helps but is
not required.

Expect an acknowledgement within 7 days and an assessment within 14. If a fix
is warranted it ships in the next release, and you will be credited in the
release notes unless you would rather not be.

## Scope

In scope — the extension as shipped:

- Anything that discloses the stored API key beyond the one verified endpoint.
- Sending the API key over plain HTTP to a non-loopback private address when
  the LAN authentication switch is off, or to a server or with a key other
  than the exact pair it was enabled for (`resolveApiKeyForRequest()` in
  `settings.js`). Non-loopback private HTTP is meant to be anonymous unless
  the user opts in for that one endpoint.
- Anything that sends selected text to a host the user did not verify, or that
  causes a request outside the granted host permission.
- Bypassing `normalizeAndValidateBaseUrl()` — the single chokepoint that decides
  which origins Pointer may request permission for and connect to
  (`settings.js`). Anything that reaches a permission pattern or a `fetch`
  without passing through it.
- Script or HTML injection into a host page, the popup, or the options page.
- A web page, or another extension, driving the background worker's message
  handlers (translation, credential status, localization).
- Reading the key out of `chrome.storage.local` from a content script.

Out of scope:

- **Prompt injection through page content.** Selected text is sent to a language
  model, so a hostile page can influence the translation it gets back. The
  response is inserted with `textContent` and never as markup, so the impact is
  bounded at misleading text. This is inherent to the design.
- **Plaintext HTTP on a LAN.** HTTP is deliberately accepted for loopback and
  literal private addresses; the README says so, and observing that traffic
  requires already being on the user's network. This covers the transport
  itself, not the key: the key leaving the extension when it should not is in
  scope above.
- **Detecting that Pointer is installed.** The FAB carries a
  `data-pointer-extension-host` attribute and the stylesheets are web-accessible,
  so any page can tell. Known, and not treated as a vulnerability.
- Anything requiring a compromised endpoint that the user verified themselves,
  beyond what that endpoint is already trusted with.
- Findings in a fork, or in Chrome itself.

## Supported versions

The latest release only. Pointer has no backport branches.

## What Pointer sends where

There is one destination, and the user chooses it: the OpenAI-compatible
endpoint set in Settings. Selected text goes to `POST /chat/completions`, the
model list to `GET /models`. There is no analytics, no telemetry, and no server
operated by this project. Both requests use `redirect: 'error'`, so a redirect
can never carry the `Authorization` header to a third host. The key is sent
over HTTPS and to loopback; for other private HTTP addresses it is withheld
unless the user turns on LAN authentication for that exact server and key.
