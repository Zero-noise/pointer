document.addEventListener('DOMContentLoaded', function () {
    const Settings = globalThis.PointerSettings;
    const apiKeyInput = document.getElementById('apiKey');
    const baseUrlInput = document.getElementById('baseUrl');
    const modelSelect = document.getElementById('model');
    const modelSearchInput = document.getElementById('modelSearch');
    const modelDropdown = document.getElementById('modelDropdown');
    const buttonPositionSelect = document.getElementById('buttonPosition');
    const buttonPositionSearch = document.getElementById('buttonPositionSearch');
    const buttonPositionDropdown = document.getElementById('buttonPositionDropdown');
    const uiLangSearch = document.getElementById('uiLangSearch');
    const uiLangDropdown = document.getElementById('uiLangDropdown');
    const verifyButton = document.getElementById('verifyButton');
    const verifyStatus = document.getElementById('verifyStatus');
    const modelSection = document.getElementById('modelSection');
    const navModelLink = document.getElementById('navModelLink');
    const buttonSizeSlider = document.getElementById('buttonSize');
    const buttonSizeValue = document.getElementById('buttonSizeValue');
    const buttonThicknessSlider = document.getElementById('buttonThickness');
    const buttonThicknessValue = document.getElementById('buttonThicknessValue');
    const uiLangSelect = document.getElementById('uiLang');
    const shortcutEnabledCheckbox = document.getElementById('shortcutEnabled');
    const shortcutKeyBtn = document.getElementById('shortcutKeyCapture');
    const shortcutNotesRow = document.getElementById('shortcutNotesRow');
    const shortcutSiteList = document.getElementById('shortcutSiteList');
    const clearCredentialsButton = document.getElementById('clearCredentialsButton');
    const navLinks = document.querySelectorAll('.nav-link');

    function syncSliderProgress(slider) {
        const min = Number(slider.min) || 0;
        const max = Number(slider.max) || 100;
        const range = max - min;
        const progress = range > 0 ? ((Number(slider.value) - min) / range) * 100 : 0;
        slider.style.setProperty('--p', `${Math.max(0, Math.min(100, progress))}%`);
    }

    syncSliderProgress(buttonSizeSlider);
    syncSliderProgress(buttonThicknessSlider);

    // 默认隐藏模型部分，直到API验证成功
    modelSection.classList.add('hidden');

    // Global variables for model management
    let allAvailableModels = [];
    let filteredModels = [];
    let selectedModelIndex = -1;
    let lastVerifiedApiKey = null;
    let lastVerifiedBaseUrl = null;
    let hasCachedModelList = false;
    let isCurrentCredentialsVerified = false;

    // Model search and selection functions
    function updateModelDropdown(models) {
        modelDropdown.innerHTML = '';

        if (!models || models.length === 0) {
            const noModelsItem = document.createElement('div');
            noModelsItem.className = 'dropdown-item';
            noModelsItem.style.fontStyle = 'italic';
            noModelsItem.style.textAlign = 'center';
            noModelsItem.style.color = 'var(--ink-4)';
            noModelsItem.textContent = 'No models found';
            modelDropdown.appendChild(noModelsItem);
            return;
        }

        models.forEach((model, index) => {
            const modelItem = document.createElement('div');
            modelItem.className = 'dropdown-item model-item';
            modelItem.textContent = model.id;
            modelItem.dataset.index = index;
            modelItem.dataset.modelId = model.id;

            // Check if this is the currently selected model
            if (model.id === modelSelect.value) {
                modelItem.classList.add('selected');
            }

            modelItem.addEventListener('click', function () {
                selectModel(model.id, index);
            });

            modelDropdown.appendChild(modelItem);
        });
    }

    function selectModel(modelId, index) {
        modelSelect.value = modelId;
        modelSearchInput.value = modelId;
        selectedModelIndex = index;

        // Update visual selection
        document.querySelectorAll('.model-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Provider-controlled model IDs can contain CSS metacharacters. Compare
        // dataset values directly instead of interpolating an ID into a selector.
        const selectedItem = Array.from(document.querySelectorAll('.model-item'))
            .find((item) => item.dataset.modelId === modelId);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        hideModelDropdown();

        // Persist immediately. selectModel is called both on user click AND on the
        // verify auto-select path — in both cases the UI now shows this model, so
        // storage must reflect it or the next reload will restore a stale value.
        if (modelId) {
            void Settings.setSync({ model: modelId }).catch((error) => {
                console.error('Failed to persist model selection:', error.message);
            });
        }
    }

    function filterModels(searchTerm) {
        if (!searchTerm.trim()) {
            filteredModels = [...allAvailableModels];
        } else {
            filteredModels = allAvailableModels.filter(model =>
                model.id.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        updateModelDropdown(filteredModels);
        selectedModelIndex = -1; // Reset selection when filtering
    }

    function showModelDropdown() {
        modelDropdown.classList.add('show');
    }

    function hideModelDropdown() {
        modelDropdown.classList.remove('show');
    }

    function disableModelSelection(messageKey = 'messageVerifyToLoadModels') {
        hideModelDropdown();
        modelSection.classList.add('hidden');
        modelSection.classList.remove('visible');
        if (navModelLink) {
            navModelLink.classList.add('hidden');
        }
        const translationAvailable = typeof I18n !== 'undefined' && typeof I18n.translate === 'function';
        const message = translationAvailable ? I18n.translate(messageKey) : messageKey;
        modelSearchInput.setAttribute('readonly', 'readonly');
        modelSearchInput.placeholder = message;
        modelDropdown.innerHTML = '';
        const messageItem = document.createElement('div');
        messageItem.className = 'dropdown-item';
        messageItem.textContent = message;
        modelDropdown.appendChild(messageItem);
    }

    function enableModelSelection() {
        modelSection.classList.remove('hidden');
        modelSection.classList.add('visible');
        if (navModelLink) {
            navModelLink.classList.remove('hidden');
        }
        modelSearchInput.removeAttribute('readonly');
        const translationAvailable = typeof I18n !== 'undefined' && typeof I18n.translate === 'function';
        modelSearchInput.placeholder = translationAvailable
            ? I18n.translate('placeholderModelSearch')
            : 'Search models...';

        const modelsToRender = filteredModels.length > 0 ? filteredModels : allAvailableModels;
        updateModelDropdown(modelsToRender);
    }

    function handleCredentialChange() {
        const currentApiKey = apiKeyInput.value.trim();
        const currentBaseUrl = sanitizeBaseUrl(baseUrlInput.value);
        // null means "no verified credential generation"; an empty string is
        // a valid verified value for local/LAN servers that do not use auth.
        const apiMatches = lastVerifiedApiKey !== null && currentApiKey === lastVerifiedApiKey;
        const baseMatches = !!lastVerifiedBaseUrl && currentBaseUrl === lastVerifiedBaseUrl;
        const credentialsMatch = apiMatches && baseMatches;

        if (hasCachedModelList && credentialsMatch && isCurrentCredentialsVerified) {
            enableModelSelection();
            return;
        }

        let messageKey;
        if (lastVerifiedApiKey === null || !lastVerifiedBaseUrl) {
            messageKey = 'messageVerifyToLoadModels';
        } else if (!credentialsMatch) {
            messageKey = 'messageCredentialsChanged';
        } else {
            messageKey = 'messageVerifyToLoadModels';
        }

        disableModelSelection(messageKey);
    }

    // Ensure model section is disabled until credentials are verified
    disableModelSelection();

    // Model search event listeners
    modelSearchInput.addEventListener('focus', function () {
        if (modelSection.classList.contains('hidden')) {
            return;
        }
        if (allAvailableModels.length > 0) {
            this.removeAttribute('readonly');
            // Always show all models when focusing, regardless of current input value
            filteredModels = [...allAvailableModels];
            updateModelDropdown(filteredModels);
            showModelDropdown();
            this.select();
        }
    });

    modelSearchInput.addEventListener('blur', function () {
        // Small delay to allow for click events on dropdown items
        setTimeout(() => {
            this.setAttribute('readonly', 'readonly');
            hideModelDropdown();
        }, 150);
    });

    modelSearchInput.addEventListener('click', function () {
        if (modelSection.classList.contains('hidden')) {
            return;
        }
        if (allAvailableModels.length > 0) {
            this.removeAttribute('readonly');
            // Always show all models when clicking
            filteredModels = [...allAvailableModels];
            updateModelDropdown(filteredModels);
            showModelDropdown();
            this.select();
        }
    });

    modelSearchInput.addEventListener('input', function () {
        if (modelSection.classList.contains('hidden')) {
            return;
        }
        filterModels(this.value);
        if (filteredModels.length > 0) {
            showModelDropdown();
        }
    });

    modelSearchInput.addEventListener('keydown', function (e) {
        if (modelSection.classList.contains('hidden')) {
            return;
        }
        if (!modelDropdown.classList.contains('show')) return;

        const items = document.querySelectorAll('.model-item:not(.no-models)');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedModelIndex = Math.min(selectedModelIndex + 1, items.length - 1);
            highlightModelItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedModelIndex = Math.max(selectedModelIndex - 1, 0);
            highlightModelItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedModelIndex >= 0 && items[selectedModelIndex]) {
                const modelId = items[selectedModelIndex].dataset.modelId;
                selectModel(modelId, selectedModelIndex);
            }
        } else if (e.key === 'Escape') {
            hideModelDropdown();
            this.blur();
        }
    });

    function highlightModelItem(items) {
        items.forEach((item, index) => {
            item.classList.toggle('highlighted', index === selectedModelIndex);
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.model-search-container')) {
            hideModelDropdown();
        }
        if (!e.target.closest('.custom-select-container, .custom-select')) {
            hideAllCustomDropdowns();
        }
    });

    // Custom select functions for Interface Settings
    function setupCustomSelect(searchInput, dropdown, hiddenInput, initialValue) {
        const items = dropdown.querySelectorAll('.custom-item');

        // Set initial value
        if (initialValue) {
            const selectedItem = dropdown.querySelector(`[data-value="${initialValue}"]`);

            if (selectedItem) {
                // Special handling for language dropdown
                if (dropdown.id === 'uiLangDropdown') {
                    searchInput.value = I18n.getLanguageDisplayName(initialValue);
                } else {
                    searchInput.value = selectedItem.textContent;
                }
                hiddenInput.value = initialValue;
                updateSelectedItem(dropdown, initialValue);
            }
        }

        // Click handler for search input
        searchInput.addEventListener('click', function () {
            hideAllCustomDropdowns();
            dropdown.classList.add('show');
            searchInput.classList.add('active');
        });

        // Click handlers for dropdown items
        items.forEach(item => {
            item.addEventListener('click', function () {
                const value = this.dataset.value;
                const text = this.textContent;

                searchInput.value = text;
                hiddenInput.value = value;

                updateSelectedItem(dropdown, value);
                dropdown.classList.remove('show');
                searchInput.classList.remove('active');

                // Trigger change event
                const changeEvent = new Event('change', { bubbles: true });
                hiddenInput.dispatchEvent(changeEvent);
            });
        });

        // Handle blur event
        searchInput.addEventListener('blur', function () {
            setTimeout(() => {
                dropdown.classList.remove('show');
                searchInput.classList.remove('active');
            }, 150);
        });
    }

    function updateSelectedItem(dropdown, value) {
        dropdown.querySelectorAll('.custom-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.value === value);
        });
    }

    function hideAllCustomDropdowns() {
        document.querySelectorAll('.custom-dropdown, .dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        document.querySelectorAll('.select-input').forEach(input => {
            input.classList.remove('active');
        });
    }

    // Initialize custom selects
    function initializeCustomSelects() {
        // Generate language options first using I18n module
        I18n.generateLanguageOptions(uiLangDropdown, 'custom-item');

        // Wait for translations to be applied first
        setTimeout(() => {
            setupCustomSelect(uiLangSearch, uiLangDropdown, uiLangSelect, uiLangSelect.value || 'en');
            setupCustomSelect(buttonPositionSearch, buttonPositionDropdown, buttonPositionSelect, buttonPositionSelect.value || 'bottom-right');
        }, 100);
    }

    // Paint English first, before the settings round-trip. The static HTML says
    // "Alt" because markup cannot know the platform, and the shortcut hint is
    // the one string that is wrong on a Mac until i18n substitutes {mod}. The
    // real language is applied again once uiLang is known; if storage fails
    // outright, this pass is the only one that runs — and it still says Option
    // on a Mac rather than leaving the wrong key name on screen.
    I18n.applyTranslations('en');

    Settings.getOptionsState().then(async function (result) {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }

        if (result.baseUrl) {
            baseUrlInput.value = result.baseUrl;
        } else {
            // Default OpenAI URL
            baseUrlInput.value = 'https://api.openai.com/v1';
        }

        // Only restore the previously selected model value if available
        if (result.model) {
            modelSelect.value = result.model;
            modelSearchInput.value = result.model;
        }

        // Storage keeps only a hash of the verified key; the in-memory plaintext
        // copy is reconstructed here iff the stored key still matches that hash.
        lastVerifiedApiKey = null;
        // 归一化一次，后续比较不必再包 sanitizeBaseUrl（其余写入点均已归一化）
        lastVerifiedBaseUrl = sanitizeBaseUrl(result.lastVerifiedBaseUrl || '') || null;
        const storedKeyAtLoad = apiKeyInput.value.trim();
        if (result.lastVerifiedApiKeyHash) {
            try {
                const storedKeyHash = await Settings.sha256Hex(storedKeyAtLoad);
                if (storedKeyHash === result.lastVerifiedApiKeyHash) {
                    lastVerifiedApiKey = storedKeyAtLoad;
                }
            } catch (error) {
                console.error('Failed to hash stored API key:', error);
            }
        }

        if (Array.isArray(result.availableModels)) {
            hasCachedModelList = true;
            allAvailableModels = result.availableModels
                .map(model => {
                    if (typeof model === 'string') {
                        return { id: model };
                    }
                    if (model && typeof model.id === 'string') {
                        return { id: model.id };
                    }
                    return null;
                })
                .filter(Boolean);
            filteredModels = [...allAvailableModels];
        } else {
            hasCachedModelList = false;
            allAvailableModels = [];
            filteredModels = [];
        }

        const storedApiKey = apiKeyInput.value.trim();
        const storedBaseUrl = sanitizeBaseUrl(baseUrlInput.value);
        const hasVerificationMetadata = !!result.lastVerified &&
            lastVerifiedApiKey !== null &&
            !!lastVerifiedBaseUrl;

        if (hasCachedModelList && hasVerificationMetadata && storedApiKey === lastVerifiedApiKey && storedBaseUrl === lastVerifiedBaseUrl) {
            isCurrentCredentialsVerified = true;
        } else {
            isCurrentCredentialsVerified = false;
        }

        if (result.buttonPosition) {
            buttonPositionSelect.value = result.buttonPosition;
        }

        // If we have custom coordinates and position is custom
        if (result.buttonPosition === 'custom' && result.buttonX !== undefined && result.buttonY !== undefined) {
            buttonPositionSelect.value = 'custom';
        }

        // Set button size if saved
        if (result.buttonSize) {
            buttonSizeSlider.value = result.buttonSize;
            buttonSizeValue.textContent = `${result.buttonSize}px`;
        } else {
            // Default size
            buttonSizeSlider.value = 64;
            buttonSizeValue.textContent = '64px';
        }

        // Set button thickness (硝子厚度) — default 0
        const savedThickness = (typeof result.buttonThickness === 'number')
            ? result.buttonThickness
            : 0;
        buttonThicknessSlider.value = savedThickness;
        buttonThicknessValue.textContent = `${savedThickness}%`;
        syncSliderProgress(buttonSizeSlider);
        syncSliderProgress(buttonThicknessSlider);

        // UI Language setting with validation
        if (result.uiLang && I18n.isLanguageSupported(result.uiLang)) {
            uiLangSelect.value = result.uiLang;
        } else {
            // Default to English if saved language is not supported
            uiLangSelect.value = 'en';
            void Settings.setSync({ uiLang: 'en' }).catch(console.error);
        }

        // Keyboard shortcut settings — default ON, default shortcut bare T
        const shortcutOn = result.shortcutEnabled !== false;
        const shortcutCode = result.shortcutKey || 'KeyT';
        shortcutModifier = Settings.normalizeShortcutModifier(result.shortcutModifier);
        shortcutSiteOverrides = Settings.normalizeShortcutSiteOverrides(result.shortcutSiteOverrides);
        shortcutEnabledCheckbox.checked = shortcutOn;
        shortcutKeyBtn.dataset.code = shortcutCode;
        shortcutKeyBtn.textContent = formatShortcutCode(shortcutCode);
        shortcutKeyBtn.classList.toggle('is-disabled', !shortcutOn);
        renderShortcutNotes();

        // Apply translations after all settings are loaded
        I18n.applyTranslations(uiLangSelect.value);
        I18n.setCurrentLanguage(uiLangSelect.value);

        // Initialize custom selects after everything is loaded
        initializeCustomSelects();

        // Update model section visibility based on stored credentials and models
        handleCredentialChange();
    }).catch((error) => {
        // 初始化链中任何一步（迁移、storage 读取、哈希）失败都不能让
        // 页面无声地停在空白状态
        console.error('Failed to initialize options page:', error);
        showVerifyStatus(`Failed to load settings: ${error.message}. Please reopen this page.`, 'error');
    });

    // Update size value display live while dragging; persist only on release
    // ('change') so a drag doesn't burn through the storage.sync write quota.
    buttonSizeSlider.addEventListener('input', function () {
        buttonSizeValue.textContent = `${this.value}px`;
        syncSliderProgress(this);
    });
    buttonSizeSlider.addEventListener('change', saveInterfaceSettings);

    // Update thickness value display live; persist on release
    buttonThicknessSlider.addEventListener('input', function () {
        buttonThicknessValue.textContent = `${this.value}%`;
        syncSliderProgress(this);
    });
    buttonThicknessSlider.addEventListener('change', saveInterfaceSettings);

    buttonPositionSelect.addEventListener('change', saveInterfaceSettings);
    uiLangSelect.addEventListener('change', function () {
        // Apply translations immediately when language changes
        I18n.applyTranslations(this.value);
        I18n.setCurrentLanguage(this.value);

        // 这两块是脚本生成的，data-i18n 扫不到，得手动重刷
        renderShortcutNotes();

        // Update custom select displays with new translations
        setTimeout(() => {
            const displayName = I18n.getLanguageDisplayName(this.value);
            if (displayName) {
                uiLangSearch.value = displayName;
            }

            const selectedPosItem = buttonPositionDropdown.querySelector(`[data-value="${buttonPositionSelect.value}"]`);
            if (selectedPosItem) {
                buttonPositionSearch.value = selectedPosItem.textContent;
            }
            handleCredentialChange();
        }, 50);

        saveInterfaceSettings();
    });

    // ——— Keyboard shortcut: enable toggle + rebindable key ———
    // e.code 到可读字形的映射。KeyT→T、Digit1→1、F5→F5、Space→Space。
    function formatKeyCode(code) {
        if (!code) return 'T';
        if (/^Key[A-Z]$/.test(code)) return code.slice(3);
        if (/^Digit[0-9]$/.test(code)) return code.slice(5);
        if (/^F([1-9]|1[0-2])$/.test(code)) return code;
        if (code === 'Space') return 'Space';
        if (code === 'Backquote') return '`';
        if (code === 'Minus') return '-';
        if (code === 'Equal') return '=';
        if (code === 'BracketLeft') return '[';
        if (code === 'BracketRight') return ']';
        if (code === 'Semicolon') return ';';
        if (code === 'Quote') return "'";
        if (code === 'Comma') return ',';
        if (code === 'Period') return '.';
        if (code === 'Slash') return '/';
        if (code === 'Backslash') return '\\';
        return code;
    }

    // 当前绑定的修饰键：'none' = 裸键，'alt' = Alt + 键
    let shortcutModifier = 'none';
    let shortcutSiteOverrides = {};

    // The cap reads ⌥T on a Mac and Alt+T everywhere else — same binding, same
    // e.code, just the label the user's own keyboard actually carries.
    function formatShortcutCode(code, modifier) {
        const key = formatKeyCode(code);
        return Settings.formatShortcutChord(key, (modifier || shortcutModifier) === 'alt');
    }

    // 只在真的有逐站例外时才占地方。裸键的冲突代价不提前解释——
    // 自愈触发时会自己说话，讲两遍就是噪音。显隐用真正画出来的条数判断，
    // 而不是 map 的大小：全是非法值时 map 非空但一条都画不出来，
    // 那一行就该继续藏着。
    function renderShortcutNotes() {
        shortcutNotesRow.hidden = renderShortcutSites() === 0;
    }

    function translateOr(key, fallback) {
        const value = (typeof I18n !== 'undefined' && I18n.translate) ? I18n.translate(key) : '';
        return value && value !== key ? value : fallback;
    }

    // 逐站例外列表。用 textContent 逐个建节点，绝不把 host 拼进 innerHTML——
    // host 虽已规范化，但它最终来自页面地址，不该走字符串拼接这条路。
    //
    // 值也要再验一次。shortcutSiteOverrides 已经过 normalizeShortcutSiteOverrides，
    // 但渲染是最后一道：模式非法时 content.js 会回落到全局设置，这里若照旧按
    // 「不是 off 就是裸键」画，就会显示一个这个站点根本不会生效的组合键。
    // 宁可不画这一条。
    function renderShortcutSites() {
        shortcutSiteList.textContent = '';
        let rendered = 0;
        const hosts = Object.keys(shortcutSiteOverrides).sort();
        for (const host of hosts) {
            const mode = Settings.normalizeShortcutMode(shortcutSiteOverrides[host]);
            if (!mode) continue;
            const chip = document.createElement('span');
            chip.className = 'shortcut-site';

            const name = document.createElement('span');
            name.textContent = host;
            chip.appendChild(name);

            const modeLabel = document.createElement('span');
            modeLabel.className = 'shortcut-site-mode';
            modeLabel.textContent = mode === 'off'
                ? translateOr('shortcutSiteOff', 'off')
                : formatShortcutCode(shortcutKeyBtn.dataset.code || 'KeyT', mode);
            chip.appendChild(modeLabel);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'shortcut-site-remove';
            remove.textContent = '\u00d7';
            remove.title = translateOr('shortcutSiteRemove', 'Remove exception');
            remove.setAttribute('aria-label', `${remove.title}: ${host}`);
            remove.addEventListener('click', function () {
                const next = Settings.normalizeShortcutSiteOverrides(shortcutSiteOverrides);
                delete next[host];
                shortcutSiteOverrides = next;
                renderShortcutNotes();
                void Settings.setSync({ shortcutSiteOverrides: next }).catch(console.error);
            });
            chip.appendChild(remove);

            shortcutSiteList.appendChild(chip);
            rendered++;
        }
        return rendered;
    }

    // 限制可绑定的按键：字母/数字/功能键/空格/常见标点——
    // 这些在 content.js 的 guard 下可靠：按键与 e.code 匹配。
    const BINDABLE_CODE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash)$/;

    // 裸键会被 preventDefault 掉，所以不能绑那些「默认行为不能没有」的键。
    // 空格是典型：裸绑之后每个页面都翻不了页。加 Alt 就没这个问题。
    const BARE_UNSAFE_CODES = new Set(['Space']);

    function isValidShortcutCode(code, modifier) {
        if (!BINDABLE_CODE.test(code)) return false;
        if (modifier !== 'alt' && BARE_UNSAFE_CODES.has(code)) return false;
        return true;
    }

    let isCapturingShortcut = false;

    function exitCaptureMode(restoreCode) {
        isCapturingShortcut = false;
        shortcutKeyBtn.classList.remove('recording');
        if (restoreCode) {
            shortcutKeyBtn.textContent = formatShortcutCode(restoreCode);
            shortcutKeyBtn.dataset.code = restoreCode;
        }
    }

    shortcutKeyBtn.addEventListener('click', function () {
        if (shortcutKeyBtn.classList.contains('is-disabled')) return;
        if (isCapturingShortcut) return;
        isCapturingShortcut = true;
        shortcutKeyBtn.classList.add('recording');
        const recordingLabel = (typeof I18n !== 'undefined' && I18n.translate)
            ? I18n.translate('shortcutRecording') : 'Press any key…';
        shortcutKeyBtn.textContent = recordingLabel;
    });

    // capture 阶段拦截，避免 Enter/Space 触发按钮自身 click
    document.addEventListener('keydown', function (e) {
        if (!isCapturingShortcut) return;

        // Escape 取消，恢复原键
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            exitCaptureMode(shortcutKeyBtn.dataset.code || 'KeyT');
            return;
        }

        // 忽略单独的修饰键按下，等用户真正按下目标键
        if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

        // 录的是「你实际按下的组合」：按 T 就绑裸键 T，按 Alt+T 就绑 Alt+T。
        // 不用额外开关，按什么得到什么。Ctrl/Meta/Shift 会撞浏览器命令，拒绝。
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        const newModifier = e.altKey ? 'alt' : 'none';
        if (!isValidShortcutCode(e.code, newModifier)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const newCode = e.code;
        shortcutModifier = newModifier;
        shortcutKeyBtn.classList.remove('recording');
        shortcutKeyBtn.textContent = formatShortcutCode(newCode);
        shortcutKeyBtn.dataset.code = newCode;
        isCapturingShortcut = false;
        renderShortcutNotes();
        void Settings.setSync({
            shortcutKey: newCode,
            shortcutModifier: newModifier
        }).catch(console.error);
    }, true);

    // 页面失焦 / 点击其他地方时，取消录制（防止卡在 recording 态）
    shortcutKeyBtn.addEventListener('blur', function () {
        if (isCapturingShortcut) {
            exitCaptureMode(shortcutKeyBtn.dataset.code || 'KeyT');
        }
    });

    // content.js 可以在冲突自愈时写入逐站例外。设置页如果正开着，
    // 用户点进来会看到一份过期列表——那正是提示语让他们来看的东西。
    try {
        chrome.storage.onChanged.addListener(function (changes, areaName) {
            if (areaName !== 'sync') return;
            let dirty = false;
            if (changes.shortcutModifier) {
                shortcutModifier = Settings.normalizeShortcutModifier(changes.shortcutModifier.newValue);
                dirty = true;
            }
            if (changes.shortcutSiteOverrides) {
                shortcutSiteOverrides =
                    Settings.normalizeShortcutSiteOverrides(changes.shortcutSiteOverrides.newValue);
                dirty = true;
            }
            if (changes.shortcutKey && !isCapturingShortcut) {
                shortcutKeyBtn.dataset.code = changes.shortcutKey.newValue || 'KeyT';
                dirty = true;
            }
            if (dirty && !isCapturingShortcut) {
                shortcutKeyBtn.textContent = formatShortcutCode(shortcutKeyBtn.dataset.code || 'KeyT');
                renderShortcutNotes();
            }
        });
    } catch (error) {
        console.error('Error setting up settings change listener:', error);
    }

    shortcutEnabledCheckbox.addEventListener('change', function () {
        void Settings.setSync({ shortcutEnabled: this.checked }).catch(console.error);
        shortcutKeyBtn.classList.toggle('is-disabled', !this.checked);
        if (!this.checked && isCapturingShortcut) {
            exitCaptureMode(shortcutKeyBtn.dataset.code || 'KeyT');
        }
    });

    apiKeyInput.addEventListener('input', function () {
        isCurrentCredentialsVerified = false;
        handleCredentialChange();
    });
    baseUrlInput.addEventListener('input', function () {
        isCurrentCredentialsVerified = false;
        handleCredentialChange();
        updatePresetMatch();
    });

    // ——— Base URL presets: curated OpenAI-compatible providers (verified April 2026) ———
    // Click the chevron → glass lens opens listing common providers. Selecting
    // one fills the URL field and dispatches the same input/change events the
    // user would trigger by typing, so existing credential-change logic runs.
    //
    // URLs were pulled from each provider's official docs. Several use NON-standard
    // path prefixes (Groq /openai/v1, OpenRouter /api/v1, Fireworks /inference/v1,
    // Gemini /v1beta/openai, DashScope /compatible-mode/v1) — store the full path
    // verbatim; the extension appends /models to whatever the user pastes.
    //
    // Excluded on purpose:
    //   · Azure OpenAI — per-deployment URL, doesn't fit a single preset
    //   · Perplexity — moved off /v1/chat/completions to /v1/agent|/v1/sonar
    // Anthropic is included but compat is officially "test/eval"; /v1/messages
    // is the production path. Users who pick it will still get a model list
    // because the native /v1/models endpoint returns OpenAI-parseable shape.
    const baseUrlPresets = [
        // Frontier model providers
        { name: 'OpenAI',      url: 'https://api.openai.com/v1' },
        { name: 'Anthropic',   url: 'https://api.anthropic.com/v1' },
        { name: 'Gemini',      url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
        { name: 'xAI',         url: 'https://api.x.ai/v1' },
        { name: 'DeepSeek',    url: 'https://api.deepseek.com/v1' },
        { name: 'Mistral',     url: 'https://api.mistral.ai/v1' },
        // Inference / aggregator platforms
        { name: 'Groq',        url: 'https://api.groq.com/openai/v1' },
        { name: 'OpenRouter',  url: 'https://openrouter.ai/api/v1' },
        { name: 'Together',    url: 'https://api.together.xyz/v1' },
        { name: 'Fireworks',   url: 'https://api.fireworks.ai/inference/v1' },
        // China-based providers
        { name: 'SiliconFlow', url: 'https://api.siliconflow.cn/v1' },
        { name: 'Moonshot',    url: 'https://api.moonshot.cn/v1' },
        { name: 'Qwen',        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
        // Local runtimes (default ports; user can override)
        { name: 'Ollama',      url: 'http://localhost:11434/v1' },
        { name: 'LM Studio',   url: 'http://localhost:1234/v1' }
    ];

    const baseUrlWrap = document.getElementById('baseUrlWrap');
    const baseUrlPresetBtn = document.getElementById('baseUrlPresetBtn');
    const baseUrlPresetDropdown = document.getElementById('baseUrlPresetDropdown');

    // trim + strip trailing slashes — the canonical form used for persistence
    // and for the /models fetch (a trailing slash would produce /v1//models).
    function sanitizeBaseUrl(url) {
        return (url || '').trim().replace(/\/+$/, '');
    }

    // Case-insensitive variant, used only for preset matching.
    function normalizeUrl(url) {
        return sanitizeBaseUrl(url).toLowerCase();
    }

    function requestApiHostPermissionPattern(originPattern) {
        return new Promise((resolve, reject) => {
            try {
                // Called directly from the Verify click handler so Chrome sees
                // a user gesture. Requesting an already-granted origin returns
                // true without showing another prompt.
                chrome.permissions.request({ origins: [originPattern] }, (granted) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(Boolean(granted));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function containsApiHostPermissionPattern(originPattern) {
        return new Promise((resolve, reject) => {
            try {
                chrome.permissions.contains({ origins: [originPattern] }, (allowed) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(Boolean(allowed));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function requestApiHostPermission(baseUrl) {
        return requestApiHostPermissionPattern(Settings.getHostPermissionPattern(baseUrl));
    }

    function containsApiHostPermission(baseUrl) {
        return containsApiHostPermissionPattern(Settings.getHostPermissionPattern(baseUrl));
    }

    function removeApiHostPermissionPattern(originPattern) {
        return new Promise((resolve, reject) => {
            try {
                chrome.permissions.remove({ origins: [originPattern] }, (removed) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(Boolean(removed));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    // ——— Narrowing a pre-exact-port grant to the endpoint's own port ———
    //
    // An existing `https://host/*` grant covers every port on that host. The
    // endpoint-specific grant is `https://host:443/*`. Chrome's documented
    // behaviour does not say whether
    // requesting the narrow pattern while the broad one is held actually stores
    // the narrow pattern, or whether request() simply returns true because the
    // broad grant already contains it. If it is the latter, removing the broad
    // pattern takes all access with it — Verify and translation would break for
    // an endpoint the user never touched.
    //
    // So this never trusts the outcome: it removes, re-checks, and only keeps
    // the removal if the exact grant is still live. If it is not, it re-requests
    // the exact pattern (activation is still warm — this runs before the network
    // call, milliseconds after the click), and failing that puts the broad grant
    // back. The caller stops verification only in the last case, which is the one
    // where the user really does have less access than they started with.
    //
    // Returns 'unchanged' | 'narrowed' | 'restored' | 'lost'.
    async function narrowLegacyHostPermission(baseUrl) {
        const exactPattern = Settings.getHostPermissionPattern(baseUrl);
        const legacyPattern = Settings.getLegacyHostPermissionPattern(baseUrl);
        if (exactPattern === legacyPattern) return 'unchanged';

        if (!await containsApiHostPermissionPattern(legacyPattern)) return 'unchanged';
        // Never remove the broad grant while the exact one is not already
        // satisfied — that would be a plain downgrade, not a migration.
        if (!await containsApiHostPermissionPattern(exactPattern)) return 'unchanged';

        if (!await removeApiHostPermissionPattern(legacyPattern)) return 'unchanged';

        if (await containsApiHostPermissionPattern(exactPattern)) return 'narrowed';

        if (await requestApiHostPermissionPattern(exactPattern)) return 'narrowed';

        return await requestApiHostPermissionPattern(legacyPattern) ? 'restored' : 'lost';
    }

    async function removeApiHostPermission(baseUrl, includeLegacyPattern = false) {
        if (!baseUrl) return false;

        const patterns = [Settings.getHostPermissionPattern(baseUrl)];
        if (includeLegacyPattern) {
            patterns.push(Settings.getLegacyHostPermissionPattern(baseUrl));
        }

        let removed = false;
        for (const pattern of [...new Set(patterns)]) {
            removed = await removeApiHostPermissionPattern(pattern) || removed;
        }
        return removed;
    }

    function hasSameApiPermission(leftBaseUrl, rightBaseUrl) {
        try {
            return Settings.getHostPermissionPattern(leftBaseUrl) ===
                Settings.getHostPermissionPattern(rightBaseUrl);
        } catch (_) {
            return false;
        }
    }

    function hasSameApiPermissionHost(leftBaseUrl, rightBaseUrl) {
        try {
            const left = new URL(Settings.normalizeAndValidateBaseUrl(leftBaseUrl));
            const right = new URL(Settings.normalizeAndValidateBaseUrl(rightBaseUrl));
            return left.protocol === right.protocol && left.hostname === right.hostname;
        } catch (_) {
            return false;
        }
    }

    function renderPresetDropdown() {
        baseUrlPresetDropdown.innerHTML = '';
        const current = normalizeUrl(baseUrlInput.value);
        baseUrlPresets.forEach((preset) => {
            const item = document.createElement('div');
            item.className = 'preset-item';
            item.setAttribute('role', 'option');
            item.dataset.url = preset.url;
            if (normalizeUrl(preset.url) === current) {
                item.classList.add('matched');
                item.setAttribute('aria-selected', 'true');
            }
            item.innerHTML = `
                <div class="preset-text">
                    <span class="preset-name"></span>
                    <span class="preset-url"></span>
                </div>
                <svg class="preset-check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
            item.querySelector('.preset-name').textContent = preset.name;
            item.querySelector('.preset-url').textContent = preset.url;
            item.addEventListener('mousedown', function (e) {
                // mousedown (not click) so the input's blur doesn't race the selection
                e.preventDefault();
                baseUrlInput.value = preset.url;
                baseUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
                baseUrlInput.dispatchEvent(new Event('change', { bubbles: true }));
                closePresetDropdown();
            });
            baseUrlPresetDropdown.appendChild(item);
        });
    }

    function updatePresetMatch() {
        const current = normalizeUrl(baseUrlInput.value);
        baseUrlPresetDropdown.querySelectorAll('.preset-item').forEach((item) => {
            const matches = normalizeUrl(item.dataset.url) === current;
            item.classList.toggle('matched', matches);
            if (matches) {
                item.setAttribute('aria-selected', 'true');
            } else {
                item.removeAttribute('aria-selected');
            }
        });
    }

    function openPresetDropdown() {
        renderPresetDropdown();
        baseUrlPresetDropdown.classList.add('show');
        baseUrlWrap.classList.add('open');
        baseUrlPresetBtn.setAttribute('aria-expanded', 'true');
    }

    function closePresetDropdown() {
        baseUrlPresetDropdown.classList.remove('show');
        baseUrlWrap.classList.remove('open');
        baseUrlPresetBtn.setAttribute('aria-expanded', 'false');
    }

    baseUrlPresetBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (baseUrlPresetDropdown.classList.contains('show')) {
            closePresetDropdown();
        } else {
            openPresetDropdown();
        }
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('#baseUrlWrap')) {
            closePresetDropdown();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && baseUrlPresetDropdown.classList.contains('show')) {
            closePresetDropdown();
        }
    });

    // Persist credentials on blur-after-change so users don't have to hit Verify
    // just to keep what they typed.
    apiKeyInput.addEventListener('change', function () {
        void Settings.setApiKey(this.value.trim()).catch(console.error);
    });
    baseUrlInput.addEventListener('change', function () {
        const nextBaseUrl = sanitizeBaseUrl(this.value);
        void Settings.setSync({ baseUrl: nextBaseUrl }).catch(console.error);

        if (lastVerifiedBaseUrl && !hasSameApiPermission(lastVerifiedBaseUrl, nextBaseUrl)) {
            // Pointer grants one port only. Remove the old exact grant as soon as
            // the endpoint changes; a host-wide compatibility grant is also safe
            // to remove when the host itself changed.
            const includeLegacy = !hasSameApiPermissionHost(lastVerifiedBaseUrl, nextBaseUrl);
            void removeApiHostPermission(lastVerifiedBaseUrl, includeLegacy).catch((error) => {
                console.warn('Failed to remove the previous API host permission:', error.message);
            });
        }
    });

    // Clear Credentials: remove apiKey/baseUrl/model and reset inputs
    if (clearCredentialsButton) {
        clearCredentialsButton.addEventListener('click', async function () {
            const permissionBaseUrl = lastVerifiedBaseUrl;
            try {
                // Remove compatibility sync keys as part of the same cleanup.
                await Settings.removeSync([
                    'baseUrl',
                    'model',
                    'lastVerified',
                    'lastVerifiedApiKeyHash',
                    'lastVerifiedBaseUrl',
                    ...Settings.LEGACY_SYNC_KEYS
                ]);
                await Settings.removeLocal([
                    ...Settings.MODEL_CACHE_KEYS,
                    'apiKey',
                    Settings.CREDENTIAL_BINDING_LOCAL_KEY
                ]);

                let permissionCleanupError = null;
                if (permissionBaseUrl) {
                    try {
                        // Clear both current exact-port grants and host-wide
                        // grants left by versions released before this change.
                        await removeApiHostPermission(permissionBaseUrl, true);
                    } catch (error) {
                        permissionCleanupError = error;
                        console.warn('Failed to remove API host permission:', error.message);
                    }
                }

                apiKeyInput.value = '';
                baseUrlInput.value = '';
                modelSelect.value = '';
                modelSearchInput.value = '';
                allAvailableModels = [];
                filteredModels = [];
                selectedModelIndex = -1;
                lastVerifiedApiKey = null;
                lastVerifiedBaseUrl = null;
                hasCachedModelList = false;
                isCurrentCredentialsVerified = false;
                disableModelSelection();
                modelDropdown.innerHTML = '<div class="dropdown-item">Cleared. Verify again to load models.</div>';
                if (permissionCleanupError) {
                    showVerifyStatus(
                        `API settings cleared, but Chrome could not remove the old server permission: ${permissionCleanupError.message}`,
                        'error'
                    );
                } else {
                    showVerifyStatus('API settings and server permission cleared.', 'success');
                }
            } catch (error) {
                console.error('Failed to clear credentials:', error);
                showVerifyStatus(`Failed to clear credentials: ${error.message}`, 'error');
            }
        });
    }

    // Scrollspy for sidebar navigation
    const sectionMap = [
        { id: 'apiSection', key: 'api' },
        { id: 'modelSection', key: 'model' },
        { id: 'interfaceSection', key: 'interface' }
    ];
    const linkByKey = {};
    navLinks.forEach(link => { linkByKey[link.dataset.nav] = link; });

    // 标志位：是否是手动点击导航触发的滚动
    let isManualNavClick = false;
    let manualNavTimer = null;

    const observer = new IntersectionObserver((entries) => {
        // 如果是手动点击导航触发的滚动，不自动更新active状态
        if (isManualNavClick) return;

        entries.forEach(entry => {
            const sec = sectionMap.find(s => s.id === entry.target.id);
            if (!sec) return;
            if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                navLinks.forEach(l => l.classList.remove('active'));
                if (linkByKey[sec.key]) linkByKey[sec.key].classList.add('active');
            }
        });
    }, { threshold: [0.55] });
    sectionMap.forEach(s => {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
    });
    // Smooth scroll on click
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    // 设置手动点击标志位
                    isManualNavClick = true;

                    // 清除之前的定时器
                    if (manualNavTimer) clearTimeout(manualNavTimer);

                    // 立即更新active状态
                    navLinks.forEach(l => l.classList.remove('active'));
                    this.classList.add('active');

                    // 滚动到目标section
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

                    // 1秒后恢复IntersectionObserver的自动更新功能
                    manualNavTimer = setTimeout(() => {
                        isManualNavClick = false;
                    }, 1000);
                }
            }
        });
    });

    // Verify API and load models
    verifyButton.addEventListener('click', async function () {
        const apiKey = apiKeyInput.value.trim();
        let baseUrl;

        if (!sanitizeBaseUrl(baseUrlInput.value)) {
            showVerifyStatus('Please enter a base URL', 'error');
            return;
        }

        try {
            baseUrl = Settings.normalizeAndValidateBaseUrl(baseUrlInput.value);
        } catch (error) {
            showVerifyStatus(error.message, 'error');
            return;
        }
        if (!apiKey && Settings.isApiKeyRequired(baseUrl)) {
            showVerifyStatus('Please enter an API key for this remote server', 'error');
            return;
        }

        // Start the permission request synchronously inside the user click.
        // Awaiting another operation first can lose Chrome's transient user
        // activation and make permissions.request fail even for a valid URL.
        // contains() is also started now so a later failed API check can roll
        // back only a permission newly granted by this click.
        const existingHostPermissionPromise = containsApiHostPermission(baseUrl).catch((error) => {
            console.warn('Could not determine whether API host permission already existed:', error.message);
            return true;
        });
        const hostPermissionPromise = requestApiHostPermission(baseUrl);
        let permissionWasNewlyGranted = false;

        // Reflect the sanitized URL in the field so it matches what gets
        // verified. Dispatch 'change' to reuse the blur-persist path, so
        // storage holds the same canonical form, including stored URLs with a
        // trailing slash that the user never re-types.
        if (baseUrlInput.value !== baseUrl) {
            baseUrlInput.value = baseUrl;
            baseUrlInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const previousModels = [...allAvailableModels];
        const previousFilteredModels = [...filteredModels];
        const previousModelValue = modelSearchInput.value;
        const previousModelSelection = modelSelect.value;
        const previousHasCachedModelList = hasCachedModelList;
        const previousLastVerifiedKey = lastVerifiedApiKey;
        const previousLastVerifiedBaseUrl = lastVerifiedBaseUrl;

        modelSearchInput.value = '';
        modelSearchInput.placeholder = 'Verifying API...';
        modelSearchInput.setAttribute('readonly', 'readonly');
        modelDropdown.innerHTML = '<div class="dropdown-item">Verifying API...</div>';

        verifyButton.disabled = true;
        verifyButton.innerHTML = '<span>Verifying...</span><div class="loading-spinner"></div>';
        // 验证在途时禁掉 Clear，否则清空后返回的成功路径会把刚清掉的
        // 验证元数据/模型缓存原样写回，留下"已验证但没有 key"的矛盾状态
        if (clearCredentialsButton) {
            clearCredentialsButton.disabled = true;
        }

        try {
            const [permissionAlreadyGranted, permissionGranted] = await Promise.all([
                existingHostPermissionPromise,
                hostPermissionPromise
            ]);
            permissionWasNewlyGranted = permissionGranted && !permissionAlreadyGranted;
            if (!permissionGranted) {
                throw new Error('Permission for this API server was not granted');
            }

            // Runs here, not after the model fetch: narrowing may have to
            // re-request, and Chrome's transient user activation would be long
            // gone by then. A failure to narrow is not a reason to fail Verify —
            // only an actual loss of access is.
            let narrowResult = 'unchanged';
            try {
                narrowResult = await narrowLegacyHostPermission(baseUrl);
            } catch (error) {
                console.warn('Could not narrow the legacy API host permission:', error.message);
            }
            if (narrowResult === 'lost') {
                throw new Error(
                    'Chrome revoked the previous access to this server while narrowing it to a ' +
                    'single port. Click Verify once more to grant it again.'
                );
            }

            // First verify API connection and get all models
            const fetchedModels = await fetchAvailableModels(apiKey, baseUrl);
            const simplifiedModels = fetchedModels
                .map(model => (model && typeof model.id === 'string') ? { id: model.id } : null)
                .filter(Boolean);

            let currentInputBaseUrl = '';
            try {
                currentInputBaseUrl = Settings.normalizeAndValidateBaseUrl(baseUrlInput.value);
            } catch (_) {
                // The mismatch check below will reject invalid/new input.
            }
            if (apiKeyInput.value.trim() !== apiKey || currentInputBaseUrl !== baseUrl) {
                throw new Error('Credentials changed during verification. Please verify the current values again.');
            }

            // Persist the endpoint first; until the following atomic local
            // credential write completes, the background worker sees a binding
            // mismatch and refuses to send the key anywhere.
            await Settings.setSync({ baseUrl });
            const verifiedAt = new Date().toISOString();
            await Settings.setVerifiedCredentialsAndModels(
                apiKey,
                baseUrl,
                simplifiedModels,
                verifiedAt
            );

            allAvailableModels = simplifiedModels;
            filteredModels = [...simplifiedModels];
            hasCachedModelList = true;
            lastVerifiedApiKey = apiKey;
            lastVerifiedBaseUrl = baseUrl;
            isCurrentCredentialsVerified = true;

            if (previousLastVerifiedBaseUrl &&
                !hasSameApiPermission(previousLastVerifiedBaseUrl, baseUrl)) {
                const includeLegacy = !hasSameApiPermissionHost(previousLastVerifiedBaseUrl, baseUrl);
                try {
                    await removeApiHostPermission(previousLastVerifiedBaseUrl, includeLegacy);
                } catch (error) {
                    // The new verified generation remains valid; do not roll it
                    // back just because Chrome could not clean a stale grant.
                    console.warn('Failed to remove the previous API host permission:', error.message);
                }
            }

            modelSearchInput.removeAttribute('readonly');

            enableModelSelection();

            // If there's a previously selected model that exists in the new list, select it
            if (previousModelSelection && simplifiedModels.some(model => model.id === previousModelSelection)) {
                selectModel(previousModelSelection, simplifiedModels.findIndex(model => model.id === previousModelSelection));
            } else if (simplifiedModels.length > 0) {
                // Select first model if no previous selection or previous model not found
                selectModel(simplifiedModels[0].id, 0);
            } else {
                modelSelect.value = '';
                modelSearchInput.value = '';
                selectedModelIndex = -1;
            }

            showVerifyStatus(`API verified successfully! ${simplifiedModels.length} models loaded.`, 'success');

        } catch (error) {
            if (permissionWasNewlyGranted) {
                try {
                    await removeApiHostPermission(baseUrl);
                } catch (cleanupError) {
                    console.warn('Failed to roll back API host permission:', cleanupError.message);
                }
            }
            showVerifyStatus(`API verification failed: ${error.message}`, 'error');
            allAvailableModels = previousModels;
            filteredModels = previousFilteredModels;
            hasCachedModelList = previousHasCachedModelList;
            lastVerifiedApiKey = previousLastVerifiedKey;
            lastVerifiedBaseUrl = previousLastVerifiedBaseUrl;
            modelSelect.value = previousModelSelection;
            modelSearchInput.value = previousModelValue;
        } finally {
            verifyButton.disabled = false;
            verifyButton.innerHTML = `<span>${I18n.translate('buttonVerify')}</span>`;
            if (clearCredentialsButton) {
                clearCredentialsButton.disabled = false;
            }
            handleCredentialChange();
        }
    });

    // Silent auto-save. Model is persisted directly in selectModel(); this covers
    // the interface section (position / size / thickness / language).
    function saveInterfaceSettings() {
        void Settings.setSync({
            buttonPosition: buttonPositionSelect.value,
            buttonSize: parseInt(buttonSizeSlider.value),
            buttonThickness: parseInt(buttonThicknessSlider.value),
            uiLang: uiLangSelect.value
        }).catch((error) => {
            console.error('Failed to save interface settings:', error.message);
        });
    }

    // Helper function to show verify status messages
    function showVerifyStatus(message, type) {
        verifyStatus.textContent = message;
        verifyStatus.className = `status-message status-${type}`;
        verifyStatus.style.display = 'block';

        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                verifyStatus.style.display = 'none';
            }, 5000);
        }
    }

    // Fetch available models from the API
    async function fetchAvailableModels(apiKey, baseUrl) {
        const REQUEST_TIMEOUT_MS = 20000;
        const MAX_RESPONSE_BYTES = 2_000_000;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

        try {
            const requestHeaders = {
                'Content-Type': 'application/json'
            };
            if (apiKey) {
                requestHeaders.Authorization = `Bearer ${apiKey}`;
            }

            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                redirect: 'error',
                signal: abortController.signal,
                headers: requestHeaders
            });

            const responseText = await Settings.readResponseTextWithLimit(
                response,
                MAX_RESPONSE_BYTES,
                'API model list is too large'
            );

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (_) {
                throw new Error('API returned an invalid JSON model list');
            }

            if (!response.ok) {
                const remoteMessage = data.error?.message;
                throw new Error(
                    typeof remoteMessage === 'string' && remoteMessage.trim()
                        ? Settings.quoteRemoteMessage(remoteMessage)
                        : `Request failed with status ${response.status}`
                );
            }

            // Return all models without filtering
            return Array.isArray(data.data) ? data.data : [];

        } catch (error) {
            if (error.name === 'AbortError') {
                error = new Error(`API verification timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
            }
            console.error('Failed to fetch models:', error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

});
