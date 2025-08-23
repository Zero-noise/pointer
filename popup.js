document.addEventListener('DOMContentLoaded', function () {
    const showButtonToggle = document.getElementById('showButton');
    const targetLangSelect = document.getElementById('targetLang');
    const openOptionsLink = document.getElementById('openOptions');
    const customLangInputContainer = document.getElementById('customLangInputContainer');
    const customTargetLangInput = document.getElementById('customTargetLang');

    // Setup UI translations
    const elementsToTranslate = document.querySelectorAll('[data-i18n]');
    const popupTranslations = {
        en: {
            popupTitle: 'Pointer',
            labelTargetLang: 'Target Language:',
            toggleDisplay: 'Display translation button',
            settingsAdvanced: 'Advanced Settings',
            optionOther: 'Other...',
            labelCustomTargetLang: 'Custom Language Code:',
            customLangHelp: 'Use standard language codes: pt (Portuguese), it (Italian), etc.'
        },
        zh: {
            popupTitle: 'Pointer',
            labelTargetLang: '目标语言：',
            toggleDisplay: '显示翻译按钮',
            settingsAdvanced: '高级设置',
            optionOther: '其他...',
            labelCustomTargetLang: '自定义语言代码：',
            customLangHelp: '使用标准语言代码：pt（葡萄牙语），it（意大利语）等'
        },
        ja: {
            popupTitle: 'Pointer',
            labelTargetLang: '対象言語：',
            toggleDisplay: '翻訳ボタンを表示',
            settingsAdvanced: '詳細設定',
            optionOther: 'その他...',
            labelCustomTargetLang: 'カスタム言語コード：',
            customLangHelp: '標準言語コードを使用：pt（ポルトガル語）、it（イタリア語）など'
        }
    };
    function applyTranslations(lang) {
        elementsToTranslate.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (popupTranslations[lang] && popupTranslations[lang][key]) {
                el.textContent = popupTranslations[lang][key];
            }
        });
    }

    // Add click handler for options link
    openOptionsLink.addEventListener('click', function (e) {
        e.preventDefault(); // Prevent default click behavior
        chrome.runtime.openOptionsPage();
    });

    // Helper function to check if a language code is standard
    function isStandardLanguage(langCode) {
        const standardOptions = Array.from(targetLangSelect.options)
            .map(opt => opt.value)
            .filter(val => val !== 'other');
        return standardOptions.includes(langCode);
    }

    // Load saved settings including UI language
    chrome.storage.sync.get(['uiLang', 'isActive', 'targetLang', 'showButton'], function (result) {
        const lang = result.uiLang || 'en';
        applyTranslations(lang);

        if (result.showButton !== undefined) {
            showButtonToggle.checked = result.showButton;
        } else {
            // Default to showing the button if not set
            showButtonToggle.checked = true;
            chrome.storage.sync.set({ showButton: true });
        }

        if (result.targetLang) {
            if (isStandardLanguage(result.targetLang)) {
                targetLangSelect.value = result.targetLang;
                customLangInputContainer.style.display = 'none'; // Hide custom input
            } else {
                targetLangSelect.value = 'other';
                customTargetLangInput.value = result.targetLang;
                customLangInputContainer.style.display = 'block'; // Show custom input
            }
        } else {
            // Default to English if nothing is set
            targetLangSelect.value = 'en';
            customLangInputContainer.style.display = 'none';
        }
    });

    // Handle target language change (both select and input)
    function saveTargetLanguage() {
        let targetLangValue;
        if (targetLangSelect.value === 'other') {
            targetLangValue = customTargetLangInput.value.trim();
            // Basic validation to ensure a value is provided
            if (!targetLangValue) {
                return; // Don't save empty values
            }
        } else {
            targetLangValue = targetLangSelect.value;
        }

        // Save the target language
        chrome.storage.sync.set({ targetLang: targetLangValue }, function () {
            // Notify content scripts about the language change if active
            chrome.storage.sync.get(['isActive'], function (result) {
                if (result.isActive) {
                    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: 'activate',
                                targetLang: targetLangValue
                            }, function (response) {
                                // Handle potential errors silently
                                if (chrome.runtime.lastError) {
                                    console.log('Error notifying content script: ', chrome.runtime.lastError.message);
                                }
                            });
                        }
                    });
                }
            });
        });
    }

    // Show/hide custom input based on selection
    targetLangSelect.addEventListener('change', function () {
        if (targetLangSelect.value === 'other') {
            customLangInputContainer.style.display = 'block';
            customTargetLangInput.focus(); // Focus the input field
        } else {
            customLangInputContainer.style.display = 'none';
        }
        saveTargetLanguage(); // Save whenever the select changes
    });

    // Save when custom input changes
    customTargetLangInput.addEventListener('change', saveTargetLanguage);
    customTargetLangInput.addEventListener('input', saveTargetLanguage); // Save as user types

    // Add validation for custom language code input
    customTargetLangInput.addEventListener('input', function () {
        const value = this.value.trim().toLowerCase();
        // Basic validation - only allow alpha characters
        if (value && !/^[a-z]+$/.test(value)) {
            this.classList.add('invalid');
        } else {
            this.classList.remove('invalid');
        }
    });

    // Toggle button visibility
    showButtonToggle.addEventListener('change', function () {
        const showButton = showButtonToggle.checked;

        chrome.storage.sync.set({
            showButton: showButton
        });
    });
}); 