/**
 * i18n Module - Internationalization for Pointer Extension
 * Provides language management and translation functionality
 */

const I18n = (function() {
    'use strict';

    // Supported interface languages configuration
    const supportedLanguages = {
        en: {
            code: 'en',
            name: 'English',
            nativeName: 'English'
        },
        zh: {
            code: 'zh',
            name: 'Chinese',
            nativeName: '中文'
        },
        ja: {
            code: 'ja',
            name: 'Japanese',
            nativeName: '日本語'
        },
        fr: {
            code: 'fr',
            name: 'French',
            nativeName: 'Français'
        },
        de: {
            code: 'de',
            name: 'German',
            nativeName: 'Deutsch'
        },
        es: {
            code: 'es',
            name: 'Spanish',
            nativeName: 'Español'
        },
        ko: {
            code: 'ko',
            name: 'Korean',
            nativeName: '한국어'
        },
        pt: {
            code: 'pt',
            name: 'Portuguese',
            nativeName: 'Português'
        },
        ru: {
            code: 'ru',
            name: 'Russian',
            nativeName: 'Русский'
        },
        it: {
            code: 'it',
            name: 'Italian',
            nativeName: 'Italiano'
        }
    };

    // Translation strings for all supported languages
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
            messageVerifyToLoadModels: 'Verify API to load models',
            messageCredentialsChanged: 'API credentials changed. Verify again to refresh models.',
            placeholderModelSearch: 'Search models...',
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
            statusApiSaveSuccess: 'AI model saved successfully!',
            navTitle: 'Settings',
            navApi: 'API',
            navModel: 'Model',
            navInterface: 'Interface',
            actionBarLabel: 'Changes',
            buttonSaveAll: 'Save All',
            buttonResetDefaults: 'Reset Defaults',
            buttonClearCredentials: 'Clear Credentials'
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
            messageVerifyToLoadModels: '请验证 API 以加载模型',
            messageCredentialsChanged: 'API 凭据已更改，请重新验证以刷新模型。',
            placeholderModelSearch: '搜索模型...',
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
            statusApiSaveSuccess: 'AI模型已成功保存！',
            navTitle: '设置',
            navApi: 'API',
            navModel: '模型',
            navInterface: '界面',
            actionBarLabel: '更改未保存',
            buttonSaveAll: '保存全部',
            buttonResetDefaults: '恢复默认',
            buttonClearCredentials: '清除凭据'
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
            messageVerifyToLoadModels: 'API を検証してモデルを読み込んでください',
            messageCredentialsChanged: 'API 資格情報が変更されました。モデルを更新するには再検証してください。',
            placeholderModelSearch: 'モデルを検索...',
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
            statusApiSaveSuccess: 'AIモデルが正常に保存されました！',
            navTitle: '設定',
            navApi: 'API',
            navModel: 'モデル',
            navInterface: 'インターフェース',
            actionBarLabel: '変更',
            buttonSaveAll: 'すべて保存',
            buttonResetDefaults: 'デフォルトに戻す',
            buttonClearCredentials: '認証情報を消去'
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
            messageVerifyToLoadModels: 'Vérifiez l\'API pour charger les modèles',
            messageCredentialsChanged: 'Les identifiants API ont changé. Vérifiez de nouveau pour actualiser les modèles.',
            placeholderModelSearch: 'Rechercher un modèle...',
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
            statusApiSaveSuccess: 'Modèle IA enregistré avec succès !',
            navTitle: 'Paramètres',
            navApi: 'API',
            navModel: 'Modèle',
            navInterface: 'Interface',
            actionBarLabel: 'Modifications',
            buttonSaveAll: 'Tout enregistrer',
            buttonResetDefaults: 'Réinitialiser',
            buttonClearCredentials: 'Effacer les identifiants'
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
            messageVerifyToLoadModels: 'API validieren, um Modelle zu laden',
            messageCredentialsChanged: 'API-Anmeldedaten wurden geändert. Bitte erneut verifizieren, um die Modelle zu aktualisieren.',
            placeholderModelSearch: 'Modell suchen...',
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
            statusApiSaveSuccess: 'KI-Modell erfolgreich gespeichert!',
            navTitle: 'Einstellungen',
            navApi: 'API',
            navModel: 'Modell',
            navInterface: 'Oberfläche',
            actionBarLabel: 'Änderungen',
            buttonSaveAll: 'Alle speichern',
            buttonResetDefaults: 'Zurücksetzen',
            buttonClearCredentials: 'Zugangsdaten löschen'
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
            messageVerifyToLoadModels: 'Verifique la API para cargar los modelos',
            messageCredentialsChanged: 'Las credenciales de la API han cambiado. Vuelva a verificar para actualizar los modelos.',
            placeholderModelSearch: 'Buscar modelo...',
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
            statusApiSaveSuccess: '¡Modelo de IA guardado exitosamente!',
            navTitle: 'Configuración',
            navApi: 'API',
            navModel: 'Modelo',
            navInterface: 'Interfaz',
            actionBarLabel: 'Cambios',
            buttonSaveAll: 'Guardar todo',
            buttonResetDefaults: 'Restablecer',
            buttonClearCredentials: 'Borrar credenciales'
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
            messageVerifyToLoadModels: '모델을 불러오려면 API를 검증하세요',
            messageCredentialsChanged: 'API 자격 증명이 변경되었습니다. 모델을 새로고침하려면 다시 검증하세요.',
            placeholderModelSearch: '모델 검색...',
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
            statusApiSaveSuccess: 'AI 모델이 성공적으로 저장되었습니다!',
            navTitle: '설정',
            navApi: 'API',
            navModel: '모델',
            navInterface: '인터페이스',
            actionBarLabel: '변경 사항',
            buttonSaveAll: '전체 저장',
            buttonResetDefaults: '기본값으로',
            buttonClearCredentials: '자격 증명 지우기'
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
            messageVerifyToLoadModels: 'Verifique a API para carregar os modelos',
            messageCredentialsChanged: 'As credenciais da API foram alteradas. Verifique novamente para atualizar os modelos.',
            placeholderModelSearch: 'Buscar modelo...',
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
            statusApiSaveSuccess: 'Modelo de IA salvo com sucesso!',
            navTitle: 'Configurações',
            navApi: 'API',
            navModel: 'Modelo',
            navInterface: 'Interface',
            actionBarLabel: 'Alterações',
            buttonSaveAll: 'Salvar tudo',
            buttonResetDefaults: 'Redefinir',
            buttonClearCredentials: 'Limpar credenciais'
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
            messageVerifyToLoadModels: 'Проверьте API, чтобы загрузить модели',
            messageCredentialsChanged: 'Учетные данные API изменены. Повторно проверьте, чтобы обновить модели.',
            placeholderModelSearch: 'Поиск модели...',
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
            statusApiSaveSuccess: 'ИИ модель успешно сохранена!',
            navTitle: 'Настройки',
            navApi: 'API',
            navModel: 'Модель',
            navInterface: 'Интерфейс',
            actionBarLabel: 'Изменения',
            buttonSaveAll: 'Сохранить всё',
            buttonResetDefaults: 'Сбросить',
            buttonClearCredentials: 'Очистить данные'
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
            messageVerifyToLoadModels: 'Verifica l\'API per caricare i modelli',
            messageCredentialsChanged: 'Le credenziali API sono cambiate. Verifica di nuovo per aggiornare i modelli.',
            placeholderModelSearch: 'Cerca modello...',
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
            statusApiSaveSuccess: 'Modello IA salvato con successo!',
            navTitle: 'Impostazioni',
            navApi: 'API',
            navModel: 'Modello',
            navInterface: 'Interfaccia',
            actionBarLabel: 'Modifiche',
            buttonSaveAll: 'Salva tutto',
            buttonResetDefaults: 'Ripristina',
            buttonClearCredentials: 'Cancella credenziali'
        }
    };

    // Current language
    let currentLanguage = 'en';

    /**
     * Get all supported languages
     * @returns {Object} Map of language codes to language info
     */
    function getSupportedLanguages() {
        return { ...supportedLanguages };
    }

    /**
     * Get language display name
     * @param {string} langCode - Language code
     * @returns {string} Native name of the language
     */
    function getLanguageDisplayName(langCode) {
        const lang = supportedLanguages[langCode];
        return lang ? lang.nativeName : langCode;
    }

    /**
     * Check if a language is supported
     * @param {string} langCode - Language code to check
     * @returns {boolean} True if language is supported
     */
    function isLanguageSupported(langCode) {
        return langCode in supportedLanguages;
    }

    /**
     * Get current language
     * @returns {string} Current language code
     */
    function getCurrentLanguage() {
        return currentLanguage;
    }

    /**
     * Set current language
     * @param {string} langCode - Language code to set
     * @returns {boolean} True if successful
     */
    function setCurrentLanguage(langCode) {
        if (isLanguageSupported(langCode)) {
            currentLanguage = langCode;
            return true;
        }
        return false;
    }

    /**
     * Get translation for a specific key in current language
     * @param {string} key - Translation key
     * @param {string} [lang] - Optional language code, defaults to current language
     * @returns {string} Translated text or key if not found
     */
    function translate(key, lang = currentLanguage) {
        if (translations[lang] && translations[lang][key]) {
            return translations[lang][key];
        }
        // Fallback to English
        if (lang !== 'en' && translations.en && translations.en[key]) {
            return translations.en[key];
        }
        return key;
    }

    /**
     * Get all translations for a specific language
     * @param {string} [lang] - Language code, defaults to current language
     * @returns {Object} All translations for the language
     */
    function getTranslations(lang = currentLanguage) {
        return { ...(translations[lang] || translations.en) };
    }

    /**
     * Apply translations to DOM elements with data-i18n attribute
     * @param {string} [lang] - Language code, defaults to current language
     */
    function applyTranslations(lang = currentLanguage) {
        if (!isLanguageSupported(lang)) {
            console.warn(`Language ${lang} not supported, falling back to English`);
            lang = 'en';
        }

        currentLanguage = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = translate(key, lang);
            if (translated) {
                el.textContent = translated;
            }
        });
    }

    /**
     * Generate language dropdown options
     * @param {HTMLElement} container - Container element for language options
     * @param {string} itemClassName - Class name for option items
     */
    function generateLanguageOptions(container, itemClassName = 'custom-item') {
        if (!container) {
            console.error('Container element not provided');
            return;
        }

        container.innerHTML = '';

        Object.values(supportedLanguages).forEach(lang => {
            const item = document.createElement('div');
            item.className = `dropdown-item ${itemClassName}`;
            item.dataset.value = lang.code;
            item.textContent = lang.nativeName;
            container.appendChild(item);
        });
    }

    // Public API
    return {
        getSupportedLanguages,
        getLanguageDisplayName,
        isLanguageSupported,
        getCurrentLanguage,
        setCurrentLanguage,
        translate,
        getTranslations,
        applyTranslations,
        generateLanguageOptions
    };
})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n;
}
