// i18n.js is imported here rather than injected into pages: content.js needs a
// handful of localized notices, and shipping the whole 30KB string table into
// every tab to get them is a bad trade. The worker already has it loaded.
importScripts('settings.js', 'i18n.js');

// settings.js assigns itself onto the global object, so it is reachable as a
// property. i18n.js declares `const I18n` at the top level of a classic script,
// which creates a global *lexical* binding — visible by name to everything that
// runs in this worker afterwards, but never as globalThis.I18n. Referencing it
// by name is the only thing that works.
const Settings = globalThis.PointerSettings;

// Content scripts may ask only for these. An allowlist, not the whole table:
// the message boundary should not become a way to read arbitrary extension
// strings, and every key here is a notice the page is already about to show.
const CONTENT_LOCALIZABLE_KEYS = new Set([
    'shortcutConflictDowngraded',
    'shortcutConflictSaveFailed',
    'tooltipToggleTranslation'
]);
const MAX_LOCALIZE_PARAM_LENGTH = 40;

// Values are interpolated into text shown in the page, so keep them short and
// boring. They originate in content.js from a key label the options page wrote,
// but validating here means a compromised content script cannot use the toast
// as an arbitrary-text channel.
function sanitizeLocalizeParams(params) {
    const safe = {};
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
        return safe;
    }
    for (const [name, value] of Object.entries(params)) {
        if (typeof value !== 'string') continue;
        if (!/^[a-zA-Z]\w{0,15}$/.test(name)) continue;
        safe[name] = value.slice(0, MAX_LOCALIZE_PARAM_LENGTH);
    }
    return safe;
}

async function getLocalizedMessage(messageKey, params) {
    if (!CONTENT_LOCALIZABLE_KEYS.has(messageKey)) {
        throw createRequestError('UNKNOWN_MESSAGE_KEY', 'Unknown localization key');
    }
    const { uiLang } = await Settings.getSync(['uiLang'], true);
    const lang = I18n.isLanguageSupported(uiLang) ? uiLang : 'en';
    return I18n.formatMessage(messageKey, sanitizeLocalizeParams(params), lang);
}

// Initialize extension state — only set defaults for keys that don't already exist,
// so user settings survive extension updates.
chrome.runtime.onInstalled.addListener((details) => {
    // Resolve any pre-existing shortcut state before ensureDefaults() fills in
    // the bare-key default.
    Settings.migrateShortcutModifier(details && details.reason)
        .catch((error) => {
            console.error('Failed to migrate shortcut modifier:', error);
        })
        .then(() => Settings.ensureDefaults())
        .catch((error) => {
            console.error('Failed to initialize default settings:', error);
        });
});

// Protect extension-local credentials from content scripts, then normalize any
// sync-based credentials and verification metadata already present. Keep the promise
// rejection observable by message handlers so a failed migration never looks
// like a missing key.
const secureLocalStateReady = Settings.prepareSecureLocalState();
secureLocalStateReady.catch((error) => {
    console.error('Failed to prepare secure local credential storage:', error);
});

async function waitForSecureLocalState() {
    await secureLocalStateReady;
}

function openOptionsPage() {
    chrome.runtime.openOptionsPage(() => {
        void chrome.runtime.lastError;
    });
}

function isInternalSender(sender) {
    return Boolean(sender && sender.id === chrome.runtime.id);
}

function isContentScriptSender(sender) {
    return isInternalSender(sender) &&
        sender.tab &&
        Number.isInteger(sender.tab.id);
}

function createRequestError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function sendMessageError(sendResponse, error) {
    sendResponse({
        error: error && error.message ? error.message : 'Unexpected extension error',
        errorCode: error && error.code ? error.code : 'INTERNAL_ERROR'
    });
}

// Listen for messages from extension pages and content scripts. Web pages
// cannot call this API directly, but validating the sender keeps the boundary
// explicit and prevents future externally-connectable changes from becoming a
// translation oracle by accident.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isInternalSender(sender) || !request || typeof request !== 'object') {
        return false;
    }

    if (request.action === 'translate') {
        if (!isContentScriptSender(sender)) {
            sendMessageError(sendResponse, createRequestError(
                'INVALID_SENDER',
                'Translation requests are accepted only from Pointer content scripts'
            ));
            return false;
        }
        void handleTranslateRequest(request, sender, sendResponse);
        return true; // Indicates async response
    }
    if (request.action === 'openOptions') {
        openOptionsPage();
        return false;
    }
    if (request.action === 'hasApiKey') {
        if (!isContentScriptSender(sender)) {
            sendMessageError(sendResponse, createRequestError(
                'INVALID_SENDER',
                'Credential status is available only to Pointer content scripts'
            ));
            return false;
        }
        getApiConfigurationStatus()
            .then((status) => sendResponse(status))
            .catch((error) => sendMessageError(sendResponse, error));
        return true;
    }
    if (request.action === 'localizeMessage') {
        if (!isContentScriptSender(sender)) {
            sendMessageError(sendResponse, createRequestError(
                'INVALID_SENDER',
                'Localized text is available only to Pointer content scripts'
            ));
            return false;
        }
        getLocalizedMessage(request.messageKey, request.params)
            .then((text) => sendResponse({ text }))
            .catch((error) => sendMessageError(sendResponse, error));
        return true;
    }
    if (request.action === 'setIconScheme') {
        if (!isContentScriptSender(sender)) return false;
        const tabId = sender.tab && sender.tab.id;
        if (typeof tabId !== 'number') return false;
        const suffix = request.scheme === 'dark' ? '-white' : '';
        const path = {
            16: `images/icon16${suffix}.png`,
            32: `images/icon32${suffix}.png`,
            48: `images/icon48${suffix}.png`,
            128: `images/icon128${suffix}.png`
        };
        chrome.action.setIcon({ tabId, path }, () => {
            void chrome.runtime.lastError;
        });
        return false;
    }
    // Potential future message handlers
});

const MAX_CONCURRENT_REQUESTS = 3;
const MAX_QUEUED_API_REQUESTS = 60;
const MAX_SEGMENTS_PER_MESSAGE = 40;
const MAX_CHARS_PER_SEGMENT = 12000;
const MAX_TOTAL_CHARS_PER_MESSAGE = 30000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 20;
const MAX_SEGMENTS_PER_WINDOW = 80;
const MAX_CHARS_PER_WINDOW = 120_000;
const MAX_GLOBAL_MESSAGES_PER_WINDOW = 60;
const MAX_GLOBAL_SEGMENTS_PER_WINDOW = 200;
const MAX_GLOBAL_CHARS_PER_WINDOW = 300_000;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,8}(-[a-z0-9]{2,8})*$/i;

let activeApiRequests = 0;
const queuedApiRequests = [];
const translationUsageByTab = new Map();
let globalTranslationUsage = [];

function drainApiRequestQueue() {
    while (activeApiRequests < MAX_CONCURRENT_REQUESTS && queuedApiRequests.length > 0) {
        const queued = queuedApiRequests.shift();
        activeApiRequests++;

        Promise.resolve()
            .then(queued.task)
            .then(queued.resolve, queued.reject)
            .finally(() => {
                activeApiRequests--;
                drainApiRequestQueue();
            });
    }
}

function runWithGlobalApiLimit(task) {
    return new Promise((resolve, reject) => {
        if (queuedApiRequests.length >= MAX_QUEUED_API_REQUESTS) {
            reject(createRequestError(
                'REQUEST_QUEUE_FULL',
                'Too many translation requests are waiting. Please try again shortly.'
            ));
            return;
        }

        queuedApiRequests.push({ task, resolve, reject });
        drainApiRequestQueue();
    });
}

function validateTranslationRequest(request) {
    const textSegments = Array.isArray(request.text) ? request.text : [request.text];
    if (textSegments.length === 0 || textSegments.length > MAX_SEGMENTS_PER_MESSAGE) {
        throw createRequestError(
            'INVALID_TRANSLATION_INPUT',
            `A translation request must contain between 1 and ${MAX_SEGMENTS_PER_MESSAGE} text segments`
        );
    }

    let totalChars = 0;
    for (const text of textSegments) {
        if (typeof text !== 'string') {
            throw createRequestError('INVALID_TRANSLATION_INPUT', 'Every text segment must be a string');
        }
        if (text.length > MAX_CHARS_PER_SEGMENT) {
            throw createRequestError(
                'TRANSLATION_TOO_LARGE',
                `A text segment cannot exceed ${MAX_CHARS_PER_SEGMENT} characters`
            );
        }
        totalChars += text.length;
    }

    if (totalChars === 0 || totalChars > MAX_TOTAL_CHARS_PER_MESSAGE) {
        throw createRequestError(
            'TRANSLATION_TOO_LARGE',
            `A translation request must contain 1-${MAX_TOTAL_CHARS_PER_MESSAGE} characters`
        );
    }

    if (typeof request.targetLang !== 'string' || !LANGUAGE_CODE_PATTERN.test(request.targetLang)) {
        throw createRequestError('INVALID_TARGET_LANGUAGE', 'Target language must be a valid language code');
    }

    return {
        textSegments,
        targetLang: request.targetLang.toLowerCase(),
        totalChars
    };
}

function consumeTranslationRateLimit(tabId, segmentCount, totalChars) {
    const now = Date.now();
    const recent = (translationUsageByTab.get(tabId) || [])
        .filter((entry) => now - entry.timestamp < RATE_LIMIT_WINDOW_MS);
    const recentGlobal = globalTranslationUsage
        .filter((entry) => now - entry.timestamp < RATE_LIMIT_WINDOW_MS);

    const usedSegments = recent.reduce((sum, entry) => sum + entry.segmentCount, 0);
    const usedChars = recent.reduce((sum, entry) => sum + entry.totalChars, 0);
    if (recent.length >= MAX_MESSAGES_PER_WINDOW ||
        usedSegments + segmentCount > MAX_SEGMENTS_PER_WINDOW ||
        usedChars + totalChars > MAX_CHARS_PER_WINDOW) {
        translationUsageByTab.set(tabId, recent);
        throw createRequestError(
            'TRANSLATION_RATE_LIMITED',
            'Too many translations were requested from this tab. Please wait a minute and try again.'
        );
    }

    const usedGlobalSegments = recentGlobal.reduce((sum, entry) => sum + entry.segmentCount, 0);
    const usedGlobalChars = recentGlobal.reduce((sum, entry) => sum + entry.totalChars, 0);
    if (recentGlobal.length >= MAX_GLOBAL_MESSAGES_PER_WINDOW ||
        usedGlobalSegments + segmentCount > MAX_GLOBAL_SEGMENTS_PER_WINDOW ||
        usedGlobalChars + totalChars > MAX_GLOBAL_CHARS_PER_WINDOW) {
        globalTranslationUsage = recentGlobal;
        throw createRequestError(
            'TRANSLATION_RATE_LIMITED',
            'Pointer reached its global translation safety limit. Please wait a minute and try again.'
        );
    }

    const usageEntry = { timestamp: now, segmentCount, totalChars };
    recent.push(usageEntry);
    recentGlobal.push(usageEntry);
    translationUsageByTab.set(tabId, recent);
    globalTranslationUsage = recentGlobal;
}

function hasHostPermission(baseUrl) {
    const originPattern = Settings.getHostPermissionPattern(baseUrl);
    return new Promise((resolve, reject) => {
        chrome.permissions.contains({ origins: [originPattern] }, (allowed) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(Boolean(allowed));
        });
    });
}

async function getApiConfigurationStatus() {
    await waitForSecureLocalState();
    const [settings, apiKey, binding] = await Promise.all([
        Settings.getSync(['baseUrl'], true),
        Settings.getApiKey(),
        Settings.getCredentialBinding()
    ]);

    const status = {
        hasApiKey: Boolean(apiKey),
        isVerified: false,
        hasHostPermission: false
    };

    let normalizedBaseUrl;
    try {
        normalizedBaseUrl = Settings.normalizeAndValidateBaseUrl(settings.baseUrl);
    } catch (_) {
        return status;
    }

    // Keep the message contract with content.js: hasApiKey means the endpoint's
    // credential requirement is satisfied. Verified local/LAN servers may use
    // an intentionally empty key and must not be sent to the "set a key" flow.
    status.hasApiKey = Boolean(apiKey) || !Settings.isApiKeyRequired(normalizedBaseUrl);
    if (!status.hasApiKey || !binding) {
        return status;
    }

    const apiKeyHash = await Settings.sha256Hex(apiKey);
    status.isVerified = binding.apiKeyHash === apiKeyHash && binding.baseUrl === normalizedBaseUrl;
    if (status.isVerified) {
        status.hasHostPermission = await hasHostPermission(normalizedBaseUrl);
    }
    return status;
}

async function getVerifiedApiConfiguration() {
    await waitForSecureLocalState();
    const [settings, apiKey, binding] = await Promise.all([
        Settings.getSync(['baseUrl', 'model'], true),
        Settings.getApiKey(),
        Settings.getCredentialBinding()
    ]);

    const normalizedBaseUrl = Settings.normalizeAndValidateBaseUrl(settings.baseUrl);
    if (!apiKey && Settings.isApiKeyRequired(normalizedBaseUrl)) {
        throw createRequestError('API_KEY_REQUIRED', 'API key is required for remote API servers');
    }

    const apiKeyHash = await Settings.sha256Hex(apiKey);
    if (!binding ||
        binding.apiKeyHash !== apiKeyHash ||
        binding.baseUrl !== normalizedBaseUrl) {
        throw createRequestError(
            'API_VERIFICATION_REQUIRED',
            'The current API key and server address must be verified together in Pointer settings'
        );
    }

    if (!await hasHostPermission(normalizedBaseUrl)) {
        throw createRequestError(
            'HOST_PERMISSION_REQUIRED',
            'Pointer needs permission for this API server. Verify it again in Pointer settings.'
        );
    }

    return {
        apiKey,
        baseUrl: normalizedBaseUrl,
        model: settings.model || Settings.DEFAULT_SYNC_SETTINGS.model
    };
}

async function mapWithConcurrencyLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    let failed = false;

    async function worker() {
        // Once any item fails the whole batch is reported as an error, so
        // stop pulling new items — don't burn API quota on discarded results.
        while (!failed && nextIndex < items.length) {
            const index = nextIndex++;
            try {
                results[index] = await mapper(items[index]);
            } catch (error) {
                failed = true;
                throw error;
            }
        }
    }

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        () => worker()
    );
    await Promise.all(workers);
    return results;
}

async function handleTranslateRequest(request, sender, sendResponse) {
    try {
        const { textSegments, targetLang, totalChars } = validateTranslationRequest(request);
        const apiConfig = await getVerifiedApiConfiguration();
        consumeTranslationRateLimit(sender.tab.id, textSegments.length, totalChars);

        const translations = await mapWithConcurrencyLimit(
            textSegments,
            MAX_CONCURRENT_REQUESTS,
            textSegment =>
                runWithGlobalApiLimit(() => translateText(
                    textSegment,
                    targetLang,
                    apiConfig.apiKey,
                    apiConfig.baseUrl,
                    apiConfig.model
                ))
        );

        sendResponse({ translations });
    } catch (error) {
        console.error('Translation error in background:', error);
        sendMessageError(sendResponse, error);
    }
}

// Function to call AI API for translation
async function translateText(text, targetLang, apiKey, baseUrl, model) {
    // Handle empty input gracefully to avoid unnecessary API calls
    if (!text || text.trim() === '') {
        return '';
    }

    baseUrl = Settings.normalizeAndValidateBaseUrl(
        baseUrl || Settings.DEFAULT_SYNC_SETTINGS.baseUrl
    );
    if (!apiKey && Settings.isApiKeyRequired(baseUrl)) {
        throw new Error('API key is required for remote API servers');
    }

    if (!model) {
        model = Settings.DEFAULT_SYNC_SETTINGS.model;
    }

    const DELIMITER = '__AI_TRANSLATOR_DELIM__';
    const hasDelimiter = text.includes(DELIMITER);
    const delimiterRule = hasDelimiter
        ? ` The text contains the separator ${DELIMITER}. Keep every occurrence exactly as-is, between the corresponding translated segments. Do not translate, remove, or alter it.`
        : '';

    const REQUEST_TIMEOUT_MS = 45000;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

    try {
        // Using OpenAI API as default, but customizable through baseUrl
        const requestHeaders = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            requestHeaders.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            redirect: 'error',
            headers: requestHeaders,
            signal: abortController.signal,
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: `You are a translator. Translate the text to ${targetLang}. If "${targetLang}" is a language code (like "pt", "it", "nl"), translate to that language. Only respond with the translation, no explanations. Keep the translation natural, elegant, and concise without adding meaning that is not in the source.${delimiterRule}`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ]
            })
        });

        const MAX_RESPONSE_BYTES = 2_000_000;
        const responseText = await Settings.readResponseTextWithLimit(
            response,
            MAX_RESPONSE_BYTES,
            'API response is too large'
        );

        if (!response.ok) {
            let apiErrorMessage = '';
            try {
                const errorData = JSON.parse(responseText);
                apiErrorMessage = errorData && errorData.error && errorData.error.message;
            } catch (_) {
                // Non-JSON errors are handled below.
            }

            if (typeof apiErrorMessage === 'string' && apiErrorMessage.trim()) {
                throw new Error(Settings.quoteRemoteMessage(apiErrorMessage));
            }
            if (/<html[\s>]/i.test(responseText)) {
                throw new Error('API returned HTML instead of JSON. Check if URL is correct.');
            }
            const summary = responseText.trim();
            throw new Error(
                `Request failed with status ${response.status}` +
                (summary ? `. ${Settings.quoteRemoteMessage(summary)}` : '')
            );
        }

        // Safely parse JSON
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch (jsonError) {
            throw new Error(`Could not parse API response as JSON. Check if URL is correct.`);
        }

        if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message) {
            throw new Error('API response is missing expected data structure');
        }

        // `content` is null rather than absent when a model refuses or answers
        // with tool_calls instead of prose. Reaching .trim() on that raises a
        // TypeError whose message ("Cannot read properties of null") tells the
        // user nothing about what actually happened.
        const messageContent = responseData.choices[0].message.content;
        if (typeof messageContent !== 'string') {
            throw new Error('API returned no translated text (the model may have declined to answer)');
        }

        let translated = messageContent.trim();
        if (!hasDelimiter && translated.includes(DELIMITER)) {
            translated = translated.replaceAll(DELIMITER, '').trim();
        }

        return translated;
    } catch (error) {
        if (error.name === 'AbortError') {
            error = new Error(`Translation request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
        }
        console.error('API request failed:', error);
        // Re-throw the error so the caller can handle it
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
