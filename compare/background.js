// Initialize extension state
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
        isActive: false,
        targetLang: 'zh',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        buttonPosition: 'bottom-right',
        buttonX: null,
        buttonY: null,
        uiLang: 'en',
        // SaaS integration settings
        useSaasApi: false,
        saasApiUrl: 'http://localhost:3000/api/v1',
        saasToken: '',
        userEmail: '',
        userTier: 'free',
        monthlyTokensUsed: 0,
        monthlyTokensLimit: 2500,
        tokensResetDate: null,
        cloudModel: 'gpt-4o'
    });
});

// Check token on startup
chrome.runtime.onStartup.addListener(() => {
    checkAndRefreshToken();
});

// Initialize translation cache
const translationCache = new Map();
const maxCacheSize = 1000;
const cacheTTL = 2 * 60 * 60 * 1000; // 2 hours

// Cache helper functions
function getCacheKey(text, targetLang, model) {
    return `${text.slice(0, 100)}|${targetLang}|${model || 'default'}`;
}

function getFromCache(text, targetLang, model) {
    const key = getCacheKey(text, targetLang, model);
    const entry = translationCache.get(key);
    
    if (!entry) return null;
    
    // Check if entry is expired
    if (Date.now() - entry.timestamp > cacheTTL) {
        translationCache.delete(key);
        return null;
    }
    
    return entry.translation;
}

function setToCache(text, targetLang, model, translation) {
    const key = getCacheKey(text, targetLang, model);
    
    // Remove oldest entry if cache is full
    if (translationCache.size >= maxCacheSize) {
        const firstKey = translationCache.keys().next().value;
        translationCache.delete(firstKey);
    }
    
    translationCache.set(key, {
        translation,
        timestamp: Date.now()
    });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        chrome.storage.sync.get([
            'apiKey', 'baseUrl', 'model', 'useSaasApi', 'saasApiUrl', 'saasToken', 'cloudModel'
        ], async function (settings) {
            try {
                let translationResult;
                
                // Check cache first
                const isArray = Array.isArray(request.text);
                const textsToCheck = isArray ? request.text : [request.text];
                const model = settings.cloudModel || settings.model || 'gpt-4o';
                
                // Check cache for all texts
                const cacheResults = textsToCheck.map(text => 
                    getFromCache(text, request.targetLang, model)
                );
                
                // If all texts are cached, return immediately
                if (cacheResults.every(result => result !== null)) {
                    translationResult = {
                        translations: cacheResults,
                        tokensUsed: 0,
                        fromCache: true
                    };
                    sendResponse(translationResult);
                    return;
                }
                
                // Find uncached texts
                const uncachedTexts = [];
                const uncachedIndices = [];
                for (let i = 0; i < textsToCheck.length; i++) {
                    if (cacheResults[i] === null) {
                        uncachedTexts.push(textsToCheck[i]);
                        uncachedIndices.push(i);
                    }
                }
                
                // Process uncached texts
                if (uncachedTexts.length > 0) {
                    if (settings.useSaasApi && settings.saasToken) {
                        // Get the selected cloud model
                        const cloudModel = settings.cloudModel || null;
                        
                        // Use SaaS API
                        translationResult = await translateWithSaasApi(
                            uncachedTexts,
                            request.targetLang,
                            settings.saasApiUrl,
                            settings.saasToken,
                            request.pageUrl,
                            request.pageTitle,
                            request.translationType,
                            cloudModel
                        );
                    } else {
                        // Use original API method
                        const translations = await Promise.all(
                            uncachedTexts.map(textSegment =>
                                translateText(
                                    textSegment,
                                    request.targetLang,
                                    settings.apiKey,
                                    settings.baseUrl,
                                    settings.model
                                )
                            )
                        );
                        translationResult = { translations: translations };
                    }
                    
                    // Cache the new translations
                    if (translationResult.translations) {
                        for (let i = 0; i < uncachedTexts.length; i++) {
                            setToCache(uncachedTexts[i], request.targetLang, model, translationResult.translations[i]);
                        }
                    }
                    
                    // Merge cached and new translations
                    const finalTranslations = [...cacheResults];
                    let translationIndex = 0;
                    for (const index of uncachedIndices) {
                        finalTranslations[index] = translationResult.translations[translationIndex++];
                    }
                    
                    translationResult.translations = finalTranslations;
                } else {
                    // All texts were cached
                    translationResult = {
                        translations: cacheResults,
                        tokensUsed: 0,
                        fromCache: true
                    };
                }
                
                // Update token usage if using SaaS
                if (settings.useSaasApi && translationResult.tokensUsed) {
                    updateTokenUsage(translationResult.tokensUsed);
                }
                
                // Format response based on original request format
                if (!isArray) {
                    translationResult.translations = translationResult.translations[0];
                }
                
                sendResponse(translationResult);
            } catch (error) {
                console.error('Translation error in background:', error);
                sendResponse({ error: error.message });
            }
        });
        return true; // Indicates async response
    }
    
    // Handle SaaS authentication
    if (request.action === 'saasLogin') {
        handleSaasLogin(request.email, request.password, sendResponse);
        return true;
    }
    
    if (request.action === 'saasLogout') {
        handleSaasLogout(sendResponse);
        return true;
    }
    
    if (request.action === 'syncUserData') {
        syncUserData(sendResponse);
        return true;
    }
    
    if (request.action === 'getUserStatus') {
        getUserStatus(sendResponse);
        return true;
    }
    
    if (request.action === 'openLoginPage') {
        chrome.tabs.create({ url: 'http://localhost:3000/login' });
        return;
    }
    
    if (request.action === 'openUpgradePage') {
        chrome.tabs.create({ url: 'http://localhost:3000/upgrade' });
        return;
    }
    
    if (request.action === 'webLoginSuccess') {
        console.log('=== Received webLoginSuccess message ===');
        console.log('User data:', request.user);
        console.log('Has token:', !!request.token);
        console.log('Sender:', sender);
        
        // Handle login success from web page
        handleWebLoginSuccess(request.user, request.token, sendResponse);
        return true;
    }
    
    if (request.action === 'syncUserSetting') {
        handleSyncUserSetting(request.settingKey, request.settingValue, sendResponse);
        return true;
    }
    
    // Vocabulary-related message handlers
    if (request.action === 'getVocabulary') {
        handleGetVocabulary(request, sendResponse);
        return true;
    }
    
    if (request.action === 'getVocabularyStats') {
        handleGetVocabularyStats(sendResponse);
        return true;
    }
    
    if (request.action === 'getReviewWords') {
        handleGetReviewWords(request.limit || 10, sendResponse);
        return true;
    }
    
    if (request.action === 'updateWordMastery') {
        handleUpdateWordMastery(request.wordId, request.masteryLevel, sendResponse);
        return true;
    }
    
    if (request.action === 'updateVocabularyMeaning') {
        handleUpdateVocabularyMeaning(request.wordId, request.newMeaning, sendResponse);
        return true;
    }
    
    if (request.action === 'deleteWord') {
        handleDeleteWord(request.wordId, sendResponse);
        return true;
    }
    
    if (request.action === 'exportVocabulary') {
        handleExportVocabulary(request.format || 'json', sendResponse);
        return true;
    }
    
    if (request.action === 'addVocabulary') {
        handleAddVocabulary(request.word, request.translation, request.context, sendResponse);
        return true;
    }
    
    if (request.action === 'generateMissingTranslations') {
        handleGenerateMissingTranslations(sendResponse);
        return true;
    }
});

// Function to call AI API for translation
async function translateText(text, targetLang, apiKey, baseUrl, model) {
    // Handle empty input gracefully to avoid unnecessary API calls
    if (!text || text.trim() === '') {
        return '';
    }

    if (!apiKey) {
        throw new Error('API key is required');
    }

    if (!baseUrl) {
        baseUrl = 'https://api.openai.com/v1'; // Default
    }

    if (!model) {
        model = 'gpt-4o-mini'; // Default
    }

    try {
        // Validate URL format
        try {
            new URL(baseUrl);
        } catch (e) {
            throw new Error(`Invalid URL format: ${baseUrl}`);
        }

        // Using OpenAI API as default, but customizable through baseUrl
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: `You are a translator. Translate the text to ${targetLang}. If "${targetLang}" is a language code (like "pt", "it", "nl"), translate to that language. Only respond with the translation, no explanations.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            // Try to get response text first to handle non-JSON responses
            const responseText = await response.text();

            try {
                // Try to parse as JSON
                const errorData = JSON.parse(responseText);
                throw new Error(errorData.error?.message || `Request failed with status ${response.status}`);
            } catch (jsonError) {
                // If parsing fails, it's not JSON
                if (responseText.includes('<html')) {
                    throw new Error(`API returned HTML instead of JSON. Check if URL is correct.`);
                } else {
                    throw new Error(`Request failed with status ${response.status}: ${responseText.slice(0, 100)}...`);
                }
            }
        }

        // Safely parse JSON
        let responseData;
        try {
            const responseText = await response.text();
            responseData = JSON.parse(responseText);
        } catch (jsonError) {
            throw new Error(`Could not parse API response as JSON. Check if URL is correct.`);
        }

        if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message) {
            throw new Error('API response is missing expected data structure');
        }

        return responseData.choices[0].message.content.trim();
    } catch (error) {
        console.error('API request failed:', error);
        // Re-throw the error so the caller can handle it
        throw error;
    }
}

// SaaS API integration functions

// Token refresh function
async function attemptTokenRefresh() {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken || !settings.saasApiUrl) {
            return { success: false, error: 'No token or API URL found' };
        }

        const response = await fetch(`${settings.saasApiUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            return { success: false, error: 'Token refresh failed' };
        }

        const data = await response.json();
        
        if (data.success && data.token) {
            // Update the token in storage
            await chrome.storage.sync.set({
                saasToken: data.token
            });
            
            return { success: true, token: data.token };
        }
        
        return { success: false, error: 'Invalid refresh response' };
    } catch (error) {
        console.error('Token refresh error:', error);
        return { success: false, error: error.message };
    }
}

// Proactive token refresh - check and refresh if needed
async function checkAndRefreshToken() {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken || !settings.saasApiUrl) {
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        // Check if server suggests token refresh
        const refreshSuggested = response.headers.get('X-Token-Refresh-Suggested');
        
        if (refreshSuggested === 'true') {
            const refreshResult = await attemptTokenRefresh();
            if (refreshResult.success) {
                console.log('Token refreshed proactively');
            }
        }
    } catch (error) {
        console.error('Proactive token refresh check error:', error);
    }
}

// Set up periodic token refresh check (every 6 hours)
setInterval(checkAndRefreshToken, 6 * 60 * 60 * 1000);

async function translateWithSaasApi(text, targetLang, saasApiUrl, saasToken, pageUrl, pageTitle, translationType, model) {
    const maxRetries = 3;
    const timeout = 30000; // 30 seconds timeout
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(`${saasApiUrl}/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${saasToken}`
                },
                body: JSON.stringify({
                    text: text,
                    targetLang: targetLang,
                    translationType: translationType || (Array.isArray(text) ? 'structured' : 'simple'),
                    pageUrl: pageUrl,
                    pageTitle: pageTitle,
                    model: model
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                
                if (response.status === 429) {
                    throw new Error(`翻译额度已用完。${errorData.resetDate ? `将于${new Date(errorData.resetDate).toLocaleDateString()}重置。` : ''}请升级到Pro版本获得无限额度。`);
                }
                
                if (response.status === 401) {
                    const errorData = await response.json();
                    
                    // Try to refresh token if it's expired
                    if (errorData.needsRefresh && attempt === 0) {
                        const refreshResult = await attemptTokenRefresh();
                        if (refreshResult.success) {
                            // Update the token and retry
                            saasToken = refreshResult.token;
                            continue;
                        }
                    }
                    
                    // Token expired and couldn't refresh, clear SaaS settings
                    chrome.storage.sync.set({
                        useSaasApi: false,
                        saasToken: '',
                        userEmail: '',
                        userTier: 'free'
                    });
                    throw new Error('登录已过期，请重新登录');
                }
                
                // For server errors, retry
                if (response.status >= 500 && attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
                    continue;
                }
                
                throw new Error(errorData.error || '翻译失败');
            }

            const result = await response.json();
            
            // Return in the same format as original API
            if (Array.isArray(text)) {
                return { 
                    translations: result.translations,
                    tokensUsed: result.tokensUsed,
                    model: result.model,
                    provider: result.provider
                };
            } else {
                return { 
                    translations: Array.isArray(result.translations) ? result.translations : [result.translations],
                    tokensUsed: result.tokensUsed,
                    model: result.model,
                    provider: result.provider
                };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                if (attempt < maxRetries - 1) {
                    console.log(`Translation timeout, retrying... (${attempt + 1}/${maxRetries})`);
                    continue;
                }
                throw new Error('翻译请求超时，请重试');
            }
            
            // For network errors, retry
            if (error.message.includes('fetch') && attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
            }
            
            throw error;
        }
    }
    
    throw new Error('翻译失败：已达到最大重试次数');
}

async function handleSaasLogin(email, password, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl']);
        const response = await fetch(`${settings.saasApiUrl}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (!response.ok) {
            sendResponse({ success: false, error: result.error });
            return;
        }

        // Save user data to storage
        await chrome.storage.sync.set({
            useSaasApi: true,
            saasToken: result.token,
            userEmail: result.user.email,
            userTier: result.user.subscriptionTier,
            monthlyTokensUsed: result.user.monthlyTokensUsed,
            monthlyTokensLimit: result.user.monthlyTokensLimit,
            tokensResetDate: result.user.tokensResetDate,
            // Sync settings
            buttonPosition: result.user.settings.buttonPosition,
            buttonX: result.user.settings.buttonX,
            buttonY: result.user.settings.buttonY,
            buttonSize: result.user.settings.buttonSize,
            showButton: result.user.settings.showButton,
            targetLang: result.user.settings.defaultTargetLang || 'zh'
        });

        sendResponse({ 
            success: true, 
            user: result.user,
            message: '登录成功' 
        });

    } catch (error) {
        console.error('SaaS login error:', error);
        sendResponse({ success: false, error: '登录失败，请检查网络连接' });
    }
}

async function handleSaasLogout(sendResponse) {
    try {
        console.log('Handling SaaS logout...');
        
        // Clear all SaaS-related data
        const clearData = {
            useSaasApi: false,
            saasToken: '',
            userEmail: '',
            userTier: 'free',
            monthlyTokensUsed: 0,
            monthlyTokensLimit: 2500,
            tokensResetDate: null
        };
        
        await chrome.storage.sync.set(clearData);
        
        console.log('SaaS logout completed, storage cleared');
        sendResponse({ success: true, message: '退出登录成功' });
    } catch (error) {
        console.error('SaaS logout error:', error);
        sendResponse({ success: false, error: '退出登录失败' });
    }
}

async function syncUserData(sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('同步失败');
        }

        const result = await response.json();
        
        // Update stored user data with comprehensive sync
        await chrome.storage.sync.set({
            userTier: result.user.subscriptionTier,
            monthlyTokensUsed: result.user.monthlyTokensUsed,
            monthlyTokensLimit: result.user.monthlyTokensLimit,
            tokensResetDate: result.user.tokensResetDate,
            userEmail: result.user.email,
            useSaasApi: true
        });

        // Return comprehensive user data for UI update
        sendResponse({ 
            success: true, 
            user: {
                ...result.user,
                userEmail: result.user.email,
                userTier: result.user.subscriptionTier,
                tokensUsed: result.user.monthlyTokensUsed,
                tokenLimit: result.user.monthlyTokensLimit,
                tokensResetDate: result.user.tokensResetDate
            }
        });

    } catch (error) {
        console.error('Sync user data error:', error);
        sendResponse({ success: false, error: '同步失败' });
    }
}

async function getUserStatus(sendResponse) {
    try {
        const settings = await chrome.storage.sync.get([
            'useSaasApi', 'userEmail', 'userTier', 'monthlyTokensUsed', 
            'monthlyTokensLimit', 'tokensResetDate', 'saasToken', 'saasApiUrl'
        ]);

        console.log('=== getUserStatus called ===');
        console.log('Settings:', {
            useSaasApi: settings.useSaasApi,
            hasToken: !!settings.saasToken,
            userEmail: settings.userEmail,
            tokensUsed: settings.monthlyTokensUsed
        });

        // Always return the correct useSaasApi value
        const useSaasApi = settings.useSaasApi || false;
        const hasValidToken = settings.saasToken && settings.saasToken.trim() !== '';
        const loggedIn = useSaasApi && hasValidToken;

        if (!loggedIn) {
            sendResponse({ 
                success: true, 
                loggedIn: false,
                useSaasApi: useSaasApi
            });
            return;
        }

        // For logged in users, try to fetch fresh data from server
        try {
            const response = await fetch(`${settings.saasApiUrl}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${settings.saasToken}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                
                // Update stored user data with latest from server
                await chrome.storage.sync.set({
                    userTier: result.user.subscriptionTier,
                    monthlyTokensUsed: result.user.monthlyTokensUsed,
                    monthlyTokensLimit: result.user.monthlyTokensLimit,
                    tokensResetDate: result.user.tokensResetDate,
                    userEmail: result.user.email
                });

                // Return fresh data
                sendResponse({
                    success: true,
                    loggedIn: true,
                    useSaasApi: true,
                    userEmail: result.user.email,
                    userTier: result.user.subscriptionTier,
                    tokensUsed: result.user.monthlyTokensUsed,
                    tokenLimit: result.user.monthlyTokensLimit,
                    tokensResetDate: result.user.tokensResetDate
                });
                return;
            }
        } catch (fetchError) {
            console.log('Failed to fetch fresh user data:', fetchError);
            // Network error, fallback to cached data but with shorter timeout
        }

        // Fallback to cached data if API call fails (but not 401)
        sendResponse({
            success: true,
            loggedIn: true,
            useSaasApi: true,
            userEmail: settings.userEmail,
            userTier: settings.userTier,
            tokensUsed: settings.monthlyTokensUsed || 0,
            tokenLimit: settings.monthlyTokensLimit || 2500,
            tokensResetDate: settings.tokensResetDate
        });

    } catch (error) {
        console.error('Get user status error:', error);
        sendResponse({ success: false, error: '获取状态失败' });
    }
}

async function updateTokenUsage(tokensUsed) {
    try {
        const settings = await chrome.storage.sync.get(['monthlyTokensUsed', 'useSaasApi']);
        
        // Only count completion tokens (user's actual usage), not prompt tokens
        // The SaaS API should return token usage with prompt tokens excluded
        // If tokensUsed includes both prompt and completion tokens, we need to subtract the prompt tokens
        let userTokens = tokensUsed;
        
        // If the tokensUsed object has separate prompt and completion tokens
        if (typeof tokensUsed === 'object' && tokensUsed.completionTokens !== undefined) {
            userTokens = tokensUsed.completionTokens;
            console.log(`Using completion tokens only: ${userTokens} (prompt: ${tokensUsed.promptTokens}, total: ${tokensUsed.totalTokens})`);
        } else if (typeof tokensUsed === 'object' && tokensUsed.userTokens !== undefined) {
            // If the API already calculated user tokens (excluding prompt)
            userTokens = tokensUsed.userTokens;
            console.log(`Using pre-calculated user tokens: ${userTokens}`);
        } else {
            // If it's just a number, assume it's already the user tokens (completion only)
            console.log(`Using tokens as completion tokens: ${userTokens}`);
        }
        
        const newUsage = (settings.monthlyTokensUsed || 0) + userTokens;
        
        console.log(`Updating token usage: ${settings.monthlyTokensUsed || 0} + ${userTokens} = ${newUsage}`);
        
        await chrome.storage.sync.set({
            monthlyTokensUsed: newUsage
        });
        
        console.log(`Token usage updated successfully: ${newUsage}`);
    } catch (error) {
        console.error('Update token usage error:', error);
    }
}

async function handleWebLoginSuccess(user, token, sendResponse) {
    console.log('=== handleWebLoginSuccess called ===');
    console.log('User data:', user);
    console.log('Token present:', !!token);
    
    try {
        // Validate input data
        if (!user || !token) {
            throw new Error('Invalid user data or token');
        }
        
        if (!user.email) {
            throw new Error('User email is required');
        }
        
        const userData = {
            useSaasApi: true,
            saasToken: token,
            userEmail: user.email,
            userTier: user.subscriptionTier || 'free',
            monthlyTokensUsed: user.monthlyTokensUsed || 0,
            monthlyTokensLimit: user.monthlyTokensLimit || 2500,
            tokensResetDate: user.tokensResetDate,
            // Sync settings
            buttonPosition: user.settings?.buttonPosition || 'bottom-right',
            buttonX: user.settings?.buttonX,
            buttonY: user.settings?.buttonY,
            buttonSize: user.settings?.buttonSize,
            showButton: user.settings?.showButton,
            targetLang: user.settings?.defaultTargetLang || 'zh'
        };
        
        console.log('Saving to storage:', userData);
        
        // Save user data to storage (same as handleSaasLogin)
        await chrome.storage.sync.set(userData);

        // Verify the data was saved
        const savedData = await chrome.storage.sync.get(['saasToken', 'userEmail', 'useSaasApi']);
        console.log('Verification - saved data:', savedData);

        console.log('✅ Web login success handled, user data saved successfully');
        
        if (sendResponse) {
            sendResponse({ 
                success: true, 
                message: 'Login data saved successfully',
                userData: userData 
            });
        }

    } catch (error) {
        console.error('❌ Handle web login success error:', error);
        console.error('Error stack:', error.stack);
        if (sendResponse) {
            sendResponse({ 
                success: false, 
                error: 'Failed to save login data: ' + error.message 
            });
        }
    }
}

async function handleSyncUserSetting(settingKey, settingValue, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        // Create the settings object with the specific key-value pair
        const settingsPayload = {};
        settingsPayload[settingKey] = settingValue;

        const response = await fetch(`${settings.saasApiUrl}/user/settings/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.saasToken}`
            },
            body: JSON.stringify(settingsPayload)
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('设置同步失败');
        }

        const result = await response.json();
        
        sendResponse({ 
            success: true, 
            message: '设置同步成功'
        });

    } catch (error) {
        console.error('Sync user setting error:', error);
        sendResponse({ success: false, error: '设置同步失败' });
    }
}

// ================================
// Vocabulary Management Functions
// ================================

async function handleGetVocabulary(request, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const queryParams = new URLSearchParams();
        if (request.search) queryParams.append('search', request.search);
        if (request.difficulty) queryParams.append('difficulty', request.difficulty);
        if (request.mastery) queryParams.append('mastery', request.mastery);
        if (request.needsReview) queryParams.append('needsReview', 'true');

        const response = await fetch(`${settings.saasApiUrl}/vocabulary?${queryParams}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('获取词汇失败');
        }

        const result = await response.json();
        sendResponse(result);

    } catch (error) {
        console.error('Get vocabulary error:', error);
        sendResponse({ success: false, error: '获取词汇失败' });
    }
}

async function handleGetVocabularyStats(sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/vocabulary/stats`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('获取词汇统计失败');
        }

        const result = await response.json();
        sendResponse(result);

    } catch (error) {
        console.error('Get vocabulary stats error:', error);
        sendResponse({ success: false, error: '获取词汇统计失败' });
    }
}

async function handleGetReviewWords(limit, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/vocabulary/review?limit=${limit}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('获取复习词汇失败');
        }

        const result = await response.json();
        sendResponse(result);

    } catch (error) {
        console.error('Get review words error:', error);
        sendResponse({ success: false, error: '获取复习词汇失败' });
    }
}

async function handleUpdateWordMastery(wordId, masteryLevel, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/vocabulary/${wordId}/mastery`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.saasToken}`
            },
            body: JSON.stringify({ masteryLevel })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('更新词汇掌握度失败');
        }

        const result = await response.json();
        sendResponse(result);

    } catch (error) {
        console.error('Update word mastery error:', error);
        sendResponse({ success: false, error: '更新词汇掌握度失败' });
    }
}

async function handleUpdateVocabularyMeaning(wordId, newMeaning, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/vocabulary/${wordId}/meaning`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.saasToken}`
            },
            body: JSON.stringify({ newMeaning })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('更新词汇释义失败');
        }

        const result = await response.json();
        sendResponse(result);

    } catch (error) {
        console.error('Update vocabulary meaning error:', error);
        sendResponse({ success: false, error: '更新词汇释义失败' });
    }
}

async function handleDeleteWord(wordId, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/vocabulary/${wordId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('删除词汇失败');
        }

        const result = await response.json();
        sendResponse(result);

    } catch (error) {
        console.error('Delete word error:', error);
        sendResponse({ success: false, error: '删除词汇失败' });
    }
}

async function handleExportVocabulary(format, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        const response = await fetch(`${settings.saasApiUrl}/vocabulary/export?format=${format}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('导出词汇失败');
        }

        if (format === 'pdf') {
            // Handle PDF export - convert to data URL for service worker compatibility
            console.log('Processing PDF download...');
            handlePdfDownloadFallback(response, sendResponse);
        } else {
            // Handle text-based formats (JSON, CSV)
            const data = await response.text();
            sendResponse({ success: true, data });
        }

    } catch (error) {
        console.error('Export vocabulary error:', error);
        sendResponse({ success: false, error: '导出词汇失败' });
    }
}

// Fallback function for PDF download using data URL
async function handlePdfDownloadFallback(response, sendResponse) {
    try {
        const arrayBuffer = await response.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        
        // Convert blob to data URL using FileReader
        const reader = new FileReader();
        reader.onload = function(event) {
            const dataUrl = event.target.result;
            
            // Use Chrome downloads API for PDF
            chrome.downloads.download({
                url: dataUrl,
                filename: 'vocabulary-study-sheet.pdf',
                saveAs: true
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('Fallback download error:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: '下载PDF失败: ' + chrome.runtime.lastError.message });
                } else {
                    console.log('PDF fallback download successful, ID:', downloadId);
                    sendResponse({ success: true, downloadId: downloadId });
                }
            });
        };
        
        reader.onerror = function(error) {
            console.error('FileReader error:', error);
            sendResponse({ success: false, error: 'PDF文件处理失败' });
        };
        
        // Read blob as data URL
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('Fallback PDF download error:', error);
        sendResponse({ success: false, error: 'PDF下载失败' });
    }
}

// Function to generate meaning using OpenRouter GPT-4o-mini

// Function to add vocabulary to user's collection
async function handleAddVocabulary(word, translation, context, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        // If no translation provided, generate one using AI
        let finalTranslation = translation;
        if (!finalTranslation || finalTranslation.trim() === '') {
            console.log('No translation provided, generating with AI...');
            finalTranslation = await generateMeaning(word, context);
        }

        const response = await fetch(`${settings.saasApiUrl}/vocabulary`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.saasToken}`
            },
            body: JSON.stringify({
                original_word: word,
                translated_word: finalTranslation,
                context_sentence: context || '',
                difficulty_level: 1,
                mastery_level: 0
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await handleSaasLogout(() => {});
                sendResponse({ success: false, error: '登录已过期' });
                return;
            }
            throw new Error('保存词汇失败');
        }

        const result = await response.json();
        sendResponse(result);

    } catch (error) {
        console.error('Add vocabulary error:', error);
        sendResponse({ success: false, error: '保存词汇失败: ' + error.message });
    }
}

// Function to generate missing translations for existing vocabulary
async function handleGenerateMissingTranslations(sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(['saasApiUrl', 'saasToken']);
        
        if (!settings.saasToken) {
            sendResponse({ success: false, error: '未登录' });
            return;
        }

        // Call the backend API to generate missing translations
        const response = await fetch(`${settings.saasApiUrl}/vocabulary/generate-translations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.saasToken}`
            }
        });

        if (!response.ok) {
            throw new Error('生成释义失败');
        }

        const result = await response.json();
        
        sendResponse({ 
            success: true, 
            message: result.message,
            updated: result.updated,
            errors: result.errors && result.errors.length > 0 ? result.errors : undefined
        });

    } catch (error) {
        console.error('Generate missing translations error:', error);
        sendResponse({ success: false, error: '生成释义失败: ' + error.message });
    }
} 