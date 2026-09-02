#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const settingsSource = fs.readFileSync(path.join(projectRoot, 'settings.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(projectRoot, 'background.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(projectRoot, 'content.js'), 'utf8');
const optionsSource = fs.readFileSync(path.join(projectRoot, 'options.js'), 'utf8');
const popupSource = fs.readFileSync(path.join(projectRoot, 'popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(projectRoot, 'popup.html'), 'utf8');
const optionsHtml = fs.readFileSync(path.join(projectRoot, 'options.html'), 'utf8');
const contentPageCss = fs.readFileSync(path.join(projectRoot, 'content-page.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
const i18nSource = fs.readFileSync(path.join(projectRoot, 'i18n.js'), 'utf8');
const I18n = require(path.join(projectRoot, 'i18n.js'));

// Everything the service worker is allowed to importScripts().
const workerImportableSources = {
    'settings.js': settingsSource,
    'i18n.js': i18nSource
};

function loadFetchAvailableModelsForTest(context) {
    const match = optionsSource.match(
        /    async function fetchAvailableModels\([\s\S]*?\n    \}\n\n\}\);\s*$/
    );
    assert.ok(match, 'could not extract fetchAvailableModels from options.js');
    const functionSource = match[0]
        .replace(/\n\n\}\);\s*$/, '')
        .replace(/^ {4}/gm, '')
        .replace(
            'async function fetchAvailableModels',
            'async function fetchAvailableModelsForTest'
        );
    vm.runInContext(functionSource, context, { filename: 'options-fetch-test.js' });
}

function createStorageArea(initialState, accessLog) {
    const state = { ...initialState };
    return {
        state,
        get(keys, callback) {
            const requested = Array.isArray(keys) ? keys : Object.keys(state);
            const result = {};
            for (const key of requested) {
                if (state[key] !== undefined) result[key] = state[key];
            }
            queueMicrotask(() => callback(result));
        },
        set(values, callback = () => {}) {
            Object.assign(state, values);
            queueMicrotask(callback);
        },
        remove(keys, callback = () => {}) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
            queueMicrotask(callback);
        },
        setAccessLevel(options, callback = () => {}) {
            accessLog.push(options);
            queueMicrotask(callback);
        }
    };
}

async function sha256Hex(text) {
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Buffer.from(digest).toString('hex');
}

async function createBackgroundHarness() {
    const apiKey = 'test-key';
    const baseUrl = 'https://api.example.test/v1';
    const binding = {
        apiKeyHash: await sha256Hex(apiKey),
        baseUrl,
        verifiedAt: '2026-08-23T00:00:00.000Z'
    };
    const accessLog = [];
    const syncArea = createStorageArea({ baseUrl, model: 'test-model' }, accessLog);
    const localArea = createStorageArea({ apiKey, credentialBinding: binding }, accessLog);
    const messageListeners = [];
    let fetchCount = 0;
    let activeFetches = 0;
    let peakFetches = 0;
    let fetchMode = 'success';
    let hostPermission = true;
    let optionsOpenCount = 0;
    let lastFetchUrl = null;
    let lastFetchOptions = null;
    let lastPermissionOrigins = null;

    const context = vm.createContext({
        AbortController,
        clearTimeout,
        console: {
            error() {},
            log() {},
            warn() {}
        },
        crypto: webcrypto,
        Error,
        fetch: async (url, options) => {
            fetchCount++;
            lastFetchUrl = url;
            lastFetchOptions = options;
            activeFetches++;
            peakFetches = Math.max(peakFetches, activeFetches);
            await new Promise((resolve) => setTimeout(resolve, 5));
            activeFetches--;
            if (fetchMode === 'json-error') {
                return new Response(JSON.stringify({ error: { message: 'provider says bad key' } }), {
                    status: 401,
                    headers: { 'content-type': 'application/json' }
                });
            }
            if (String(url).endsWith('/models')) {
                return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }
            return new Response(JSON.stringify({
                choices: [{ message: { content: 'translated' } }]
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        },
        // Honour the arguments rather than hard-loading settings.js: background.js
        // also pulls in i18n.js, and a stub that ignores what it was asked for
        // would hide a missing or misnamed import.
        importScripts(...files) {
            for (const file of files) {
                const source = workerImportableSources[file];
                assert.ok(source, `background.js imported an unstubbed file: ${file}`);
                vm.runInContext(source, context, { filename: file });
            }
        },
        Promise,
        queueMicrotask,
        Response,
        setTimeout,
        TextDecoder,
        TextEncoder,
        URL
    });

    context.chrome = {
        action: { setIcon(_options, callback) { callback(); } },
        permissions: {
            contains(options, callback) {
                lastPermissionOrigins = options.origins;
                queueMicrotask(() => callback(hostPermission));
            }
        },
        runtime: {
            id: 'pointer-test-extension',
            lastError: null,
            getURL(file) { return `chrome-extension://pointer-test-extension/${file}`; },
            openOptionsPage(callback) {
                optionsOpenCount++;
                callback();
            },
            onInstalled: { addListener() {} },
            onMessage: { addListener(listener) { messageListeners.push(listener); } }
        },
        storage: {
            local: localArea,
            sync: syncArea
        }
    };

    vm.runInContext(backgroundSource, context, { filename: 'background.js' });
    loadFetchAvailableModelsForTest(context);
    assert.equal(messageListeners.length, 1);
    await vm.runInContext('waitForSecureLocalState()', context);

    function dispatch(request, tabId = 1, senderId = 'pointer-test-extension') {
        return new Promise((resolve, reject) => {
            let settled = false;
            const sender = { id: senderId, tab: { id: tabId } };
            const keepOpen = messageListeners[0](request, sender, (response) => {
                settled = true;
                resolve({ keepOpen, response });
            });
            if (!keepOpen && !settled) resolve({ keepOpen, response: undefined });
            setTimeout(() => {
                if (!settled && keepOpen) reject(new Error('Timed out waiting for background response'));
            }, 3000);
        });
    }

    // An extension page (popup/options) sends without a tab. Used to prove the
    // content-script-only actions really do reject everything else.
    function dispatchFromExtensionPage(request) {
        return new Promise((resolve, reject) => {
            // A rejected sender is answered synchronously — before the listener
            // returns — so the response is captured first and resolved after,
            // when keepOpen is actually known.
            let settled = false;
            let pendingResponse;
            let resolveLater = null;
            const sender = { id: 'pointer-test-extension' };
            const keepOpen = messageListeners[0](request, sender, (response) => {
                settled = true;
                pendingResponse = response;
                if (resolveLater) resolveLater(response);
            });
            if (settled) {
                resolve({ keepOpen, response: pendingResponse });
            } else if (!keepOpen) {
                resolve({ keepOpen, response: undefined });
            } else {
                resolveLater = (response) => resolve({ keepOpen, response });
            }
            setTimeout(() => {
                if (!settled && keepOpen) reject(new Error('Timed out waiting for background response'));
            }, 3000);
        });
    }

    return {
        context,
        dispatch,
        dispatchFromExtensionPage,
        localArea,
        syncArea,
        accessLog,
        get fetchCount() { return fetchCount; },
        get optionsOpenCount() { return optionsOpenCount; },
        get peakFetches() { return peakFetches; },
        get lastFetchUrl() { return lastFetchUrl; },
        get lastFetchOptions() { return lastFetchOptions; },
        get lastPermissionOrigins() { return lastPermissionOrigins; },
        setFetchMode(value) { fetchMode = value; },
        setHostPermission(value) { hostPermission = value; }
    };
}

async function run() {
    const harness = await createBackgroundHarness();

    assert.equal(harness.accessLog.at(-1).accessLevel, 'TRUSTED_CONTEXTS');
    assert.equal(
        vm.runInContext("PointerSettings.normalizeAndValidateBaseUrl('http://localhost:11434/v1/')", harness.context),
        'http://localhost:11434/v1'
    );
    const allowedPrivateHttpUrls = [
        'http://127.9.8.7:11434/v1',
        'http://10.0.0.7:8080/v1',
        'http://172.16.0.1/v1',
        'http://172.31.255.255/v1',
        'http://192.168.50.23:1234/v1',
        'http://[fd12:3456::7]:1234/v1'
    ];
    for (const url of allowedPrivateHttpUrls) {
        assert.equal(
            vm.runInContext(`PointerSettings.normalizeAndValidateBaseUrl(${JSON.stringify(url)})`, harness.context),
            url
        );
    }

    const rejectedHttpUrls = [
        'http://api.example.test/v1',
        'http://nas.local/v1',
        'http://172.32.0.1/v1',
        'http://100.64.0.1/v1',
        'http://169.254.1.1/v1',
        'http://8.8.8.8/v1',
        'http://[fe80::1]/v1',
        'http://[2001:db8::1]/v1'
    ];
    for (const url of rejectedHttpUrls) {
        assert.throws(
            () => vm.runInContext(`PointerSettings.normalizeAndValidateBaseUrl(${JSON.stringify(url)})`, harness.context),
            /must use HTTPS/
        );
    }

    const privateLanAuthUrl = 'http://192.168.50.23:1234/v1';
    assert.equal(vm.runInContext(
        `PointerSettings.isPrivateLanHttpBaseUrl(${JSON.stringify(privateLanAuthUrl)})`,
        harness.context
    ), true);
    assert.equal(vm.runInContext(
        "PointerSettings.isPrivateLanHttpBaseUrl('http://localhost:11434/v1')",
        harness.context
    ), false);
    assert.equal(vm.runInContext(
        "PointerSettings.isPrivateLanHttpBaseUrl('https://192.168.50.23/v1')",
        harness.context
    ), false);

    // Private-LAN HTTP is anonymous by default even when a key is filled in.
    // HTTPS and loopback retain their existing key behaviour.
    assert.equal(await vm.runInContext(
        `PointerSettings.resolveApiKeyForRequest('team-key', ${JSON.stringify(privateLanAuthUrl)})`,
        harness.context
    ), '');
    assert.equal(await vm.runInContext(
        "PointerSettings.resolveApiKeyForRequest('team-key', 'http://localhost:11434/v1')",
        harness.context
    ), 'team-key');
    assert.equal(await vm.runInContext(
        "PointerSettings.resolveApiKeyForRequest('team-key', 'https://api.example.test/v1')",
        harness.context
    ), 'team-key');

    const firstLanAuthGeneration = await vm.runInContext(
        `PointerSettings.setPrivateLanHttpAuthAllowed(` +
        `'team-key', ${JSON.stringify(privateLanAuthUrl)}, true)`,
        harness.context
    );
    assert.match(firstLanAuthGeneration, /^[a-f0-9]{32}$/);
    assert.equal(await vm.runInContext(
        `PointerSettings.getPrivateLanHttpAuthGeneration(` +
        `'team-key', ${JSON.stringify(privateLanAuthUrl)})`,
        harness.context
    ), firstLanAuthGeneration);
    assert.equal(await vm.runInContext(
        `PointerSettings.resolveApiKeyForRequest(` +
        `'team-key', ${JSON.stringify(privateLanAuthUrl)}, ` +
        `${JSON.stringify(firstLanAuthGeneration)})`,
        harness.context
    ), 'team-key');
    await assert.rejects(
        vm.runInContext(
            `PointerSettings.setVerifiedCredentialsAndModels(` +
            `'team-key', ${JSON.stringify(privateLanAuthUrl)}, [{ id: 'model' }], ` +
            `'2026-08-30T00:00:00.000Z', 'stale-generation')`,
            harness.context
        ),
        /changed during verification/
    );
    assert.equal(await vm.runInContext(
        `PointerSettings.getPrivateLanHttpAuthGeneration(` +
        `'different-key', ${JSON.stringify(privateLanAuthUrl)})`,
        harness.context
    ), null);
    assert.equal(await vm.runInContext(
        "PointerSettings.getPrivateLanHttpAuthGeneration(" +
        "'team-key', 'http://192.168.50.24:1234/v1')",
        harness.context
    ), null);

    await vm.runInContext(
        `PointerSettings.setPrivateLanHttpAuthAllowed(` +
        `'team-key', ${JSON.stringify(privateLanAuthUrl)}, false)`,
        harness.context
    );
    await assert.rejects(
        vm.runInContext(
            `PointerSettings.resolveApiKeyForRequest(` +
            `'team-key', ${JSON.stringify(privateLanAuthUrl)}, ` +
            `${JSON.stringify(firstLanAuthGeneration)})`,
            harness.context
        ),
        (error) => error.code === 'AUTHORIZATION_REVOKED'
    );

    const secondLanAuthGeneration = await vm.runInContext(
        `PointerSettings.setPrivateLanHttpAuthAllowed(` +
        `'team-key', ${JSON.stringify(privateLanAuthUrl)}, true)`,
        harness.context
    );
    assert.notEqual(secondLanAuthGeneration, firstLanAuthGeneration);
    await assert.rejects(
        vm.runInContext(
            `PointerSettings.resolveApiKeyForRequest(` +
            `'team-key', ${JSON.stringify(privateLanAuthUrl)}, ` +
            `${JSON.stringify(firstLanAuthGeneration)})`,
            harness.context
        ),
        (error) => error.code === 'AUTHORIZATION_REVOKED'
    );
    assert.equal(await vm.runInContext(
        `PointerSettings.resolveApiKeyForRequest(` +
        `'team-key', ${JSON.stringify(privateLanAuthUrl)}, ` +
        `${JSON.stringify(secondLanAuthGeneration)})`,
        harness.context
    ), 'team-key');
    await vm.runInContext(
        `PointerSettings.setPrivateLanHttpAuthAllowed(` +
        `'team-key', ${JSON.stringify(privateLanAuthUrl)}, false)`,
        harness.context
    );
    await assert.rejects(
        vm.runInContext(
            "PointerSettings.setPrivateLanHttpAuthAllowed(" +
            "'team-key', 'http://localhost:11434/v1', true)",
            harness.context
        ),
        /requires a private HTTP endpoint/
    );
    await assert.rejects(
        vm.runInContext(
            "PointerSettings.setPrivateLanHttpAuthAllowed(" +
            "'team-key', 'http://8.8.8.8/v1', true)",
            harness.context
        ),
        /must use HTTPS/
    );

    assert.equal(
        vm.runInContext("PointerSettings.getHostPermissionPattern('https://api.example.test:8443/v1')", harness.context),
        'https://api.example.test:8443/*'
    );
    assert.equal(
        vm.runInContext("PointerSettings.getHostPermissionPattern('https://api.example.test/v1')", harness.context),
        'https://api.example.test:443/*'
    );
    assert.equal(
        vm.runInContext("PointerSettings.getHostPermissionPattern('http://192.168.50.23:1234/v1')", harness.context),
        'http://192.168.50.23:1234/*'
    );
    assert.equal(
        vm.runInContext("PointerSettings.getHostPermissionPattern('http://[fd12:3456::7]:1234/v1')", harness.context),
        'http://[fd12:3456::7]:1234/*'
    );
    assert.equal(
        vm.runInContext("PointerSettings.getLegacyHostPermissionPattern('http://192.168.50.23:1234/v1')", harness.context),
        'http://192.168.50.23/*'
    );

    let oversizedBodyCancelled = false;
    harness.context.oversizedResponse = new Response(new ReadableStream({
        pull(controller) {
            controller.enqueue(new Uint8Array(1024));
        },
        cancel() {
            oversizedBodyCancelled = true;
        }
    }));
    await assert.rejects(
        vm.runInContext(
            "PointerSettings.readResponseTextWithLimit(oversizedResponse, 2048, 'bounded overflow')",
            harness.context
        ),
        /bounded overflow/
    );
    assert.equal(oversizedBodyCancelled, true);

    // Error text from the endpoint is shown in a page toast and in the options
    // page's verify status. It must arrive attributed and bounded, so a hostile
    // endpoint cannot speak in Pointer's own voice or flood the toast.
    const quote = (value) => vm.runInContext(
        `PointerSettings.quoteRemoteMessage(${JSON.stringify(value)})`,
        harness.context
    );
    assert.equal(quote('rate limit exceeded'), 'The API server replied: "rate limit exceeded"');
    for (const empty of ['', '   ', '\n\t']) {
        assert.equal(quote(empty), 'The API server replied with an empty error.');
    }
    // Newlines and control characters collapse, so the attributing prefix
    // cannot be pushed out of view in a single-line toast.
    assert.equal(
        quote('first\nsecond\r third'),
        'The API server replied: "first second third"'
    );
    const clipped = quote('x'.repeat(500));
    assert.ok(clipped.startsWith('The API server replied: "'));
    assert.ok(clipped.endsWith('…"'));
    assert.ok(clipped.length < 160, 'quoted remote text must stay toast-sized');
    // Both surfaces that show endpoint text must route through the helper.
    assert.ok(
        /Settings\.quoteRemoteMessage\(/.test(backgroundSource),
        'background.js must attribute endpoint error text'
    );
    assert.ok(
        /Settings\.quoteRemoteMessage\(/.test(optionsSource),
        'options.js must attribute endpoint error text'
    );

    const rejectedSender = await harness.dispatch(
        { action: 'translate', text: ['hello'], targetLang: 'zh' },
        1,
        'different-extension'
    );
    assert.equal(rejectedSender.keepOpen, false);
    assert.equal(harness.fetchCount, 0);

    const openedOptions = await harness.dispatch({ action: 'openOptions' });
    assert.equal(openedOptions.keepOpen, false);
    assert.equal(harness.optionsOpenCount, 1);

    const batches = Array.from({ length: 5 }, (_, index) =>
        harness.dispatch({
            action: 'translate',
            text: Array.from({ length: 10 }, (__, segment) => `text-${index}-${segment}`),
            targetLang: 'zh-hant'
        }, index + 1)
    );
    const batchResults = await Promise.all(batches);
    assert.ok(batchResults.every(({ response }) => response.translations.length === 10));
    assert.equal(harness.fetchCount, 50);
    assert.ok(harness.peakFetches <= 3, `global fetch peak was ${harness.peakFetches}`);
    assert.deepEqual(
        Array.from(harness.lastPermissionOrigins),
        ['https://api.example.test:443/*']
    );

    harness.syncArea.state.baseUrl = 'https://changed.example.test/v1';
    const beforeBindingMismatch = harness.fetchCount;
    const mismatch = await harness.dispatch({ action: 'translate', text: ['hello'], targetLang: 'zh' }, 20);
    assert.equal(mismatch.response.errorCode, 'API_VERIFICATION_REQUIRED');
    assert.equal(harness.fetchCount, beforeBindingMismatch);
    harness.context.bindingBeforeSyncedEndpointChange = {
        ...harness.localArea.state.credentialBinding
    };
    await assert.rejects(
        vm.runInContext(
            "translateText('hello', 'zh', 'test-key', " +
            "'https://api.example.test/v1', 'test-model', null, " +
            "bindingBeforeSyncedEndpointChange)",
            harness.context
        ),
        (error) => error.code === 'AUTHORIZATION_REVOKED'
    );
    assert.equal(harness.fetchCount, beforeBindingMismatch);
    harness.syncArea.state.baseUrl = 'https://api.example.test/v1';

    harness.setHostPermission(false);
    const missingPermission = await harness.dispatch({ action: 'translate', text: ['hello'], targetLang: 'zh' }, 21);
    assert.equal(missingPermission.response.errorCode, 'HOST_PERMISSION_REQUIRED');
    harness.setHostPermission(true);

    // A translation that was accepted before the user edited or cleared the
    // credentials must re-check the verified binding when its queue slot opens.
    // This covers HTTPS/loopback as well as the private-LAN generation below.
    harness.context.queuedCredentialBinding = {
        ...harness.localArea.state.credentialBinding
    };
    await vm.runInContext('PointerSettings.clearCredentialBinding()', harness.context);
    const beforeRevokedQueuedRequest = harness.fetchCount;
    await assert.rejects(
        vm.runInContext(
            "translateText('hello', 'zh', 'test-key', " +
            "'https://api.example.test/v1', 'test-model', null, queuedCredentialBinding)",
            harness.context
        ),
        (error) => error.code === 'AUTHORIZATION_REVOKED'
    );
    assert.equal(harness.fetchCount, beforeRevokedQueuedRequest);
    await vm.runInContext(
        "PointerSettings.setVerifiedCredentials(" +
        "'test-key', 'https://api.example.test/v1', '2026-08-23T00:00:01.000Z')",
        harness.context
    );

    vm.runInContext('consumeTranslationRateLimit(99, 40, 1000)', harness.context);
    vm.runInContext('consumeTranslationRateLimit(99, 40, 1000)', harness.context);
    assert.throws(
        () => vm.runInContext('consumeTranslationRateLimit(99, 1, 1)', harness.context),
        /Too many translations/
    );

    harness.setFetchMode('json-error');
    await assert.rejects(
        vm.runInContext(
            "translateText('hello', 'zh', 'test-key', 'https://api.example.test/v1', 'test-model')",
            harness.context
        ),
        /provider says bad key/
    );

    await vm.runInContext(
        "PointerSettings.setVerifiedCredentialsAndModels(" +
        "'next-key', 'https://next.example.test/v1', [{ id: 'next-model' }], " +
        "'2026-08-27T00:00:00.000Z')",
        harness.context
    );
    const nextHash = await sha256Hex('next-key');
    assert.equal(harness.localArea.state.apiKey, 'next-key');
    assert.equal(harness.localArea.state.credentialBinding.apiKeyHash, nextHash);
    assert.equal(harness.localArea.state.availableModelsBinding.apiKeyHash, nextHash);
    assert.equal(harness.localArea.state.availableModelsBinding.baseUrl, 'https://next.example.test/v1');
    assert.equal(JSON.stringify(harness.localArea.state.availableModels), JSON.stringify([{ id: 'next-model' }]));

    harness.localArea.state.availableModelsBinding = {
        apiKeyHash: 'stale-hash',
        baseUrl: 'https://stale.example.test/v1'
    };
    const staleModels = await vm.runInContext(
        'PointerSettings.migrateAvailableModelsToLocal(credentialBindingForTest)',
        Object.assign(harness.context, {
            credentialBindingForTest: harness.localArea.state.credentialBinding
        })
    );
    assert.equal(staleModels, undefined);
    assert.equal(harness.localArea.state.availableModels, undefined);
    assert.equal(harness.localArea.state.availableModelsBinding, undefined);

    await assert.rejects(
        vm.runInContext(
            "PointerSettings.setVerifiedCredentialsAndModels(" +
            "'', 'https://api.example.test/v1', [{ id: 'remote-model' }])",
            harness.context
        ),
        /required for remote API servers/
    );

    const localBaseUrl = 'http://192.168.50.23:1234/v1';
    await vm.runInContext(
        "PointerSettings.setVerifiedCredentialsAndModels(" +
        "'', 'http://192.168.50.23:1234/v1', [{ id: 'local-model' }], " +
        "'2026-08-30T00:00:00.000Z')",
        harness.context
    );
    const emptyKeyHash = await sha256Hex('');
    assert.equal(harness.localArea.state.apiKey, '');
    assert.equal(harness.localArea.state.credentialBinding.apiKeyHash, emptyKeyHash);
    assert.equal(harness.localArea.state.availableModelsBinding.apiKeyHash, emptyKeyHash);
    assert.equal(harness.localArea.state.availableModelsBinding.baseUrl, localBaseUrl);

    harness.syncArea.state.baseUrl = localBaseUrl;
    harness.syncArea.state.model = 'local-model';
    harness.setFetchMode('success');

    const localStatus = await harness.dispatch({ action: 'hasApiKey' }, 22);
    assert.equal(localStatus.response.hasApiKey, true);
    assert.equal(localStatus.response.isVerified, true);
    assert.equal(localStatus.response.hasHostPermission, true);
    assert.deepEqual(
        Array.from(harness.lastPermissionOrigins),
        ['http://192.168.50.23:1234/*']
    );

    const localTranslation = await harness.dispatch(
        { action: 'translate', text: ['local hello'], targetLang: 'zh' },
        22
    );
    assert.deepEqual(Array.from(localTranslation.response.translations), ['translated']);
    assert.equal(harness.lastFetchUrl, `${localBaseUrl}/chat/completions`);
    assert.equal(
        Object.prototype.hasOwnProperty.call(harness.lastFetchOptions.headers, 'Authorization'),
        false
    );

    // A filled key is still withheld from non-loopback private HTTP until the
    // exact endpoint/key switch is enabled and the pair is verified again.
    await vm.runInContext(
        `PointerSettings.setPrivateLanHttpAuthAllowed(` +
        `'lan-team-key', ${JSON.stringify(localBaseUrl)}, false)`,
        harness.context
    );
    await vm.runInContext(
        `PointerSettings.setVerifiedCredentialsAndModels(` +
        `'lan-team-key', ${JSON.stringify(localBaseUrl)}, [{ id: 'local-model' }], ` +
        `'2026-08-30T00:00:01.000Z')`,
        harness.context
    );
    const privateOffModels = await vm.runInContext(
        `fetchAvailableModelsForTest(` +
        `'lan-team-key', ${JSON.stringify(localBaseUrl)}, null)`,
        harness.context
    );
    assert.equal(privateOffModels[0].id, 'test-model');
    assert.equal(
        Object.prototype.hasOwnProperty.call(harness.lastFetchOptions.headers, 'Authorization'),
        false
    );
    const privateOffTranslation = await harness.dispatch(
        { action: 'translate', text: ['private anonymous'], targetLang: 'zh' },
        23
    );
    assert.deepEqual(Array.from(privateOffTranslation.response.translations), ['translated']);
    assert.equal(
        Object.prototype.hasOwnProperty.call(harness.lastFetchOptions.headers, 'Authorization'),
        false
    );

    await vm.runInContext('PointerSettings.invalidateCredentialGeneration()', harness.context);
    const enabledLanAuthGeneration = await vm.runInContext(
        `PointerSettings.setPrivateLanHttpAuthAllowed(` +
        `'lan-team-key', ${JSON.stringify(localBaseUrl)}, true)`,
        harness.context
    );
    await vm.runInContext(
        `PointerSettings.setVerifiedCredentialsAndModels(` +
        `'lan-team-key', ${JSON.stringify(localBaseUrl)}, [{ id: 'local-model' }], ` +
        `'2026-08-30T00:00:02.000Z')`,
        harness.context
    );
    const privateAuthenticatedModels = await vm.runInContext(
        `fetchAvailableModelsForTest(` +
        `'lan-team-key', ${JSON.stringify(localBaseUrl)}, ` +
        `${JSON.stringify(enabledLanAuthGeneration)})`,
        harness.context
    );
    assert.equal(privateAuthenticatedModels[0].id, 'test-model');
    assert.equal(
        harness.lastFetchOptions.headers.Authorization,
        'Bearer lan-team-key'
    );
    const privateAuthenticatedTranslation = await harness.dispatch(
        { action: 'translate', text: ['private authenticated'], targetLang: 'zh' },
        24
    );
    assert.deepEqual(
        Array.from(privateAuthenticatedTranslation.response.translations),
        ['translated']
    );
    assert.equal(
        harness.lastFetchOptions.headers.Authorization,
        'Bearer lan-team-key'
    );

    harness.context.queuedLanCredentialBinding = {
        ...harness.localArea.state.credentialBinding
    };
    await vm.runInContext('PointerSettings.invalidateCredentialGeneration()', harness.context);
    assert.equal(harness.localArea.state.credentialBinding, undefined);
    assert.equal(harness.localArea.state.privateLanHttpAuthBinding, undefined);
    assert.equal(harness.localArea.state.availableModels, undefined);
    assert.equal(harness.localArea.state.availableModelsBinding, undefined);
    const beforeRevokedLanRequest = harness.fetchCount;
    await assert.rejects(
        vm.runInContext(
            `translateText('hello', 'zh', 'lan-team-key', ` +
            `${JSON.stringify(localBaseUrl)}, 'local-model', ` +
            `${JSON.stringify(enabledLanAuthGeneration)}, queuedLanCredentialBinding)`,
            harness.context
        ),
        (error) => error.code === 'AUTHORIZATION_REVOKED'
    );
    assert.equal(harness.fetchCount, beforeRevokedLanRequest);

    const beforeEmptyRemoteKey = harness.fetchCount;
    await assert.rejects(
        vm.runInContext(
            "translateText('hello', 'zh', '', 'https://api.example.test/v1', 'test-model')",
            harness.context
        ),
        /required for remote API servers/
    );
    assert.equal(harness.fetchCount, beforeEmptyRemoteKey);

    // ——— Localized in-page notices (content.js has no i18n of its own) ———
    harness.syncArea.state.uiLang = 'ja';
    const localized = await harness.dispatch({
        action: 'localizeMessage',
        messageKey: 'shortcutConflictDowngraded',
        params: { key: 'T', chord: '⌥T' }
    }, 31);
    assert.equal(localized.response.text, I18n.getTranslations('ja').shortcutConflictDowngraded
        .split('{key}').join('T').split('{chord}').join('⌥T'));
    assert.doesNotMatch(localized.response.text, /\{(?:key|chord)\}/);

    // An unsupported uiLang must fall back rather than return the raw key.
    harness.syncArea.state.uiLang = 'not-a-language';
    const fallbackLocalized = await harness.dispatch({
        action: 'localizeMessage',
        messageKey: 'shortcutConflictSaveFailed',
        params: { key: 'T', chord: 'Alt+T' }
    }, 31);
    assert.match(fallbackLocalized.response.text, /could not be saved/);
    harness.syncArea.state.uiLang = 'en';

    // The allowlist is the boundary: an arbitrary key is refused outright.
    const unknownKeyResult = await harness.dispatch({
        action: 'localizeMessage',
        messageKey: 'labelApiKey',
        params: {}
    }, 31);
    assert.equal(unknownKeyResult.response.errorCode, 'UNKNOWN_MESSAGE_KEY');
    assert.equal(unknownKeyResult.response.text, undefined);

    // Params are clamped so the toast cannot be driven as an arbitrary-text sink.
    const longParamResult = await harness.dispatch({
        action: 'localizeMessage',
        messageKey: 'shortcutConflictDowngraded',
        params: { key: 'X'.repeat(500), chord: 'Alt+T', 'bad name': 'ignored', nested: { a: 1 } }
    }, 31);
    assert.ok(longParamResult.response.text.length < 400);
    assert.doesNotMatch(longParamResult.response.text, /ignored/);
    // A param the string does not name leaves no residue, and an absent one
    // leaves its placeholder visible rather than blanking silently.
    const missingParamResult = await harness.dispatch({
        action: 'localizeMessage',
        messageKey: 'shortcutConflictDowngraded',
        params: { key: 'T' }
    }, 31);
    assert.match(missingParamResult.response.text, /\{chord\}/);

    // Extension pages have I18n directly; the message path is content-only.
    const localizeFromPage = await harness.dispatchFromExtensionPage({
        action: 'localizeMessage',
        messageKey: 'shortcutConflictDowngraded',
        params: {}
    });
    assert.equal(localizeFromPage.response.errorCode, 'INVALID_SENDER');

    // ——— Per-site override map: capped, evicted oldest-first ———
    const overrideLimit = vm.runInContext(
        'PointerSettings.SHORTCUT_SITE_OVERRIDES_LIMIT', harness.context);
    assert.equal(overrideLimit, 100);
    const cappedOverrides = vm.runInContext(`(() => {
        let map = {};
        for (let i = 0; i < ${overrideLimit + 10}; i++) {
            map = PointerSettings.addShortcutSiteOverride(map, 'site' + i + '.example', 'alt');
        }
        return JSON.stringify({ keys: Object.keys(map), size: Object.keys(map).length });
    })()`, harness.context);
    const cappedResult = JSON.parse(cappedOverrides);
    assert.equal(cappedResult.size, overrideLimit);
    assert.equal(cappedResult.keys.includes('site0.example'), false);
    assert.equal(cappedResult.keys[cappedResult.keys.length - 1],
        `site${overrideLimit + 9}.example`);
    // An unusable host or mode is refused rather than stored.
    assert.equal(vm.runInContext(
        "PointerSettings.addShortcutSiteOverride({}, 'has space.example', 'alt')", harness.context), null);
    assert.equal(vm.runInContext(
        "PointerSettings.addShortcutSiteOverride({}, 'example.com', 'ALT')", harness.context), null);
    // Reading a corrupt map drops the bad entries instead of passing them on.
    assert.deepEqual(
        JSON.parse(vm.runInContext(
            "JSON.stringify(PointerSettings.normalizeShortcutSiteOverrides(" +
            "{ 'WWW.Example.COM': 'ALT', 'ok.example': 'off', 'bad host': 'alt' }))",
            harness.context)),
        { 'ok.example': 'off' }
    );

    // ——— content.js no longer receives messages ———
    // popup.js lost chrome.tabs, so nothing sends these; receivers for messages
    // with no sender are surface without a purpose.
    assert.doesNotMatch(contentSource, /chrome\.runtime\.onMessage\.addListener/);
    for (const deadAction of ['activate', 'deactivate', 'toggleButtonVisibility']) {
        assert.doesNotMatch(
            contentSource,
            new RegExp(`request\\.action === '${deadAction}'`),
            `content.js still handles the removed '${deadAction}' message`
        );
    }

    assert.match(contentSource, /attachShadow\(\{ mode: 'closed' \}\)/);
    assert.match(contentSource, /if \(!event \|\| !event\.isTrusted\) return;/);
    assert.doesNotMatch(contentSource, /querySelectorAll\(TRANSLATED_TEXT_SELECTOR/);
    assert.match(contentSource, /const spans = getConnectedOwnedTranslatedNodes\(\);/);
    assert.match(contentSource, /segments\.map\(seg => seg\.text\)\.join\(DELIMITER\)/);
    assert.doesNotMatch(contentSource, /join\(` \$\{DELIMITER\} `\)/);

    // Switching back to source text must not retain Pointer's pre-wrap layout.
    // The wrapper keeps only the designed dashed state mark and click behavior.
    const displayStateFunctionSource = contentSource.match(
        /^function applyTranslatedNodeDisplayState\([^\n]+\) \{[\s\S]*?^\}\n/m
    );
    assert.ok(displayStateFunctionSource, 'missing translated-node display-state helper');
    const applyDisplayState = vm.runInNewContext(`(${displayStateFunctionSource[0]})`);
    const classes = new Set();
    const declarations = new Map();
    const priorities = new Map();
    const translatedNode = {
        textContent: '',
        classList: {
            toggle(name, enabled) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            }
        },
        style: {
            removeProperty(name) {
                declarations.delete(name);
                priorities.delete(name);
            },
            setProperty(name, value, priority = '') {
                declarations.set(name, value);
                priorities.set(name, priority);
            }
        }
    };
    const translatedState = {
        originalText: 'Original  text',
        translatedText: '译文',
        showingOriginal: false
    };

    applyDisplayState(translatedNode, translatedState, false);
    assert.equal(translatedNode.textContent, '译文');
    assert.equal(declarations.get('white-space'), 'pre-wrap');
    assert.ok(classes.has('ai-translator-highlight'));

    applyDisplayState(translatedNode, translatedState, true);
    assert.equal(translatedNode.textContent, 'Original  text');
    assert.equal(translatedState.showingOriginal, true);
    assert.ok(classes.has('ai-translator-original'));
    assert.ok(!classes.has('ai-translator-highlight'));
    assert.ok(!declarations.has('white-space'));
    assert.ok(!declarations.has('display'));
    assert.equal(declarations.get('all'), 'unset');
    assert.equal(priorities.get('all'), 'important');
    assert.equal(
        declarations.get('border-bottom'),
        '1px dashed var(--pointer-original-underline-color, rgba(31, 28, 25, 0.3))'
    );
    assert.equal(declarations.get('cursor'), 'pointer');
    assert.equal(priorities.get('border-bottom'), 'important');

    applyDisplayState(translatedNode, translatedState, false);
    assert.equal(translatedNode.textContent, '译文');
    assert.ok(!declarations.has('all'));
    assert.ok(!declarations.has('border-bottom'));
    assert.ok(!declarations.has('cursor'));
    assert.equal(declarations.get('white-space'), 'pre-wrap');
    assert.equal(declarations.get('display'), 'inline');
    const originalStyleRule = contentPageCss.match(
        /\[data-pointer-extension-owned="translation"\]\.ai-translator-original \{([\s\S]*?)\n\}/
    );
    assert.ok(originalStyleRule, 'missing neutral original-text style');
    assert.match(originalStyleRule[1], /all:\s*unset\s*!important/);
    assert.match(
        originalStyleRule[1],
        /--pointer-original-underline-color:\s*rgba\(31, 28, 25, 0\.3\)\s*!important/
    );
    assert.doesNotMatch(originalStyleRule[1], /\bwhite-space\s*:/);
    assert.match(
        contentPageCss,
        /\.ai-translator-original:hover \{\s*--pointer-original-underline-color:\s*rgba\(31, 28, 25, 0\.62\)\s*!important/
    );
    assert.match(
        contentPageCss,
        /\.ai-translator-original:hover \{\s*--pointer-original-underline-color:\s*rgba\(245, 242, 237, 0\.75\)\s*!important/
    );
    assert.match(backgroundSource, /Settings\.readResponseTextWithLimit\(/);
    assert.match(optionsSource, /Settings\.readResponseTextWithLimit\(/);
    assert.doesNotMatch(backgroundSource, /await response\.text\(\)/);
    assert.doesNotMatch(optionsSource, /await response\.text\(\)/);
    assert.match(optionsSource, /Settings\.setVerifiedCredentialsAndModels\(/);
    assert.match(optionsSource, /Settings\.resolveApiKeyForRequest\(/);
    assert.match(optionsSource, /Settings\.setPrivateLanHttpAuthAllowed\(/);
    assert.match(optionsSource, /Settings\.invalidateCredentialGeneration\(/);
    assert.match(optionsSource, /chrome\.permissions\.remove\(/);
    assert.match(popupSource, /window\.addEventListener\('pagehide', flushCustomLanguageSave\)/);
    assert.match(popupSource, /document\.visibilityState === 'hidden'/);
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.deepEqual(manifest.optional_host_permissions, ['https://*/*', 'http://*/*']);
    assert.doesNotMatch(backgroundSource, /chrome\.tabs\.|chrome\.windows\./);
    assert.doesNotMatch(popupSource, /chrome\.tabs\./);
    assert.doesNotMatch(popupHtml, /id="targetLang"|popup-shim\.js/);
    assert.doesNotMatch(optionsHtml, /options-shim\.js/);
    assert.match(optionsHtml, /id="privateLanHttpAuthRow" hidden/);
    assert.match(optionsHtml, /id="privateLanHttpAuth"[^>]*class="mtoggle-input"/);
    assert.match(optionsHtml, /aria-labelledby="privateLanHttpAuthLabel"/);
    assert.match(popupHtml, /role="combobox"/);
    assert.match(popupHtml, /aria-controls="langLens"/);
    const languageOptionTags = popupHtml.match(/<div class="lens-item"[^>]*>/g) || [];
    assert.ok(languageOptionTags.length > 0);
    for (const optionTag of languageOptionTags) {
        assert.match(optionTag, /role="option"/);
        assert.match(optionTag, /aria-selected="(?:true|false)"/);
        assert.match(optionTag, /data-value="[^"]+"/);
    }

    const interfaceSource = [popupHtml, optionsHtml, popupSource, optionsSource].join('\n');
    const usedTranslationKeys = new Set(
        [...interfaceSource.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1])
    );
    for (const match of interfaceSource.matchAll(/I18n\.translate\(['"]([^'"]+)['"]/g)) {
        usedTranslationKeys.add(match[1]);
    }
    // options.js reads some keys through translateOr(key, fallback), which wraps
    // I18n.translate for script-built DOM. Count those as used too, otherwise the
    // orphan-key check below flags them as dead strings.
    for (const match of interfaceSource.matchAll(/\btranslateOr\(['"]([^'"]+)['"]/g)) {
        usedTranslationKeys.add(match[1]);
    }
    // content.js cannot load i18n.js (the manifest injects only content.js), so
    // its notices are localized by the background worker. Both ends are counted:
    // the request site in content.js and the allowlist in background.js — and
    // they are then required to name exactly the same keys, so neither can grow
    // a string the other will refuse to serve.
    const contentRequestedKeys = new Set(
        [...contentSource.matchAll(/requestLocalizedText\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
    );
    const backgroundAllowlistBlock = backgroundSource.match(
        /CONTENT_LOCALIZABLE_KEYS = new Set\(\[([\s\S]*?)\]\)/
    );
    assert.ok(backgroundAllowlistBlock, 'background.js must declare CONTENT_LOCALIZABLE_KEYS');
    const backgroundAllowedKeys = new Set(
        [...backgroundAllowlistBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    );
    assert.ok(contentRequestedKeys.size > 0, 'expected content.js to request localized text');
    assert.deepEqual(
        [...contentRequestedKeys].sort(),
        [...backgroundAllowedKeys].sort(),
        'content.js and background.js disagree about which strings may be localized'
    );
    for (const key of contentRequestedKeys) {
        usedTranslationKeys.add(key);
    }

    usedTranslationKeys.add('messageVerifyToLoadModels');
    usedTranslationKeys.add('messageCredentialsChanged');

    const englishTranslationKeys = Object.keys(I18n.getTranslations('en')).sort();
    for (const langCode of Object.keys(I18n.getSupportedLanguages())) {
        const languageTranslations = I18n.getTranslations(langCode);
        assert.deepEqual(Object.keys(languageTranslations).sort(), englishTranslationKeys);
        for (const key of usedTranslationKeys) {
            assert.ok(languageTranslations[key], `missing ${langCode}.${key}`);
        }
    }
    assert.deepEqual(englishTranslationKeys, [...usedTranslationKeys].sort());

    console.log('security-regression: ok');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
