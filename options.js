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
    const buttonSizeSlider = document.getElementById('buttonSize');
    const buttonSizeValue = document.getElementById('buttonSizeValue');
    const uiLangSelect = document.getElementById('uiLang');
    const autoSaveCheckbox = document.getElementById('autoSave');

    // 默认隐藏模型部分，直到API验证成功
    modelSection.classList.add('hidden');
    
    // Global variables for model management
    let allAvailableModels = [];
    let filteredModels = [];
    let selectedModelIndex = -1;

    // Supported interface languages configuration
    const supportedLanguages = {
        en: {
            code: 'en',
            name: 'English',
            nativeName: 'English',
            flag: '🇺🇸'
        },
        zh: {
            code: 'zh',
            name: 'Chinese',
            nativeName: '中文',
            flag: '🇨🇳'
        },
        ja: {
            code: 'ja',
            name: 'Japanese',
            nativeName: '日本語',
            flag: '🇯🇵'
        },
        fr: {
            code: 'fr',
            name: 'French',
            nativeName: 'Français',
            flag: '🇫🇷'
        },
        de: {
            code: 'de',
            name: 'German',
            nativeName: 'Deutsch',
            flag: '🇩🇪'
        },
        es: {
            code: 'es',
            name: 'Spanish',
            nativeName: 'Español',
            flag: '🇪🇸'
        },
        ko: {
            code: 'ko',
            name: 'Korean',
            nativeName: '한국어',
            flag: '🇰🇷'
        },
        pt: {
            code: 'pt',
            name: 'Portuguese',
            nativeName: 'Português',
            flag: '🇵🇹'
        },
        ru: {
            code: 'ru',
            name: 'Russian',
            nativeName: 'Русский',
            flag: '🇷🇺'
        },
        it: {
            code: 'it',
            name: 'Italian',
            nativeName: 'Italiano',
            flag: '🇮🇹'
        }
    };

    const translations = {
        en: {
            title: 'Pointer Settings',
            subtitle: 'Configure your AI-powered translation extension',
            apiConfig: 'API Configuration',
            labelApiKey: 'API Key',
            hintApiKey: 'Your API key will be stored securely in your browser',
            labelBaseUrl: 'API Base URL',
            hintBaseUrl: 'For OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verify API & Load Models',
            modelConfig: 'AI Model',
            labelModel: 'Select AI Model',
            hintModel: 'Type to search and select the AI model to use for translation',
            interfaceSettings: 'Interface',
            labelUiLang: 'Interface Language',
            hintUiLang: 'Set the display language of the interface',
            labelButtonPosition: 'Button Position',
            optionPosBottomRight: 'Bottom Right',
            optionPosBottomLeft: 'Bottom Left',
            optionPosTopRight: 'Top Right',
            optionPosTopLeft: 'Top Left',
            optionPosCustom: 'Custom Position',
            hintButtonPosition: 'You can also drag the button on any webpage to set a custom position',
            labelButtonSize: 'Button Size',
            hintButtonSize: 'Adjust the size of the translation button',
            buttonSave: 'Save Interface Settings',
            buttonSaveApi: 'Save AI Model',
            labelAutoSave: 'Auto-save settings',
            hintAutoSave: 'Automatically save interface settings when you make changes',
            statusSaveSuccess: 'Settings saved successfully!',
            statusApiSaveSuccess: 'AI model saved successfully!'
        },
        zh: {
            title: 'Pointer 设置',
            subtitle: '配置您的AI翻译扩展',
            apiConfig: 'API 配置',
            labelApiKey: 'API 密钥',
            hintApiKey: '您的 API 密钥将安全地存储在浏览器中',
            labelBaseUrl: 'API 基础 URL',
            hintBaseUrl: '对于 OpenAI： https://api.openai.com/v1',
            buttonVerify: '验证 API 并加载模型',
            modelConfig: 'AI 模型',
            labelModel: '选择 AI 模型',
            hintModel: '输入搜索并选择用于翻译的 AI 模型',
            interfaceSettings: '界面设置',
            labelUiLang: '界面语言',
            hintUiLang: '设置界面的显示语言',
            labelButtonPosition: '按钮位置',
            optionPosBottomRight: '右下角',
            optionPosBottomLeft: '左下角',
            optionPosTopRight: '右上角',
            optionPosTopLeft: '左上角',
            optionPosCustom: '自定义位置',
            hintButtonPosition: '您也可以在任何网页上拖动按钮来设置自定义位置',
            labelButtonSize: '按钮大小',
            hintButtonSize: '调整翻译按钮的大小',
            buttonSave: '保存界面设置',
            buttonSaveApi: '保存AI模型',
            labelAutoSave: '自动保存设置',
            hintAutoSave: '当您做出更改时自动保存界面设置',
            statusSaveSuccess: '设置已成功保存！',
            statusApiSaveSuccess: 'AI模型已成功保存！'
        },
        ja: {
            title: 'Pointer 設定',
            subtitle: 'AI翻訳拡張機能を設定',
            apiConfig: 'API 設定',
            labelApiKey: 'API キー',
            hintApiKey: 'あなたの API キーはブラウザに安全に保存されます。',
            labelBaseUrl: 'API ベース URL：',
            hintBaseUrl: 'OpenAI の場合： https://api.openai.com/v1',
            buttonVerify: 'API を検証してモデルを読み込む',
            modelConfig: 'AI モデル設定',
            labelModel: 'AI モデルを選択：',
            hintModel: '入力して翻訳に使用する AI モデルを検索・選択します',
            interfaceSettings: 'インターフェース設定',
            labelUiLang: 'インターフェース言語：',
            hintUiLang: 'インターフェースの表示言語を設定します',
            labelButtonPosition: '初期ボタン位置：',
            optionPosBottomRight: '右下',
            optionPosBottomLeft: '左下',
            optionPosTopRight: '右上',
            optionPosTopLeft: '左上',
            optionPosCustom: 'カスタム位置',
            hintButtonPosition: '任意のウェブページでボタンをドラッグしてカスタム位置を設定することもできます',
            labelButtonSize: 'ボタンサイズ：',
            hintButtonSize: '翻訳ボタンのサイズを調整します',
            buttonSave: 'インターフェース設定を保存',
            buttonSaveApi: 'AIモデルを保存',
            labelAutoSave: '設定を自動保存',
            hintAutoSave: '変更を行う際に自動的にインターフェース設定を保存します',
            statusSaveSuccess: '設定が正常に保存されました！',
            statusApiSaveSuccess: 'AIモデルが正常に保存されました！'
        },
        fr: {
            title: 'Paramètres Pointer',
            subtitle: 'Configurez votre extension de traduction IA',
            apiConfig: 'Configuration API',
            labelApiKey: 'Clé API',
            hintApiKey: 'Votre clé API sera stockée en sécurité dans votre navigateur.',
            labelBaseUrl: 'URL de base API :',
            hintBaseUrl: 'Pour OpenAI : https://api.openai.com/v1',
            buttonVerify: 'Vérifier l\'API et charger les modèles',
            modelConfig: 'Configuration du modèle IA',
            labelModel: 'Sélectionner le modèle IA :',
            hintModel: 'Tapez pour rechercher et sélectionner le modèle IA à utiliser pour la traduction',
            interfaceSettings: 'Paramètres de l\'interface',
            labelUiLang: 'Langue de l\'interface :',
            hintUiLang: 'Définir la langue d\'affichage de l\'interface',
            labelButtonPosition: 'Position initiale du bouton :',
            optionPosBottomRight: 'En bas à droite',
            optionPosBottomLeft: 'En bas à gauche',
            optionPosTopRight: 'En haut à droite',
            optionPosTopLeft: 'En haut à gauche',
            optionPosCustom: 'Position personnalisée',
            hintButtonPosition: 'Vous pouvez également faire glisser le bouton sur n\'importe quelle page web pour définir une position personnalisée',
            labelButtonSize: 'Taille du bouton :',
            hintButtonSize: 'Ajuster la taille du bouton de traduction',
            buttonSave: 'Enregistrer les paramètres de l\'interface',
            buttonSaveApi: 'Enregistrer le modèle IA',
            labelAutoSave: 'Sauvegarde automatique',
            hintAutoSave: 'Enregistrer automatiquement les paramètres de l\'interface lorsque vous apportez des modifications',
            statusSaveSuccess: 'Paramètres enregistrés avec succès !',
            statusApiSaveSuccess: 'Modèle IA enregistré avec succès !'
        },
        de: {
            title: 'Pointer-Einstellungen',
            subtitle: 'Konfigurieren Sie Ihre KI-Übersetzungserweiterung',
            apiConfig: 'API-Konfiguration',
            labelApiKey: 'API-Schlüssel',
            hintApiKey: 'Ihr API-Schlüssel wird sicher in Ihrem Browser gespeichert.',
            labelBaseUrl: 'API-Basis-URL:',
            hintBaseUrl: 'Für OpenAI: https://api.openai.com/v1',
            buttonVerify: 'API verifizieren und Modelle laden',
            modelConfig: 'KI-Modell-Konfiguration',
            labelModel: 'KI-Modell auswählen:',
            hintModel: 'Tippen Sie, um das für die Übersetzung zu verwendende KI-Modell zu suchen und auszuwählen',
            interfaceSettings: 'Benutzeroberflächen-Einstellungen',
            labelUiLang: 'Sprache der Benutzeroberfläche:',
            hintUiLang: 'Anzeigesprache der Benutzeroberfläche festlegen',
            labelButtonPosition: 'Anfangsposition der Schaltfläche:',
            optionPosBottomRight: 'Unten rechts',
            optionPosBottomLeft: 'Unten links',
            optionPosTopRight: 'Oben rechts',
            optionPosTopLeft: 'Oben links',
            optionPosCustom: 'Benutzerdefinierte Position',
            hintButtonPosition: 'Sie können die Schaltfläche auch auf jeder Webseite ziehen, um eine benutzerdefinierte Position festzulegen',
            labelButtonSize: 'Schaltflächengröße:',
            hintButtonSize: 'Größe der Übersetzungsschaltfläche anpassen',
            buttonSave: 'Benutzeroberflächen-Einstellungen speichern',
            buttonSaveApi: 'KI-Modell speichern',
            labelAutoSave: 'Automatisches Speichern',
            hintAutoSave: 'Benutzeroberflächen-Einstellungen automatisch speichern, wenn Sie Änderungen vornehmen',
            statusSaveSuccess: 'Einstellungen erfolgreich gespeichert!',
            statusApiSaveSuccess: 'KI-Modell erfolgreich gespeichert!'
        },
        es: {
            title: 'Configuración de Pointer',
            subtitle: 'Configure su extensión de traducción IA',
            apiConfig: 'Configuración de API',
            labelApiKey: 'Clave API',
            hintApiKey: 'Su clave API se almacenará de forma segura en su navegador.',
            labelBaseUrl: 'URL base de API:',
            hintBaseUrl: 'Para OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verificar API y cargar modelos',
            modelConfig: 'Configuración del modelo de IA',
            labelModel: 'Seleccionar modelo de IA:',
            hintModel: 'Escriba para buscar y seleccionar el modelo de IA a usar para la traducción',
            interfaceSettings: 'Configuración de interfaz',
            labelUiLang: 'Idioma de la interfaz:',
            hintUiLang: 'Establecer el idioma de visualización de la interfaz',
            labelButtonPosition: 'Posición inicial del botón:',
            optionPosBottomRight: 'Abajo a la derecha',
            optionPosBottomLeft: 'Abajo a la izquierda',
            optionPosTopRight: 'Arriba a la derecha',
            optionPosTopLeft: 'Arriba a la izquierda',
            optionPosCustom: 'Posición personalizada',
            hintButtonPosition: 'También puede arrastrar el botón en cualquier página web para establecer una posición personalizada',
            labelButtonSize: 'Tamaño del botón:',
            hintButtonSize: 'Ajustar el tamaño del botón de traducción',
            buttonSave: 'Guardar configuración de interfaz',
            buttonSaveApi: 'Guardar modelo de IA',
            labelAutoSave: 'Guardado automático',
            hintAutoSave: 'Guardar automáticamente la configuración de interfaz cuando realice cambios',
            statusSaveSuccess: '¡Configuración guardada exitosamente!',
            statusApiSaveSuccess: '¡Modelo de IA guardado exitosamente!'
        },
        ko: {
            title: 'Pointer 설정',
            subtitle: 'AI 번역 확장 프로그램 구성',
            apiConfig: 'API 구성',
            labelApiKey: 'API 키',
            hintApiKey: 'API 키는 브라우저에 안전하게 저장됩니다.',
            labelBaseUrl: 'API 기본 URL:',
            hintBaseUrl: 'OpenAI용: https://api.openai.com/v1',
            buttonVerify: 'API 확인 및 모델 로드',
            modelConfig: 'AI 모델 구성',
            labelModel: 'AI 모델 선택:',
            hintModel: '번역에 사용할 AI 모델을 검색하고 선택하려면 입력하세요',
            interfaceSettings: '인터페이스 설정',
            labelUiLang: '인터페이스 언어:',
            hintUiLang: '인터페이스의 표시 언어 설정',
            labelButtonPosition: '초기 버튼 위치:',
            optionPosBottomRight: '오른쪽 아래',
            optionPosBottomLeft: '왼쪽 아래',
            optionPosTopRight: '오른쪽 위',
            optionPosTopLeft: '왼쪽 위',
            optionPosCustom: '사용자 정의 위치',
            hintButtonPosition: '모든 웹페이지에서 버튼을 드래그하여 사용자 정의 위치를 설정할 수도 있습니다',
            labelButtonSize: '버튼 크기:',
            hintButtonSize: '번역 버튼의 크기 조정',
            buttonSave: '인터페이스 설정 저장',
            buttonSaveApi: 'AI 모델 저장',
            labelAutoSave: '자동 저장',
            hintAutoSave: '변경 사항을 적용할 때 인터페이스 설정을 자동으로 저장',
            statusSaveSuccess: '설정이 성공적으로 저장되었습니다!',
            statusApiSaveSuccess: 'AI 모델이 성공적으로 저장되었습니다!'
        },
        pt: {
            title: 'Configurações do Pointer',
            subtitle: 'Configure sua extensão de tradução IA',
            apiConfig: 'Configuração da API',
            labelApiKey: 'Chave da API',
            hintApiKey: 'Sua chave da API será armazenada com segurança no seu navegador.',
            labelBaseUrl: 'URL base da API:',
            hintBaseUrl: 'Para OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verificar API e carregar modelos',
            modelConfig: 'Configuração do modelo de IA',
            labelModel: 'Selecionar modelo de IA:',
            hintModel: 'Digite para pesquisar e selecionar o modelo de IA a ser usado para tradução',
            interfaceSettings: 'Configurações da interface',
            labelUiLang: 'Idioma da interface:',
            hintUiLang: 'Definir o idioma de exibição da interface',
            labelButtonPosition: 'Posição inicial do botão:',
            optionPosBottomRight: 'Inferior direito',
            optionPosBottomLeft: 'Inferior esquerdo',
            optionPosTopRight: 'Superior direito',
            optionPosTopLeft: 'Superior esquerdo',
            optionPosCustom: 'Posição personalizada',
            hintButtonPosition: 'Você também pode arrastar o botão em qualquer página da web para definir uma posição personalizada',
            labelButtonSize: 'Tamanho do botão:',
            hintButtonSize: 'Ajustar o tamanho do botão de tradução',
            buttonSave: 'Salvar configurações da interface',
            buttonSaveApi: 'Salvar modelo de IA',
            labelAutoSave: 'Salvamento automático',
            hintAutoSave: 'Salvar automaticamente as configurações da interface quando você fizer alterações',
            statusSaveSuccess: 'Configurações salvas com sucesso!',
            statusApiSaveSuccess: 'Modelo de IA salvo com sucesso!'
        },
        ru: {
            title: 'Настройки Pointer',
            subtitle: 'Настройте ваше ИИ-расширение для перевода',
            apiConfig: 'Конфигурация API',
            labelApiKey: 'API ключ',
            hintApiKey: 'Ваш API ключ будет безопасно сохранен в браузере.',
            labelBaseUrl: 'Базовый URL API:',
            hintBaseUrl: 'Для OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Проверить API и загрузить модели',
            modelConfig: 'Конфигурация ИИ модели',
            labelModel: 'Выбрать ИИ модель:',
            hintModel: 'Введите текст для поиска и выбора ИИ модели для перевода',
            interfaceSettings: 'Настройки интерфейса',
            labelUiLang: 'Язык интерфейса:',
            hintUiLang: 'Установить язык отображения интерфейса',
            labelButtonPosition: 'Начальная позиция кнопки:',
            optionPosBottomRight: 'Внизу справа',
            optionPosBottomLeft: 'Внизу слева',
            optionPosTopRight: 'Вверху справа',
            optionPosTopLeft: 'Вверху слева',
            optionPosCustom: 'Пользовательская позиция',
            hintButtonPosition: 'Вы также можете перетащить кнопку на любой веб-странице, чтобы установить пользовательскую позицию',
            labelButtonSize: 'Размер кнопки:',
            hintButtonSize: 'Настроить размер кнопки перевода',
            buttonSave: 'Сохранить настройки интерфейса',
            buttonSaveApi: 'Сохранить ИИ модель',
            labelAutoSave: 'Автосохранение',
            hintAutoSave: 'Автоматически сохранять настройки интерфейса при внесении изменений',
            statusSaveSuccess: 'Настройки успешно сохранены!',
            statusApiSaveSuccess: 'ИИ модель успешно сохранена!'
        },
        it: {
            title: 'Impostazioni Pointer',
            subtitle: 'Configura la tua estensione di traduzione IA',
            apiConfig: 'Configurazione API',
            labelApiKey: 'Chiave API',
            hintApiKey: 'La tua chiave API verrà memorizzata in modo sicuro nel tuo browser.',
            labelBaseUrl: 'URL base API:',
            hintBaseUrl: 'Per OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verifica API e carica modelli',
            modelConfig: 'Configurazione modello IA',
            labelModel: 'Seleziona modello IA:',
            hintModel: 'Digita per cercare e selezionare il modello IA da utilizzare per la traduzione',
            interfaceSettings: 'Impostazioni interfaccia',
            labelUiLang: 'Lingua interfaccia:',
            hintUiLang: 'Imposta la lingua di visualizzazione dell\'interfaccia',
            labelButtonPosition: 'Posizione iniziale pulsante:',
            optionPosBottomRight: 'In basso a destra',
            optionPosBottomLeft: 'In basso a sinistra',
            optionPosTopRight: 'In alto a destra',
            optionPosTopLeft: 'In alto a sinistra',
            optionPosCustom: 'Posizione personalizzata',
            hintButtonPosition: 'Puoi anche trascinare il pulsante su qualsiasi pagina web per impostare una posizione personalizzata',
            labelButtonSize: 'Dimensione pulsante:',
            hintButtonSize: 'Regola la dimensione del pulsante di traduzione',
            buttonSave: 'Salva impostazioni interfaccia',
            buttonSaveApi: 'Salva modello IA',
            labelAutoSave: 'Salvataggio automatico',
            hintAutoSave: 'Salva automaticamente le impostazioni dell\'interfaccia quando apporti modifiche',
            statusSaveSuccess: 'Impostazioni salvate con successo!',
            statusApiSaveSuccess: 'Modello IA salvato con successo!'
        }
    };

    // Function to generate language options dynamically
    function generateLanguageOptions() {
        const uiLangDropdown = document.getElementById('uiLangDropdown');
        uiLangDropdown.innerHTML = ''; // Clear existing options
        
        Object.values(supportedLanguages).forEach(lang => {
            const item = document.createElement('div');
            item.className = 'dropdown-item custom-item';
            item.dataset.value = lang.code;
            item.textContent = `${lang.flag} ${lang.nativeName}`;
            uiLangDropdown.appendChild(item);
        });
    }

    // Helper function to get language display name
    function getLanguageDisplayName(langCode) {
        const lang = supportedLanguages[langCode];
        return lang ? `${lang.flag} ${lang.nativeName}` : langCode;
    }

    function applyTranslations(lang) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang] && translations[lang][key]) {
                el.textContent = translations[lang][key];
            }
        });
    }

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
                    searchInput.value = getLanguageDisplayName(initialValue);
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
        // Generate language options first
        generateLanguageOptions();
        
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
        if (result.uiLang && supportedLanguages[result.uiLang]) {
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
        applyTranslations(uiLangSelect.value);
        
        // Initialize custom selects after everything is loaded
        initializeCustomSelects();
    });

    // Update size value display when slider moves
    buttonSizeSlider.addEventListener('input', function () {
        buttonSizeValue.textContent = `${this.value}px`;
        autoSaveIfEnabled();
    });

    // Auto-save when interface settings change
    buttonPositionSelect.addEventListener('change', autoSaveIfEnabled);
    uiLangSelect.addEventListener('change', function() {
        // Apply translations immediately when language changes
        applyTranslations(this.value);
        
        // Update custom select displays with new translations
        setTimeout(() => {
            const selectedLang = supportedLanguages[this.value];
            if (selectedLang) {
                uiLangSearch.value = `${selectedLang.flag} ${selectedLang.nativeName}`;
            }
            
            const selectedPosItem = buttonPositionDropdown.querySelector(`[data-value="${buttonPositionSelect.value}"]`);
            if (selectedPosItem) {
                buttonPositionSearch.value = selectedPosItem.textContent;
            }
        }, 50);
        
        autoSaveIfEnabled();
    });

    // Save auto-save preference immediately when changed
    autoSaveCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({ autoSave: this.checked });
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
        } finally {
            verifyButton.disabled = false;
            verifyButton.innerHTML = `<span>${translations[uiLangSelect.value].buttonVerify || 'Verify API & Load Models'}</span>`;
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
            showApiStatus(translations[uiLangSelect.value].statusApiSaveSuccess, 'success');
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
                showStatus(translations[uiLangSelect.value].statusSaveSuccess, 'success');
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