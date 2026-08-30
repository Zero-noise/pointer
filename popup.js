document.addEventListener('DOMContentLoaded', async function () {
    const Settings = globalThis.PointerSettings;
    const showButtonToggle = document.getElementById('showButton');
    const openOptionsLink = document.getElementById('openOptions');
    const customLangInputContainer = document.getElementById('customLangInputContainer');
    const customTargetLangInput = document.getElementById('customTargetLang');
    const langField = document.getElementById('langField');
    const langFieldLabel = document.getElementById('langFieldLabel');
    const langFieldChip = document.getElementById('langFieldChip');
    const langLens = document.getElementById('langLens');
    const languageItems = Array.from(langLens.querySelectorAll('.lens-item'));
    const srcLangTag = document.getElementById('srcLangTag');
    const dstLangTag = document.getElementById('dstLangTag');

    const LANG_CODE_PATTERN = /^[a-z]{2,8}(-[a-z0-9]{2,8})*$/;
    let selectedLanguage = 'en';
    let activeOptionIndex = -1;
    let customLangSaveTimer;

    function applyTranslations(lang) {
        if (typeof I18n === 'undefined') {
            return;
        }
        I18n.applyTranslations(lang);
        document.title = I18n.translate('popupTitle', lang);
    }

    function isStandardLanguage(langCode) {
        return languageItems.some((item) => item.dataset.value === langCode && langCode !== 'other');
    }

    function isValidLangCode(value) {
        return LANG_CODE_PATTERN.test(value);
    }

    function getItemLabel(item) {
        const copy = item.cloneNode(true);
        copy.querySelector('.code')?.remove();
        return copy.textContent.trim();
    }

    function renderLanguageSelection() {
        const selectedItem = languageItems.find((item) => item.dataset.value === selectedLanguage);
        const customValue = customTargetLangInput.value.trim().toLowerCase();
        let label = '';
        let code = '—';

        if (selectedLanguage === 'other' && customValue) {
            label = customValue;
            code = customValue.slice(0, 4).toUpperCase();
        } else if (selectedItem) {
            label = getItemLabel(selectedItem);
            code = selectedItem.querySelector('.code')?.textContent.trim() || selectedLanguage.toUpperCase();
        }

        langFieldLabel.textContent = label;
        langFieldChip.textContent = code;
        dstLangTag.textContent = code;
        customLangInputContainer.style.display = selectedLanguage === 'other' ? 'block' : 'none';
        customTargetLangInput.classList.toggle(
            'invalid',
            selectedLanguage === 'other' && Boolean(customValue) && !isValidLangCode(customValue)
        );

        languageItems.forEach((item) => {
            const isSelected = item.dataset.value === selectedLanguage;
            item.classList.toggle('active', isSelected);
            item.setAttribute('aria-selected', String(isSelected));
        });
    }

    function persistTargetLanguage() {
        void saveTargetLanguage().catch((error) => {
            console.error('Failed to save target language:', error);
        });
    }

    function positionLens() {
        const rect = langField.getBoundingClientRect();
        const top = rect.bottom + 6;
        const availableHeight = document.documentElement.clientHeight - top - 10;
        langLens.style.top = `${top}px`;
        langLens.style.left = `${rect.left}px`;
        langLens.style.width = `${rect.width}px`;
        langLens.style.maxHeight = `${Math.max(96, availableHeight)}px`;
    }

    function setFocusedOption(index) {
        languageItems.forEach((item) => item.classList.remove('focused'));
        if (languageItems.length === 0) {
            activeOptionIndex = -1;
            langField.removeAttribute('aria-activedescendant');
            return;
        }

        activeOptionIndex = (index + languageItems.length) % languageItems.length;
        const item = languageItems[activeOptionIndex];
        item.classList.add('focused');
        langField.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView({ block: 'nearest' });
    }

    function openLens() {
        positionLens();
        langLens.classList.add('show');
        langLens.setAttribute('aria-hidden', 'false');
        langField.setAttribute('aria-expanded', 'true');
        const selectedIndex = languageItems.findIndex((item) => item.dataset.value === selectedLanguage);
        setFocusedOption(selectedIndex >= 0 ? selectedIndex : 0);
    }

    function closeLens() {
        langLens.classList.remove('show');
        langLens.setAttribute('aria-hidden', 'true');
        langField.setAttribute('aria-expanded', 'false');
        langField.removeAttribute('aria-activedescendant');
        languageItems.forEach((item) => item.classList.remove('focused'));
        activeOptionIndex = -1;
    }

    async function saveTargetLanguage() {
        let targetLangValue = selectedLanguage;
        if (selectedLanguage === 'other') {
            targetLangValue = customTargetLangInput.value.trim().toLowerCase();
            if (!targetLangValue || !isValidLangCode(targetLangValue)) {
                return;
            }
        }

        await Settings.setSync({ targetLang: targetLangValue });
    }

    function selectLanguage(value, { focusCustomInput = false, persist = true } = {}) {
        if (!languageItems.some((item) => item.dataset.value === value)) {
            return;
        }

        selectedLanguage = value;
        renderLanguageSelection();
        closeLens();

        if (focusCustomInput && value === 'other') {
            requestAnimationFrame(() => customTargetLangInput.focus());
        } else {
            langField.focus();
        }

        if (persist) {
            persistTargetLanguage();
        }
    }

    function flushCustomLanguageSave() {
        if (!customLangSaveTimer) {
            return;
        }
        clearTimeout(customLangSaveTimer);
        customLangSaveTimer = null;
        persistTargetLanguage();
    }

    openOptionsLink.addEventListener('click', function (event) {
        event.preventDefault();
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
            window.open('options.html');
            return;
        }
        chrome.runtime.sendMessage({ action: 'openOptions' }, function () {
            void chrome.runtime.lastError;
        });
    });

    langField.addEventListener('click', function (event) {
        event.stopPropagation();
        if (langLens.classList.contains('show')) {
            closeLens();
        } else {
            openLens();
        }
    });

    langField.addEventListener('keydown', function (event) {
        const isOpen = langLens.classList.contains('show');

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
                openLens();
            }
            setFocusedOption(activeOptionIndex + (event.key === 'ArrowDown' ? 1 : -1));
            return;
        }

        if (event.key === 'Home' || event.key === 'End') {
            if (!isOpen) {
                return;
            }
            event.preventDefault();
            setFocusedOption(event.key === 'Home' ? 0 : languageItems.length - 1);
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!isOpen) {
                openLens();
            } else if (activeOptionIndex >= 0) {
                const value = languageItems[activeOptionIndex].dataset.value;
                selectLanguage(value, { focusCustomInput: value === 'other' });
            }
            return;
        }

        if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            closeLens();
        } else if (event.key === 'Tab') {
            closeLens();
        }
    });

    langLens.addEventListener('click', function (event) {
        const item = event.target.closest('.lens-item');
        if (!item) {
            return;
        }
        event.stopPropagation();
        const value = item.dataset.value;
        selectLanguage(value, { focusCustomInput: value === 'other' });
    });

    document.addEventListener('click', function (event) {
        if (!langField.contains(event.target) && !langLens.contains(event.target)) {
            closeLens();
        }
    });

    window.addEventListener('resize', function () {
        if (langLens.classList.contains('show')) {
            positionLens();
        }
    });

    customTargetLangInput.addEventListener('change', flushCustomLanguageSave);
    customTargetLangInput.addEventListener('input', function () {
        renderLanguageSelection();

        clearTimeout(customLangSaveTimer);
        customLangSaveTimer = setTimeout(() => {
            customLangSaveTimer = null;
            persistTargetLanguage();
        }, 400);
    });

    window.addEventListener('pagehide', flushCustomLanguageSave);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            flushCustomLanguageSave();
        }
    });

    showButtonToggle.addEventListener('change', function () {
        void Settings.setSync({ showButton: showButtonToggle.checked }).catch((error) => {
            console.error('Failed to save button visibility:', error);
        });
    });

    srcLangTag.textContent = 'AUTO';
    langLens.setAttribute('aria-hidden', 'true');

    try {
        const result = await Settings.getSync(['uiLang', 'targetLang', 'showButton'], true);
        applyTranslations(result.uiLang || 'en');

        if (result.showButton === undefined) {
            showButtonToggle.checked = true;
            await Settings.setSync({ showButton: true });
        } else {
            showButtonToggle.checked = result.showButton;
        }

        if (result.targetLang && isStandardLanguage(result.targetLang)) {
            selectedLanguage = result.targetLang;
        } else if (result.targetLang) {
            selectedLanguage = 'other';
            customTargetLangInput.value = result.targetLang;
        } else {
            selectedLanguage = 'en';
        }

        renderLanguageSelection();
    } catch (error) {
        console.error('Failed to initialize popup:', error);
        applyTranslations('en');
        renderLanguageSelection();
    }
});
