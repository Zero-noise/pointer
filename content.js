// ──────────────────────────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────────────────────────

// Traces for the skipped / no-op translation paths. Off in shipped builds so
// Pointer never writes to the console of a page it is a guest on; flip to true
// when tracing selection behaviour locally. Real failures still use
// console.error unconditionally.
const POINTER_DEBUG = false;
function debugLog(...args) {
    if (POINTER_DEBUG) {
        console.log(...args);
    }
}

const CONTENT_SYNC_SETTING_KEYS = Object.freeze([
    'isActive',
    'targetLang',
    'baseUrl',
    'model',
    'buttonPosition',
    'buttonX',
    'buttonY',
    'uiLang',
    'showButton',
    'buttonSize',
    'buttonThickness',
    'shortcutEnabled',
    'shortcutKey',
    'shortcutModifier',
    'shortcutSiteOverrides'
]);

function ensureContentSettingsShape(settings) {
    if (!settings || typeof settings.getSync !== 'function' || typeof settings.setSync !== 'function') {
        throw new Error('Pointer settings API is unavailable in content script');
    }

    const defaults = settings.DEFAULT_SYNC_SETTINGS || {};
    const missingKeys = CONTENT_SYNC_SETTING_KEYS.filter((key) => !(key in defaults));
    if (missingKeys.length) {
        throw new Error(`Pointer content settings are missing defaults for: ${missingKeys.join(', ')}`);
    }

    return settings;
}

const Settings = (() => {
    if (globalThis.PointerSettings) {
        return ensureContentSettingsShape(globalThis.PointerSettings);
    }

    // The manifest intentionally injects only content.js into pages.
    // Keep this embedded storage adapter aligned with settings.js; the manifest
    // intentionally injects only this content-script bundle into host pages.

    // The API key lives in chrome.storage.local and is only ever read by the
    // background worker; the content script asks it via the hasApiKey message.
    const DEFAULT_SYNC_SETTINGS = Object.freeze({
        isActive: false,
        targetLang: 'zh',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        buttonPosition: 'bottom-right',
        buttonX: null,
        buttonY: null,
        uiLang: 'en',
        showButton: true,
        buttonSize: 64,
        buttonThickness: 0,
        shortcutEnabled: true,
        shortcutKey: 'KeyT',
        shortcutModifier: 'none',
        shortcutSiteOverrides: {}
    });

    function getSync(keys, includeDefaults = false) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.sync.get(keys, (result) => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(includeDefaults ? { ...DEFAULT_SYNC_SETTINGS, ...(result || {}) } : (result || {}));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function setSync(values) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.sync.set(values, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    return ensureContentSettingsShape({
        DEFAULT_SYNC_SETTINGS,
        getSync,
        setSync
    });
})();

// ──────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────

let isActive = Settings.DEFAULT_SYNC_SETTINGS.isActive;
let targetLang = Settings.DEFAULT_SYNC_SETTINGS.targetLang;
let translationButton;
let isDragging = false;
let startX, startY, buttonStartX, buttonStartY;
let lastDragClientX = 0;
let longPressTimer;
let longPressClearTimer = null; // 环填满(1s)后才执行清除；提前松手/离开可取消
let suppressSelectionAfterDrag = false; // 拖拽结束的 mouseup 不触发选区翻译
let translationEpoch = 0; // 长按清除时 +1，在途的旧请求返回后直接丢弃
let longPressTriggered = false;
let pressStartTime = 0;
let dragStartPending = false;
let buttonMoved = false;
let showButton = Settings.DEFAULT_SYNC_SETTINGS.showButton;
let buttonSize = Settings.DEFAULT_SYNC_SETTINGS.buttonSize; // Default button size
let buttonThickness = Settings.DEFAULT_SYNC_SETTINGS.buttonThickness; // 0–100, 越大越偏向「硝子厚」设计（更不透明、更重的阴影、更厚的边框）
let currentButtonPosition = Settings.DEFAULT_SYNC_SETTINGS.buttonPosition;
let currentButtonX = Settings.DEFAULT_SYNC_SETTINGS.buttonX;
let currentButtonY = Settings.DEFAULT_SYNC_SETTINGS.buttonY;
let shortcutEnabled = Settings.DEFAULT_SYNC_SETTINGS.shortcutEnabled; // 键盘快捷键总开关，默认开
let shortcutKey = Settings.DEFAULT_SYNC_SETTINGS.shortcutKey;   // e.code 值；默认 T
let shortcutModifier = Settings.DEFAULT_SYNC_SETTINGS.shortcutModifier; // 'none' = 裸键，'alt' = Alt + 键
let shortcutSiteOverrides = {}; // host -> 'none' | 'alt' | 'off'，逐站例外
let translationGroupCounter = 0;

// The tooltip on a translated span. createTranslatedSpan() is synchronous and
// runs once per translated node, so the localized text is fetched once from the
// background worker (which holds i18n.js) and cached here. The English default
// is what a span gets if that fetch has not landed yet, or fails.
const DEFAULT_TOGGLE_TOOLTIP = 'Click to switch between the original and the translation';
let toggleTooltipText = DEFAULT_TOGGLE_TOOLTIP;
const BLOCK_LEVEL_SELECTOR = 'p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, div, section, article';

// Brush-style T icon — two hand-drawn calligraphy strokes, fills parent via width/height 100%
// 清墨 Clean Sumi · T 瘦到 3.4，两笔书法感，和 halo/ring 同一墨语
const BRUSH_T_SVG = '<svg viewBox="0 0 32 34" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M5 7 Q 16 4, 28 7"/><path d="M16.5 7 Q 15.9 18, 16.5 29"/></svg>';

// 长按进度环 —— 1s 匀速沿边缘填满；viewBox 0-100, r=47, 2πr≈295 (dasharray/offset)
const LONG_PRESS_RING_SVG = '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><circle cx="50" cy="50" r="47"/></svg>';

// 完成勾 —— 几何 V，和环同一墨色，scale 弹入
const CHECK_V_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 L10 17 L19 7"/></svg>';

function openOptionsPageSafely() {
    try {
        chrome.runtime.sendMessage({ action: 'openOptions' }, () => {
            // 后台对该消息不回包，"message port closed" 属正常；只有真失效才走清理
            const lastError = chrome.runtime.lastError;
            if (lastError && lastError.message &&
                lastError.message.includes('Extension context invalidated')) {
                onExtensionContextInvalidated();
            }
        });
    } catch (_) { }
}

// Tracks text nodes currently undergoing translation to prevent concurrent mutations
const pendingTranslationNodes = new Set();
// CSS classes describe appearance only. Ownership and original text live in
// content-script memory so a page cannot forge a class and make Pointer remove
// or rewrite site-owned DOM.
const ownedTranslatedNodes = new Set();
const translatedNodeState = new WeakMap();
const blockGroupIds = new WeakMap();
const groupedBlockElements = new Set();

// ──────────────────────────────────────────────────────────────────
// Selection / Range
// ──────────────────────────────────────────────────────────────────

function markNodesAsPending(nodes) {
    for (const node of nodes) pendingTranslationNodes.add(node);
}

function unmarkNodesAsPending(nodes) {
    for (const node of nodes) pendingTranslationNodes.delete(node);
}

function hasOverlapWithPending(range) {
    const textNodes = getTextNodesInRange(range);
    return textNodes.some(node => pendingTranslationNodes.has(node));
}

function generateGroupId() {
    translationGroupCounter += 1;
    return `ai-translator-group-${Date.now()}-${translationGroupCounter}`;
}

function getBlockGroupId(node) {
    if (!node) {
        return generateGroupId();
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) {
        return generateGroupId();
    }

    const block = getClosestBlockElement(node);
    if (!block) {
        return generateGroupId();
    }

    let groupId = blockGroupIds.get(block);
    if (!groupId) {
        groupId = generateGroupId();
        blockGroupIds.set(block, groupId);
        groupedBlockElements.add(block);
    }

    return groupId;
}

function getConnectedOwnedTranslatedNodes() {
    const connected = [];
    for (const node of ownedTranslatedNodes) {
        if (node && node.isConnected && node.ownerDocument === document) {
            connected.push(node);
        } else {
            ownedTranslatedNodes.delete(node);
            translatedNodeState.delete(node);
        }
    }
    return connected;
}

function getOwnedTranslatedAncestor(node) {
    let element = node
        ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
        : null;
    while (element) {
        if (ownedTranslatedNodes.has(element)) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

function getClosestBlockElement(node) {
    if (!node) {
        return null;
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element && element.closest ? element.closest(BLOCK_LEVEL_SELECTOR) : null;
}

function createRangeForNode(node) {
    const nodeRange = document.createRange();
    if (node.nodeType === Node.TEXT_NODE) {
        nodeRange.selectNodeContents(node);
    } else {
        nodeRange.selectNode(node);
    }
    return nodeRange;
}

function rangeIntersectsNodeStrict(range, node) {
    if (!range || !node) {
        return false;
    }

    try {
        const nodeRange = createRangeForNode(node);
        // START_TO_END compares range.end to nodeRange.start; > 0 means range ends after node starts.
        // END_TO_START compares range.start to nodeRange.end; < 0 means range starts before node ends.
        return range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0 &&
            range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0;
    } catch (error) {
        return false;
    }
}

// Shadow DOM container and root for translation UI
let aiTranslatorContainer;
let aiTranslatorShadow;
let pageStyleElement;
// 缓存页面内译文 CSS，SPA 重建 head 后可以重注入
let pageCssText = '';
// Gate for when the UI stylesheet has been injected — button must NOT appear in
// the shadow tree before this resolves, otherwise the transition from "unstyled"
// (halo opacity 1, no glass bg) to "styled" (halo opacity 0, glass bg) fires on
// first paint and reads as a brief activation flash on every page load.
let cssLoadedPromise = null;

// Function to setup Shadow DOM and load UI styles
function setupShadowDOM() {
    // Always create a host we own. Reusing a page element with the same ID can
    // attach Pointer state to arbitrary site DOM or crash when it has no shadow.
    aiTranslatorContainer = document.createElement('div');
    aiTranslatorContainer.setAttribute('data-pointer-extension-host', 'true');
    aiTranslatorContainer.style.setProperty('all', 'initial', 'important');
    aiTranslatorContainer.style.setProperty('position', 'fixed', 'important');
    aiTranslatorContainer.style.setProperty('left', '0', 'important');
    aiTranslatorContainer.style.setProperty('top', '0', 'important');
    aiTranslatorContainer.style.setProperty('width', '0', 'important');
    aiTranslatorContainer.style.setProperty('height', '0', 'important');
    aiTranslatorContainer.style.setProperty('z-index', '2147483647', 'important');
    aiTranslatorContainer.style.setProperty('pointer-events', 'none', 'important');
    document.body.appendChild(aiTranslatorContainer);
    aiTranslatorShadow = aiTranslatorContainer.attachShadow({ mode: 'closed' });

    const shadowStyle = document.createElement('style');
    // theme.css goes in FIRST: it declares the :host tokens (ink, glass
    // alphas, ink ladder, --font-sans, radii, motion) that content.css reads.
    // Same file the popup and the options page link — one material, one source.
    cssLoadedPromise = Promise.all([
        fetch(chrome.runtime.getURL('theme.css')).then(response => response.text()),
        fetch(chrome.runtime.getURL('content.css')).then(response => response.text()),
        fetch(chrome.runtime.getURL('content-page.css')).then(response => response.text())
    ]).then(([themeCss, shadowCss, translationCss]) => {
        shadowStyle.textContent = themeCss + '\n' + shadowCss;
        aiTranslatorShadow.appendChild(shadowStyle);

        pageCssText = translationCss;
        pageStyleElement = document.createElement('style');
        pageStyleElement.setAttribute('data-pointer-extension-style', 'true');
        pageStyleElement.textContent = pageCssText;
        document.head.appendChild(pageStyleElement);

        // Static CSS 加载完成后，注入动态 spinner 样式
        applyButtonSize(buttonSize);
    }).catch(err => console.error('Failed to load Pointer styles:', err));
}

// 等 CSS 注入完再把 FAB 放进 shadow DOM，避免首帧"无样式 → 有样式"的 transition
// 被浏览器当作值变化而播放一遍（halo opacity 1→0、glass bg 淡入等），视觉上像一次假激活。
function attachButtonWhenStyled() {
    // CSS 加载期间设置可能已翻转（比如快速开关"显示按钮"），
    // 真正挂载前再确认一次，避免排队的 append 覆盖用户的隐藏操作
    const append = () => {
        if (!showButton) return;
        aiTranslatorShadow.appendChild(translationButton);
    };
    if (cssLoadedPromise) {
        cssLoadedPromise.then(append, append);
    } else {
        append();
    }
}

// Check if chrome API is available
function isChromeAPIAvailable() {
    return typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.id;
}

// ——— Keyboard shortcut: press the configured key to toggle translation mode ———
// 默认是裸键 T（可在设置里改成 Alt + 键）。裸键更快，但整个网页的单键快捷键
// 都可能撞车，所以触发条件比 Alt 组合严格得多：焦点不在任何输入/可交互控件、
// 非长按重复、非 IME 合成中、浏览器窗口聚焦，且页面没有先声明这个键。
const TYPING_INPUT_TYPES = new Set([
    'text', 'email', 'search', 'password', 'url', 'tel', 'number',
    'date', 'time', 'datetime-local', 'month', 'week', 'color'
]);
const TYPING_ROLES = new Set(['textbox', 'searchbox', 'combobox']);

// 这些角色属于「复合控件」：ARIA 规定由控件自己接管键盘导航，
// 单键几乎一定是它的。裸键模式下一律让路。
const KEYBOARD_OWNING_ROLES = new Set([
    'application', 'grid', 'gridcell', 'listbox', 'option', 'menu', 'menubar',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tree', 'treeitem',
    'treegrid', 'tab', 'tablist', 'slider', 'spinbutton', 'radiogroup'
]);

// 自己不接受文字、但按键有意义的元素：媒体播放器（j/k/l/f/m）、
// canvas 应用（Figma/游戏）、可展开的 summary。
const KEYBOARD_OWNING_TAGS = new Set([
    'VIDEO', 'AUDIO', 'CANVAS', 'EMBED', 'OBJECT', 'SUMMARY'
]);

function deepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    return el;
}

function isTypingContext() {
    const el = deepActiveElement();
    if (!el || el === document.body) return false;
    if (el.tagName === 'IFRAME') return true; // 跨域 iframe 看不见内部焦点，保守放行
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.tagName === 'INPUT') {
        const t = (el.type || 'text').toLowerCase();
        return TYPING_INPUT_TYPES.has(t);
    }
    if (el.isContentEditable) return true;
    const role = (el.getAttribute && el.getAttribute('role') || '').toLowerCase();
    if (TYPING_ROLES.has(role)) return true;
    return false;
}

// 裸键模式专用的加严判断。isTypingContext() 只认「能打字的地方」，
// 但抢一个字母键的风险面比那大得多：任何作者自己造的可聚焦控件都可能绑了它。
function pageOwnsBareKey() {
    // 整页可编辑（部分富文本编辑器用这个而不是 contenteditable）
    if (document.designMode === 'on') return true;

    const el = deepActiveElement();
    if (!el || el === document.body || el === document.documentElement) {
        // 没有具体焦点时，仍要排除「整页是个应用」的情况，
        // 比如 role="application" 挂在 body 或包装容器上。
        return Boolean(document.querySelector('[role="application"]'));
    }

    if (KEYBOARD_OWNING_TAGS.has(el.tagName)) return true;

    // 作者显式设了 tabindex = 自造控件，几乎都自带键盘处理逻辑。
    // 原生的 <a>/<button> 不设 tabindex 也能聚焦，它们不占字母键，放行。
    if (el.hasAttribute && el.hasAttribute('tabindex')) return true;

    // 焦点本身或任一祖先是复合控件/模态框
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 40) {
        const role = (node.getAttribute && node.getAttribute('role') || '').toLowerCase();
        if (KEYBOARD_OWNING_ROLES.has(role)) return true;
        if (node.getAttribute && node.getAttribute('aria-modal') === 'true') return true;
        if (node.tagName === 'DIALOG' && node.hasAttribute('open')) return true;
        node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
        depth++;
    }

    return false;
}

// ——— settings.js 的手抄副本 ———
// manifest 只往页面注入 content.js 这一个文件，拿不到 PointerSettings，
// 所以这里必须自带一份。副本的风险就是漂移，因此保持最小、且逐个函数被
// tests/shortcut.test.js 钉在 settings.js 的同名实现上（主机名规范化、
// 合法/非法模式、IPv6、浏览器允许的各种主机名，以及容量淘汰）。
// 改这里就要同步 settings.js，反之亦然——测试会立刻失败。
const SHORTCUT_MODES = ['none', 'alt', 'off'];
const SHORTCUT_SITE_OVERRIDES_LIMIT = 100;

function normalizeShortcutHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host || host.length > 253 || /[^a-z0-9.\-\[\]:]/.test(host)) {
        return '';
    }
    return host.replace(/^www\./, '');
}

function normalizeShortcutMode(value) {
    return SHORTCUT_MODES.includes(value) ? value : null;
}

function trimShortcutSiteOverrides(cleaned) {
    const hosts = Object.keys(cleaned);
    if (hosts.length <= SHORTCUT_SITE_OVERRIDES_LIMIT) return cleaned;
    const trimmed = {};
    for (const host of hosts.slice(hosts.length - SHORTCUT_SITE_OVERRIDES_LIMIT)) {
        trimmed[host] = cleaned[host];
    }
    return trimmed;
}

function normalizeShortcutSiteOverrides(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const cleaned = {};
    for (const [host, mode] of Object.entries(value)) {
        const normalizedHost = normalizeShortcutHost(host);
        const normalizedMode = normalizeShortcutMode(mode);
        if (normalizedHost && normalizedMode) {
            cleaned[normalizedHost] = normalizedMode;
        }
    }
    return trimShortcutSiteOverrides(cleaned);
}

function addShortcutSiteOverride(overrides, host, mode) {
    const normalizedHost = normalizeShortcutHost(host);
    const normalizedMode = normalizeShortcutMode(mode);
    if (!normalizedHost || !normalizedMode) return null;
    const cleaned = normalizeShortcutSiteOverrides(overrides);
    delete cleaned[normalizedHost];
    cleaned[normalizedHost] = normalizedMode;
    return trimShortcutSiteOverrides(cleaned);
}

function resolveShortcutMode(hostname, modifier, overrides) {
    const host = normalizeShortcutHost(hostname);
    const cleaned = normalizeShortcutSiteOverrides(overrides);
    if (host && Object.prototype.hasOwnProperty.call(cleaned, host)) {
        return cleaned[host];
    }
    return modifier === 'alt' ? 'alt' : 'none';
}

// 逐站例外优先于全局修饰键设置。返回 'none' | 'alt' | 'off'。
function getEffectiveShortcutMode() {
    return resolveShortcutMode(location.hostname, shortcutModifier, shortcutSiteOverrides);
}

function formatShortcutKeyLabel(code) {
    if (!code) return 'T';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1[0-2])$/.test(code)) return code;
    const punctuation = {
        Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[',
        BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
        Slash: '/', Backslash: '\\'
    };
    return punctuation[code] || code;
}

// Mac 键盘上没有 Alt 这个键，同一个物理键（同一个 e.altKey）叫 Option / ⌥。
// 只有**标签**随平台变，匹配始终走 e.code，所以在哪台机器上绑的键换台机器照样用。
// 这是 settings.js 里 isMacPlatform / formatShortcutChord 的手抄副本：manifest
// 只往页面注入 content.js 这一个文件（同上面那份内嵌 storage adapter），
// 改一处就要同步另一处。
function formatShortcutChord(keyLabel, withAlt) {
    const key = keyLabel || 'T';
    if (!withAlt) return key;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const platform = nav
        ? ((nav.userAgentData && nav.userAgentData.platform) || nav.platform || nav.userAgent || '')
        : '';
    return /mac/i.test(platform) ? `\u2325${key}` : `Alt+${key}`;
}

// 两种模式共用的触发条件。requireAlt 决定这一条监听链认哪种组合，
// 两条链互斥，所以同一次按键只可能被其中一条认领。
function isShortcutTrigger(e, requireAlt) {
    if (!e.isTrusted) return false;
    if (!shortcutEnabled) return false;
    if (e.code !== shortcutKey) return false;
    if (e.ctrlKey || e.metaKey || e.shiftKey) return false;
    if (requireAlt ? !e.altKey : e.altKey) return false;
    if (e.repeat) return false;
    if (e.isComposing || e.keyCode === 229) return false;
    if (!document.hasFocus()) return false;
    if (isTypingContext()) return false;
    return true;
}

// ——— 裸键冲突自愈 ———
// 裸键撞上站点自己的快捷键时，用户的反应几乎总是「立刻再按一次关掉」。
// 连续几次「开了马上撤销」就当作冲突信号，把这个站点降级成 Alt 组合，
// 而不是让用户自己去猜为什么页面变怪了。阈值取 3 次，避免把
// 正常的快速开关误判成冲突。
const BARE_KEY_UNDO_WINDOW_MS = 1200;
const BARE_KEY_CONFLICT_STRIKES = 3;
let bareKeyLastActivationAt = 0;
let bareKeyConflictStrikes = 0;
let bareKeyDowngradeInFlight = false;

function noteBareKeyToggle() {
    const now = Date.now();
    if (!isActive) {
        bareKeyLastActivationAt = now;
        return;
    }
    if (bareKeyLastActivationAt && now - bareKeyLastActivationAt <= BARE_KEY_UNDO_WINDOW_MS) {
        bareKeyConflictStrikes += 1;
        if (bareKeyConflictStrikes >= BARE_KEY_CONFLICT_STRIKES) {
            bareKeyConflictStrikes = 0;
            void downgradeShortcutForThisSite();
        }
    } else {
        bareKeyConflictStrikes = 0;
    }
    bareKeyLastActivationAt = 0;
}

// 提示语走后台：i18n.js 有 30KB 的词表，为一句话把它注入每个页面不划算，
// 而 background 已经 importScripts 了它。后台不可用时退回英文，
// 宁可提示语没本地化，也不能让用户什么都看不到。
async function requestLocalizedText(messageKey, params) {
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'localizeMessage', messageKey, params: params || {} },
                (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(result);
                }
            );
        });
        if (response && typeof response.text === 'string' && response.text) {
            return response.text;
        }
    } catch (error) {
        debugLog('AI Translator: falling back to the built-in message text.', error);
    }
    return '';
}

async function downgradeShortcutForThisSite() {
    const host = normalizeShortcutHost(location.hostname);
    if (!host || bareKeyDowngradeInFlight) return;
    bareKeyDowngradeInFlight = true;
    const label = formatShortcutKeyLabel(shortcutKey);
    const chord = formatShortcutChord(label, true);
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');
        // 先读再写：其他标签页可能刚写过别的站点的例外
        const stored = await Settings.getSync(['shortcutSiteOverrides']);
        const existing = normalizeShortcutSiteOverrides(stored && stored.shortcutSiteOverrides);
        if (existing[host] === 'alt') return;
        const overrides = addShortcutSiteOverride(existing, host, 'alt');
        if (!overrides) return;
        await Settings.setSync({ shortcutSiteOverrides: overrides });
        shortcutSiteOverrides = overrides;
        const message = await requestLocalizedText('shortcutConflictDowngraded', { key: label, chord });
        showTranslatorToast(
            message || `${label} clashes on this site — using ${chord} here instead.`, 'info');
    } catch (error) {
        // 静默失败等于「按键突然不听话了，而且没人解释」。写不进去就直说，
        // 并给出用户自己能走通的下一步（设置页里手动改这个站点）。
        console.error('Error saving per-site shortcut override:', error);
        const message = await requestLocalizedText('shortcutConflictSaveFailed', { key: label, chord });
        showTranslatorToast(
            message ||
            `${label} clashes on this site, but Pointer could not save the exception. ` +
            'Set this site to Alt in Pointer settings.');
    } finally {
        bareKeyDowngradeInFlight = false;
    }
}

// Initialize extension
function initializeExtension() {
    setupShadowDOM();
    // Warm the localized tooltip. Fire-and-forget: spans created before it
    // lands carry the English default and are retitled when it arrives.
    void refreshToggleTooltipText();
    // Create the floating translation button
    translationButton = document.createElement('div');
    translationButton.id = 'ai-translator-button';
    translationButton.title = 'AI Translation Mode';

    // Halo ring — 外沿缓慢旋转的 sage 渐变光带，作为激活信号
    const haloRing = document.createElement('div');
    haloRing.id = 'ai-translator-halo';
    haloRing.setAttribute('aria-hidden', 'true');
    haloRing.innerHTML = `
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="ai-translator-halo-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%"   class="halo-stop-start"/>
                    <stop offset="50%"  class="halo-stop-mid"/>
                    <stop offset="100%" class="halo-stop-end"/>
                </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="47" fill="none"
                    stroke="url(#ai-translator-halo-grad)"
                    stroke-width="2.2" stroke-linecap="round"
                    stroke-dasharray="180 120"/>
        </svg>`;
    translationButton.appendChild(haloRing);

    // Create the icon inside the button
    const buttonIcon = document.createElement('div');
    buttonIcon.id = 'ai-translator-icon';
    buttonIcon.innerHTML = BRUSH_T_SVG;
    translationButton.appendChild(buttonIcon);

    // 长按进度环：常驻结构，靠 .long-press-active 触发 stroke-dashoffset 填充
    const ringLayer = document.createElement('div');
    ringLayer.id = 'ai-translator-ring';
    ringLayer.setAttribute('aria-hidden', 'true');
    ringLayer.innerHTML = LONG_PRESS_RING_SVG;
    translationButton.appendChild(ringLayer);

    // 完成勾：常驻结构，靠 .show 触发 scale+opacity 弹入
    const checkLayer = document.createElement('div');
    checkLayer.id = 'ai-translator-check';
    checkLayer.setAttribute('aria-hidden', 'true');
    checkLayer.innerHTML = CHECK_V_SVG;
    translationButton.appendChild(checkLayer);

    // Check if button should be shown
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        void Settings.getSync([
            'showButton',
            'buttonSize',
            'buttonThickness',
            'buttonPosition',
            'buttonX',
            'buttonY'
        ], true).then((result) => {
            showButton = result.showButton !== undefined ? result.showButton : true;

            if (result.buttonSize) {
                buttonSize = result.buttonSize;
                applyButtonSize(buttonSize);
            }

            if (typeof result.buttonThickness === 'number') {
                applyButtonThickness(result.buttonThickness);
            }

            positionButton(result.buttonPosition, result.buttonX, result.buttonY);

            if (showButton) {
                attachButtonWhenStyled();
            }

            setupButtonInteractions();
        }).catch((error) => {
            console.error('Error checking button visibility:', error);
            // storage 读不到也要给按钮兜底：默认位置 + 挂载 + 交互，避免 FAB 静默消失
            positionButton(Settings.DEFAULT_SYNC_SETTINGS.buttonPosition, null, null);
            attachButtonWhenStyled();
            setupButtonInteractions();
        });
    } catch (error) {
        console.error('Error initializing button:', error);
        // Default positioning if API fails
        translationButton.style.bottom = '20px';
        translationButton.style.right = '20px';
        attachButtonWhenStyled();
        setupButtonInteractions();
    }

    // Check if translation mode is active
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        void Settings.getSync(['isActive', 'targetLang', 'shortcutEnabled', 'shortcutKey',
            'shortcutModifier', 'shortcutSiteOverrides'], true)
            .then((result) => {
                isActive = result.isActive || false;
                targetLang = result.targetLang || 'zh';
                shortcutEnabled = result.shortcutEnabled !== false;
                shortcutKey = result.shortcutKey || 'KeyT';
                shortcutModifier = result.shortcutModifier === 'alt' ? 'alt' : 'none';
                shortcutSiteOverrides = normalizeShortcutSiteOverrides(result.shortcutSiteOverrides);

                if (isActive) {
                    activateTranslationMode();
                }
            })
            .catch((error) => {
                console.error('Error activating translation mode:', error);
            });
    } catch (error) {
        console.error('Error checking translation mode status:', error);
    }

    // No inbound message listener on purpose. Every cross-surface signal Pointer
    // needs — activation, target language, button visibility — is a sync-storage
    // key, and the listener below already reacts to all of them in every tab at
    // once. The popup sends no parallel chrome.tabs messages; keeping receivers
    // for messages no current surface sends would only widen the content script's
    // surface.

    // Listen for storage changes to update button in real-time
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        chrome.storage.onChanged.addListener(function (changes, namespace) {
            if (namespace === 'sync') {
                // Handle target language changes so future translations use the latest value
                if (changes.targetLang) {
                    targetLang = changes.targetLang.newValue || 'zh';
                }

                // Handle translation activation state changes across tabs without refresh
                if (changes.isActive) {
                    const shouldActivate = !!changes.isActive.newValue;
                    if (shouldActivate && !isActive) {
                        activateTranslationMode();
                    } else if (!shouldActivate && isActive) {
                        deactivateTranslationMode();
                    }
                }

                // Handle button size changes
                if (changes.buttonSize && changes.buttonSize.newValue) {
                    buttonSize = changes.buttonSize.newValue;
                    applyButtonSize(buttonSize);
                }

                // Handle 硝子厚度 (shadow / thickness slider) changes
                if (changes.buttonThickness) {
                    const newThickness = changes.buttonThickness.newValue;
                    applyButtonThickness(typeof newThickness === 'number' ? newThickness : 0);
                }

                // Handle button position changes including drag updates
                if (changes.buttonPosition || changes.buttonX || changes.buttonY) {
                    void Settings.getSync(['buttonPosition', 'buttonX', 'buttonY'], true)
                        .then((result) => {
                            positionButton(result.buttonPosition, result.buttonX, result.buttonY);
                            // 位置变了，玻璃下方的底色可能也变了 —— 重采自适应 token
                            _scheduleAdaptive();
                        })
                        .catch((error) => {
                            console.error('Error updating button position:', error);
                        });
                }

                // Handle button visibility changes
                if (changes.showButton !== undefined) {
                    toggleButtonVisibility(changes.showButton.newValue);
                }

                // Handle keyboard shortcut preferences (hot-reload without page refresh)
                if (changes.shortcutEnabled) {
                    shortcutEnabled = changes.shortcutEnabled.newValue !== false;
                }
                if (changes.shortcutKey) {
                    shortcutKey = changes.shortcutKey.newValue || 'KeyT';
                }
                if (changes.shortcutModifier) {
                    shortcutModifier = changes.shortcutModifier.newValue === 'alt' ? 'alt' : 'none';
                }
                if (changes.shortcutSiteOverrides) {
                    shortcutSiteOverrides =
                        normalizeShortcutSiteOverrides(changes.shortcutSiteOverrides.newValue);
                }

                // Interface language changed in another surface — re-fetch the
                // tooltip so translations already on this page follow it.
                if (changes.uiLang) {
                    void refreshToggleTooltipText();
                }
            }
        });
    } catch (error) {
        console.error('Error setting up storage change listener:', error);
    }

    // 两种模式分两条监听链，因为「抢这个键」的正当性完全不同。
    //
    // Alt 模式：Alt+字母 基本不与网页冲突，所以在 capture 阶段拦下并
    // stopPropagation —— 页面再怎么 stopPropagation 也截不断我们。
    document.addEventListener('keydown', function (e) {
        if (getEffectiveShortcutMode() !== 'alt') return;
        if (!isShortcutTrigger(e, true)) return;

        e.preventDefault();
        e.stopPropagation();
        toggleTranslationMode();
    }, true);

    // 裸键模式：这个键本来就可能属于网页。故意反过来做——
    //  · bubble 阶段注册，页面的 handler 先跑；
    //  · 页面若已 preventDefault，说明它认领了这个键，我们让路；
    //  · 绝不 stopPropagation，不静默掐掉站点自己的功能；
    //  · pageOwnsBareKey() 再挡掉一切可交互焦点。
    // 宁可少触发一次，也不能把别人的快捷键吃掉。
    document.addEventListener('keydown', function (e) {
        if (getEffectiveShortcutMode() !== 'none') return;
        if (e.defaultPrevented) return;
        if (!isShortcutTrigger(e, false)) return;
        if (pageOwnsBareKey()) return;

        e.preventDefault();
        noteBareKeyToggle();
        toggleTranslationMode();
    }, false);

    // CSS styles are now defined in content.css for better maintainability
}

function getFiniteCoordinate(value) {
    // Number(null) / Number('') 都是 0，必须先显式排除，
    // 否则 custom 位置 + 未设置的坐标会把按钮钉到 (0,0)
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function getVisibleCustomButtonPosition(customX, customY) {
    const x = getFiniteCoordinate(customX);
    const y = getFiniteCoordinate(customY);
    if (x === null || y === null) {
        return null;
    }

    const width = translationButton.offsetWidth || parseFloat(translationButton.style.width) || buttonSize;
    const height = translationButton.offsetHeight || parseFloat(translationButton.style.height) || buttonSize;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;
    const maxX = Math.max(0, viewportWidth - width);
    const maxY = Math.max(0, viewportHeight - height);

    return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY))
    };
}

// Position the button according to preferences
function positionButton(position, customX, customY) {
    currentButtonPosition = position || Settings.DEFAULT_SYNC_SETTINGS.buttonPosition;
    currentButtonX = customX;
    currentButtonY = customY;

    // Reset button positioning
    translationButton.style.top = 'auto';
    translationButton.style.right = 'auto';
    translationButton.style.bottom = 'auto';
    translationButton.style.left = 'auto';

    // Apply position based on setting
    const customPosition = currentButtonPosition === 'custom'
        ? getVisibleCustomButtonPosition(customX, customY)
        : null;

    if (customPosition) {
        translationButton.style.top = customPosition.y + 'px';
        translationButton.style.left = customPosition.x + 'px';
    } else {
        switch (currentButtonPosition) {
            case 'top-left':
                translationButton.style.top = '20px';
                translationButton.style.left = '20px';
                break;
            case 'top-right':
                translationButton.style.top = '20px';
                translationButton.style.right = '20px';
                break;
            case 'bottom-left':
                translationButton.style.bottom = '20px';
                translationButton.style.left = '20px';
                break;
            case 'bottom-right':
            default:
                translationButton.style.bottom = '20px';
                translationButton.style.right = '20px';
                break;
        }
    }
}

function keepCustomButtonInViewport() {
    if (currentButtonPosition !== 'custom' || !translationButton) return;
    // 拖拽进行中位置由指针决定，镜像坐标还是旧值，此时校正会把按钮
    // 从指针下方抢走
    if (isDragging) return;

    const customPosition = getVisibleCustomButtonPosition(currentButtonX, currentButtonY);
    if (!customPosition) return;

    translationButton.style.top = customPosition.y + 'px';
    translationButton.style.left = customPosition.x + 'px';
}

// Setup button interactions for click and long-press
function setupButtonInteractions() {
    // Click to toggle translation mode (ignored if long-press occurred)
    translationButton.addEventListener('click', function (e) {
        if (!e.isTrusted) return;
        if (buttonMoved) {
            buttonMoved = false;
            pressStartTime = 0;
            return;
        }
        if (longPressTriggered) {
            longPressTriggered = false;
            pressStartTime = 0;
            return;
        }
        if (!isDragging) {
            const duration = Date.now() - pressStartTime;
            pressStartTime = 0;
            // Only treat as click if press duration is short
            if (duration < 350) {
                toggleTranslationMode();
            }
        }
    });

    // Mousedown to start long-press clear or immediate drag
    translationButton.addEventListener('mousedown', function (e) {
        if (!e.isTrusted || e.button !== 0) return;
        pressStartTime = Date.now();
        e.preventDefault();
        longPressTriggered = false;
        buttonMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        lastDragClientX = e.clientX;
        buttonStartX = translationButton.offsetLeft;
        buttonStartY = translationButton.offsetTop;
        if (isActive) {
            // Only in translation mode do we clear on long-press
            longPressTimer = setTimeout(() => {
                handleLongPress();
            }, 350); // Long press threshold (350ms)
        }
        // 激活与否都允许拖拽：位移超过阈值后 startDragging 会先取消长按
        dragStartPending = true;
    });

    // Cancel long press if released early (含环填满前的清除定时器)
    translationButton.addEventListener('mouseup', function (e) {
        if (!e.isTrusted) return;
        cancelLongPress();
    });

    // 指针离开按钮视为放弃长按；拖拽中按钮跟随指针，不会误触。
    // 但 :active/.long-pressing 的 scale 缩小会把边缘从静止的指针下方抽走，
    // 触发假的 mouseleave —— 留 8px 余量，指针仍在按钮附近就不算离开
    translationButton.addEventListener('mouseleave', function (e) {
        if (!e.isTrusted) return;
        const rect = translationButton.getBoundingClientRect();
        const slack = 8;
        if (e.clientX >= rect.left - slack && e.clientX <= rect.right + slack &&
            e.clientY >= rect.top - slack && e.clientY <= rect.bottom + slack) {
            return;
        }
        cancelLongPress();
    });

    // Handle dragging movement
    document.addEventListener('mousemove', function (e) {
        if (!e.isTrusted) return;
        // If pending drag and moved enough, begin dragging
        if (dragStartPending) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            // Only start dragging on significant movement (>10px) to avoid click jitter
            if (Math.sqrt(dx * dx + dy * dy) > 10) {
                startDragging(e);
                dragStartPending = false;
            }
        }
        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const newLeft = buttonStartX + dx;
            const newTop = buttonStartY + dy;

            // Keep button within viewport
            const maxX = window.innerWidth - translationButton.offsetWidth;
            const maxY = window.innerHeight - translationButton.offsetHeight;

            translationButton.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
            translationButton.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';

            // 跟随移动方向的倾斜：较低倍率 + 小限幅 → 沉稳、有重量感
            const vx = e.clientX - lastDragClientX;
            const tilt = Math.max(-8, Math.min(8, vx * 0.8));
            translationButton.style.setProperty('--drag-tilt', tilt + 'deg');
            lastDragClientX = e.clientX;
        }
    });

    // Mouseup anywhere to stop dragging
    document.addEventListener('mouseup', function (e) {
        if (!e.isTrusted) return;
        cancelLongPress();
        // Cancel pending drag on mouseup
        dragStartPending = false;
        if (isDragging) {
            stopDragging();
        }
    });

    // Prevent default drag behavior
    translationButton.addEventListener('dragstart', function (e) {
        e.preventDefault();
    });
}

// Start dragging the button
function startDragging(e) {
    // 拖拽一旦成立，长按蓄力立即作废（含清除定时器和进度环视觉）
    cancelLongPress();
    buttonMoved = true;
    isDragging = true;

    // Get the button's current position *before* applying the dragging class
    const rect = translationButton.getBoundingClientRect();

    // 重置倾斜值，避免上一次拖动结束时的残留
    translationButton.style.setProperty('--drag-tilt', '0deg');
    lastDragClientX = e.clientX;

    // Add the dragging class (may change appearance/size)
    translationButton.classList.add('dragging');

    // Prepare fixed positioning using the *original* bounds
    translationButton.style.bottom = 'auto';
    translationButton.style.right = 'auto';
    translationButton.style.top = rect.top + 'px';
    translationButton.style.left = rect.left + 'px';
    translationButton.style.position = 'fixed';

    // Update start positions based on the new fixed positioning
    // offsetLeft/Top should now reflect the fixed position values
    buttonStartX = translationButton.offsetLeft;
    buttonStartY = translationButton.offsetTop;
}

// Stop dragging and save new position
function stopDragging() {
    isDragging = false;
    translationButton.classList.remove('dragging');
    if (isActive) {
        suppressSelectionAfterDrag = true;
    }

    // 落点下方的底色可能和起点完全不同 —— 重采一次自适应 token
    _scheduleAdaptive();

    // Save the new position
    const buttonX = translationButton.offsetLeft;
    const buttonY = translationButton.offsetTop;

    // 本地镜像立即更新，不等 storage.onChanged 回环 —— 否则回环完成前的
    // resize 会用拖拽前的旧坐标把按钮弹回去（setSync 失败时则永远弹回）
    currentButtonPosition = 'custom';
    currentButtonX = buttonX;
    currentButtonY = buttonY;

    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        void Settings.setSync({
            buttonPosition: 'custom',
            buttonX: buttonX,
            buttonY: buttonY
        }).catch((error) => {
            console.error('Error saving button position:', error);
        });
    } catch (error) {
        console.error('Error saving button position:', error);
    }
}

// ──────────────────────────────────────────────────────────────────
// FAB / Interaction
// ──────────────────────────────────────────────────────────────────

function toggleTranslationMode() {
    if (isActive) {
        deactivateTranslationMode();
        try {
            if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');
            void Settings.setSync({ isActive: false });
        } catch (error) {
            console.error('Error saving translation mode state:', error);
        }
    } else {
        // Verify that the endpoint's credential requirement is satisfied.
        try {
            if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

            void ensureApiKeyConfigured().then((hasKey) => {
                if (!hasKey) return;

                activateTranslationMode();
                void Settings.setSync({ isActive: true });
            }).catch((error) => {
                console.error('Error activating translation mode:', error);
            });
        } catch (error) {
            console.error('Error checking API key:', error);
            showTranslatorToast('Extension context changed. Please refresh the page.');
        }
    }
}

// Activate translation mode
function activateTranslationMode() {
    isActive = true;
    // .active 类驱动 CSS 过渡：玻璃本体不动，边沿覆上濃墨、透出滲み、
    // halo 墨带转起来，T 从 sumi 60% 换蘸濃墨并加粗 3.4 → 3.8。
    // SVG 节点不动，才能让 stroke-width 平滑动画。
    translationButton.classList.add('active');

    document.addEventListener('mouseup', handleTextSelection);
}

// Deactivate translation mode
function deactivateTranslationMode() {
    isActive = false;
    // 取消 .active → CSS 把濃墨收回：stroke 3.8 → 3.4、drop-shadow 退场、
    // color 从濃墨回到 --ink-color（sumi 60%）。SVG 节点不重建，才能平滑过渡。
    translationButton.classList.remove('active');

    document.removeEventListener('mouseup', handleTextSelection);
}

// 选区端点是否落在可编辑上下文（contenteditable / input / textarea）内。
// isContentEditable 自带祖先继承，input/textarea 再用 closest 兜一层。
function isNodeInEditableContext(node) {
    const element = node
        ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
        : null;
    if (!element) return false;
    return element.isContentEditable || !!element.closest('input, textarea');
}

function rangeTouchesEditableContext(range) {
    if (isNodeInEditableContext(range.startContainer) ||
        isNodeInEditableContext(range.endContainer) ||
        isNodeInEditableContext(range.commonAncestorContainer)) {
        return true;
    }

    if (getTextNodesInRange(range).some(isNodeInEditableContext)) {
        return true;
    }

    const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (!root || !root.querySelectorAll) return false;

    return Array.from(root.querySelectorAll('input, textarea, [contenteditable]'))
        .some((element) =>
            (element.matches('input, textarea') || element.isContentEditable) &&
            rangeIntersectsNodeStrict(range, element)
        );
}

// Handle text selection (Modified for structure preservation)
async function handleTextSelection(event) {
    // Programmatic DOM events are controlled by the page. Translation is a
    // quota-spending action and must start from a real user mouse event.
    if (!event || !event.isTrusted) return;
    // Don't process if we're dragging the button
    if (isDragging) return;
    // 拖拽结束的那次 mouseup 里 stopDragging 先执行（监听器注册更早），
    // isDragging 已被清掉 —— 用一次性标志挡住这次事件，别把页面上
    // 残留的旧选区当成新的翻译请求
    if (suppressSelectionAfterDrag) {
        suppressSelectionAfterDrag = false;
        return;
    }
    if (!isActive) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // Skip empty selections
    if (!selectedText) return;

    // Get the range for processing
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // Skip if selection is within the translator button
    if (translationButton.contains(container) || container === translationButton) {
        return;
    }

    // 不碰用户正在编辑的内容：替换编辑器里的文本节点会改坏输入状态
    if (rangeTouchesEditableContext(range)) {
        return;
    }

    // Concurrency guard: skip if any text nodes in this range are already being translated
    if (hasOverlapWithPending(range)) {
        debugLog("AI Translator: Translation already in progress for overlapping region, skipping.");
        return;
    }

    const startSpan = getOwnedTranslatedAncestor(range.startContainer);
    const endSpan = getOwnedTranslatedAncestor(range.endContainer);

    if (startSpan && endSpan && startSpan === endSpan) {
        // Selection fully inside a translated span; keep current display state and do nothing
        return;
    }

    // 检查选择是否完全在已翻译区域内
    const isWithinTranslatedSpan = (node) => getOwnedTranslatedAncestor(node) !== null;

    // 如果选择的开始和结束都在已翻译区域内，仅当完全在单个已翻译节点内时跳过
    if (isWithinTranslatedSpan(range.startContainer) && isWithinTranslatedSpan(range.endContainer)) {
        const spanNodes = findTranslatedNodesInRange(range);
        if (spanNodes.length === 1 && isSelectionContainedInNode(range, spanNodes[0])) {
            debugLog("Selection within a single translated node, ignoring translation action");
            return;
        }
        // 否则选区中含有已翻译片段但不全在同一span内，继续执行后续逻辑
    }

    // 场景 1: 检查选择是否与已翻译内容完全相同
    const exactTranslatedMatch = findExactTranslatedMatch(range);
    if (exactTranslatedMatch) {
        // 如果是完全相同的选择，不做任何操作
        return;
    }

    // 后面所有分支（混合/块级/结构化/简单）都会发 API 请求，
    // 在分派前统一预检一次 key，避免多块选区里每个块各自失败
    const hasApiKey = await ensureApiKeyConfigured().catch((error) => {
        console.error('AI Translator: API key precheck failed:', error);
        return false;
    });
    if (!hasApiKey) {
        return;
    }

    // await 期间可能有并发的 mouseup 抢先分派了同区域的翻译（锁在分派时才登记），
    // 必须重查一次 pending 才能保证 guard→lock 的原子性
    if (hasOverlapWithPending(range)) {
        debugLog("AI Translator: Translation already in progress for overlapping region, skipping.");
        return;
    }

    // 检查当前选区是否与已翻译片段存在交集，如有则直接跳过避免重复翻译
    const translatedNodes = findTranslatedNodesInRange(range);
    if (translatedNodes.length > 0) {
        if (translateMixedSelection(range)) {
            return;
        }
        debugLog("AI Translator: Selection intersects existing translation, skipping retranslation.");
        return;
    }

    // 场景 4: 选择区域完全是未翻译的内容，正常进行翻译
    const isSimple = isSimpleTextSelection(range);
    if (isSimple) {
        // 单个文本节点选择，简易翻译
        translateSimpleSelection(range, selectedText);
    } else {
        // 多节点选择，判断是否在同一块级元素内以决定翻译方式
        const startBlock = getClosestBlockElement(range.startContainer);
        const endBlock = getClosestBlockElement(range.endContainer);
        if (startBlock && endBlock && startBlock === endBlock) {
            // 同一块级元素内的多节点选区，使用 translateRangeAsSingleBlock 保留内联元素结构
            translateRangeAsSingleBlock(range, { blockElement: startBlock });
        } else {
            // 跨块级元素的多节点选区，使用结构化翻译以保留跨度
            translateStructuredSelection(range);
        }
    }
}

// Find exact match of a selection with an existing translated node
function findExactTranslatedMatch(range) {
    const translatedNodes = getConnectedOwnedTranslatedNodes();

    // Find a node that has identical content
    for (const node of translatedNodes) {
        const nodeRange = document.createRange();
        nodeRange.selectNode(node);

        if (range.compareBoundaryPoints(Range.START_TO_START, nodeRange) === 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, nodeRange) === 0) {
            return node;
        }
    }

    return null;
}

// Find all translated nodes that intersect with the given range
function findTranslatedNodesInRange(range) {
    const translatedNodes = [];
    const allTranslatedNodes = getConnectedOwnedTranslatedNodes();

    for (const node of allTranslatedNodes) {
        if (rangeIntersectsNodeStrict(range, node)) {
            translatedNodes.push(node);
        }
    }

    return translatedNodes;
}

// Check if selection is fully contained within a node
function isSelectionContainedInNode(range, node) {
    const nodeRange = document.createRange();
    nodeRange.selectNode(node);

    return (range.compareBoundaryPoints(Range.START_TO_START, nodeRange) >= 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, nodeRange) <= 0);
}

// Replace a translated node with its original text
function replaceTranslatedNodeWithOriginal(node) {
    if (!node || !ownedTranslatedNodes.has(node)) {
        return null;
    }

    const state = translatedNodeState.get(node);
    const originalText = state ? state.originalText : '';
    const textNode = document.createTextNode(originalText || '');
    if (node.parentNode) {
        node.parentNode.replaceChild(textNode, node);
        ownedTranslatedNodes.delete(node);
        translatedNodeState.delete(node);
        return textNode;
    } else {
        console.warn("AI Translator: Node parent missing when trying to restore original text.", node);
        return null; // Indicate failure
    }
}

function getTextSliceWithinRange(node, range) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent || !rangeIntersectsNodeStrict(range, node)) {
        return null;
    }

    let startOffset = 0;
    let endOffset = node.textContent.length;

    if (node === range.startContainer) {
        startOffset = range.startOffset;
    }

    if (node === range.endContainer) {
        endOffset = range.endOffset;
    }

    if (startOffset >= endOffset) {
        return null;
    }

    return {
        startOffset,
        endOffset,
        text: node.textContent.substring(startOffset, endOffset)
    };
}

function rangeHasFreshText(range) {
    const textNodes = getTextNodesInRange(range);

    return textNodes.some(node => {
        const slice = getTextSliceWithinRange(node, range);
        if (!slice || !hasTranslatableContent(slice.text)) {
            return false;
        }

        return !getOwnedTranslatedAncestor(node);
    });
}

function expandRangeToContainTranslatedNodes(range, translatedNodes) {
    const expandedRange = range.cloneRange();

    translatedNodes.forEach(node => {
        if (!node || !document.contains(node)) {
            return;
        }

        const nodeRange = document.createRange();
        try {
            nodeRange.selectNode(node);
        } catch (error) {
            console.warn('AI Translator: Failed to create range for translated node.', node, error);
            return;
        }

        if (expandedRange.compareBoundaryPoints(Range.START_TO_START, nodeRange) > 0) {
            expandedRange.setStart(nodeRange.startContainer, nodeRange.startOffset);
        }
        if (expandedRange.compareBoundaryPoints(Range.END_TO_END, nodeRange) < 0) {
            expandedRange.setEnd(nodeRange.endContainer, nodeRange.endOffset);
        }
    });

    return expandedRange;
}

function buildMixedSelectionBlockPlan(selectionRange, blockElements, translatedNodes) {
    if (!blockElements || blockElements.length <= 1) {
        return null;
    }

    const blockElementsToTranslate = [];
    const translatedNodesToRestore = [];
    const restoredNodeSet = new Set();

    for (const block of blockElements) {
        if (!block || !document.contains(block)) {
            continue;
        }

        const blockRange = createBlockIntersectionRange(selectionRange, block);
        if (!blockRange || blockRange.collapsed || !rangeHasFreshText(blockRange)) {
            continue;
        }

        blockElementsToTranslate.push(block);

        for (const node of translatedNodes) {
            if (!node || restoredNodeSet.has(node) || !document.contains(node)) {
                continue;
            }

            if (rangeIntersectsNodeStrict(blockRange, node)) {
                restoredNodeSet.add(node);
                translatedNodesToRestore.push(node);
            }
        }
    }

    if (!blockElementsToTranslate.length || blockElementsToTranslate.length === blockElements.length) {
        return null;
    }

    return {
        blockElementsToTranslate,
        translatedNodesToRestore
    };
}

// Translate mixed selections containing both original and already translated segments as a single block
function translateMixedSelection(range) {
    if (!rangeHasFreshText(range)) {
        return false;
    }

    const translatedNodes = findTranslatedNodesInRange(range);
    if (!translatedNodes.length) {
        return false;
    }

    const blockPlan = buildMixedSelectionBlockPlan(range, getBlockElementsInRange(range), translatedNodes);
    const translatedNodesToRestore = blockPlan ? blockPlan.translatedNodesToRestore : translatedNodes;
    const expandedRange = expandRangeToContainTranslatedNodes(range, translatedNodesToRestore);

    const startMarker = document.createTextNode('');
    const endMarker = document.createTextNode('');

    const startRange = expandedRange.cloneRange();
    startRange.collapse(true);
    startRange.insertNode(startMarker);

    const endRange = expandedRange.cloneRange();
    endRange.collapse(false);
    endRange.insertNode(endMarker);

    const spansToRestore = translatedNodesToRestore.filter(node =>
        node && document.contains(node) && isNodeBetweenMarkers(node, startMarker, endMarker)
    );

    spansToRestore.forEach(span => {
        if (span && document.contains(span)) {
            replaceTranslatedNodeWithOriginal(span);
        }
    });

    const finalRange = document.createRange();
    finalRange.setStartAfter(startMarker);
    finalRange.setEndBefore(endMarker);

    const cleanupMarkers = () => {
        const parentsToNormalize = new Set();
        if (startMarker.parentNode) {
            parentsToNormalize.add(startMarker.parentNode);
            startMarker.parentNode.removeChild(startMarker);
        }
        if (endMarker.parentNode) {
            parentsToNormalize.add(endMarker.parentNode);
            endMarker.parentNode.removeChild(endMarker);
        }
        // insertNode 会把文本节点劈成两半；移除 marker 后合并碎片，
        // 但翻译在途的节点不能被 normalize 合并掉（会失去引用）。
        // normalize() 递归整棵子树，所以要按"包含"而不是"直接子节点"判定
        const hasPendingDescendant = (parent) => {
            for (const node of pendingTranslationNodes) {
                if (parent.contains(node)) return true;
            }
            return false;
        };
        parentsToNormalize.forEach((parent) => {
            if (parent && typeof parent.normalize === 'function' && !hasPendingDescendant(parent)) {
                parent.normalize();
            }
        });
    };

    const finalText = finalRange.toString();
    const trimmedFinalText = finalText.trim();

    if (!trimmedFinalText) {
        cleanupMarkers();
        const clearedSelection = window.getSelection();
        if (clearedSelection) {
            clearedSelection.removeAllRanges();
        }
        return true;
    }

    const blockElements = getBlockElementsInRange(finalRange);
    let translationHandled = false;

    if (blockPlan) {
        const blockElementsToTranslate = blockPlan.blockElementsToTranslate.filter(block => block && document.contains(block));

        if (blockElementsToTranslate.length > 1) {
            translationHandled = translateRangeByBlocks(finalRange, blockElementsToTranslate);
        } else if (blockElementsToTranslate.length === 1) {
            const targetBlock = blockElementsToTranslate[0];
            const targetRange = createBlockIntersectionRange(finalRange, targetBlock);
            if (targetRange && !targetRange.collapsed) {
                translationHandled = translateRangeAsSingleBlock(targetRange, { blockElement: targetBlock });
            }
        }
    } else if (blockElements.length > 1) {
        translationHandled = translateRangeByBlocks(finalRange, blockElements);
    } else if (blockElements.length === 1) {
        translationHandled = translateRangeAsSingleBlock(finalRange, { blockElement: blockElements[0] });
    } else {
        translateStructuredSelection(finalRange);
        translationHandled = true;
    }

    cleanupMarkers();

    if (translationHandled) {
        const activeSelection = window.getSelection();
        if (activeSelection) {
            activeSelection.removeAllRanges();
        }
    }

    return translationHandled;
}

// Translate untranslated segments around existing translations
function translateUntranslatedSegments(range, translatedNodes) {
    // Filter out nodes without valid parent to avoid selectNode errors
    translatedNodes = translatedNodes.filter(node => node && document.contains(node) && node.parentNode);
    // This is a complex operation because we need to:
    // 1. Identify contiguous untranslated text segments
    // 2. Create ranges for each segment
    // 3. Translate each segment separately

    // Clone the range to work with
    const workingRange = range.cloneRange();

    // Sort translated nodes by their position in the document
    translatedNodes.sort((a, b) => {
        const posA = a.compareDocumentPosition(b);
        return posA & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    let currentPos = range.startContainer;
    let currentOffset = range.startOffset;
    const segments = [];

    // For each translated node, create a segment from current position to the node
    for (const node of translatedNodes) {
        const nodeRange = document.createRange();
        // Skip nodes that cannot be selected (e.g., no parent)
        try {
            nodeRange.selectNode(node);
        } catch (error) {
            console.warn("AI Translator: Cannot select node in translateUntranslatedSegments, skipping.", node, error);
            continue;
        }

        // If there's text between the current position and this translated node
        if (currentPos !== nodeRange.startContainer || currentOffset !== nodeRange.startOffset) {
            const segmentRange = document.createRange();
            segmentRange.setStart(currentPos, currentOffset);
            segmentRange.setEnd(nodeRange.startContainer, nodeRange.startOffset);

            // Only add non-empty segments
            if (!segmentRange.collapsed && segmentRange.toString().trim()) {
                segments.push(segmentRange);
            }
        }

        // Move current position to after this translated node
        currentPos = nodeRange.endContainer;
        currentOffset = nodeRange.endOffset;
    }

    // Add final segment from last translated node to end of selection
    if (currentPos !== range.endContainer || currentOffset !== range.endOffset) {
        const finalSegment = document.createRange();
        finalSegment.setStart(currentPos, currentOffset);
        finalSegment.setEnd(range.endContainer, range.endOffset);

        // Only add non-empty segments
        if (!finalSegment.collapsed && finalSegment.toString().trim()) {
            segments.push(finalSegment);
        }
    }

    // Translate each segment
    for (const segment of segments) {
        const segmentText = segment.toString().trim();
        if (segmentText) {
            const isSimple = isSimpleTextSelection(segment);
            if (isSimple) {
                translateSimpleSelection(segment, segmentText);
            } else {
                translateStructuredSelection(segment);
            }
        }
    }

    // Clear selection
    window.getSelection().removeAllRanges();
}

// Check if selection contains already translated content
function checkForTranslatedContent(range) {
    return findTranslatedNodesInRange(range).length > 0;
}

// Determine if a selection is simple (contained within one text node)
function isSimpleTextSelection(range) {
    // Check if start and end containers are the same text node
    return range.startContainer === range.endContainer &&
        range.startContainer.nodeType === Node.TEXT_NODE;
}

function getBlockElementsInRange(range) {
    const textNodes = getTextNodesInRange(range);
    const blocks = [];
    const seen = new Set();

    for (const node of textNodes) {
        if (!node || node.nodeType !== Node.TEXT_NODE) {
            continue;
        }
        const parentElement = node.parentElement;
        if (!parentElement) {
            continue;
        }
        const block = getClosestBlockElement(node);
        if (block && !seen.has(block)) {
            seen.add(block);
            blocks.push(block);
        }
    }

    return sortNodesInDocumentOrder(blocks);
}

function sortNodesInDocumentOrder(nodes) {
    return nodes.sort((a, b) => {
        if (a === b) {
            return 0;
        }
        const position = a.compareDocumentPosition(b);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
            return -1;
        }
        if (position & Node.DOCUMENT_POSITION_PRECEDING) {
            return 1;
        }
        return 0;
    });
}

function createBlockIntersectionRange(selectionRange, blockElement) {
    if (!selectionRange || !blockElement || !rangeIntersectsNodeStrict(selectionRange, blockElement)) {
        return null;
    }

    const blockRange = document.createRange();
    blockRange.selectNodeContents(blockElement);

    const intersection = document.createRange();

    if (selectionRange.compareBoundaryPoints(Range.START_TO_START, blockRange) < 0) {
        intersection.setStart(blockRange.startContainer, blockRange.startOffset);
    } else {
        intersection.setStart(selectionRange.startContainer, selectionRange.startOffset);
    }

    if (selectionRange.compareBoundaryPoints(Range.END_TO_END, blockRange) > 0) {
        intersection.setEnd(blockRange.endContainer, blockRange.endOffset);
    } else {
        intersection.setEnd(selectionRange.endContainer, selectionRange.endOffset);
    }

    if (intersection.collapsed) {
        return null;
    }

    return intersection;
}

function isNodeBetweenMarkers(node, startMarker, endMarker) {
    if (!node || !document.contains(node)) return false;
    if (!startMarker || !document.contains(startMarker)) return false;
    if (!endMarker || !document.contains(endMarker)) return false;

    try {
        const afterStart = startMarker.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING;
        const beforeEnd = endMarker.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING;
        return !!(afterStart && beforeEnd);
    } catch (e) {
        return false;
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitByDelimiter(text, delimiter, expectedCount) {
    // Strategy 1: exact split
    let parts = text.split(delimiter);
    if (parts.length === expectedCount) return parts;

    // Strategy 2: trimmed delimiter
    const trimmed = delimiter.trim();
    parts = text.split(trimmed);
    if (parts.length === expectedCount) return parts;

    // Strategy 3: flexible whitespace around delimiter
    const flexRegex = new RegExp('\\s*' + escapeRegExp(trimmed) + '\\s*', 'g');
    parts = text.split(flexRegex);
    if (parts.length === expectedCount) return parts;

    // All strategies must match exactly expectedCount
    return null;
}

// Text nodes that contain only invisible characters (word joiner U+2060,
// zero-width spaces, BOM, bidi marks, etc.) survive a .trim() check but carry
// no translatable content. Sending them to the model causes hallucinated
// filler like "请提供需要翻译的文本" because the model sees an empty segment.
function hasTranslatableContent(text) {
    if (typeof text !== 'string' || !text) return false;
    return /[^\s\p{Cf}\p{Cc}]/u.test(text);
}

function stripDelimiterArtifacts(text, delimiter) {
    if (typeof text !== 'string' || !text.includes(delimiter)) {
        return text;
    }

    // Some models leak the control token into translated prose even when the
    // overall split count still matches. Strip any residual control token before rendering.
    return text.replaceAll(delimiter, '').trim();
}

// ──────────────────────────────────────────────────────────────────
// Translation Engine
// ──────────────────────────────────────────────────────────────────

function createTranslationLoadingSession(range, options = {}) {
    const loadingController = options.loadingController || null;
    const externalLoadingIndicator = options.loadingIndicator || null;
    let loadingIndicator = null;
    let manageLoading = true;

    if (loadingController) {
        loadingController.acquire();
        loadingIndicator = loadingController.indicator;
        manageLoading = false;
    } else if (externalLoadingIndicator) {
        loadingIndicator = externalLoadingIndicator;
        manageLoading = false;
    } else {
        loadingIndicator = showLoadingNearRange(range);
    }

    return {
        indicator: loadingIndicator,
        cleanup() {
            if (loadingController) {
                loadingController.release();
            } else if (manageLoading) {
                hideLoading(loadingIndicator);
            }
        }
    };
}

function createPendingNodesLock(nodes) {
    const pendingNodes = Array.from(new Set((nodes || []).filter(Boolean)));
    markNodesAsPending(pendingNodes);
    let released = false;

    return () => {
        if (!released) {
            released = true;
            unmarkNodesAsPending(pendingNodes);
        }
    };
}

function clearCurrentSelection() {
    const selection = window.getSelection();
    if (selection) {
        selection.removeAllRanges();
    }
}

function sendTranslationRequest(texts, expectedCount = texts.length) {
    const epochAtDispatch = translationEpoch;
    return new Promise((resolve, reject) => {
        try {
            if (!isChromeAPIAvailable()) {
                throw new Error('Chrome API not available');
            }

            chrome.runtime.sendMessage({
                action: 'translate',
                text: texts,
                targetLang: targetLang
            }, (response) => {
                try {
                    if (chrome.runtime.lastError) {
                        const lastErrorMessage = chrome.runtime.lastError.message || 'Extension context invalidated';
                        // context invalidated → 统一清理；port closed（worker 被杀等
                        // 临时故障）→ 当普通失败抛出，由调用方 toast 提示后可重试
                        if (isContextInvalidationError(lastErrorMessage)) {
                            onExtensionContextInvalidated();
                        }
                        throw new Error(lastErrorMessage);
                    }

                    if (!response) {
                        throw new Error('No response from background script');
                    }

                    if (response.error) {
                        const responseError = new Error(response.error);
                        responseError.code = response.errorCode;
                        throw responseError;
                    }

                    if (!Array.isArray(response.translations) ||
                        response.translations.length !== expectedCount ||
                        response.translations.some((translation) => typeof translation !== 'string')) {
                        throw new Error('Mismatched translations received');
                    }

                    // 用户在请求在途时长按清空了整页译文 —— 迟到的结果不再上屏，
                    // 否则会插入带旧 groupId 的孤儿 span，破坏分组还原
                    if (epochAtDispatch !== translationEpoch) {
                        const staleError = new Error('Translations were cleared while this request was in flight');
                        staleError.staleByClear = true;
                        throw staleError;
                    }

                    resolve(response.translations);
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

function resolveNodeSelectionOffsets(originalFullText, startOffset, endOffset, expectedText) {
    let validStartOffset = Math.min(startOffset, originalFullText.length);
    let validEndOffset = Math.min(endOffset, originalFullText.length);
    validStartOffset = Math.min(validStartOffset, validEndOffset);
    let selectedText = originalFullText.substring(validStartOffset, validEndOffset);

    if (selectedText !== expectedText) {
        const firstIndex = originalFullText.indexOf(expectedText);
        if (firstIndex !== -1 && originalFullText.indexOf(expectedText, firstIndex + 1) === -1) {
            validStartOffset = firstIndex;
            validEndOffset = firstIndex + expectedText.length;
            selectedText = expectedText;
        } else {
            return null;
        }
    }

    return {
        startOffset: validStartOffset,
        endOffset: validEndOffset,
        selectedText
    };
}

function replaceSelectedTextNode(node, startOffset, endOffset, originalText, translatedText, groupId) {
    if (!node || !document.contains(node) || !node.parentNode) {
        console.warn('AI Translator: Node or parent invalid before applying translation.', node);
        return false;
    }

    const originalFullText = node.textContent;
    const resolvedOffsets = resolveNodeSelectionOffsets(originalFullText, startOffset, endOffset, originalText);
    if (!resolvedOffsets) {
        console.warn('AI Translator: Text changed for node, skipping.', originalText);
        return false;
    }

    const { startOffset: validStartOffset, endOffset: validEndOffset, selectedText } = resolvedOffsets;
    const parentNode = node.parentNode;
    const beforeText = originalFullText.substring(0, validStartOffset);
    const afterText = originalFullText.substring(validEndOffset);
    const span = createTranslatedSpan(translatedText, selectedText, groupId);

    if (beforeText) {
        parentNode.insertBefore(document.createTextNode(beforeText), node);
    }

    parentNode.insertBefore(span, node);

    if (afterText) {
        parentNode.insertBefore(document.createTextNode(afterText), node);
    }

    parentNode.removeChild(node);
    return true;
}

// A key, when used, never enters the page's isolated world — the background
// worker reports only whether the endpoint's credential requirement is met.
function getApiConfigurationStatus() {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({ action: 'hasApiKey' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                // 后台读取失败 ≠ 没配置 key：reject 走安静的失败路径，
                // 不弹"请设置 API key"、不拉起设置页
                if (response && response.error) {
                    reject(new Error(response.error));
                    return;
                }
                resolve({
                    hasApiKey: Boolean(response && response.hasApiKey),
                    isVerified: Boolean(response && response.isVerified),
                    hasHostPermission: Boolean(response && response.hasHostPermission)
                });
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function ensureApiKeyConfigured() {
    const status = await getApiConfigurationStatus();

    if (!status.hasApiKey) {
        showTranslatorToast('Please set your API key in the extension settings');
        openOptionsPageSafely();
        return false;
    }

    if (!status.isVerified) {
        showTranslatorToast('Please verify the current API settings and server address in Pointer settings');
        openOptionsPageSafely();
        return false;
    }

    if (!status.hasHostPermission) {
        showTranslatorToast('Please verify the API server again to grant Pointer access');
        openOptionsPageSafely();
        return false;
    }

    return true;
}

// 非阻塞 toast —— 与上下文失效通知同一套页内浮条样式；
// 单例：新消息顶替旧消息，5s 自散，不像 alert 一样逐条阻塞页面
let translatorToastElement = null;
let translatorToastTimer = null;

function showTranslatorToast(message, tone) {
    if (translatorToastElement && translatorToastElement.parentNode) {
        translatorToastElement.parentNode.removeChild(translatorToastElement);
    }
    clearTimeout(translatorToastTimer);

    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '10px';
    toast.style.left = '10px';
    toast.style.padding = '10px';
    // 冲突降级之类的提示不是错误，用中性色，避免把「已经帮你处理好了」画成告警
    toast.style.backgroundColor = tone === 'info'
        ? 'rgba(28, 32, 36, 0.88)'
        : 'rgba(255, 0, 0, 0.7)';
    toast.style.color = 'white';
    toast.style.borderRadius = '5px';
    toast.style.zIndex = '10000';
    toast.textContent = `AI Translator: ${message}`;
    (document.body || document.documentElement).appendChild(toast);

    translatorToastElement = toast;
    translatorToastTimer = setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
        if (translatorToastElement === toast) {
            translatorToastElement = null;
        }
    }, 5000);
}

// failureScope：同一批翻译（一次选区可拆出多个块请求）共享一个 scope，
// 多个失败只提示一次，避免连环弹条
function reportTranslationFailure(error, fallbackMessage, failureScope) {
    // 长按清除导致的主动丢弃不是失败，不打扰用户
    if (error && error.staleByClear) {
        debugLog('AI Translator: Discarded translation that arrived after clear-all.');
        return;
    }
    console.error(fallbackMessage, error);
    if (failureScope) {
        if (failureScope.reported) return;
        failureScope.reported = true;
    }
    if (error instanceof TypeError && error.message.includes("reading 'replaceChild'")) {
        showTranslatorToast('Translation failed: The page structure changed during translation. Please try again.');
        return;
    }
    if (error && (error.code === 'API_VERIFICATION_REQUIRED' ||
        error.code === 'HOST_PERMISSION_REQUIRED' ||
        error.code === 'API_KEY_REQUIRED')) {
        showTranslatorToast(error.message);
        openOptionsPageSafely();
        return;
    }
    showTranslatorToast(`Translation failed: ${error.message}`);
}

function translateRangeAsSingleBlock(targetRange, options = {}) {
    if (!targetRange || targetRange.collapsed) {
        return false;
    }
    const loadingSession = createTranslationLoadingSession(targetRange, options);

    const textNodes = getTextNodesInRange(targetRange);
    const segments = [];
    const groupId = getBlockGroupId(options.blockElement || targetRange.startContainer);

    for (const node of textNodes) {
        if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent) {
            continue;
        }

        const slice = getTextSliceWithinRange(node, targetRange);
        if (!slice || !hasTranslatableContent(slice.text)) {
            continue;
        }

        segments.push({
            node,
            startOffset: slice.startOffset,
            endOffset: slice.endOffset,
            text: slice.text
        });
    }

    if (!segments.length) {
        loadingSession.cleanup();
        return false;
    }

    const segmentNodes = segments.map(s => s.node);
    const unlockNodes = createPendingNodesLock(segmentNodes);

    const DELIMITER = '__AI_TRANSLATOR_DELIM__';
    // Segment text already contains the page's real boundary whitespace.
    // Adding spaces around the control token creates doubled spaces when the
    // model faithfully preserves both the original and injected whitespace.
    const combinedText = segments.map(seg => seg.text).join(DELIMITER);

    void sendTranslationRequest([combinedText], 1)
        .then((translations) => {
            loadingSession.cleanup();

            const invalidNode = segments.some(seg => !seg.node || !document.contains(seg.node) || !seg.node.parentNode);
            if (invalidNode) {
                unlockNodes();
                console.warn('AI Translator: Node invalid before applying block translation, aborting stale selection.');
                return;
            }

            const translatedCombined = translations[0];
            if (typeof translatedCombined !== 'string' || !translatedCombined.trim()) {
                unlockNodes();
                throw new Error('Empty translation received');
            }

            const translatedParts = splitByDelimiter(translatedCombined, DELIMITER, segments.length);
            if (!translatedParts) {
                unlockNodes();
                console.warn('AI Translator: Delimiter split mismatch after all strategies, falling back.', {
                    expected: segments.length
                });
                translateStructuredSelection(targetRange);
                return;
            }

            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const translatedText = stripDelimiterArtifacts(translatedParts[i], DELIMITER);
                replaceSelectedTextNode(
                    seg.node,
                    seg.startOffset,
                    seg.endOffset,
                    seg.text,
                    translatedText,
                    groupId
                );
            }

            clearCurrentSelection();
            unlockNodes();
        })
        .catch((error) => {
            loadingSession.cleanup();
            unlockNodes();
            reportTranslationFailure(error, 'AI Translator: Error processing combined block translation.', options.failureScope);
        });

    return true;
}

function translateRangeByBlocks(selectionRange, blockElements) {
    if (!blockElements || blockElements.length === 0) {
        return false;
    }

    const loadingController = createLoadingController(selectionRange);
    // 同一批块请求共享一个失败提示 scope（多块失败只提示一次）
    const failureScope = {};
    let translatedCount = 0;

    for (const block of blockElements) {
        if (!block || !document.contains(block)) {
            continue;
        }

        const blockRange = createBlockIntersectionRange(selectionRange, block);
        if (!blockRange || blockRange.collapsed) {
            continue;
        }

        const translated = translateRangeAsSingleBlock(blockRange, { loadingController, blockElement: block, failureScope });
        if (translated) {
            translatedCount++;
        }
    }

    if (translatedCount === 0) {
        loadingController.cancel();
    }

    return translatedCount > 0;
}

// Simplified translation for single text node selections
function translateSimpleSelection(range, selectedText, options = {}) {
    const groupId = options.groupId || getBlockGroupId(range.startContainer);
    const loadingSession = createTranslationLoadingSession(range, options);

    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        const textNode = range.startContainer;

        if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !document.contains(textNode)) {
            loadingSession.cleanup();
            console.warn('AI Translator: Skipping translation, selection text node invalid before request.');
            return;
        }

        const parentTranslatedSpan = getOwnedTranslatedAncestor(textNode);
        if (parentTranslatedSpan) {
            loadingSession.cleanup();
            debugLog('AI Translator: Selection already translated, skipping duplicate translation.');
            return;
        }

        const unlockNode = createPendingNodesLock([textNode]);

        // key 已在 handleTextSelection 分派前统一预检，这里不再重复 round-trip
        const snapshotStartOffset = range.startOffset;
        const snapshotEndOffset = range.endOffset;
        const snapshotSelectedText = selectedText;

        void sendTranslationRequest([selectedText], 1)
            .then((translations) => {
                loadingSession.cleanup();

                if (!textNode || !document.contains(textNode) || !textNode.parentNode) {
                    unlockNode();
                    console.warn('AI Translator: Original text node or its parent is no longer valid after translation.');
                    return;
                }

                replaceSelectedTextNode(
                    textNode,
                    snapshotStartOffset,
                    snapshotEndOffset,
                    snapshotSelectedText,
                    translations[0],
                    groupId
                );

                clearCurrentSelection();
                unlockNode();
            })
            .catch((error) => {
                loadingSession.cleanup();
                unlockNode();
                reportTranslationFailure(error, 'Error processing translation:');
            });
    } catch (error) {
        loadingSession.cleanup();
        console.error('Error sending translation request:', error);
        showTranslatorToast('Translation failed: Extension context changed. Please refresh the page.');
    }
}

// Complex translation for structured content (preserves DOM structure)
function translateStructuredSelection(range) {
    const loadingSession = createTranslationLoadingSession(range);

    const initialTextNodesInRange = getTextNodesInRange(range);
    const textsToTranslate = [];
    const nodeData = [];

    if (initialTextNodesInRange.length === 0) {
        loadingSession.cleanup();
        debugLog('No translatable text found in selection.');
        return;
    }

    for (let i = 0; i < initialTextNodesInRange.length; i++) {
        const node = initialTextNodesInRange[i];
        let textToAdd = node.textContent;
        let start = 0;
        let end = node.textContent.length;

        if (!node || node.nodeType !== Node.TEXT_NODE || !document.contains(node)) {
            console.warn('AI Translator: A text node became invalid during initial processing.', node);
            continue;
        }

        if (node === range.startContainer && node.nodeType === Node.TEXT_NODE) {
            start = range.startOffset;
            textToAdd = textToAdd.substring(start);
        }

        if (node === range.endContainer && node.nodeType === Node.TEXT_NODE) {
            end = range.endOffset;
            textToAdd = textToAdd.substring(0, end - start); // Adjust end based on potential start offset change
        }

        if (hasTranslatableContent(textToAdd)) {
            textsToTranslate.push(textToAdd);
            nodeData.push({ node: node, originalText: textToAdd, startOffset: start, endOffset: end });
        }
    }

    if (textsToTranslate.length === 0 || nodeData.length === 0) {
        loadingSession.cleanup();
        debugLog('No valid text to translate in selection after filtering.');
        return;
    }

    const unlockNodes = createPendingNodesLock(nodeData.map(data => data.node));

    void sendTranslationRequest(textsToTranslate, nodeData.length)
        .then((translations) => {
            loadingSession.cleanup();

            const hasInvalidNode = nodeData.some(data => !data.node || !document.contains(data.node) || !data.node.parentNode);
            if (hasInvalidNode) {
                unlockNodes();
                console.warn('AI Translator: Node invalid before applying structured translation, aborting stale selection.');
                return;
            }

            for (let i = 0; i < nodeData.length; i++) {
                const data = nodeData[i];
                replaceSelectedTextNode(
                    data.node,
                    data.startOffset,
                    data.endOffset,
                    data.originalText,
                    translations[i],
                    getBlockGroupId(data.node)
                );
            }

            clearCurrentSelection();
            unlockNodes();
        })
        .catch((error) => {
            loadingSession.cleanup();
            unlockNodes();
            reportTranslationFailure(error, 'Error processing translation response:');
        });
}

// Function to get text nodes in a range
function getTextNodesInRange(range) {
    const textNodes = [];

    // TreeWalker.nextNode() skips the root itself; handle single-text-node case
    const root = range.commonAncestorContainer;
    if (root.nodeType === Node.TEXT_NODE) {
        if (root.textContent.trim() &&
            !(translationButton && translationButton.contains(root.parentNode)) &&
            rangeIntersectsNodeStrict(range, root)) {
            return [root];
        }
        return [];
    }

    const treeWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function (node) {
                // Skip empty nodes and nodes in the button
                if (!node.textContent.trim() ||
                    (translationButton && translationButton.contains(node.parentNode))) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = treeWalker.nextNode()) {
        if (rangeIntersectsNodeStrict(range, node)) {
            textNodes.push(node);
        }
    }

    return textNodes;
}

// Loading indicator anchored to the first visual line of the selection.
function showLoadingNearRange(range) {
    const rect = range.getBoundingClientRect();
    const indicator = document.createElement('div');
    indicator.classList.add('ai-translator-loading-indicator');
    indicator.setAttribute('data-pointer-extension-owned', 'loading');

    const label = document.createElement('span');
    label.textContent = 'Translating';
    indicator.appendChild(label);

    const dots = document.createElement('span');
    dots.className = 'ai-translator-loading-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
    indicator.appendChild(dots);

    // Anchor to the first line's client rect — bounding-box min-x can sit
    // far from the actual visual start of a multi-line selection.
    const rects = range.getClientRects();
    const anchor = (rects && rects.length > 0) ? rects[0] : rect;
    indicator.style.left = `${window.scrollX + anchor.left}px`;
    indicator.style.top = `${window.scrollY + anchor.top - 24}px`;
    document.body.appendChild(indicator);
    return indicator;
}

function hideLoading(indicator) {
    if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
    }
}

function createLoadingController(range) {
    let indicator = null;
    let pendingCount = 0;

    const ensureIndicator = () => {
        if (!indicator) {
            indicator = showLoadingNearRange(range);
        }
    };

    return {
        get indicator() {
            return indicator;
        },
        acquire() {
            ensureIndicator();
            pendingCount++;
        },
        release() {
            if (pendingCount > 0) {
                pendingCount--;
            }
            if (pendingCount === 0 && indicator) {
                hideLoading(indicator);
                indicator = null;
            }
        },
        cancel() {
            pendingCount = 0;
            if (indicator) {
                hideLoading(indicator);
                indicator = null;
            }
        }
    };
}

// 失效错误特征：仅 context invalidated（扩展被重载/卸载）。
// 注意 "message port closed" 不算失效 —— MV3 后台 worker 被杀/重启时
// 也会单方面关闭端口，此时上下文依然有效，按普通请求失败处理即可。
function isContextInvalidationError(message) {
    return typeof message === 'string' &&
        message.includes('Extension context invalidated');
}

let contextInvalidationHandled = false;

function onExtensionContextInvalidated() {
    if (contextInvalidationHandled) return;

    // 误报保险：runtime.id 仍可访问说明上下文还活着（比如 worker 被杀
    // 导致的临时错误被误判），此时绝不能拆掉整套 UI
    try {
        if (chrome.runtime && chrome.runtime.id) return;
    } catch (e) {
        // 访问抛错 = 上下文确实已失效，继续清理
    }

    contextInvalidationHandled = true;

    // Remove UI elements that depend on Chrome API
    if (translationButton && translationButton.parentNode) {
        translationButton.parentNode.removeChild(translationButton);
    }
    if (aiTranslatorContainer && aiTranslatorContainer.parentNode) {
        aiTranslatorContainer.parentNode.removeChild(aiTranslatorContainer);
    }
    if (pageStyleElement && pageStyleElement.parentNode) {
        pageStyleElement.parentNode.removeChild(pageStyleElement);
    }

    // Remove event listeners
    document.removeEventListener('mouseup', handleTextSelection);

    console.warn('Extension context invalidated. The extension might have been updated, reloaded or uninstalled.');

    showTranslatorToast('Extension context changed. Please refresh the page.');
}

// Handle extension context invalidation
function handleExtensionContextInvalidation() {
    window.addEventListener('error', function (event) {
        if (event.error && event.error.message &&
            event.error.message.includes('Extension context invalidated')) {
            onExtensionContextInvalidated();
        }
    });

    // 异步链路里的失效多以 rejection 形式出现，error 事件接不到
    window.addEventListener('unhandledrejection', function (event) {
        const message = event.reason && event.reason.message;
        if (isContextInvalidationError(message)) {
            onExtensionContextInvalidated();
        }
    });
}

// Initialize the extension when the page is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        initializeExtension();
        handleExtensionContextInvalidation();
    });
} else {
    initializeExtension();
    handleExtensionContextInvalidation();
}

// Polyfill for Range.intersectsNode if not available
if (!Range.prototype.intersectsNode) {
    Range.prototype.intersectsNode = function (node) {
        if (!node || !node.nodeType) return false;

        try {
            // Create a range for the node
            const nodeRange = document.createRange();

            if (node.nodeType === Node.TEXT_NODE) {
                nodeRange.selectNodeContents(node);
            } else {
                nodeRange.selectNode(node);
            }

            // Check if ranges intersect (neither ends before the other starts)
            return (
                this.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0 &&
                this.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0
            );
        } catch (e) {
            console.error("Error in intersectsNode polyfill:", e);
            return false;
        }
    };
}

// ──────────────────────────────────────────────────────────────────
// DOM Apply
// ──────────────────────────────────────────────────────────────────

// Add the toggle translation function
function toggleTranslation(event) {
    const span = event.currentTarget;
    if (!ownedTranslatedNodes.has(span)) {
        return;
    }

    const state = translatedNodeState.get(span);
    if (!state) return;

    const groupId = state.groupId;
    const targetStateIsOriginal = !state.showingOriginal;
    const candidates = groupId
        ? getConnectedOwnedTranslatedNodes()
            .filter((node) => translatedNodeState.get(node)?.groupId === groupId)
        : [span];

    candidates.forEach(node => {
        const nodeState = translatedNodeState.get(node);
        if (!nodeState) return;

        if (targetStateIsOriginal) {
            node.textContent = nodeState.originalText;
            nodeState.showingOriginal = true;
            node.classList.remove('ai-translator-highlight');
            node.classList.add('ai-translator-original');
        } else {
            node.textContent = nodeState.translatedText;
            nodeState.showingOriginal = false;
            node.classList.add('ai-translator-highlight');
            node.classList.remove('ai-translator-original');
        }
    });
}

// 修改创建翻译span的函数，确保事件处理正确
function createTranslatedSpan(translatedText, originalText, groupId) {
    const span = document.createElement('span');
    span.classList.add('ai-translator-highlight');
    span.setAttribute('data-pointer-extension-owned', 'translation');
    // Preserve whitespace and formatting
    span.style.whiteSpace = 'pre-wrap';
    span.style.display = 'inline';
    span.textContent = translatedText;
    ownedTranslatedNodes.add(span);
    translatedNodeState.set(span, {
        originalText,
        translatedText,
        showingOriginal: false,
        groupId: groupId || null
    });

    let isMouseDown = false;
    let startX = 0;
    let startY = 0;

    // 鼠标按下时记录状态和位置
    span.addEventListener('mousedown', function (e) {
        if (!e.isTrusted || e.button !== 0) return; // 只处理真实左键
        isMouseDown = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    // 鼠标释放时检查是否应该触发切换
    span.addEventListener('mouseup', function (e) {
        if (!e.isTrusted) return;
        if (!isMouseDown) return;

        // 检查鼠标是否移动（允许小范围抖动）
        const moveDistance = Math.sqrt(
            Math.pow(e.clientX - startX, 2) +
            Math.pow(e.clientY - startY, 2)
        );

        // 如果鼠标基本没有移动，且没有选中文本，则视为点击
        if (moveDistance < 5 && !window.getSelection().toString().trim()) {
            toggleTranslation({ currentTarget: this });
        }

        isMouseDown = false;
    });

    // 鼠标离开元素时重置状态
    span.addEventListener('mouseleave', function () {
        isMouseDown = false;
    });

    // 添加标题提示
    span.title = toggleTooltipText;
    return span;
}

// Fetch the localized toggle tooltip once and retitle any spans already on the
// page. Called at startup and whenever the interface language changes; a
// failure leaves the English default in place rather than blanking the tooltip.
async function refreshToggleTooltipText() {
    const text = await requestLocalizedText('tooltipToggleTranslation');
    const resolved = text || DEFAULT_TOGGLE_TOOLTIP;
    if (resolved === toggleTooltipText) return;
    toggleTooltipText = resolved;
    getConnectedOwnedTranslatedNodes().forEach((span) => {
        span.title = toggleTooltipText;
    });
}

// Add functions: clear all translations and handle long press action
function clearAllTranslations() {
    // 先推进纪元：清除后才返回的在途请求一律丢弃
    translationEpoch++;

    const spans = getConnectedOwnedTranslatedNodes();
    if (!spans.length) {
        groupedBlockElements.forEach((element) => blockGroupIds.delete(element));
        groupedBlockElements.clear();
        return;
    }

    const parentsToNormalize = new Set();

    spans.forEach(span => {
        if (!span) {
            return;
        }

        const restoredNode = replaceTranslatedNodeWithOriginal(span);
        if (restoredNode && restoredNode.parentNode) {
            parentsToNormalize.add(restoredNode.parentNode);
        }
    });

    parentsToNormalize.forEach(parent => {
        if (parent && typeof parent.normalize === 'function') {
            parent.normalize();
        }
    });

    // 译文全部还原后，块级元素上的分组标记也一并撤掉，不在页面 DOM 留痕
    groupedBlockElements.forEach((element) => blockGroupIds.delete(element));
    groupedBlockElements.clear();
}

function handleLongPress() {
    // mark that long press happened
    longPressTriggered = true;
    // 进入 busy：图标淡出，环沿 1s 匀速填满（CSS 驱动）
    translationButton.classList.add('long-pressing', 'long-press-active');
    // 按满整圈（1s）才执行清除；提前松手/离开由 cancelLongPress() 撤销
    longPressClearTimer = setTimeout(() => {
        longPressClearTimer = null;
        clearAllTranslations();
        const checkLayer = aiTranslatorShadow.querySelector('#ai-translator-check');
        if (checkLayer) {
            checkLayer.classList.add('show');
            // 勾号亮相 ~500ms 后开始退场
            setTimeout(() => {
                checkLayer.classList.remove('show');
                // 等勾号淡出（~200ms）再清 busy，避免图标/环和勾号同框
                setTimeout(() => {
                    translationButton.classList.remove('long-press-active', 'long-pressing');
                }, 200);
            }, 500);
        } else {
            translationButton.classList.remove('long-press-active', 'long-pressing');
        }
    }, 1000); // ring fill duration
}

// 取消长按：既停掉 350ms 的触发定时器，也停掉环填满前的清除定时器。
// 只有清除尚未执行（longPressClearTimer 还在）时才复位视觉，
// 避免打断已经在播的勾号确认动画；进度环靠 base 0s transition 瞬间归零。
function cancelLongPress() {
    clearTimeout(longPressTimer);
    if (longPressClearTimer) {
        clearTimeout(longPressClearTimer);
        longPressClearTimer = null;
        if (translationButton) {
            translationButton.classList.remove('long-press-active', 'long-pressing');
        }
    }
}

// Toggle button visibility
function toggleButtonVisibility(show) {
    showButton = show;

    if (show && !translationButton.parentNode) {
        // 走 CSS 加载门挂载，避免首帧无样式 transition 造成的假激活闪烁
        attachButtonWhenStyled();
        // When showing the button, keep default translation mode (do not activate)
    } else if (!show && translationButton.parentNode) {
        aiTranslatorShadow.removeChild(translationButton);
        // If hiding the button, also deactivate translation mode if active
        if (isActive) {
            deactivateTranslationMode();
            if (isChromeAPIAvailable()) {
                void Settings.setSync({ isActive: false });
            }
        }
    }
}

// ──────────────────────────────────────────────────────────────────
// Theme / Adaptive FAB
// ──────────────────────────────────────────────────────────────────

// Apply button size to the translation button
function applyButtonSize(size) {
    if (!translationButton || !aiTranslatorShadow) return;

    // Apply size to the button
    translationButton.style.width = `${size}px`;
    translationButton.style.height = `${size}px`;

    // Scale the icon based on button size
    const iconElement = translationButton.querySelector('#ai-translator-icon');
    if (iconElement) {
        const iconSize = Math.max(Math.floor(size / 2), 16);
        iconElement.style.width = `${iconSize}px`;
        iconElement.style.height = `${iconSize}px`;
        iconElement.style.fontSize = `${Math.max(Math.floor(iconSize * 0.8), 14)}px`;
    }

    // ring / check 用 SVG viewBox + % 宽高，随容器自动缩放，不需要动态样式
}

// "硝子厚度" 滑块 —— 在 0–100 之间插值 CSS 变量，让玻璃从「薄」过渡到「厚」
// 0 = 当前的薄玻璃（默认），100 = 硝子・厚 设计（更不透明、更重的阴影、更厚的边框）
// 设计说明：dark mode 用不同的插值范围（黑色背景上 alpha 需要不同的曲线）
function applyButtonThickness(value) {
    buttonThickness = value;
    if (!translationButton) return;

    const t = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
    const s = translationButton.style;

    // List of all vars that get controlled (used both for set and clear)
    const VARS = [
        '--glass-bg-a', '--glass-border-w', '--glass-border-a',
        '--glass-sh1-blur', '--glass-sh1-a',
        '--glass-sh2-y', '--glass-sh2-blur', '--glass-sh2-a',
        '--glass-inset-a'
    ];

    if (t === 0) {
        // 滑块在 0：清空所有内联变量，让自适应层（HSP 采样）重新铺 α 基线
        VARS.forEach(p => s.removeProperty(p));
        if (typeof applyAdaptiveFAB === 'function') applyAdaptiveFAB();
        return;
    }

    const lerp = (a, b) => a + (b - a) * t;
    const isDark = window.matchMedia
        && window.matchMedia('(prefers-color-scheme: dark)').matches;

    // 尺寸值（边框宽度、阴影模糊、阴影偏移）—— 浅深色一致
    s.setProperty('--glass-border-w', `${lerp(1, 1.6).toFixed(2)}px`);
    s.setProperty('--glass-sh1-blur', `${lerp(4, 10).toFixed(1)}px`);
    s.setProperty('--glass-sh2-blur', `${lerp(8, 20).toFixed(1)}px`);
    s.setProperty('--glass-sh2-y', `${lerp(2, 5).toFixed(1)}px`);

    if (isDark) {
        // Dark mode: 起点再次抬高 —— 在 SuperGrok 那种深色 banner 上也读得出状态
        s.setProperty('--glass-bg-a', lerp(0.38, 0.56).toFixed(3));
        s.setProperty('--glass-border-a', lerp(0.52, 0.68).toFixed(3));
        s.setProperty('--glass-sh1-a', lerp(0.35, 0.55).toFixed(3));
        s.setProperty('--glass-sh2-a', lerp(0.18, 0.32).toFixed(3));
        s.setProperty('--glass-inset-a', lerp(0.48, 0.62).toFixed(3));
    } else {
        // Light mode: 从薄玻璃 0.42（= theme.css --glass-chip）→ 厚玻璃 0.62
        s.setProperty('--glass-bg-a', lerp(0.42, 0.62).toFixed(3));
        s.setProperty('--glass-border-a', lerp(0.4, 0.55).toFixed(3));
        s.setProperty('--glass-sh1-a', lerp(0.03, 0.08).toFixed(3));
        s.setProperty('--glass-sh2-a', lerp(0.02, 0.05).toFixed(3));
        s.setProperty('--glass-inset-a', lerp(0.55, 0.65).toFixed(3));
    }
}

// 当 OS 主题在 light/dark 之间切换时，重新应用插值（不同 mode 的 alpha 范围不一样）
try {
    if (window.matchMedia) {
        const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            applyButtonThickness(buttonThickness);
            if (typeof applyAdaptiveFAB === 'function') applyAdaptiveFAB();
        };
        if (darkQuery.addEventListener) {
            darkQuery.addEventListener('change', onChange);
        } else if (darkQuery.addListener) {
            darkQuery.addListener(onChange); // older Safari
        }
    }
} catch (e) { /* matchMedia not available */ }

// ──────────────────────────────────────────────────────────────────
// Adaptive ambient sampling — HSP 亮度替代 OS 主题判断
// 只做三件事：HSP 采样、暖底补偿、墨色翻转
// 其它参数（frost/edge/inset 插值范围、voidBoost 等）沿用同一套硝子自适应基线
// ──────────────────────────────────────────────────────────────────

// HSP luminance — sqrt(0.299 r² + 0.587 g² + 0.114 b²)，感知上比 WCAG 更接近人眼
function _lumHSP(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    return Math.sqrt(0.299 * rn * rn + 0.587 * gn * gn + 0.114 * bn * bn);
}
function _rgb2hs(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return [0, 0];
    const d = max - min;
    const l = (max + min) / 2;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    return [h * 60, s];
}
const _clamp01 = v => Math.max(0, Math.min(1, v));
const _lerp    = (a, b, t) => a + (b - a) * t;
const _smooth  = t => t * t * (3 - 2 * t);

function _parseBg(css) {
    if (!css) return null;
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(v => parseFloat(v.trim()));
    if (parts.length < 3) return null;
    const a = parts[3] !== undefined ? parts[3] : 1;
    return [parts[0], parts[1], parts[2], a];
}

// 走 elementsFromPoint 找 FAB 正中点下第一层不透明的背景
function _sampleAmbientBehindFAB() {
    if (!translationButton) return null;
    const rect = translationButton.getBoundingClientRect();
    if (!rect.width) return null;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const els = document.elementsFromPoint(cx, cy);
    for (const el of els) {
        if (!el || !el.id && !el.closest) continue;
        if (el === aiTranslatorContainer) continue;
        const bg = window.getComputedStyle(el).backgroundColor;
        const rgba = _parseBg(bg);
        if (rgba && rgba[3] > 0.5) return [rgba[0], rgba[1], rgba[2]];
    }
    // 回退：body 背景
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const rgba = _parseBg(bodyBg);
    if (rgba && rgba[3] > 0.3) return [rgba[0], rgba[1], rgba[2]];
    // 最后回退：OS 主题
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? [24, 24, 24] : [253, 252, 248];
}

function _computeAdaptiveTokens(r, g, b) {
    const Y = _lumHSP(r, g, b);
    const [h, s] = _rgb2hs(r, g, b);
    const voidBoost = _smooth(_clamp01((0.08 - Y) / 0.08)) * 0.06;

    // ── 硝子配方：α 沿 Y 连续插值 ───────────────────────────────
    // 3 个锚点通过 piecewise smoothstep 连成一条连续曲线：Y=0 纯黑
    // (薄炭) / Y=0.45 中灰(中厚) / Y=1 纯白(微厚)。跨过中点时材质
    // 不会跳变，CSS transition 只负责视觉过渡，不负责掩盖数值断层。
    const tDark  = _smooth(_clamp01(Y / 0.45));          // 0 at Y=0, 1 at Y=0.45
    const tLight = _smooth(_clamp01((Y - 0.45) / 0.55)); // 0 at Y=0.45, 1 at Y=1
    const lerp3 = (lo, mid, hi) =>
        Y <= 0.45 ? _lerp(lo, mid, tDark) : _lerp(mid, hi, tLight);

    // frostA（玻璃本体 α）：暗端 0.12 薄炭 ←→ 中 0.30 中厚 ←→ 亮端 0.42 温柔白雾
    // 亮端 0.42 = theme.css 的 --glass-chip —— 白纸上的球和 popup 的字段
    // 是同一厚度的同一块玻璃，这是"统一"最实在的一条
    const frostA = lerp3(0.12, 0.30, 0.42) + voidBoost;
    // edgeA（白 rim 边 α）：暗端 0.08 几乎不见 ←→ 中 0.22 ←→ 亮端 0.40 清透
    const edgeA  = lerp3(0.08, 0.22, 0.40) + voidBoost * 0.6;
    // insetA（1px 顶沿 specular）：暗端 0.18 细光 ←→ 中 0.30 ←→ 亮端 0.50
    const insetA = lerp3(0.18, 0.30, 0.50);
    // dragA（拖拽时 α 抬高补偿 backdrop 对比失效）：暗端 0.22 ←→ 中 0.36 ←→ 亮端 0.55
    const dragA  = lerp3(0.22, 0.36, 0.55);

    // 暖底补偿：底色偏暖橙时把 frost RGB 推到 253,254,255（视觉几乎一致，
    // 语义上声明 frost 不跟着底色一起漂暖）
    let fr = 255, fg = 255, fb = 255;
    if (Y > 0.3) {
        const hueDist = Math.min(Math.abs(h - 30), 360 - Math.abs(h - 30));
        const warm = _smooth(_clamp01((60 - hueDist) / 60)) * s;
        if (warm > 0.25) { fr = 253; fg = 254; fb = 255; }
    }

    // ── ink / rim：在 Y=0.35–0.55 内连续换色 ───────────────────
    // band 外锁定在 sumi / gofun 两端纯色，band 内平滑混色。band 足够窄
    // (Δ=0.20)，绝大多数页面仍落在一个明确端点，中灰只作为切换过场。
    const tInk = _smooth(_clamp01((Y - 0.35) / 0.20)); // 0 at Y≤0.35, 1 at Y≥0.55
    const ir = Math.round(_lerp(230, 62, tInk));
    const ig = Math.round(_lerp(226, 58, tInk));
    const ib = Math.round(_lerp(221, 54, tInk));
    // α：底色越远离中灰，对比越足，α 可以相对收；中间带 α 抬高保可读
    // Y=0 (gofun/black) 0.88 → Y=0.45 0.82 → Y=1 (sumi/white) 0.60
    const ia = _lerp(0.88, 0.60, _smooth(Y));

    // ── 激活信号：濃墨，跟着纸翻 ────────────────────────────────────
    // 信号色 = 濃墨（--accent-rgb，theme.css），比正文墨深一档。整个扩展
    // 只有浓淡、没有色相；唯一的颜色是 --alert 那支朱，只画报错。因此信号
    // 也必须随页面明暗翻转，不能用一个固定的中明度彩色值代替。
    //
    // 代价在这里：墨是靠"离纸多远"定义的，白纸上是黑、黑页上必须是白，
    // 没法一个值跨明暗。theme.css 的 @media 只知道系统偏好，而 FAB 贴在
    // 别人家页面上 —— 系统深色、站点白底是极常见的组合。所以这里按 HSP
    // 采样的实际底色翻，和图标那支墨共用同一条 tInk 过渡带。
    //
    // 浓度随环境走的理由是物理的：暗底上玻璃更薄、落影更黑，同样一笔要
    // 重一档才"落得实"。两端的 α 都比彩色信号需要的低 —— 纯度没了，明度
    // 差在替它发力，同样的 α 墨看上去重得多。
    // signalA（边沿 α）：Y=0 暗底 0.72 → Y=1 亮底 0.42
    // glowA  （辉光 α）：Y=0 暗底 0.20 → Y=1 亮底 0.10
    //   —— 亮底上这层不再是"辉光"而是滲み：墨洇进纸里的那圈晕。
    const tSig    = _smooth(Y);
    const signalA = _lerp(0.72, 0.42, tSig);
    const glowA   = _lerp(0.20, 0.10, tSig);

    // 色相跟着纸走：亮底 濃墨 31,28,25 ←→ 暗底 胡粉 245,242,237。
    // 复用上面那条 tInk（Y=0.35–0.55 的过渡带），所以激活边沿和图标的墨
    // 是同一时刻、同一速度翻的 —— 球上永远只有一支墨，不会出现"字翻了
    // 边没翻"的半拍。两端比 ink 各深/亮一档，这一档就是"这在生效"。
    const ar = Math.round(_lerp(245, 31, tInk));
    const ag = Math.round(_lerp(242, 28, tInk));
    const ab = Math.round(_lerp(237, 25, tInk));

    return {
        frostRgb: [fr, fg, fb], frostA, edgeA, insetA, dragA,
        ink: [ir, ig, ib, ia],
        signalRgb: [ar, ag, ab],
        signalA, glowA,
    };
}

function applyAdaptiveFAB() {
    if (!translationButton) return;
    const sample = _sampleAmbientBehindFAB();
    if (!sample) return;
    const [r, g, b] = sample;
    const t = _computeAdaptiveTokens(r, g, b);
    const s = translationButton.style;

    // frost RGB（暖底补偿）— 始终写入
    s.setProperty('--glass-bg-rgb', `${t.frostRgb[0]}, ${t.frostRgb[1]}, ${t.frostRgb[2]}`);

    // α 曲线 — 只有 thickness 滑块未在拨时才写，避免和厚度逻辑打架
    if ((buttonThickness || 0) === 0) {
        s.setProperty('--glass-bg-a',     t.frostA.toFixed(3));
        s.setProperty('--glass-border-a', t.edgeA.toFixed(3));
        s.setProperty('--glass-inset-a', t.insetA.toFixed(3));
    }

    // 拖拽时的本体 α —— 亮底 0.55（玻璃更显），暗底 0.18–0.26（薄一档、不发白）
    s.setProperty('--glass-drag-a', t.dragA.toFixed(3));

    // 墨色翻转 — 通过 CSS 变量写入，不破坏 .active 规则的高特指度
    s.setProperty('--ink-color', `rgba(${t.ink[0]}, ${t.ink[1]}, ${t.ink[2]}, ${t.ink[3].toFixed(3)})`);

    // 激活信号浓度 — 墨色由上面的 signalRgb 跟着纸翻，这里只调 α。
    // 始终写入；未激活时 halo opacity=0、边沿仍是白鳞，变量不影响观感。
    // 一旦 .active 打开，边沿和辉光立刻以当前环境的浓度出现。
    s.setProperty('--fab-accent-rgb',
        `${t.signalRgb[0]}, ${t.signalRgb[1]}, ${t.signalRgb[2]}`);
    s.setProperty('--fab-signal-a', t.signalA.toFixed(3));
    s.setProperty('--fab-glow-a', t.glowA.toFixed(3));
}

// SPA 整体重建 body 会把宿主容器（连同 shadow 里的 FAB）和页面级样式一起带走；
// 借 scroll/resize 的采样时机做自愈，不再另开 MutationObserver
function ensureUiStillMounted() {
    if (!document.body) return;

    if (aiTranslatorContainer && !aiTranslatorContainer.isConnected) {
        // shadow root 跟随宿主元素，重挂宿主即恢复整棵 UI 树
        document.body.appendChild(aiTranslatorContainer);
        if (showButton && translationButton && !translationButton.isConnected) {
            attachButtonWhenStyled();
        }
    }

    if (pageCssText && document.head && (!pageStyleElement || !pageStyleElement.isConnected)) {
        if (!pageStyleElement) {
            pageStyleElement = document.createElement('style');
            pageStyleElement.setAttribute('data-pointer-extension-style', 'true');
            pageStyleElement.textContent = pageCssText;
        }
        document.head.appendChild(pageStyleElement);
    }
}

// RAF 合帧：滚动高频事件不会多次 sample
let _adaptiveRaf = null;
function _scheduleAdaptive() {
    if (_adaptiveRaf) return;
    _adaptiveRaf = requestAnimationFrame(() => {
        _adaptiveRaf = null;
        ensureUiStillMounted();
        applyAdaptiveFAB();
    });
}
// 页面切主题触发：不仅立刻跑一次，还要在 150/400/800ms 再采几次，
// 以追上页面自己的 bg transition（getComputedStyle 返回被 CSS transition 插值后的
// used value，多次采样能让 FAB 的 α/ink 跟着页面底色一起逐帧滑过去，
// 而不是"瞬跳到新 token 等页面慢慢跟上"）。
const _adaptiveThemeTimers = [];
function _scheduleAdaptiveTheme() {
    _scheduleAdaptive();
    // 清掉上一轮还没跑的 timer 避免叠加
    while (_adaptiveThemeTimers.length) clearTimeout(_adaptiveThemeTimers.pop());
    _adaptiveThemeTimers.push(setTimeout(_scheduleAdaptive, 150));
    _adaptiveThemeTimers.push(setTimeout(_scheduleAdaptive, 400));
    _adaptiveThemeTimers.push(setTimeout(_scheduleAdaptive, 800));
}
window.addEventListener('scroll', _scheduleAdaptive, { passive: true });
window.addEventListener('resize', _scheduleAdaptive);
window.addEventListener('resize', keepCustomButtonInViewport);
// 初次进入：轮询到 button 挂到 shadow DOM 再跑（chrome.storage 链是异步的）
(function _initAdaptiveWhenReady() {
    let tries = 0;
    const tick = () => {
        if (translationButton && translationButton.isConnected) {
            applyAdaptiveFAB();
            return;
        }
        if (++tries < 30) setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
})();

// ──────────────────────────────────────────────────────────────────
// Toolbar icon adaptive switching
// 系统/浏览器主题深色 OR 网页背景深色 → 通知后台切白图(per-tab)
// ──────────────────────────────────────────────────────────────────
let _lastIconScheme = null;

function _detectIconScheme() {
    const sysDark = window.matchMedia
        && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (sysDark) return 'dark';

    const targets = [document.documentElement, document.body].filter(Boolean);
    for (const el of targets) {
        const cs = window.getComputedStyle(el);
        const rgba = _parseBg(cs.backgroundColor);
        if (rgba && rgba[3] > 0.5) {
            const Y = _lumHSP(rgba[0], rgba[1], rgba[2]);
            return Y < 0.45 ? 'dark' : 'light';
        }
    }
    return 'light';
}

function _syncToolbarIcon() {
    const scheme = _detectIconScheme();
    if (scheme === _lastIconScheme) return;
    _lastIconScheme = scheme;
    try {
        chrome.runtime.sendMessage({ action: 'setIconScheme', scheme }, () => {
            // 后台对该消息不回包，"message port closed" 属正常；只有真失效才清理
            const lastError = chrome.runtime.lastError;
            if (lastError && lastError.message &&
                lastError.message.includes('Extension context invalidated')) {
                onExtensionContextInvalidated();
            }
        });
    } catch (e) { /* extension context invalidated on reload */ }
}

let _iconSyncRaf = null;
function _scheduleIconSync() {
    if (_iconSyncRaf) return;
    _iconSyncRaf = requestAnimationFrame(() => {
        _iconSyncRaf = null;
        _syncToolbarIcon();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _syncToolbarIcon, { once: true });
} else {
    _syncToolbarIcon();
}

try {
    if (window.matchMedia) {
        const dq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            _scheduleIconSync();
            // OS 主题翻转也要驱动 FAB 重采 —— 很多站点跟随 OS，
            // 不一定改 class/data-theme（纯 @media 驱动），MutationObserver 抓不到
            _scheduleAdaptiveTheme();
        };
        if (dq.addEventListener) dq.addEventListener('change', onChange);
        else if (dq.addListener) dq.addListener(onChange);
    }
} catch (e) { /* matchMedia unavailable */ }

try {
    // 一个观察者，两个回调：toolbar 图标方案 + FAB 自适应 token
    // 主流站点（GitHub data-color-mode、Reddit class、Twitter 配色属性）切主题
    // 都会改 html/body 的 class 或 data-*，一条事件双路驱动最省事
    const obs = new MutationObserver(() => {
        _scheduleIconSync();
        _scheduleAdaptiveTheme();
    });
    const startObserve = () => {
        if (document.documentElement) {
            obs.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode', 'data-color-scheme']
            });
        }
        if (document.body) {
            obs.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode', 'data-color-scheme']
            });
        }
    };
    if (document.body) startObserve();
    else document.addEventListener('DOMContentLoaded', startObserve, { once: true });
} catch (e) { /* MutationObserver unavailable */ }
