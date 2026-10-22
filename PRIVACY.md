# Pointer privacy policy

Last updated: October 22, 2026

Pointer is an open-source browser extension maintained at
https://github.com/Zero-noise/pointer. It translates text you select on webpages
using an API endpoint that you choose and verify in Settings.

## Translation requests

When translation mode is on and you select text, Pointer sends that text, the
selected model, and a translation instruction containing the target language
directly to your configured endpoint. If the endpoint requires authentication,
Pointer includes your API key according to the endpoint rules described below.
Clicking Verify also requests the endpoint's available model list.

Pointer does not include the page's URL, title, or your browser history in the
translation request. Text you select may itself contain personal or sensitive
information, so choose your endpoint and selections accordingly. Translations
and original text are held in the open page for display and restoration;
Pointer does not maintain a saved translation history.

The endpoint operator receives the request and ordinary connection information,
such as your IP address. Its own privacy and retention policies apply. Pointer
does not control how an independently operated endpoint retains or uses data.

## Data stored in the browser

Your API key, verification record, cached model list, optional private-LAN
authentication approval, translation-mode state, and last-translation activity
timestamp are stored locally using the browser's extension storage. The key and
verification data are not synced by Pointer. Local credential storage is
restricted to trusted extension contexts where the browser supports that API.
Pointer does not add its own encryption layer to browser storage.

Other preferences use Chrome's sync storage. These include your endpoint URL,
selected model, target and interface languages, button position and appearance,
shortcut preferences, and idle-timeout settings. If browser sync is enabled,
the browser may sync these preferences through your browser account.

Site-specific shortcut exceptions contain website hostnames and their shortcut
modes. They are stored in sync storage so Pointer can avoid shortcut conflicts
on those sites. The map is limited to 100 entries. Pointer does not keep a
chronological record of visited pages. It handles selections, shortcut keys,
button clicks and dragging locally to provide its interface; it does not record
a general keystroke, mouse-movement, or click log. The local activity timestamp
exists solely to turn translation mode off after inactivity.

## Network access and security

The in-page button and selection handler run on supported webpages. API access
is requested when you click Verify for the endpoint you entered. Changing or
clearing the endpoint removes its previous runtime permission.

Remote public endpoints must use HTTPS. Loopback and literal private-network
addresses may use HTTP for local or LAN model servers. HTTP traffic is not
encrypted. For non-loopback private HTTP servers, Pointer withholds a configured
API key unless you explicitly enable LAN authentication for that server and
key. Use an endpoint and network you trust. API requests reject redirects.

## Developer access and data use

The project operates no translation server and includes no analytics,
advertising, telemetry, or remote logging service. The developer does not receive
your translation requests or API keys through Pointer. All executable extension
code is included in the extension package; API responses are treated as data.

Data handled by Pointer is used to provide translation and its associated
settings and controls. The developer does not sell it, use it for advertising,
or use it to determine creditworthiness or for lending. This policy does not
override the separate policies of an API provider you choose or your browser's
sync service.

## Your controls and retention

You can turn translation mode or the floating button off, change your endpoint
and model, clear API credentials, edit or remove shortcut exceptions, and change
other settings in Pointer. Translation display state lasts only in the page;
you can restore text by clicking a translation or clear translations by
long-pressing the button. Browser settings let you control extension access,
uninstall Pointer, and manage browser sync data.

Local settings and credentials remain until you clear them or the browser
removes the extension's data. Synced preferences are subject to the browser's
sync controls. Requests already delivered to your chosen API provider are
subject to that provider's retention and deletion procedures.

## Contact and updates

For general questions, use https://github.com/Zero-noise/pointer/issues. Do not
post API keys or sensitive text in a public issue. For security reports, follow
the repository's Security policy. Changes to this policy will be published with
an updated date in the project repository.
