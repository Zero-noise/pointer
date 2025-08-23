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
        uiLang: 'en'
    });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        chrome.storage.sync.get(['apiKey', 'baseUrl', 'model'], async function (settings) {
            try {
                let translationResult;
                // Check if request.text is an array
                if (Array.isArray(request.text)) {
                    // Translate each text segment in the array
                    const translations = await Promise.all(
                        request.text.map(textSegment =>
                            translateText(
                                textSegment,
                                request.targetLang,
                                settings.apiKey,
                                settings.baseUrl,
                                settings.model
                            )
                        )
                    );
                    translationResult = { translations: translations }; // Send back an array
                } else {
                    // Handle single text translation (original behavior for safety, though unlikely used now)
                    const translation = await translateText(
                        request.text,
                        request.targetLang,
                        settings.apiKey,
                        settings.baseUrl,
                        settings.model
                    );
                    translationResult = { translation: translation }; // Send back a single string
                }
                sendResponse(translationResult);
            } catch (error) {
                console.error('Translation error in background:', error);
                sendResponse({ error: error.message });
            }
        });
        return true; // Indicates async response
    }
    // Potential future message handlers
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