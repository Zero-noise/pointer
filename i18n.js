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
            popupTitle: 'Pointer',
            labelTargetLang: 'Target Language',
            toggleDisplay: 'Show button',
            settingsAdvanced: 'Advanced Settings',
            optionOther: 'Other...',
            customLangHelp: 'ISO code',
            title: 'Pointer Settings',
            subtitle: 'Configure your AI-powered translation extension',
            apiConfig: 'API Configuration',
            labelApiKey: 'API Key',
            hintApiKey: 'Stored on this device only; optional for local/LAN servers',
            labelBaseUrl: 'API Base URL',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verify API & Load Models',
            modelConfig: 'AI Model',
            labelModel: 'Select AI Model',
            hintModel: 'Type to search models',
            messageVerifyToLoadModels: 'Verify API to load models',
            messageCredentialsChanged: 'API credentials changed. Verify again to refresh models.',
            placeholderModelSearch: 'Search models...',
            interfaceSettings: 'Interface',
            labelUiLang: 'Interface Language',
            labelButtonPosition: 'Button Position',
            optionPosBottomRight: 'Bottom Right',
            optionPosBottomLeft: 'Bottom Left',
            optionPosTopRight: 'Top Right',
            optionPosTopLeft: 'Top Left',
            optionPosCustom: 'Custom Position',
            hintButtonPosition: 'Or drag the button on any page',
            labelButtonSize: 'Button Size',
            labelButtonThickness: 'Glass Thickness',
            hintButtonThickness: 'Higher = more opaque, heavier shadow',
            labelShortcutEnabled: 'Keyboard Shortcut',
            hintShortcutEnabled: 'Click to rebind; hold {mod} to require {mod}',
            shortcutRecording: 'Press any key…',
            shortcutSiteRemove: 'Remove exception',
            shortcutSiteOff: 'off',
            shortcutConflictDowngraded: '{key} clashes on this site — using {chord} here instead.',
            shortcutConflictSaveFailed: '{key} clashes on this site, but the exception could not be saved. Set this site to {chord} in Pointer settings.',
            tooltipToggleTranslation: 'Click to switch between the original and the translation',
            navTitle: 'Settings',
            navApi: 'API',
            navModel: 'Model',
            navInterface: 'Interface',
            buttonClearCredentials: 'Clear Credentials'
        },
        zh: {
            popupTitle: 'Pointer',
            labelTargetLang: '目标语言',
            toggleDisplay: '显示按钮',
            settingsAdvanced: '高级设置',
            optionOther: '其他...',
            customLangHelp: 'ISO 代码',
            title: 'Pointer 设置',
            subtitle: '配置您的AI翻译扩展',
            apiConfig: 'API 配置',
            labelApiKey: 'API 密钥',
            hintApiKey: '仅存本设备；本机/局域网服务可留空',
            labelBaseUrl: 'API 基础 URL',
            hintBaseUrl: 'OpenAI：https://api.openai.com/v1',
            buttonVerify: '验证 API 并加载模型',
            modelConfig: 'AI 模型',
            labelModel: '选择 AI 模型',
            hintModel: '输入以搜索模型',
            messageVerifyToLoadModels: '请验证 API 以加载模型',
            messageCredentialsChanged: 'API 凭据已更改，请重新验证以刷新模型。',
            placeholderModelSearch: '搜索模型...',
            interfaceSettings: '界面设置',
            labelUiLang: '界面语言',
            labelButtonPosition: '按钮位置',
            optionPosBottomRight: '右下角',
            optionPosBottomLeft: '左下角',
            optionPosTopRight: '右上角',
            optionPosTopLeft: '左上角',
            optionPosCustom: '自定义位置',
            hintButtonPosition: '也可直接在网页上拖动按钮',
            labelButtonSize: '按钮大小',
            labelButtonThickness: '玻璃厚度',
            hintButtonThickness: '越高越不透明，阴影越重',
            labelShortcutEnabled: '键盘快捷键',
            hintShortcutEnabled: '点击重新绑定；按住 {mod} 可要求 {mod}',
            shortcutRecording: '按任意键…',
            shortcutSiteRemove: '移除例外',
            shortcutSiteOff: '关闭',
            shortcutConflictDowngraded: '{key} 与本站快捷键冲突，已改用 {chord}。',
            shortcutConflictSaveFailed: '{key} 与本站快捷键冲突，但例外没能保存。请在 Pointer 设置中把本站改为 {chord}。',
            tooltipToggleTranslation: '点击切换原文/译文',
            navTitle: '设置',
            navApi: 'API',
            navModel: '模型',
            navInterface: '界面',
            buttonClearCredentials: '清除凭据'
        },
        ja: {
            popupTitle: 'Pointer',
            labelTargetLang: '対象言語',
            toggleDisplay: 'ボタン表示',
            settingsAdvanced: '詳細設定',
            optionOther: 'その他...',
            customLangHelp: 'ISO コード',
            title: 'Pointer 設定',
            subtitle: 'AI翻訳拡張機能を設定',
            apiConfig: 'API 設定',
            labelApiKey: 'API キー',
            hintApiKey: 'この端末にのみ保存。ローカル/LANサーバーでは省略可',
            labelBaseUrl: 'API ベース URL：',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'API を検証してモデルを読み込む',
            modelConfig: 'AI モデル設定',
            labelModel: 'AI モデルを選択：',
            hintModel: '入力してモデルを検索',
            messageVerifyToLoadModels: 'API を検証してモデルを読み込んでください',
            messageCredentialsChanged: 'API 資格情報が変更されました。モデルを更新するには再検証してください。',
            placeholderModelSearch: 'モデルを検索...',
            interfaceSettings: 'インターフェース設定',
            labelUiLang: 'インターフェース言語：',
            labelButtonPosition: '初期ボタン位置：',
            optionPosBottomRight: '右下',
            optionPosBottomLeft: '左下',
            optionPosTopRight: '右上',
            optionPosTopLeft: '左上',
            optionPosCustom: 'カスタム位置',
            hintButtonPosition: 'ページ上でドラッグしても設定できます',
            labelButtonSize: 'ボタンサイズ：',
            labelButtonThickness: 'ガラスの厚み',
            hintButtonThickness: '高いほど不透明で影が濃く',
            labelShortcutEnabled: 'キーボードショートカット',
            hintShortcutEnabled: 'クリックで再設定、{mod} 併用で {mod} 必須に',
            shortcutRecording: '任意のキーを押してください…',
            shortcutSiteRemove: '例外を削除',
            shortcutSiteOff: 'オフ',
            shortcutConflictDowngraded: '{key} はこのサイトと競合するため、{chord} に切り替えました。',
            shortcutConflictSaveFailed: '{key} はこのサイトと競合しますが、例外を保存できませんでした。Pointer の設定でこのサイトを {chord} にしてください。',
            tooltipToggleTranslation: 'クリックで原文と訳文を切り替え',
            navTitle: '設定',
            navApi: 'API',
            navModel: 'モデル',
            navInterface: 'インターフェース',
            buttonClearCredentials: '認証情報を消去'
        },
        fr: {
            popupTitle: 'Pointer',
            labelTargetLang: 'Langue cible',
            toggleDisplay: 'Afficher bouton',
            settingsAdvanced: 'Paramètres avancés',
            optionOther: 'Autre...',
            customLangHelp: 'Code ISO',
            title: 'Paramètres Pointer',
            subtitle: 'Configurez votre extension de traduction IA',
            apiConfig: 'Configuration API',
            labelApiKey: 'Clé API',
            hintApiKey: 'Stockée uniquement sur cet appareil ; facultative pour les serveurs locaux/LAN',
            labelBaseUrl: 'URL de base API :',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Vérifier l\'API et charger les modèles',
            modelConfig: 'Configuration du modèle IA',
            labelModel: 'Sélectionner le modèle IA :',
            hintModel: 'Tapez pour rechercher un modèle',
            messageVerifyToLoadModels: 'Vérifiez l\'API pour charger les modèles',
            messageCredentialsChanged: 'Les identifiants API ont changé. Vérifiez de nouveau pour actualiser les modèles.',
            placeholderModelSearch: 'Rechercher un modèle...',
            interfaceSettings: 'Paramètres de l\'interface',
            labelUiLang: 'Langue de l\'interface :',
            labelButtonPosition: 'Position initiale du bouton :',
            optionPosBottomRight: 'En bas à droite',
            optionPosBottomLeft: 'En bas à gauche',
            optionPosTopRight: 'En haut à droite',
            optionPosTopLeft: 'En haut à gauche',
            optionPosCustom: 'Position personnalisée',
            hintButtonPosition: 'Ou faites glisser le bouton sur une page',
            labelButtonSize: 'Taille du bouton :',
            labelButtonThickness: 'Épaisseur du verre',
            hintButtonThickness: 'Plus élevé = plus opaque, ombre plus marquée',
            labelShortcutEnabled: 'Raccourci clavier',
            hintShortcutEnabled: 'Cliquez pour réassigner ; maintenez {mod} pour exiger {mod}',
            shortcutRecording: 'Appuyez sur une touche…',
            shortcutSiteRemove: 'Supprimer l\'exception',
            shortcutSiteOff: 'désactivé',
            shortcutConflictDowngraded: '{key} entre en conflit sur ce site — {chord} est utilisé à la place.',
            shortcutConflictSaveFailed: '{key} entre en conflit sur ce site, mais l\'exception n\'a pas pu être enregistrée. Définissez ce site sur {chord} dans les paramètres de Pointer.',
            tooltipToggleTranslation: 'Cliquez pour basculer entre l\'original et la traduction',
            navTitle: 'Paramètres',
            navApi: 'API',
            navModel: 'Modèle',
            navInterface: 'Interface',
            buttonClearCredentials: 'Effacer les identifiants'
        },
        de: {
            popupTitle: 'Pointer',
            labelTargetLang: 'Zielsprache',
            toggleDisplay: 'Button anzeigen',
            settingsAdvanced: 'Erweiterte Einstellungen',
            optionOther: 'Andere...',
            customLangHelp: 'ISO-Code',
            title: 'Pointer-Einstellungen',
            subtitle: 'Konfigurieren Sie Ihre KI-Übersetzungserweiterung',
            apiConfig: 'API-Konfiguration',
            labelApiKey: 'API-Schlüssel',
            hintApiKey: 'Nur auf diesem Gerät gespeichert; für lokale/LAN-Server optional',
            labelBaseUrl: 'API-Basis-URL:',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'API verifizieren und Modelle laden',
            modelConfig: 'KI-Modell-Konfiguration',
            labelModel: 'KI-Modell auswählen:',
            hintModel: 'Tippen, um Modelle zu suchen',
            messageVerifyToLoadModels: 'API validieren, um Modelle zu laden',
            messageCredentialsChanged: 'API-Anmeldedaten wurden geändert. Bitte erneut verifizieren, um die Modelle zu aktualisieren.',
            placeholderModelSearch: 'Modell suchen...',
            interfaceSettings: 'Benutzeroberflächen-Einstellungen',
            labelUiLang: 'Sprache der Benutzeroberfläche:',
            labelButtonPosition: 'Anfangsposition der Schaltfläche:',
            optionPosBottomRight: 'Unten rechts',
            optionPosBottomLeft: 'Unten links',
            optionPosTopRight: 'Oben rechts',
            optionPosTopLeft: 'Oben links',
            optionPosCustom: 'Benutzerdefinierte Position',
            hintButtonPosition: 'Oder die Schaltfläche auf einer Seite ziehen',
            labelButtonSize: 'Schaltflächengröße:',
            labelButtonThickness: 'Glasstärke',
            hintButtonThickness: 'Höher = undurchsichtiger, kräftigerer Schatten',
            labelShortcutEnabled: 'Tastenkürzel',
            hintShortcutEnabled: 'Klicken zum Neuzuweisen; {mod} halten, um {mod} zu verlangen',
            shortcutRecording: 'Beliebige Taste drücken…',
            shortcutSiteRemove: 'Ausnahme entfernen',
            shortcutSiteOff: 'aus',
            shortcutConflictDowngraded: '{key} kollidiert auf dieser Website — stattdessen wird {chord} verwendet.',
            shortcutConflictSaveFailed: '{key} kollidiert auf dieser Website, aber die Ausnahme konnte nicht gespeichert werden. Stellen Sie diese Website in den Pointer-Einstellungen auf {chord} um.',
            tooltipToggleTranslation: 'Klicken, um zwischen Original und Übersetzung zu wechseln',
            navTitle: 'Einstellungen',
            navApi: 'API',
            navModel: 'Modell',
            navInterface: 'Oberfläche',
            buttonClearCredentials: 'Zugangsdaten löschen'
        },
        es: {
            popupTitle: 'Pointer',
            labelTargetLang: 'Idioma',
            toggleDisplay: 'Mostrar botón',
            settingsAdvanced: 'Configuración avanzada',
            optionOther: 'Otro...',
            customLangHelp: 'Código ISO',
            title: 'Configuración de Pointer',
            subtitle: 'Configure su extensión de traducción IA',
            apiConfig: 'Configuración de API',
            labelApiKey: 'Clave API',
            hintApiKey: 'Solo se guarda en este dispositivo; opcional para servidores locales/LAN',
            labelBaseUrl: 'URL base de API:',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verificar API y cargar modelos',
            modelConfig: 'Configuración del modelo de IA',
            labelModel: 'Seleccionar modelo de IA:',
            hintModel: 'Escriba para buscar modelos',
            messageVerifyToLoadModels: 'Verifique la API para cargar los modelos',
            messageCredentialsChanged: 'Las credenciales de la API han cambiado. Vuelva a verificar para actualizar los modelos.',
            placeholderModelSearch: 'Buscar modelo...',
            interfaceSettings: 'Configuración de interfaz',
            labelUiLang: 'Idioma de la interfaz:',
            labelButtonPosition: 'Posición inicial del botón:',
            optionPosBottomRight: 'Abajo a la derecha',
            optionPosBottomLeft: 'Abajo a la izquierda',
            optionPosTopRight: 'Arriba a la derecha',
            optionPosTopLeft: 'Arriba a la izquierda',
            optionPosCustom: 'Posición personalizada',
            hintButtonPosition: 'O arrastre el botón en cualquier página',
            labelButtonSize: 'Tamaño del botón:',
            labelButtonThickness: 'Grosor del vidrio',
            hintButtonThickness: 'Mayor = más opaco, sombra más intensa',
            labelShortcutEnabled: 'Atajo de teclado',
            hintShortcutEnabled: 'Clic para reasignar; mantenga {mod} para exigir {mod}',
            shortcutRecording: 'Pulse cualquier tecla…',
            shortcutSiteRemove: 'Quitar excepción',
            shortcutSiteOff: 'desactivado',
            shortcutConflictDowngraded: '{key} entra en conflicto en este sitio: se usará {chord} en su lugar.',
            shortcutConflictSaveFailed: '{key} entra en conflicto en este sitio, pero no se pudo guardar la excepción. Configure este sitio como {chord} en los ajustes de Pointer.',
            tooltipToggleTranslation: 'Haga clic para alternar entre el original y la traducción',
            navTitle: 'Configuración',
            navApi: 'API',
            navModel: 'Modelo',
            navInterface: 'Interfaz',
            buttonClearCredentials: 'Borrar credenciales'
        },
        ko: {
            popupTitle: 'Pointer',
            labelTargetLang: '대상 언어',
            toggleDisplay: '버튼 표시',
            settingsAdvanced: '고급 설정',
            optionOther: '기타...',
            customLangHelp: 'ISO 코드',
            title: 'Pointer 설정',
            subtitle: 'AI 번역 확장 프로그램 구성',
            apiConfig: 'API 구성',
            labelApiKey: 'API 키',
            hintApiKey: '이 기기에만 저장되며 로컬/LAN 서버에서는 선택 사항',
            labelBaseUrl: 'API 기본 URL:',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'API 확인 및 모델 로드',
            modelConfig: 'AI 모델 구성',
            labelModel: 'AI 모델 선택:',
            hintModel: '입력하여 모델 검색',
            messageVerifyToLoadModels: '모델을 불러오려면 API를 검증하세요',
            messageCredentialsChanged: 'API 자격 증명이 변경되었습니다. 모델을 새로고침하려면 다시 검증하세요.',
            placeholderModelSearch: '모델 검색...',
            interfaceSettings: '인터페이스 설정',
            labelUiLang: '인터페이스 언어:',
            labelButtonPosition: '초기 버튼 위치:',
            optionPosBottomRight: '오른쪽 아래',
            optionPosBottomLeft: '왼쪽 아래',
            optionPosTopRight: '오른쪽 위',
            optionPosTopLeft: '왼쪽 위',
            optionPosCustom: '사용자 정의 위치',
            hintButtonPosition: '웹페이지에서 버튼을 드래그해도 됩니다',
            labelButtonSize: '버튼 크기:',
            labelButtonThickness: '유리 두께',
            hintButtonThickness: '높을수록 불투명하고 그림자가 진해짐',
            labelShortcutEnabled: '키보드 단축키',
            hintShortcutEnabled: '클릭하면 재설정, {mod}를 함께 누르면 {mod} 조합',
            shortcutRecording: '아무 키나 누르세요…',
            shortcutSiteRemove: '예외 제거',
            shortcutSiteOff: '끔',
            shortcutConflictDowngraded: '{key} 키가 이 사이트와 충돌하여 {chord}(으)로 전환했습니다.',
            shortcutConflictSaveFailed: '{key} 키가 이 사이트와 충돌하지만 예외를 저장하지 못했습니다. Pointer 설정에서 이 사이트를 {chord}(으)로 지정하세요.',
            tooltipToggleTranslation: '클릭하여 원문과 번역문 전환',
            navTitle: '설정',
            navApi: 'API',
            navModel: '모델',
            navInterface: '인터페이스',
            buttonClearCredentials: '자격 증명 지우기'
        },
        pt: {
            popupTitle: 'Pointer',
            labelTargetLang: 'Idioma',
            toggleDisplay: 'Mostrar botão',
            settingsAdvanced: 'Configurações avançadas',
            optionOther: 'Outro...',
            customLangHelp: 'Código ISO',
            title: 'Configurações do Pointer',
            subtitle: 'Configure sua extensão de tradução IA',
            apiConfig: 'Configuração da API',
            labelApiKey: 'Chave da API',
            hintApiKey: 'Armazenada apenas neste dispositivo; opcional para servidores locais/LAN',
            labelBaseUrl: 'URL base da API:',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verificar API e carregar modelos',
            modelConfig: 'Configuração do modelo de IA',
            labelModel: 'Selecionar modelo de IA:',
            hintModel: 'Digite para buscar modelos',
            messageVerifyToLoadModels: 'Verifique a API para carregar os modelos',
            messageCredentialsChanged: 'As credenciais da API foram alteradas. Verifique novamente para atualizar os modelos.',
            placeholderModelSearch: 'Buscar modelo...',
            interfaceSettings: 'Configurações da interface',
            labelUiLang: 'Idioma da interface:',
            labelButtonPosition: 'Posição inicial do botão:',
            optionPosBottomRight: 'Inferior direito',
            optionPosBottomLeft: 'Inferior esquerdo',
            optionPosTopRight: 'Superior direito',
            optionPosTopLeft: 'Superior esquerdo',
            optionPosCustom: 'Posição personalizada',
            hintButtonPosition: 'Ou arraste o botão em qualquer página',
            labelButtonSize: 'Tamanho do botão:',
            labelButtonThickness: 'Espessura do vidro',
            hintButtonThickness: 'Maior = mais opaco, sombra mais intensa',
            labelShortcutEnabled: 'Atalho de teclado',
            hintShortcutEnabled: 'Clique para reatribuir; segure {mod} para exigir {mod}',
            shortcutRecording: 'Pressione qualquer tecla…',
            shortcutSiteRemove: 'Remover exceção',
            shortcutSiteOff: 'desligado',
            shortcutConflictDowngraded: '{key} entra em conflito neste site — usando {chord} aqui.',
            shortcutConflictSaveFailed: '{key} entra em conflito neste site, mas não foi possível salvar a exceção. Defina este site como {chord} nas configurações do Pointer.',
            tooltipToggleTranslation: 'Clique para alternar entre o original e a tradução',
            navTitle: 'Configurações',
            navApi: 'API',
            navModel: 'Modelo',
            navInterface: 'Interface',
            buttonClearCredentials: 'Limpar credenciais'
        },
        ru: {
            popupTitle: 'Pointer',
            labelTargetLang: 'Язык',
            toggleDisplay: 'Показать кнопку',
            settingsAdvanced: 'Расширенные настройки',
            optionOther: 'Другой...',
            customLangHelp: 'Код ISO',
            title: 'Настройки Pointer',
            subtitle: 'Настройте ваше ИИ-расширение для перевода',
            apiConfig: 'Конфигурация API',
            labelApiKey: 'API ключ',
            hintApiKey: 'Хранится только на этом устройстве; для локальных/LAN-серверов необязателен',
            labelBaseUrl: 'Базовый URL API:',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Проверить API и загрузить модели',
            modelConfig: 'Конфигурация ИИ модели',
            labelModel: 'Выбрать ИИ модель:',
            hintModel: 'Введите для поиска моделей',
            messageVerifyToLoadModels: 'Проверьте API, чтобы загрузить модели',
            messageCredentialsChanged: 'Учетные данные API изменены. Повторно проверьте, чтобы обновить модели.',
            placeholderModelSearch: 'Поиск модели...',
            interfaceSettings: 'Настройки интерфейса',
            labelUiLang: 'Язык интерфейса:',
            labelButtonPosition: 'Начальная позиция кнопки:',
            optionPosBottomRight: 'Внизу справа',
            optionPosBottomLeft: 'Внизу слева',
            optionPosTopRight: 'Вверху справа',
            optionPosTopLeft: 'Вверху слева',
            optionPosCustom: 'Пользовательская позиция',
            hintButtonPosition: 'Или перетащите кнопку на странице',
            labelButtonSize: 'Размер кнопки:',
            labelButtonThickness: 'Толщина стекла',
            hintButtonThickness: 'Выше = плотнее стекло, насыщеннее тень',
            labelShortcutEnabled: 'Горячая клавиша',
            hintShortcutEnabled: 'Клик — переназначить; удерживайте {mod}, чтобы требовать {mod}',
            shortcutRecording: 'Нажмите любую клавишу…',
            shortcutSiteRemove: 'Удалить исключение',
            shortcutSiteOff: 'выкл.',
            shortcutConflictDowngraded: '{key} конфликтует на этом сайте — используется {chord}.',
            shortcutConflictSaveFailed: '{key} конфликтует на этом сайте, но исключение не удалось сохранить. Задайте для этого сайта {chord} в настройках Pointer.',
            tooltipToggleTranslation: 'Нажмите, чтобы переключиться между оригиналом и переводом',
            navTitle: 'Настройки',
            navApi: 'API',
            navModel: 'Модель',
            navInterface: 'Интерфейс',
            buttonClearCredentials: 'Очистить данные'
        },
        it: {
            popupTitle: 'Pointer',
            labelTargetLang: 'Lingua',
            toggleDisplay: 'Mostra pulsante',
            settingsAdvanced: 'Impostazioni avanzate',
            optionOther: 'Altro...',
            customLangHelp: 'Codice ISO',
            title: 'Impostazioni Pointer',
            subtitle: 'Configura la tua estensione di traduzione IA',
            apiConfig: 'Configurazione API',
            labelApiKey: 'Chiave API',
            hintApiKey: 'Salvata solo su questo dispositivo; facoltativa per server locali/LAN',
            labelBaseUrl: 'URL base API:',
            hintBaseUrl: 'OpenAI: https://api.openai.com/v1',
            buttonVerify: 'Verifica API e carica modelli',
            modelConfig: 'Configurazione modello IA',
            labelModel: 'Seleziona modello IA:',
            hintModel: 'Digita per cercare modelli',
            messageVerifyToLoadModels: 'Verifica l\'API per caricare i modelli',
            messageCredentialsChanged: 'Le credenziali API sono cambiate. Verifica di nuovo per aggiornare i modelli.',
            placeholderModelSearch: 'Cerca modello...',
            interfaceSettings: 'Impostazioni interfaccia',
            labelUiLang: 'Lingua interfaccia:',
            labelButtonPosition: 'Posizione iniziale pulsante:',
            optionPosBottomRight: 'In basso a destra',
            optionPosBottomLeft: 'In basso a sinistra',
            optionPosTopRight: 'In alto a destra',
            optionPosTopLeft: 'In alto a sinistra',
            optionPosCustom: 'Posizione personalizzata',
            hintButtonPosition: 'Oppure trascina il pulsante su una pagina',
            labelButtonSize: 'Dimensione pulsante:',
            labelButtonThickness: 'Spessore del vetro',
            hintButtonThickness: 'Più alto = più opaco, ombra più marcata',
            labelShortcutEnabled: 'Scorciatoia tastiera',
            hintShortcutEnabled: 'Clicca per riassegnare; tieni {mod} per richiedere {mod}',
            shortcutRecording: 'Premi un tasto qualsiasi…',
            shortcutSiteRemove: 'Rimuovi eccezione',
            shortcutSiteOff: 'disattivato',
            shortcutConflictDowngraded: '{key} va in conflitto su questo sito: verrà usato {chord}.',
            shortcutConflictSaveFailed: '{key} va in conflitto su questo sito, ma non è stato possibile salvare l\'eccezione. Imposta questo sito su {chord} nelle impostazioni di Pointer.',
            tooltipToggleTranslation: 'Fare clic per alternare tra originale e traduzione',
            navTitle: 'Impostazioni',
            navApi: 'API',
            navModel: 'Modello',
            navInterface: 'Interfaccia',
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
    // {mod} is the name of the Alt key, which is Option on a Mac. Every locale
    // keeps ONE string with the token in it and the platform decides the word
    // inside — the alternative, a second copy of ten strings differing by one
    // word, would drift the moment anybody edits the phrasing. The label comes
    // from settings.js so the options page, the key cap and the in-page toast
    // cannot disagree; 'Alt' is the fallback if that module has not loaded.
    function fillPlaceholders(text) {
        if (typeof text !== 'string' || !text.includes('{mod}')) {
            return text;
        }
        const settings = globalThis.PointerSettings;
        const mod = (settings && typeof settings.getModifierName === 'function')
            ? settings.getModifierName()
            : 'Alt';
        return text.split('{mod}').join(mod);
    }

    function translate(key, lang = currentLanguage) {
        if (translations[lang] && translations[lang][key]) {
            return fillPlaceholders(translations[lang][key]);
        }
        // Fallback to English
        if (lang !== 'en' && translations.en && translations.en[key]) {
            return fillPlaceholders(translations.en[key]);
        }
        return key;
    }

    /**
     * translate() plus caller-supplied placeholders, for strings whose values are
     * only known at runtime ({key} and {chord} in the shortcut-conflict notices).
     * Substitution is literal and one-pass — a value that happens to contain
     * "{chord}" is never re-scanned — and an unknown key still returns the key,
     * so a missing string is visible rather than silently blank.
     * @param {string} key
     * @param {Object<string,string>} [params]
     * @param {string} [lang]
     * @returns {string}
     */
    function formatMessage(key, params, lang = currentLanguage) {
        const text = translate(key, lang);
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, (match, name) =>
            Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
    }

    /**
     * Get all translations for a specific language
     * @param {string} [lang] - Language code, defaults to current language
     * @returns {Object} All translations for the language
     */
    function getTranslations(lang = currentLanguage) {
        const table = { ...(translations[lang] || translations.en) };
        for (const key of Object.keys(table)) {
            table[key] = fillPlaceholders(table[key]);
        }
        return table;
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
        formatMessage,
        getTranslations,
        applyTranslations,
        generateLanguageOptions
    };
})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n;
}
