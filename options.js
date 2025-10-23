document.addEventListener('DOMContentLoaded', function () {
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
    const saveButton = document.getElementById('saveButton');
    const statusMessage = document.getElementById('statusMessage');
    const saveApiButton = document.getElementById('saveApiButton');
    const apiStatusMessage = document.getElementById('apiStatusMessage');
    const verifyButton = document.getElementById('verifyButton');
    const verifyStatus = document.getElementById('verifyStatus');
    const modelSection = document.getElementById('modelSection');
    const navModelLink = document.getElementById('navModelLink');
    const buttonSizeSlider = document.getElementById('buttonSize');
    const buttonSizeValue = document.getElementById('buttonSizeValue');
    const uiLangSelect = document.getElementById('uiLang');
    const autoSaveCheckbox = document.getElementById('autoSave');
    const saveAllButton = document.getElementById('saveAllButton');
    const resetDefaultsButton = document.getElementById('resetDefaultsButton');
    const clearCredentialsButton = document.getElementById('clearCredentialsButton');
    const unsavedDot = document.getElementById('unsavedDot');
    const navLinks = document.querySelectorAll('.nav-link');

    // 默认隐藏模型部分，直到API验证成功
    modelSection.classList.add('hidden');
    
    // Global variables for model management
    let allAvailableModels = [];
    let filteredModels = [];
    let selectedModelIndex = -1;

    // Model search and selection functions
    function updateModelDropdown(models) {
        modelDropdown.innerHTML = '';
        
        if (!models || models.length === 0) {
            const noModelsItem = document.createElement('div');
            noModelsItem.className = 'dropdown-item';
            noModelsItem.style.fontStyle = 'italic';
            noModelsItem.style.textAlign = 'center';
            noModelsItem.style.color = 'var(--neutral-500)';
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
            
            modelItem.addEventListener('click', function() {
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
        
        const selectedItem = document.querySelector(`.model-item[data-model-id="${modelId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        hideModelDropdown();
        // Mark unsaved change for model selection
        showUnsavedIndicator();
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
    
    // Model search event listeners
    modelSearchInput.addEventListener('focus', function() {
        if (allAvailableModels.length > 0) {
            this.removeAttribute('readonly');
            // Always show all models when focusing, regardless of current input value
            filteredModels = [...allAvailableModels];
            updateModelDropdown(filteredModels);
            showModelDropdown();
        }
    });
    
    modelSearchInput.addEventListener('blur', function() {
        // Small delay to allow for click events on dropdown items
        setTimeout(() => {
            this.setAttribute('readonly', 'readonly');
            hideModelDropdown();
        }, 150);
    });
    
    modelSearchInput.addEventListener('click', function() {
        if (allAvailableModels.length > 0) {
            this.removeAttribute('readonly');
            // Always show all models when clicking
            filteredModels = [...allAvailableModels];
            updateModelDropdown(filteredModels);
            showModelDropdown();
        }
    });

    modelSearchInput.addEventListener('input', function() {
        filterModels(this.value);
        if (filteredModels.length > 0) {
            showModelDropdown();
        }
    });
    
    modelSearchInput.addEventListener('keydown', function(e) {
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
    document.addEventListener('click', function(e) {
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
        searchInput.addEventListener('click', function() {
            hideAllCustomDropdowns();
            dropdown.classList.add('show');
            searchInput.classList.add('active');
        });
        
        // Click handlers for dropdown items
        items.forEach(item => {
            item.addEventListener('click', function() {
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
        searchInput.addEventListener('blur', function() {
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

    // Load saved settings
    chrome.storage.sync.get([
        'apiKey',
        'baseUrl',
        'model',
        'buttonPosition',
        'buttonX',
        'buttonY',
        'buttonSize',
        'uiLang',
        'availableModels',
        'lastVerified',
        'autoSave'
    ], function (result) {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }

        if (result.baseUrl) {
            baseUrlInput.value = result.baseUrl;
        } else {
            // Default OpenAI URL
            baseUrlInput.value = 'https://api.openai.com/v1';
        }

        // Note: We no longer restore model list on page load
        // User must verify API each time to get fresh model list
        
        // Only restore the previously selected model value if available
        if (result.model) {
            modelSelect.value = result.model;
            modelSearchInput.value = result.model;
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

        // UI Language setting with validation
        if (result.uiLang && I18n.isLanguageSupported(result.uiLang)) {
            uiLangSelect.value = result.uiLang;
        } else {
            // Default to English if saved language is not supported
            uiLangSelect.value = 'en';
            chrome.storage.sync.set({ uiLang: 'en' });
        }

        // Auto-save setting
        if (result.autoSave !== undefined) {
            autoSaveCheckbox.checked = result.autoSave;
        } else {
            autoSaveCheckbox.checked = false;
            chrome.storage.sync.set({ autoSave: false });
        }

        // Apply translations after all settings are loaded
        I18n.applyTranslations(uiLangSelect.value);
        I18n.setCurrentLanguage(uiLangSelect.value);

        // Initialize custom selects after everything is loaded
        initializeCustomSelects();
    });

    // Update size value display when slider moves
    buttonSizeSlider.addEventListener('input', function () {
        buttonSizeValue.textContent = `${this.value}px`;
        autoSaveIfEnabled();
        markUnsavedIfNeeded();
    });

    // Auto-save when interface settings change
    buttonPositionSelect.addEventListener('change', function() {
        autoSaveIfEnabled();
        markUnsavedIfNeeded();
    });
    uiLangSelect.addEventListener('change', function() {
        // Apply translations immediately when language changes
        I18n.applyTranslations(this.value);
        I18n.setCurrentLanguage(this.value);

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
        }, 50);

        autoSaveIfEnabled();
        markUnsavedIfNeeded();
    });

    // Save auto-save preference immediately when changed
    autoSaveCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({ autoSave: this.checked });
    });

    // Save All button: saves interface settings and model if selected
    if (saveAllButton) {
        saveAllButton.addEventListener('click', function() {
            saveInterfaceSettings(true);
            if (modelSelect.value) {
                chrome.storage.sync.set({ model: modelSelect.value }, function () {
                    showApiStatus(I18n.translate('statusApiSaveSuccess'), 'success');
                });
            }
            hideUnsavedIndicator();
        });
    }

    // Reset Defaults: set interface defaults without saving
    if (resetDefaultsButton) {
        resetDefaultsButton.addEventListener('click', function() {
            // Defaults
            uiLangSelect.value = 'en';
            const displayName = I18n.getLanguageDisplayName('en');
            if (displayName) {
                uiLangSearch.value = displayName;
            }
            buttonPositionSelect.value = 'bottom-right';
            const selectedPosItem = buttonPositionDropdown.querySelector('[data-value="bottom-right"]');
            if (selectedPosItem) {
                buttonPositionSearch.value = selectedPosItem.textContent;
            }
            buttonSizeSlider.value = 64;
            buttonSizeValue.textContent = '64px';
            autoSaveCheckbox.checked = false;

            // Apply translations immediately
            I18n.applyTranslations(uiLangSelect.value);
            I18n.setCurrentLanguage(uiLangSelect.value);

            showUnsavedIndicator();
        });
    }

    // Clear Credentials: remove apiKey/baseUrl/model and reset inputs
    if (clearCredentialsButton) {
        clearCredentialsButton.addEventListener('click', function() {
            chrome.storage.sync.remove(['apiKey','baseUrl','model'], function() {
                apiKeyInput.value = '';
                baseUrlInput.value = '';
                modelSelect.value = '';
                modelSearchInput.value = '';
                modelDropdown.innerHTML = '<div class="dropdown-item">Cleared. Verify again to load models.</div>';
                modelSection.classList.add('hidden');
                modelSection.classList.remove('visible');
                if (navModelLink) {
                    navModelLink.classList.add('hidden');
                }
                showVerifyStatus('Credentials cleared. Please enter new API key and base URL.', 'success');
            });
        });
    }

    // Unsaved changes indicator helpers
    function showUnsavedIndicator() {
        if (unsavedDot) unsavedDot.classList.remove('hidden');
    }
    function hideUnsavedIndicator() {
        if (unsavedDot) unsavedDot.classList.add('hidden');
    }
    function markUnsavedIfNeeded() {
        if (!autoSaveCheckbox.checked) {
            showUnsavedIndicator();
        }
    }

    // Scrollspy for sidebar navigation
    const sectionMap = [
        { id: 'apiSection', key: 'api' },
        { id: 'modelSection', key: 'model' },
        { id: 'interfaceSection', key: 'interface' }
    ];
    const linkByKey = {};
    navLinks.forEach(link => { linkByKey[link.dataset.nav] = link; });
    const observer = new IntersectionObserver((entries) => {
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
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Verify API and load models
    verifyButton.addEventListener('click', async function () {
        const apiKey = apiKeyInput.value.trim();
        const baseUrl = baseUrlInput.value.trim();

        if (!apiKey) {
            showVerifyStatus('Please enter an API key', 'error');
            return;
        }

        if (!baseUrl) {
            showVerifyStatus('Please enter a base URL', 'error');
            return;
        }

        // Save API credentials immediately before verification
        chrome.storage.sync.set({
            apiKey: apiKey,
            baseUrl: baseUrl
        });

        // Clear model list and reset UI
        allAvailableModels = [];
        filteredModels = [];
        modelSearchInput.value = '';
        modelSearchInput.placeholder = 'Verifying API...';
        modelSearchInput.setAttribute('readonly', 'readonly');
        modelDropdown.innerHTML = '<div class="dropdown-item">Verifying API...</div>';

        verifyButton.disabled = true;
        verifyButton.innerHTML = '<span>Verifying...</span><div class="loading-spinner"></div>';

        try {
            // First verify API connection and get all models
            const models = await fetchAvailableModels(apiKey, baseUrl);

            // Store all available models
            allAvailableModels = models;
            filteredModels = [...models];

            // Update model search UI
            modelSearchInput.placeholder = 'Type to search models...';
            modelSearchInput.removeAttribute('readonly');
            updateModelDropdown(filteredModels);

            // If there's a previously selected model that exists in the new list, select it
            const previousModel = modelSelect.value;
            if (previousModel && models.some(model => model.id === previousModel)) {
                selectModel(previousModel, models.findIndex(model => model.id === previousModel));
            } else if (models.length > 0) {
                // Select first model if no previous selection or previous model not found
                selectModel(models[0].id, 0);
            }

            // Show success message and enable model section
            showVerifyStatus(`API verified successfully! ${models.length} models loaded.`, 'success');
            modelSection.classList.remove('hidden');
            modelSection.classList.add('visible');
            if (navModelLink) {
                navModelLink.classList.remove('hidden');
            }

            // Save API settings only (no longer cache model list)
            chrome.storage.sync.set({
                apiKey: apiKey,
                baseUrl: baseUrl,
                lastVerified: new Date().toISOString()
            }, function () {
                console.log('API settings saved');
            });

        } catch (error) {
            showVerifyStatus(`API verification failed: ${error.message}`, 'error');
            modelSection.classList.add('hidden');
            modelSection.classList.remove('visible');
            if (navModelLink) {
                navModelLink.classList.add('hidden');
            }
        } finally {
            verifyButton.disabled = false;
            verifyButton.innerHTML = `<span>${I18n.translate('buttonVerify')}</span>`;
        }
    });

    // Save API model settings
    saveApiButton.addEventListener('click', function () {
        // Validate that a model has been selected
        if (!modelSelect.value) {
            showApiStatus('Please select a model', 'error');
            return;
        }

        // Save AI model setting
        chrome.storage.sync.set({
            model: modelSelect.value
        }, function () {
            showApiStatus(I18n.translate('statusApiSaveSuccess'), 'success');
        });
    });

    // Function to save interface settings
    function saveInterfaceSettings(showMessage = true) {
        // Collect interface settings to save
        const interfaceSettings = {
            buttonPosition: buttonPositionSelect.value,
            buttonSize: parseInt(buttonSizeSlider.value),
            uiLang: uiLangSelect.value,
            autoSave: autoSaveCheckbox.checked
        };

        // Save interface settings
        chrome.storage.sync.set(interfaceSettings, function () {
            if (showMessage) {
                showStatus(I18n.translate('statusSaveSuccess'), 'success');
            }
        });
    }

    // Function to auto-save if enabled
    function autoSaveIfEnabled() {
        if (autoSaveCheckbox.checked) {
            saveInterfaceSettings(false); // Don't show message for auto-save
        }
    }

    // Save interface settings manually
    saveButton.addEventListener('click', function () {
        saveInterfaceSettings(true);
    });

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

    // Helper function to show status messages
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message status-${type}`;
        statusMessage.style.display = 'block';

        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 3000);
        }
    }

    // Helper function to show API status messages
    function showApiStatus(message, type) {
        apiStatusMessage.textContent = message;
        apiStatusMessage.className = `status-message status-${type}`;
        apiStatusMessage.style.display = 'block';

        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                apiStatusMessage.style.display = 'none';
            }, 3000);
        }
    }

    // Fetch available models from the API
    async function fetchAvailableModels(apiKey, baseUrl) {
        try {
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `Request failed with status ${response.status}`);
            }

            const data = await response.json();

            // Return all models without filtering
            return data.data || [];

        } catch (error) {
            console.error('Failed to fetch models:', error);
            throw error;
        }
    }


}); 