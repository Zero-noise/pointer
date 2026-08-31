(function (global) {
    'use strict';

    const DEFAULT_SYNC_SETTINGS = {
        isActive: false,
        targetLang: 'zh',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        buttonPosition: 'bottom-right',
        buttonX: null,
        buttonY: null,
        uiLang: 'en',
        showButton: true,
        buttonSize: 64,
        buttonThickness: 0,
        shortcutEnabled: true,
        shortcutKey: 'KeyT',
        // 'none' = bare key (default), 'alt' = Alt + key. Bare keys are faster but
        // can collide with site shortcuts, so content.js yields to the page and can
        // fall back per-site; see shortcutSiteOverrides.
        shortcutModifier: 'none',
        // host -> 'none' | 'alt' | 'off'. Per-site exceptions, set by the user in
        // options or written automatically when bare-key conflicts are detected.
        shortcutSiteOverrides: {}
    };

    // The API key lives in chrome.storage.local ('apiKey') on purpose: sync
    // storage is uploaded to the user's Google account and shared across
    // devices. Access it via getApiKey/setApiKey only.
    const MODEL_CACHE_BINDING_LOCAL_KEY = 'availableModelsBinding';
    const MODEL_CACHE_KEYS = ['availableModels', MODEL_CACHE_BINDING_LOCAL_KEY];
    const CREDENTIAL_BINDING_LOCAL_KEY = 'credentialBinding';
    const PRIVATE_LAN_HTTP_AUTH_BINDING_LOCAL_KEY = 'privateLanHttpAuthBinding';
    // Compatibility keys read only during secure local-state preparation.
    // Verification belongs on the same device as the API key; otherwise a synced
    // endpoint could become trusted without being verified on this device.
    const VERIFICATION_SYNC_KEYS = ['lastVerified', 'lastVerifiedApiKeyHash', 'lastVerifiedBaseUrl'];
    const LEGACY_SYNC_KEYS = ['apiKey', 'lastVerifiedApiKey'];
    const SYNC_KEYS = [...Object.keys(DEFAULT_SYNC_SETTINGS)];

    function areaApi(area) {
        const storage = chrome && chrome.storage && chrome.storage[area];
        if (!storage) {
            throw new Error(`chrome.storage.${area} is not available`);
        }
        return storage;
    }

    function withDefaults(result, defaults) {
        return { ...defaults, ...(result || {}) };
    }

    function get(area, keys, defaults) {
        return new Promise((resolve, reject) => {
            try {
                areaApi(area).get(keys, (result) => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(defaults ? withDefaults(result, defaults) : (result || {}));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function set(area, values) {
        return new Promise((resolve, reject) => {
            try {
                areaApi(area).set(values, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function remove(area, keys) {
        return new Promise((resolve, reject) => {
            try {
                areaApi(area).remove(keys, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async function ensureDefaults() {
        const existing = await get('sync', Object.keys(DEFAULT_SYNC_SETTINGS));
        const missing = {};

        for (const [key, value] of Object.entries(DEFAULT_SYNC_SETTINGS)) {
            if (existing[key] === undefined) {
                missing[key] = value;
            }
        }

        if (Object.keys(missing).length > 0) {
            await set('sync', missing);
        }
    }

    // ——— Keyboard shortcut resolution ———
    // A shortcut has a global modifier ('none' | 'alt') plus optional per-host
    // exceptions. 'off' is only reachable per-host; the global kill switch stays
    // shortcutEnabled.
    const SHORTCUT_MODES = Object.freeze(['none', 'alt', 'off']);

    // ——— Platform: the Alt key is Option on a Mac ———
    // A Mac keyboard has no key labelled Alt. The same physical key raises the
    // same event.altKey, so only the LABEL is platform-specific — matching runs
    // on e.code, which means a binding made on one platform keeps working on
    // the other and nothing about it needs migrating.
    //
    // navigator, not chrome.runtime.getPlatformInfo(): that call is async and
    // is not exposed to content scripts, and every surface that prints a chord
    // (options page, in-page toast) has to reach the same answer synchronously.
    // userAgentData first (Chrome 90+, reports "macOS"), then the deprecated
    // platform ("MacIntel"), then the UA string.
    //
    // `nav` is injectable so both branches are testable off a real browser.
    function isMacPlatform(nav) {
        const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
        if (!n) return false;
        const platform = (n.userAgentData && n.userAgentData.platform) || n.platform || n.userAgent || '';
        return /mac/i.test(platform);
    }

    // Prose wants the word ("hold Option to…"); a key cap wants the glyph (⌥T).
    function getModifierName(nav) {
        return isMacPlatform(nav) ? 'Option' : 'Alt';
    }

    // Mac convention stacks modifier glyphs with no separator; Windows and
    // Linux spell the modifier out and join with '+'.
    function formatShortcutChord(keyLabel, withAlt, nav) {
        const key = keyLabel || 'T';
        if (!withAlt) return key;
        return isMacPlatform(nav) ? `\u2325${key}` : `Alt+${key}`;
    }

    function normalizeShortcutModifier(value) {
        return value === 'alt' ? 'alt' : 'none';
    }

    function normalizeShortcutMode(value) {
        return SHORTCUT_MODES.includes(value) ? value : null;
    }

    // The map lives in sync storage, whose per-item quota is 8192 bytes. At roughly
    // 30-40 bytes per "host":"mode" pair an uncapped map would start failing every
    // write somewhere around 200 sites — and the failure would land on the automatic
    // conflict downgrade, the one writer the user never asked for. Cap it well under
    // that and evict deterministically instead.
    const SHORTCUT_SITE_OVERRIDES_LIMIT = 100;

    // "Oldest" means insertion order, which is what both JSON and JS object key
    // order preserve for these keys: a hostname is never an array-index-like key
    // (it always carries a dot, letter, or bracket), so it can never be hoisted
    // into the integer-key group that would reorder the map across a storage
    // round-trip. Eviction therefore drops the front of the map, and re-writing a
    // host moves it to the back — see addShortcutSiteOverride.
    function trimShortcutSiteOverrides(cleaned) {
        const hosts = Object.keys(cleaned);
        if (hosts.length <= SHORTCUT_SITE_OVERRIDES_LIMIT) {
            return cleaned;
        }
        const trimmed = {};
        for (const host of hosts.slice(hosts.length - SHORTCUT_SITE_OVERRIDES_LIMIT)) {
            trimmed[host] = cleaned[host];
        }
        return trimmed;
    }

    // Stored overrides come from sync storage, which another extension version (or a
    // corrupted write) can leave in any shape. Rebuild a clean object rather than
    // trusting it, so a bad value can never widen where the shortcut fires. Every
    // reader goes through here, so an unknown mode is dropped rather than rendered
    // or acted on.
    function normalizeShortcutSiteOverrides(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        const cleaned = {};
        for (const [host, mode] of Object.entries(value)) {
            const normalizedHost = normalizeShortcutHost(host);
            const normalizedMode = normalizeShortcutMode(mode);
            if (normalizedHost && normalizedMode) {
                cleaned[normalizedHost] = normalizedMode;
            }
        }
        return trimShortcutSiteOverrides(cleaned);
    }

    // Returns a new map with `host` set to `mode`, capped and evicted. Deleting
    // before re-inserting is what makes a re-written host count as newest; without
    // it an old entry that keeps getting rewritten would still be evicted first.
    // Returns null when the host or mode is unusable, so callers skip the write
    // entirely rather than persisting a no-op.
    function addShortcutSiteOverride(overrides, host, mode) {
        const normalizedHost = normalizeShortcutHost(host);
        const normalizedMode = normalizeShortcutMode(mode);
        if (!normalizedHost || !normalizedMode) {
            return null;
        }
        const cleaned = normalizeShortcutSiteOverrides(overrides);
        delete cleaned[normalizedHost];
        cleaned[normalizedHost] = normalizedMode;
        return trimShortcutSiteOverrides(cleaned);
    }

    function normalizeShortcutHost(hostname) {
        const host = String(hostname || '').trim().toLowerCase();
        if (!host || host.length > 253 || /[^a-z0-9.\-\[\]:]/.test(host)) {
            return '';
        }
        return host.replace(/^www\./, '');
    }

    // Per-host exception wins over the global modifier. This is the reference
    // definition of shortcut mode resolution; content.js carries a hand-copy
    // (see the note there) that tests/shortcut.test.js pins to this one.
    function resolveShortcutMode(hostname, modifier, overrides) {
        const host = normalizeShortcutHost(hostname);
        const cleaned = normalizeShortcutSiteOverrides(overrides);
        if (host && Object.prototype.hasOwnProperty.call(cleaned, host)) {
            return cleaned[host];
        }
        return normalizeShortcutModifier(modifier);
    }

    // Existing installs ran Alt + key. ensureDefaults() would silently hand them the
    // new bare-key default on update, which would start swallowing single keypresses
    // on sites they already use. Pin them to 'alt' first; only fresh installs get the
    // bare-key default.
    async function migrateShortcutModifier(installReason) {
        const existing = await get('sync', ['shortcutModifier', 'shortcutKey']);
        if (existing.shortcutModifier !== undefined) {
            return;
        }
        if (installReason !== 'install' && existing.shortcutKey !== undefined) {
            await set('sync', { shortcutModifier: 'alt' });
        }
    }

    function parseIpv4Hostname(hostname) {
        const normalized = String(hostname || '').trim();
        if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
            return null;
        }

        const octets = normalized.split('.').map(Number);
        if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
            return null;
        }
        return octets;
    }

    function unwrapIpv6Hostname(hostname) {
        const normalized = String(hostname || '').trim().toLowerCase();
        if (normalized.startsWith('[') && normalized.endsWith(']')) {
            return normalized.slice(1, -1);
        }
        return normalized;
    }

    function isLoopbackHostname(hostname) {
        const normalized = String(hostname || '').trim().toLowerCase();
        if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
            return true;
        }
        if (unwrapIpv6Hostname(normalized) === '::1') {
            return true;
        }

        const ipv4 = parseIpv4Hostname(normalized);
        return Boolean(ipv4 && ipv4[0] === 127);
    }

    // HTTP is intentionally limited to literal, non-public LAN addresses.
    // Hostnames such as nas.local are not accepted here: resolving names in an
    // extension before every request would add DNS-rebinding and time-of-check
    // gaps. Users can still use such names over HTTPS.
    function isPrivateNetworkHostname(hostname) {
        const normalized = String(hostname || '').trim().toLowerCase();
        const ipv4 = parseIpv4Hostname(normalized);
        if (ipv4) {
            return ipv4[0] === 10 ||
                (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
                (ipv4[0] === 192 && ipv4[1] === 168);
        }

        const ipv6 = unwrapIpv6Hostname(normalized);
        if (!ipv6.includes(':')) {
            return false;
        }
        const firstHextet = Number.parseInt(ipv6.split(':', 1)[0], 16);
        return Number.isInteger(firstHextet) && firstHextet >= 0xfc00 && firstHextet <= 0xfdff;
    }

    function isLocalNetworkHostname(hostname) {
        return isLoopbackHostname(hostname) || isPrivateNetworkHostname(hostname);
    }

    function isLocalNetworkBaseUrl(baseUrl) {
        try {
            return isLocalNetworkHostname(new URL(String(baseUrl || '').trim()).hostname);
        } catch (_) {
            return false;
        }
    }

    function isPrivateLanHttpBaseUrl(baseUrl) {
        try {
            const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
            const parsed = new URL(normalizedBaseUrl);
            return parsed.protocol === 'http:' &&
                isPrivateNetworkHostname(parsed.hostname) &&
                !isLoopbackHostname(parsed.hostname);
        } catch (_) {
            return false;
        }
    }

    // ——— Where the HTTP restriction actually lives ———
    //
    // manifest.json declares `http://*/*` under optional_host_permissions. That
    // breadth is unavoidable, not a relaxation: a Chrome match pattern's host is
    // a literal name or a `*.`-prefixed suffix, so there is no way to write
    // "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7" — the very addresses
    // a self-hosted model server sits on. Enumerating them is hopeless (16.8M
    // hosts in 10/8 alone) and `http://*.local/*` would not help, since name-based
    // HTTP is deliberately refused below.
    //
    // What that declaration buys is only the *right to ask*: an optional host
    // permission grants nothing at install time, and Pointer never requests the
    // wildcard. Every request is built by getHostPermissionPattern() from a URL
    // this function has already accepted, so the real restriction — HTTPS
    // everywhere except loopback and literal private addresses — is enforced
    // here, in one place, and nowhere else. Two consequences worth keeping in
    // mind when editing:
    //
    //   1. Any new code path that builds an origin pattern MUST route through
    //      normalizeAndValidateBaseUrl() (getHostPermissionPattern and
    //      getLegacyHostPermissionPattern both do). A pattern built from raw
    //      user input would be able to ask for `http://evil.example/*`.
    //   2. Loosening this function silently widens what the extension can be
    //      talked into requesting. tests/security-regression.test.js pins the
    //      accepted and rejected sets; extend those lists in the same change.
    function normalizeAndValidateBaseUrl(baseUrl) {
        const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
        if (!raw) {
            throw new Error('API base URL is required');
        }

        let parsed;
        try {
            parsed = new URL(raw);
        } catch (_) {
            throw new Error(`Invalid API base URL: ${raw}`);
        }

        if (parsed.username || parsed.password) {
            throw new Error('API base URL must not contain embedded credentials');
        }
        if (parsed.search || parsed.hash) {
            throw new Error('API base URL must not contain a query string or fragment');
        }
        if (parsed.protocol !== 'https:' &&
            !(parsed.protocol === 'http:' && isLocalNetworkHostname(parsed.hostname))) {
            throw new Error(
                'API base URL must use HTTPS (HTTP is allowed only for localhost and private LAN IP addresses)'
            );
        }

        const pathname = parsed.pathname.replace(/\/+$/, '');
        return `${parsed.origin}${pathname}`;
    }

    // A match pattern's port is optional and defaults to `:*`, so the host-wide
    // form below grants every port on the host. Naming the port narrows the grant
    // to the one endpoint the user actually verified. parsed.port is empty for a
    // default-port URL, hence the explicit 443/80.
    function getHostPermissionPattern(baseUrl) {
        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
        const parsed = new URL(normalizedBaseUrl);
        const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
        return `${parsed.protocol}//${parsed.hostname}:${port}/*`;
    }

    // A pre-existing host-wide grant may cover every port. Keep this helper only
    // for narrowing or clearing such grants; normal checks and requests always
    // use getHostPermissionPattern().
    function getLegacyHostPermissionPattern(baseUrl) {
        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
        const parsed = new URL(normalizedBaseUrl);
        return `${parsed.protocol}//${parsed.hostname}/*`;
    }

    function isApiKeyRequired(baseUrl) {
        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
        return !isLocalNetworkBaseUrl(normalizedBaseUrl);
    }

    async function getSync(keys = SYNC_KEYS, includeDefaults = false) {
        return get('sync', keys, includeDefaults ? DEFAULT_SYNC_SETTINGS : null);
    }

    async function getLocal(keys = MODEL_CACHE_KEYS) {
        return get('local', keys);
    }

    async function setSync(values) {
        return set('sync', values);
    }

    async function setLocal(values) {
        return set('local', values);
    }

    async function removeSync(keys) {
        return remove('sync', keys);
    }

    async function removeLocal(keys) {
        return remove('local', keys);
    }

    async function sha256Hex(text) {
        const data = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    // Error text from the configured endpoint is shown to the user — in a toast
    // on the page, and in the options page's verify status. Both render it with
    // textContent, so it cannot inject markup, but unattributed it still arrives
    // wearing Pointer's name ("AI Translator: <whatever the server said>"). A
    // hostile or compromised endpoint should not get to speak as the extension.
    // Quote it, name its source, and cap it well below toast length.
    const MAX_REMOTE_MESSAGE_LENGTH = 100;

    function quoteRemoteMessage(message) {
        // Control characters are flattened before whitespace is collapsed: a
        // multi-line or NUL-padded reply could otherwise push the attributing
        // prefix out of view in a single-line toast.
        const flattened = Array.from(String(message == null ? '' : message))
            .map((ch) => {
                const code = ch.codePointAt(0);
                const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
                return isControl ? ' ' : ch;
            })
            .join('');
        const text = flattened.replace(/\s+/g, ' ').trim();
        if (!text) {
            return 'The API server replied with an empty error.';
        }
        const clipped = text.length > MAX_REMOTE_MESSAGE_LENGTH
            ? `${text.slice(0, MAX_REMOTE_MESSAGE_LENGTH)}…`
            : text;
        return `The API server replied: "${clipped}"`;
    }

    async function readResponseTextWithLimit(response, maxBytes, tooLargeMessage) {
        if (!response || !Number.isFinite(maxBytes) || maxBytes <= 0) {
            throw new Error('Invalid bounded response read');
        }

        const sizeErrorMessage = tooLargeMessage || 'Response is too large';
        const declaredLengthHeader = response.headers && response.headers.get('content-length');
        const declaredLength = Number(declaredLengthHeader);
        if (declaredLengthHeader !== null &&
            Number.isFinite(declaredLength) &&
            declaredLength > maxBytes) {
            try {
                await response.body?.cancel();
            } catch (_) {
                // The size error below is the useful failure for the caller.
            }
            throw new Error(sizeErrorMessage);
        }

        if (!response.body || typeof response.body.getReader !== 'function') {
            const text = await response.text();
            if (new TextEncoder().encode(text).byteLength > maxBytes) {
                throw new Error(sizeErrorMessage);
            }
            return text;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let receivedBytes = 0;
        let text = '';
        let readerCancelled = false;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                receivedBytes += value.byteLength;
                if (receivedBytes > maxBytes) {
                    readerCancelled = true;
                    try {
                        await reader.cancel();
                    } catch (_) {
                        // Preserve the deterministic size error below.
                    }
                    throw new Error(sizeErrorMessage);
                }
                text += decoder.decode(value, { stream: true });
            }
            text += decoder.decode();
            return text;
        } catch (error) {
            if (!readerCancelled) {
                try {
                    await reader.cancel(error);
                } catch (_) {
                    // Preserve the original read/decode error.
                }
            }
            throw error;
        } finally {
            try {
                reader.releaseLock();
            } catch (_) { }
        }
    }

    async function getApiKey() {
        const result = await getLocal(['apiKey']);
        return typeof result.apiKey === 'string' ? result.apiKey : '';
    }

    async function setApiKey(apiKey) {
        return setLocal({ apiKey });
    }

    function createPrivateLanHttpAuthGeneration() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    async function getPrivateLanHttpAuthBinding() {
        const result = await getLocal([PRIVATE_LAN_HTTP_AUTH_BINDING_LOCAL_KEY]);
        const binding = result[PRIVATE_LAN_HTTP_AUTH_BINDING_LOCAL_KEY];
        if (!binding || typeof binding !== 'object') {
            return null;
        }
        if (typeof binding.baseUrl !== 'string' ||
            typeof binding.apiKeyHash !== 'string' ||
            typeof binding.generation !== 'string' ||
            !/^[a-f0-9]{32}$/.test(binding.generation)) {
            return null;
        }
        return binding;
    }

    async function setPrivateLanHttpAuthAllowed(apiKey, baseUrl, allowed) {
        if (!allowed) {
            await removeLocal([PRIVATE_LAN_HTTP_AUTH_BINDING_LOCAL_KEY]);
            return null;
        }

        const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
        if (!normalizedApiKey || !isPrivateLanHttpBaseUrl(normalizedBaseUrl)) {
            throw new Error('Private LAN HTTP authentication requires a private HTTP endpoint and API key');
        }

        const binding = {
            baseUrl: normalizedBaseUrl,
            apiKeyHash: await sha256Hex(normalizedApiKey),
            generation: createPrivateLanHttpAuthGeneration()
        };
        await setLocal({ [PRIVATE_LAN_HTTP_AUTH_BINDING_LOCAL_KEY]: binding });
        return binding.generation;
    }

    async function getPrivateLanHttpAuthGeneration(apiKey, baseUrl) {
        const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
        if (!normalizedApiKey || !isPrivateLanHttpBaseUrl(baseUrl)) {
            return null;
        }

        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
        const binding = await getPrivateLanHttpAuthBinding();
        if (!binding || binding.baseUrl !== normalizedBaseUrl) {
            return null;
        }
        const apiKeyHash = await sha256Hex(normalizedApiKey);
        return binding.apiKeyHash === apiKeyHash ? binding.generation : null;
    }

    async function resolveApiKeyForRequest(
        apiKey,
        baseUrl,
        expectedPrivateLanAuthGeneration = null,
        expectedCredentialBinding = null
    ) {
        const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);

        // Translation work can wait in the global queue. Re-read the verified
        // binding when that work actually starts so editing/clearing credentials
        // revokes queued requests for HTTPS, loopback, and LAN endpoints alike.
        if (expectedCredentialBinding) {
            const [currentBinding, currentSettings] = await Promise.all([
                getCredentialBinding(),
                getSync(['baseUrl'])
            ]);
            let currentBaseUrl = '';
            try {
                currentBaseUrl = normalizeAndValidateBaseUrl(currentSettings.baseUrl);
            } catch (_) {
                // Invalid or missing current settings fail the comparison below.
            }
            const bindingStillCurrent = Boolean(currentBinding) &&
                currentBinding.apiKeyHash === expectedCredentialBinding.apiKeyHash &&
                currentBinding.baseUrl === expectedCredentialBinding.baseUrl &&
                currentBinding.verifiedAt === expectedCredentialBinding.verifiedAt &&
                currentBinding.privateLanHttpAuthGeneration ===
                    expectedCredentialBinding.privateLanHttpAuthGeneration &&
                expectedCredentialBinding.baseUrl === normalizedBaseUrl &&
                currentBaseUrl === normalizedBaseUrl;
            if (!bindingStillCurrent) {
                const error = new Error('API credentials changed before the request started');
                error.code = 'AUTHORIZATION_REVOKED';
                throw error;
            }
        }

        if (!normalizedApiKey || !isPrivateLanHttpBaseUrl(normalizedBaseUrl)) {
            return normalizedApiKey;
        }

        // Non-loopback private HTTP is anonymous by default. A key is released
        // only for the exact local endpoint/key generation the user enabled.
        if (!expectedPrivateLanAuthGeneration) {
            return '';
        }

        const currentGeneration = await getPrivateLanHttpAuthGeneration(
            normalizedApiKey,
            normalizedBaseUrl
        );
        if (currentGeneration !== expectedPrivateLanAuthGeneration) {
            const error = new Error('Private LAN HTTP authentication changed before the request started');
            error.code = 'AUTHORIZATION_REVOKED';
            throw error;
        }
        return normalizedApiKey;
    }

    function credentialBindingMatchesPrivateLanAuth(
        binding,
        apiKey,
        baseUrl,
        currentPrivateLanAuthGeneration
    ) {
        const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
        if (!normalizedApiKey || !isPrivateLanHttpBaseUrl(baseUrl)) {
            return true;
        }
        return Boolean(binding) &&
            Object.prototype.hasOwnProperty.call(binding, 'privateLanHttpAuthGeneration') &&
            binding.privateLanHttpAuthGeneration === currentPrivateLanAuthGeneration;
    }

    async function getCredentialBinding() {
        const result = await getLocal([CREDENTIAL_BINDING_LOCAL_KEY]);
        const binding = result[CREDENTIAL_BINDING_LOCAL_KEY];
        if (!binding || typeof binding !== 'object') {
            return null;
        }
        if (typeof binding.apiKeyHash !== 'string' ||
            typeof binding.baseUrl !== 'string' ||
            typeof binding.verifiedAt !== 'string') {
            return null;
        }
        return binding;
    }

    async function setVerifiedCredentials(apiKey, baseUrl, verifiedAt = new Date().toISOString()) {
        const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
        if (!normalizedApiKey && isApiKeyRequired(normalizedBaseUrl)) {
            throw new Error('API key is required for remote API servers');
        }
        const privateLanHttpAuthGeneration = await getPrivateLanHttpAuthGeneration(
            normalizedApiKey,
            normalizedBaseUrl
        );
        const binding = {
            apiKeyHash: await sha256Hex(normalizedApiKey),
            baseUrl: normalizedBaseUrl,
            verifiedAt,
            privateLanHttpAuthGeneration
        };

        // Store the key and its verified binding in one local write so the
        // background worker never observes a newly trusted key with an old URL.
        await setLocal({
            apiKey: normalizedApiKey,
            [CREDENTIAL_BINDING_LOCAL_KEY]: binding
        });
        await removeSync(VERIFICATION_SYNC_KEYS);
        return binding;
    }

    async function setVerifiedCredentialsAndModels(
        apiKey,
        baseUrl,
        availableModels,
        verifiedAt = new Date().toISOString(),
        expectedPrivateLanHttpAuthGeneration
    ) {
        const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
        if (!Array.isArray(availableModels)) {
            throw new Error('Verified model list must be an array');
        }

        const normalizedBaseUrl = normalizeAndValidateBaseUrl(baseUrl);
        if (!normalizedApiKey && isApiKeyRequired(normalizedBaseUrl)) {
            throw new Error('API key is required for remote API servers');
        }
        const privateLanHttpAuthGeneration = await getPrivateLanHttpAuthGeneration(
            normalizedApiKey,
            normalizedBaseUrl
        );
        if (expectedPrivateLanHttpAuthGeneration !== undefined &&
            privateLanHttpAuthGeneration !== expectedPrivateLanHttpAuthGeneration) {
            throw new Error('Private LAN HTTP authentication changed during verification');
        }
        const binding = {
            apiKeyHash: await sha256Hex(normalizedApiKey),
            baseUrl: normalizedBaseUrl,
            verifiedAt,
            privateLanHttpAuthGeneration
        };

        // One local write keeps credentials, their verification record, and
        // the model cache on the same generation. A failed write leaves the
        // previous complete generation intact instead of mixing old/new data.
        await setLocal({
            apiKey: normalizedApiKey,
            [CREDENTIAL_BINDING_LOCAL_KEY]: binding,
            availableModels,
            [MODEL_CACHE_BINDING_LOCAL_KEY]: {
                apiKeyHash: binding.apiKeyHash,
                baseUrl: binding.baseUrl,
                privateLanHttpAuthGeneration: binding.privateLanHttpAuthGeneration
            }
        });
        await removeSync(VERIFICATION_SYNC_KEYS);
        return binding;
    }

    async function clearCredentialBinding() {
        return removeLocal([CREDENTIAL_BINDING_LOCAL_KEY]);
    }

    async function invalidateCredentialGeneration() {
        return removeLocal([
            CREDENTIAL_BINDING_LOCAL_KEY,
            ...MODEL_CACHE_KEYS,
            PRIVATE_LAN_HTTP_AUTH_BINDING_LOCAL_KEY
        ]);
    }

    async function restrictLocalStorageAccess() {
        const local = areaApi('local');
        if (typeof local.setAccessLevel !== 'function') {
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    // Idempotently move any credentials found in sync storage into local storage.
    async function migrateApiKeyToLocal() {
        const legacy = await get('sync', LEGACY_SYNC_KEYS);
        if (legacy.apiKey === undefined && legacy.lastVerifiedApiKey === undefined) {
            return;
        }

        if (typeof legacy.apiKey === 'string' && legacy.apiKey) {
            const local = await getLocal(['apiKey']);
            if (!local.apiKey) {
                await setLocal({ apiKey: legacy.apiKey });
            }
        }

        if (typeof legacy.lastVerifiedApiKey === 'string' && legacy.lastVerifiedApiKey) {
            const existing = await get('sync', ['lastVerifiedApiKeyHash']);
            if (!existing.lastVerifiedApiKeyHash) {
                await set('sync', {
                    lastVerifiedApiKeyHash: await sha256Hex(legacy.lastVerifiedApiKey)
                });
            }
        }

        await remove('sync', LEGACY_SYNC_KEYS);
    }

    async function migrateVerificationToLocal() {
        const [localBinding, legacyVerification] = await Promise.all([
            getCredentialBinding(),
            get('sync', VERIFICATION_SYNC_KEYS)
        ]);

        if (localBinding) {
            if (VERIFICATION_SYNC_KEYS.some((key) => legacyVerification[key] !== undefined)) {
                await removeSync(VERIFICATION_SYNC_KEYS);
            }
            return localBinding;
        }

        let migratedBinding = null;
        const apiKey = await getApiKey();
        if (apiKey &&
            typeof legacyVerification.lastVerifiedApiKeyHash === 'string' &&
            typeof legacyVerification.lastVerifiedBaseUrl === 'string') {
            try {
                const currentHash = await sha256Hex(apiKey);
                if (currentHash === legacyVerification.lastVerifiedApiKeyHash) {
                    migratedBinding = {
                        apiKeyHash: currentHash,
                        baseUrl: normalizeAndValidateBaseUrl(legacyVerification.lastVerifiedBaseUrl),
                        verifiedAt: typeof legacyVerification.lastVerified === 'string'
                            ? legacyVerification.lastVerified
                            : new Date().toISOString()
                    };
                    await setLocal({ [CREDENTIAL_BINDING_LOCAL_KEY]: migratedBinding });
                }
            } catch (error) {
                console.warn('Ignoring invalid legacy API verification metadata:', error.message);
            }
        }

        if (VERIFICATION_SYNC_KEYS.some((key) => legacyVerification[key] !== undefined)) {
            await removeSync(VERIFICATION_SYNC_KEYS);
        }
        return migratedBinding;
    }

    async function prepareSecureLocalState() {
        await restrictLocalStorageAccess();
        await migrateApiKeyToLocal();
        return migrateVerificationToLocal();
    }

    async function migrateAvailableModelsToLocal(credentialBinding) {
        const localResult = await getLocal(MODEL_CACHE_KEYS);
        const localModels = Array.isArray(localResult.availableModels)
            ? localResult.availableModels
            : null;
        const cacheBinding = localResult[MODEL_CACHE_BINDING_LOCAL_KEY];
        const cacheMatchesCredentials = Boolean(
            localModels &&
            credentialBinding &&
            cacheBinding &&
            cacheBinding.apiKeyHash === credentialBinding.apiKeyHash &&
            cacheBinding.baseUrl === credentialBinding.baseUrl &&
            cacheBinding.privateLanHttpAuthGeneration ===
                credentialBinding.privateLanHttpAuthGeneration
        );

        const legacy = await get('sync', ['availableModels']);
        if (Array.isArray(legacy.availableModels)) {
            // A legacy list has no trustworthy credential provenance. Remove
            // it and require one verification instead of blessing stale data.
            await removeSync(['availableModels']);
        }

        if (!cacheMatchesCredentials) {
            if (localModels || cacheBinding) {
                await removeLocal(MODEL_CACHE_KEYS);
            }
            return undefined;
        }

        return localModels;
    }

    async function getOptionsState() {
        // Credential migration and access restriction must land before any
        // local reads. The remaining independent reads can then run together.
        const credentialBinding = await prepareSecureLocalState();
        const [syncResult, availableModels, apiKey] = await Promise.all([
            getSync(SYNC_KEYS, true),
            migrateAvailableModelsToLocal(credentialBinding),
            getApiKey()
        ]);
        const privateLanHttpAuthGeneration = await getPrivateLanHttpAuthGeneration(
            apiKey,
            syncResult.baseUrl
        );
        return {
            ...syncResult,
            apiKey,
            availableModels,
            privateLanHttpAuthGeneration,
            lastVerified: credentialBinding?.verifiedAt,
            lastVerifiedApiKeyHash: credentialBinding?.apiKeyHash,
            lastVerifiedBaseUrl: credentialBinding?.baseUrl,
            lastVerifiedPrivateLanHttpAuthGeneration:
                credentialBinding?.privateLanHttpAuthGeneration
        };
    }

    global.PointerSettings = {
        DEFAULT_SYNC_SETTINGS,
        MODEL_CACHE_KEYS,
        MODEL_CACHE_BINDING_LOCAL_KEY,
        CREDENTIAL_BINDING_LOCAL_KEY,
        PRIVATE_LAN_HTTP_AUTH_BINDING_LOCAL_KEY,
        SYNC_KEYS,
        LEGACY_SYNC_KEYS,
        VERIFICATION_SYNC_KEYS,
        ensureDefaults,
        getSync,
        getLocal,
        setSync,
        setLocal,
        removeSync,
        removeLocal,
        sha256Hex,
        quoteRemoteMessage,
        readResponseTextWithLimit,
        isApiKeyRequired,
        isPrivateLanHttpBaseUrl,
        normalizeAndValidateBaseUrl,
        getHostPermissionPattern,
        getLegacyHostPermissionPattern,
        getApiKey,
        setApiKey,
        getPrivateLanHttpAuthBinding,
        setPrivateLanHttpAuthAllowed,
        getPrivateLanHttpAuthGeneration,
        resolveApiKeyForRequest,
        credentialBindingMatchesPrivateLanAuth,
        getCredentialBinding,
        setVerifiedCredentials,
        setVerifiedCredentialsAndModels,
        clearCredentialBinding,
        invalidateCredentialGeneration,
        restrictLocalStorageAccess,
        getModifierName,
        formatShortcutChord,
        normalizeShortcutModifier,
        normalizeShortcutMode,
        normalizeShortcutSiteOverrides,
        normalizeShortcutHost,
        resolveShortcutMode,
        addShortcutSiteOverride,
        SHORTCUT_SITE_OVERRIDES_LIMIT,
        migrateShortcutModifier,
        migrateApiKeyToLocal,
        migrateVerificationToLocal,
        prepareSecureLocalState,
        migrateAvailableModelsToLocal,
        getOptionsState
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
