// Global variables
let isActive = false;
let targetLang = 'zh';
let apiKey = '';
let translationButton;
let isDragging = false;
let startX, startY, buttonStartX, buttonStartY;
let longPressTimer;
let longPressTriggered = false;
let pressStartTime = 0;
let dragStartPending = false;
let buttonMoved = false;
let showButton = true;
let buttonSize = 64; // Default button size
const BLOCK_LEVEL_SELECTOR = 'p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, div, section, article';

// Shadow DOM container and root for translation UI
let aiTranslatorContainer;
let aiTranslatorShadow;

// Function to setup Shadow DOM and load UI styles
function setupShadowDOM() {
    aiTranslatorContainer = document.getElementById('ai-translator-container');
    if (!aiTranslatorContainer) {
        aiTranslatorContainer = document.createElement('div');
        aiTranslatorContainer.id = 'ai-translator-container';
        document.body.appendChild(aiTranslatorContainer);
        aiTranslatorShadow = aiTranslatorContainer.attachShadow({ mode: 'open' });
        // Load UI CSS into Shadow DOM
        const style = document.createElement('style');
        fetch(chrome.runtime.getURL('content.css'))
            .then(response => response.text())
            .then(css => {
                style.textContent = css;
                aiTranslatorShadow.appendChild(style);

                // Also inject translation-related CSS into page DOM
                // so styles apply to translated content outside Shadow DOM
                const pageStyle = document.createElement('style');
                pageStyle.id = 'ai-translator-page-styles';
                pageStyle.textContent = css;
                document.head.appendChild(pageStyle);

                // Static CSS 加载完成后，注入动态 spinner 样式
                applyButtonSize(buttonSize);
            })
            .catch(err => console.error('Failed to load Shadow DOM CSS:', err));
    } else {
        aiTranslatorShadow = aiTranslatorContainer.shadowRoot;
    }
}

// Check if chrome API is available
function isChromeAPIAvailable() {
    return typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.id;
}

// Initialize extension
function initializeExtension() {
    setupShadowDOM();
    // Create the floating translation button
    translationButton = document.createElement('div');
    translationButton.id = 'ai-translator-button';
    translationButton.title = 'AI Translation Mode';

    // Create the icon inside the button
    const buttonIcon = document.createElement('div');
    buttonIcon.id = 'ai-translator-icon';
    buttonIcon.textContent = 'T';
    translationButton.appendChild(buttonIcon);

    // Check if button should be shown
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        chrome.storage.sync.get(['showButton', 'buttonSize'], function (result) {
            try {
                showButton = result.showButton !== undefined ? result.showButton : true;

                // Apply button size if saved
                if (result.buttonSize) {
                    buttonSize = result.buttonSize;
                    applyButtonSize(buttonSize);
                }

                // Position the button according to saved preferences
                chrome.storage.sync.get(['buttonPosition', 'buttonX', 'buttonY'], function (result) {
                    try {
                        positionButton(result.buttonPosition, result.buttonX, result.buttonY);

                        // Only append to DOM if button should be shown
                        if (showButton) {
                            aiTranslatorShadow.appendChild(translationButton);
                        }

                        // Add event listeners for button interactions
                        setupButtonInteractions();
                    } catch (error) {
                        console.error('Error setting up button:', error);
                    }
                });
            } catch (error) {
                console.error('Error checking button visibility:', error);
            }
        });
    } catch (error) {
        console.error('Error initializing button:', error);
        // Default positioning if API fails
        translationButton.style.bottom = '20px';
        translationButton.style.right = '20px';
        aiTranslatorShadow.appendChild(translationButton);
        setupButtonInteractions();
    }

    // Check if translation mode is active
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        chrome.storage.sync.get(['isActive', 'targetLang'], function (result) {
            try {
                isActive = result.isActive || false;
                targetLang = result.targetLang || 'zh';

                if (isActive) {
                    activateTranslationMode();
                }
            } catch (error) {
                console.error('Error activating translation mode:', error);
            }
        });
    } catch (error) {
        console.error('Error checking translation mode status:', error);
    }

    // Listen for messages from popup
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try {
                if (request.action === 'activate') {
                    targetLang = request.targetLang;
                    activateTranslationMode();
                    sendResponse({ success: true });
                } else if (request.action === 'deactivate') {
                    deactivateTranslationMode();
                    sendResponse({ success: true });
                } else if (request.action === 'toggleButtonVisibility') {
                    toggleButtonVisibility(request.showButton);
                    sendResponse({ success: true });
                }
            } catch (error) {
                console.error('Error handling message:', error);
                sendResponse({ error: error.message });
            }
            return true;
        });
    } catch (error) {
        console.error('Error setting up message listener:', error);
    }

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

                // Handle button position changes including drag updates
                if (changes.buttonPosition || changes.buttonX || changes.buttonY) {
                    chrome.storage.sync.get(['buttonPosition', 'buttonX', 'buttonY'], function (result) {
                        positionButton(result.buttonPosition, result.buttonX, result.buttonY);
                    });
                }

                // Handle button visibility changes
                if (changes.showButton !== undefined) {
                    toggleButtonVisibility(changes.showButton.newValue);
                }
            }
        });
    } catch (error) {
        console.error('Error setting up storage change listener:', error);
    }

    // CSS styles are now defined in content.css for better maintainability
}

// Position the button according to preferences
function positionButton(position, customX, customY) {
    // Reset button positioning
    translationButton.style.top = 'auto';
    translationButton.style.right = 'auto';
    translationButton.style.bottom = 'auto';
    translationButton.style.left = 'auto';

    // Apply position based on setting
    if (position === 'custom' && customX !== null && customY !== null) {
        translationButton.style.top = customY + 'px';
        translationButton.style.left = customX + 'px';
    } else {
        switch (position || 'bottom-right') {
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

// Setup button interactions for click and long-press
function setupButtonInteractions() {
    // Click to toggle translation mode (ignored if long-press occurred)
    translationButton.addEventListener('click', function (e) {
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
        pressStartTime = Date.now();
        e.preventDefault();
        longPressTriggered = false;
        buttonMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        buttonStartX = translationButton.offsetLeft;
        buttonStartY = translationButton.offsetTop;
        if (isActive) {
            // Only in translation mode do we clear on long-press
            longPressTimer = setTimeout(() => {
                handleLongPress();
            }, 350); // Long press threshold (350ms)
        } else {
            // In inactive mode, delay dragging until movement threshold
            dragStartPending = true;
        }
    });

    // Cancel long press if released early
    translationButton.addEventListener('mouseup', function (e) {
        clearTimeout(longPressTimer);
    });

    // Handle dragging movement
    document.addEventListener('mousemove', function (e) {
        // If a press is in progress, mark as moved on any movement to prevent toggles
        if (pressStartTime) {
            const dxAny = e.clientX - startX;
            const dyAny = e.clientY - startY;
            if (dxAny !== 0 || dyAny !== 0) {
                buttonMoved = true;
            }
        }
        // If pending drag in inactive mode and moved enough, begin dragging
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
        }
    });

    // Mouseup anywhere to stop dragging
    document.addEventListener('mouseup', function (e) {
        clearTimeout(longPressTimer);
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
    buttonMoved = true;
    isDragging = true;

    // Get the button's current position *before* applying the dragging class
    const rect = translationButton.getBoundingClientRect();

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

    // Save the new position
    const buttonX = translationButton.offsetLeft;
    const buttonY = translationButton.offsetTop;

    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        chrome.storage.sync.set({
            buttonPosition: 'custom',
            buttonX: buttonX,
            buttonY: buttonY
        });
    } catch (error) {
        console.error('Error saving button position:', error);
    }
}

// Toggle translation mode
function toggleTranslationMode() {
    if (isActive) {
        deactivateTranslationMode();
        try {
            if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');
            chrome.storage.sync.set({ isActive: false });
        } catch (error) {
            console.error('Error saving translation mode state:', error);
        }
    } else {
        // Verify API key is set before activating
        try {
            if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

            chrome.storage.sync.get(['apiKey'], function (result) {
                try {
                    if (!result.apiKey) {
                        alert('Please set your API key in the extension settings');
                        // Open options page
                        if (chrome.runtime && chrome.runtime.openOptionsPage) {
                            chrome.runtime.openOptionsPage();
                        }
                        return;
                    }

                    activateTranslationMode();
                    chrome.storage.sync.set({ isActive: true });
                } catch (error) {
                    console.error('Error activating translation mode:', error);
                }
            });
        } catch (error) {
            console.error('Error checking API key:', error);
            alert('Extension context changed. Please refresh the page.');
        }
    }
}

// Activate translation mode
function activateTranslationMode() {
    isActive = true;
    translationButton.classList.add('active');

    // 更新按钮图标文本，表明翻译已开启
    const buttonIcon = aiTranslatorShadow.querySelector('#ai-translator-icon');
    if (buttonIcon) {
        buttonIcon.textContent = 'T';
    }

    document.addEventListener('mouseup', handleTextSelection);
    // 注释掉下面这行，不再高亮元素
    // highlightTranslatableElements();
}

// Deactivate translation mode
function deactivateTranslationMode() {
    isActive = false;
    translationButton.classList.remove('active');

    // 恢复按钮原始图标文本
    const buttonIcon = aiTranslatorShadow.querySelector('#ai-translator-icon');
    if (buttonIcon) {
        buttonIcon.textContent = 'T';
    }

    document.removeEventListener('mouseup', handleTextSelection);
    removeHighlights();
}

// Highlight translatable elements (保留但不再调用)
function highlightTranslatableElements() {
    const textNodes = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, span, div:not(#ai-translator-button)');
    textNodes.forEach(node => {
        if (node.textContent.trim() && !node.classList.contains('ai-translator-highlight')) {
            node.classList.add('ai-translator-target');
        }
    });
}

// Remove highlights
function removeHighlights() {
    document.querySelectorAll('.ai-translator-target').forEach(el => {
        el.classList.remove('ai-translator-target');
    });
}

// Handle text selection (Modified for structure preservation)
function handleTextSelection(event) {
    // Don't process if we're dragging the button
    if (isDragging) return;
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

    const getTranslationSpan = (node) => {
        if (!node) return null;
        if (node.nodeType === Node.ELEMENT_NODE) {
            return node.closest('.ai-translator-highlight, .ai-translator-original');
        }
        return node.parentElement?.closest('.ai-translator-highlight, .ai-translator-original') || null;
    };

    const startSpan = getTranslationSpan(range.startContainer);
    const endSpan = getTranslationSpan(range.endContainer);

    if (startSpan && endSpan && startSpan === endSpan) {
        // Selection fully inside a translated span; keep current display state and do nothing
        return;
    }

    // 检查选择是否完全在已翻译区域内
    const isWithinTranslatedSpan = (node) => {
        const closest = node.nodeType === Node.ELEMENT_NODE ?
            node.closest('.ai-translator-highlight, .ai-translator-original') :
            node.parentElement?.closest('.ai-translator-highlight, .ai-translator-original');
        return closest !== null;
    };

    // 如果选择的开始和结束都在已翻译区域内，仅当完全在单个已翻译节点内时跳过
    if (isWithinTranslatedSpan(range.startContainer) && isWithinTranslatedSpan(range.endContainer)) {
        const spanNodes = findTranslatedNodesInRange(range);
        if (spanNodes.length === 1 && isSelectionContainedInNode(range, spanNodes[0])) {
            console.log("Selection within a single translated node, ignoring translation action");
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

    // 检查当前选区是否与已翻译片段存在交集，如有则直接跳过避免重复翻译
    const translatedNodes = findTranslatedNodesInRange(range);
    if (translatedNodes.length > 0) {
        if (translateMixedSelection(range)) {
            return;
        }
        console.log("AI Translator: Selection intersects existing translation, skipping retranslation.");
        return;
    }

    // 场景 4: 选择区域完全是未翻译的内容，正常进行翻译
    const isSimple = isSimpleTextSelection(range);
    if (isSimple) {
        // 单个文本节点选择，简易翻译
        translateSimpleSelection(range, selectedText);
    } else {
        // 多节点选择，判断是否在同一块级元素内以决定翻译方式
        const startElem = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
        const endElem = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
        const blockSelector = BLOCK_LEVEL_SELECTOR;
        const startBlock = startElem.closest && startElem.closest(blockSelector);
        const endBlock = endElem.closest && endElem.closest(blockSelector);
        if (startBlock && endBlock && startBlock === endBlock) {
            // 同一块级元素内的多节点选区，克隆选区内容并合并为纯文本，然后简易翻译
            const fragment = range.cloneContents();
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(fragment);
            // 无需恢复翻译片段，因为场景4未翻译
            const mergedText = tempDiv.innerText.trim();
            if (mergedText) {
                range.deleteContents();
                const textNode = document.createTextNode(mergedText);
                range.insertNode(textNode);
                const newRange = document.createRange();
                newRange.setStart(textNode, 0);
                newRange.setEnd(textNode, mergedText.length);
                translateSimpleSelection(newRange, mergedText);
            }
        } else {
            // 跨块级元素的多节点选区，使用结构化翻译以保留跨度
            translateStructuredSelection(range);
        }
    }
}

// Find exact match of a selection with an existing translated node
function findExactTranslatedMatch(range) {
    // Create a temporary container to represent the selection
    const fragment = range.cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    const selectedHTML = tempDiv.innerHTML;

    // Get all translated nodes
    const translatedNodes = document.querySelectorAll('.ai-translator-highlight, .ai-translator-original');

    // Find a node that has identical content
    for (const node of translatedNodes) {
        if (node.dataset.originalText === range.toString()) {
            // Check if the selection boundaries match the node boundaries
            const nodeRange = document.createRange();
            nodeRange.selectNode(node);

            if (range.startContainer === nodeRange.startContainer &&
                range.startOffset === nodeRange.startOffset &&
                range.endContainer === nodeRange.endContainer &&
                range.endOffset === nodeRange.endOffset) {
                return node;
            }
        }
    }

    return null;
}

// Find all translated nodes that intersect with the given range
function findTranslatedNodesInRange(range) {
    const translatedNodes = [];
    const allTranslatedNodes = document.querySelectorAll('.ai-translator-highlight, .ai-translator-original');

    for (const node of allTranslatedNodes) {
        if (range.intersectsNode(node)) {
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
    const originalText = node && node.dataset && node.dataset.originalText !== undefined
        ? node.dataset.originalText
        : (node ? node.textContent : '');
    const textNode = document.createTextNode(originalText || '');
    if (node.parentNode) {
        node.parentNode.replaceChild(textNode, node);
        return textNode;
    } else {
        console.warn("AI Translator: Node parent missing when trying to restore original text.", node);
        return null; // Indicate failure
    }
}

// Translate mixed selections containing both original and already translated segments as a single block
function translateMixedSelection(range) {
    const textNodes = getTextNodesInRange(range);
    const hasUntranslated = textNodes.some(node => {
        if (!node || !node.textContent || !node.textContent.trim()) {
            return false;
        }
        const parentElement = node.parentElement;
        return !parentElement || !parentElement.closest('.ai-translator-highlight, .ai-translator-original');
    });

    if (!hasUntranslated) {
        return false;
    }

    const translatedNodes = findTranslatedNodesInRange(range);
    if (!translatedNodes.length) {
        return false;
    }

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

    const startMarker = document.createTextNode('');
    const endMarker = document.createTextNode('');

    const startRange = expandedRange.cloneRange();
    startRange.collapse(true);
    startRange.insertNode(startMarker);

    const endRange = expandedRange.cloneRange();
    endRange.collapse(false);
    endRange.insertNode(endMarker);

    const workingRange = document.createRange();
    workingRange.setStartAfter(startMarker);
    workingRange.setEndBefore(endMarker);

    const spansToRestore = findTranslatedNodesInRange(workingRange);
    spansToRestore.forEach(span => {
        if (span && document.contains(span)) {
            replaceTranslatedNodeWithOriginal(span);
        }
    });

    const finalRange = document.createRange();
    finalRange.setStartAfter(startMarker);
    finalRange.setEndBefore(endMarker);

    const cleanupMarkers = () => {
        if (startMarker.parentNode) {
            startMarker.parentNode.removeChild(startMarker);
        }
        if (endMarker.parentNode) {
            endMarker.parentNode.removeChild(endMarker);
        }
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

    if (blockElements.length > 1) {
        translationHandled = translateRangeByBlocks(finalRange, blockElements);
    } else {
        translationHandled = translateRangeAsSingleBlock(finalRange);
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
    const fragment = range.cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    // Check if any descendant has the highlight class
    return tempDiv.querySelector('.ai-translator-highlight, .ai-translator-original') !== null;
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
        const blockAncestor = parentElement.closest ? parentElement.closest(BLOCK_LEVEL_SELECTOR) : null;
        const resolvedBlock = blockAncestor || parentElement;
        if (resolvedBlock && !seen.has(resolvedBlock)) {
            seen.add(resolvedBlock);
            blocks.push(resolvedBlock);
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
    if (!selectionRange || !blockElement || !selectionRange.intersectsNode(blockElement)) {
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

function translateRangeAsSingleBlock(targetRange, options = {}) {
    if (!targetRange || targetRange.collapsed) {
        return false;
    }

    const fragment = targetRange.cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    const mergedText = tempDiv.innerText !== undefined ? tempDiv.innerText : (tempDiv.textContent || '');

    if (!mergedText.trim()) {
        return false;
    }

    targetRange.deleteContents();
    const placeholderNode = document.createTextNode(mergedText);
    targetRange.insertNode(placeholderNode);

    const normalizedRange = document.createRange();
    normalizedRange.setStart(placeholderNode, 0);
    normalizedRange.setEnd(placeholderNode, mergedText.length);

    try {
        translateSimpleSelection(normalizedRange, mergedText, options);
        return true;
    } catch (error) {
        console.error('AI Translator: Failed to translate block segment.', error);
        return false;
    }
}

function translateRangeByBlocks(selectionRange, blockElements) {
    if (!blockElements || blockElements.length === 0) {
        return false;
    }

    const loadingController = createLoadingController(selectionRange);
    let translatedCount = 0;

    for (const block of blockElements) {
        if (!block || !document.contains(block)) {
            continue;
        }

        const blockRange = createBlockIntersectionRange(selectionRange, block);
        if (!blockRange || blockRange.collapsed) {
            continue;
        }

        const translated = translateRangeAsSingleBlock(blockRange, { loadingController });
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

    const cleanupLoading = () => {
        if (loadingController) {
            loadingController.release();
        } else if (manageLoading) {
            hideLoading(loadingIndicator);
        }
    };

    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        const textNode = range.startContainer;

        // Validate text node before async work
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !document.contains(textNode)) {
            cleanupLoading();
            console.warn("AI Translator: Skipping translation, selection text node invalid before request.");
            return;
        }

        // Prevent re-translating content that already lives inside a translated span
        const parentTranslatedSpan = textNode.parentElement?.closest('.ai-translator-highlight, .ai-translator-original');
        if (parentTranslatedSpan) {
            cleanupLoading();
            console.log("AI Translator: Selection already translated, skipping duplicate translation.");
            return;
        }

        chrome.storage.sync.get(['apiKey'], function (result) {
            apiKey = result.apiKey || '';

            if (!apiKey) {
                cleanupLoading();
                alert('Please set your API key in the extension settings');
                if (chrome.runtime && chrome.runtime.openOptionsPage) {
                    chrome.runtime.openOptionsPage();
                }
                return;
            }

            // --- Store node reference --- 
            // --- Check node existence before sending request --- 
            if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !document.contains(textNode)) {
                cleanupLoading();
                console.warn("AI Translator: Original text node is no longer valid before sending request.");
                return;
            }

            chrome.runtime.sendMessage({
                action: 'translate',
                text: [selectedText],
                targetLang: targetLang
            }, (response) => {
                cleanupLoading();

                try {
                    // --- Check node existence again after response --- 
                    if (!textNode || !document.contains(textNode) || !textNode.parentNode) {
                        console.warn("AI Translator: Original text node or its parent is no longer valid after translation.");
                        return;
                    }

                    if (chrome.runtime.lastError) {
                        throw new Error(chrome.runtime.lastError.message || 'Extension context invalidated');
                    }

                    if (!response || !response.translations || response.translations.length === 0) {
                        throw new Error('No translation received');
                    }

                    if (response.error) {
                        throw new Error(response.error);
                    }

                    const translatedText = response.translations[0];

                    // Preserve original whitespace
                    const originalText = textNode.textContent; // Use the potentially updated text content
                    const startOffset = range.startOffset;
                    const endOffset = range.endOffset;

                    // Store the actual selected text for restoration
                    // Ensure offsets are still valid for the current text node length
                    const validEndOffset = Math.min(endOffset, originalText.length);
                    const validStartOffset = Math.min(startOffset, validEndOffset);
                    const originalSelectedText = originalText.substring(validStartOffset, validEndOffset);

                    // Create a highlighted span with the translated text
                    const span = createTranslatedSpan(translatedText, originalSelectedText);

                    // Split the original text node into three parts:
                    // 1. Text before selection
                    // 2. Translated text (in span)
                    // 3. Text after selection
                    // const textNode = range.startContainer; // Already defined and checked
                    const parentNode = textNode.parentNode; // Already checked

                    // Create text nodes for before and after content
                    const beforeText = originalText.substring(0, validStartOffset);
                    const afterText = originalText.substring(validEndOffset);

                    // Insert the nodes in the correct order
                    if (beforeText) {
                        const beforeNode = document.createTextNode(beforeText);
                        parentNode.insertBefore(beforeNode, textNode);
                    }

                    parentNode.insertBefore(span, textNode);

                    if (afterText) {
                        const afterNode = document.createTextNode(afterText);
                        parentNode.insertBefore(afterNode, textNode);
                    }

                    // Remove the original text node
                    parentNode.removeChild(textNode);

                    // Clear selection
                    window.getSelection().removeAllRanges();

                } catch (error) {
                    console.error('Error processing translation:', error);
                    // Check if the error is the specific one we are trying to fix
                    if (error instanceof TypeError && error.message.includes("reading 'replaceChild'")) {
                        alert(`Translation failed: The page structure changed during translation. Please try again.`);
                    } else {
                        alert(`Translation failed: ${error.message}. Please try again.`);
                    }
                }
            });
        });
    } catch (error) {
        cleanupLoading();
        console.error('Error sending translation request:', error);
        alert('Translation failed: Extension context changed. Please refresh the page.');
    }
}

// Complex translation for structured content (preserves DOM structure)
function translateStructuredSelection(range) {
    const loadingIndicator = showLoadingNearRange(range);

    // 1. Identify all text nodes within the range
    const initialTextNodesInRange = getTextNodesInRange(range);
    const textsToTranslate = [];
    const nodeData = []; // Store node and original text segment

    if (initialTextNodesInRange.length === 0) {
        hideLoading(loadingIndicator);
        console.log("No translatable text found in selection.");
        return;
    }

    // 2. Process each text node to extract the content and store references
    for (let i = 0; i < initialTextNodesInRange.length; i++) {
        const node = initialTextNodesInRange[i];
        let textToAdd = node.textContent;
        let start = 0;
        let end = node.textContent.length;

        // Check if node is still valid before processing
        if (!node || node.nodeType !== Node.TEXT_NODE || !document.contains(node)) {
            console.warn("AI Translator: A text node became invalid during initial processing.", node);
            continue; // Skip this invalid node
        }

        // Handle partial selection in start and end nodes
        if (node === range.startContainer && node.nodeType === Node.TEXT_NODE) {
            start = range.startOffset;
            textToAdd = textToAdd.substring(start);
        }

        if (node === range.endContainer && node.nodeType === Node.TEXT_NODE) {
            end = range.endOffset;
            textToAdd = textToAdd.substring(0, end - start); // Adjust end based on potential start offset change
        }

        // Only add non-empty trimmed text
        if (textToAdd.trim()) {
            textsToTranslate.push(textToAdd);
            nodeData.push({ node: node, originalText: textToAdd, startOffset: start, endOffset: end });
        }
    }

    // If no valid text to translate after processing
    if (textsToTranslate.length === 0 || nodeData.length === 0) {
        hideLoading(loadingIndicator);
        console.log("No valid text to translate in selection after filtering.");
        return;
    }

    // 3. Send texts to background script
    try {
        if (!isChromeAPIAvailable()) throw new Error('Chrome API not available');

        chrome.runtime.sendMessage({
            action: 'translate',
            text: textsToTranslate,
            targetLang: targetLang
        }, (response) => {
            hideLoading(loadingIndicator);
            // 如果任何节点在应用结构化翻译前已失效，则退回简单翻译全范围
            const hasInvalidNode = nodeData.some(data => !data.node || !document.contains(data.node) || !data.node.parentNode);
            if (hasInvalidNode) {
                console.warn('AI Translator: Node invalid before applying structured translation, fallback to simple translation.');
                const fallbackText = range.toString().trim();
                translateSimpleSelection(range, fallbackText);
                return;
            }

            try {
                if (chrome.runtime.lastError) {
                    throw new Error(chrome.runtime.lastError.message || 'Extension context invalidated');
                }

                if (!response) {
                    throw new Error('No response from background script');
                }

                if (response.error) {
                    throw new Error(response.error);
                }

                if (!response.translations || response.translations.length !== nodeData.length) {
                    console.error('Translation count mismatch:',
                        { expected: nodeData.length, received: response.translations ? response.translations.length : 'undefined' },
                        { originalTexts: textsToTranslate, translatedTexts: response.translations });
                    throw new Error('Mismatched translations received');
                }

                // 4. Replace text in original nodes & apply highlighting carefully
                for (let i = 0; i < nodeData.length; i++) {
                    const data = nodeData[i];
                    const node = data.node;
                    const translatedText = response.translations[i];
                    const originalFullText = node.textContent; // Get current text content

                    // --- Check node validity AGAIN before modification --- 
                    if (!node || !document.contains(node) || !node.parentNode) {
                        console.warn("AI Translator: Node or parent invalid before applying translation.", node);
                        continue; // Skip this node
                    }

                    const parentNode = node.parentNode; // We know it exists from the check above

                    // Use stored offsets, but validate against current length
                    const currentLength = originalFullText.length;
                    const startOffset = Math.min(data.startOffset, currentLength);
                    const endOffset = Math.min(data.endOffset, currentLength);
                    const originalSelectedText = originalFullText.substring(startOffset, endOffset);

                    // Preserve whitespace logic (using original selected text's whitespace)
                    const leadingSpace = data.originalText.match(/^\s*/)[0]; // Use original segment's space
                    const trailingSpace = data.originalText.match(/\s*$/)[0]; // Use original segment's space
                    let newTextContent = translatedText.trim();

                    // Create the span for translation
                    const span = createTranslatedSpan(translatedText, originalSelectedText);

                    // Handle the translation replacement based on selection type
                    if (node === range.startContainer && node === range.endContainer) {
                        // Selection within a single node
                        const beforeText = originalFullText.substring(0, startOffset);
                        const afterText = originalFullText.substring(endOffset);

                        if (beforeText) parentNode.insertBefore(document.createTextNode(beforeText), node);
                        parentNode.insertBefore(span, node);
                        if (afterText) parentNode.insertBefore(document.createTextNode(afterText), node);
                        parentNode.removeChild(node);

                    } else if (node === range.startContainer) {
                        // Start node of a multi-node selection
                        const beforeText = originalFullText.substring(0, startOffset);

                        if (beforeText) parentNode.insertBefore(document.createTextNode(beforeText), node);
                        parentNode.insertBefore(span, node);
                        parentNode.removeChild(node); // Remove original node only after insertion

                    } else if (node === range.endContainer) {
                        // End node of a multi-node selection
                        const afterText = originalFullText.substring(endOffset);

                        parentNode.insertBefore(span, node);
                        if (afterText) parentNode.insertBefore(document.createTextNode(afterText), node);
                        parentNode.removeChild(node);

                    } else {
                        // Fully selected node in the middle
                        // Replace the original node with the span
                        parentNode.replaceChild(span, node);
                    }
                }

                // Clear selection
                window.getSelection().removeAllRanges();

            } catch (error) {
                console.error('Error processing translation response:', error);
                // Check if the error is the specific one we are trying to fix
                if (error instanceof TypeError && error.message.includes("reading 'replaceChild'")) {
                    alert(`Translation failed: The page structure changed during translation. Please try again.`);
                } else {
                    alert(`Translation failed: ${error.message}. Extension might need reloading.`);
                }
            }
        });
    } catch (error) {
        hideLoading(loadingIndicator);
        console.error('Error sending translation request:', error);
        alert('Translation failed: Extension context changed. Please refresh the page.');
    }
}

// Function to get text nodes in a range
function getTextNodesInRange(range) {
    const textNodes = [];
    const treeWalker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function (node) {
                // Skip empty nodes and nodes in the button
                if (!node.textContent.trim() ||
                    (node.parentNode && node.parentNode.closest('#ai-translator-button'))) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = treeWalker.nextNode()) {
        if (range.intersectsNode(node)) {
            textNodes.push(node);
        }
    }

    return textNodes;
}

// Helper function to get computed style
function getComputedStyle(element, property) {
    return window.getComputedStyle(element)[property];
}

// Helper functions for loading state (replace with your actual implementation)
function showLoadingNearRange(range) {
    // Create a loading indicator element near the selection
    const rect = range.getBoundingClientRect();
    const indicator = document.createElement('div');
    indicator.textContent = 'Translating';
    // Add CSS class for styling and animation
    indicator.classList.add('ai-translator-loading-indicator');
    // Only set position-related inline styles
    indicator.style.left = `${window.scrollX + rect.left}px`;
    indicator.style.top = `${window.scrollY + rect.top - 35}px`; // Position above
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

// Handle extension context invalidation
function handleExtensionContextInvalidation() {
    window.addEventListener('error', function (event) {
        if (event.error && event.error.message &&
            event.error.message.includes('Extension context invalidated')) {
            // Remove UI elements that depend on Chrome API
            if (translationButton && translationButton.parentNode) {
                translationButton.parentNode.removeChild(translationButton);
            }

            // Remove event listeners
            document.removeEventListener('mouseup', handleTextSelection);
            removeHighlights();

            console.warn('Extension context invalidated. The extension might have been updated, reloaded or uninstalled.');

            // Add a notification to the page
            const notification = document.createElement('div');
            notification.style.position = 'fixed';
            notification.style.bottom = '10px';
            notification.style.left = '10px';
            notification.style.padding = '10px';
            notification.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
            notification.style.color = 'white';
            notification.style.borderRadius = '5px';
            notification.style.zIndex = '10000';
            notification.textContent = 'AI Translator: Extension context changed. Please refresh the page.';
            document.body.appendChild(notification);

            // Auto-remove notification after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
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

// Add the toggle translation function
function toggleTranslation(event) {
    const span = event.currentTarget;
    // If we have the original text stored
    if (span.dataset.originalText) {
        // Check if we're currently showing the translation or the original text
        if (span.dataset.showingOriginal === 'true') {
            // If showing original, switch to translation
            // First save the current translation if not already saved
            if (!span.dataset.translatedText) {
                span.dataset.translatedText = span.textContent;
            }
            span.textContent = span.dataset.translatedText;
            span.dataset.showingOriginal = 'false';
            span.classList.add('ai-translator-highlight');
            span.classList.remove('ai-translator-original');
        } else {
            // If showing translation, switch to original
            // Save the translation text if not already saved
            if (!span.dataset.translatedText) {
                span.dataset.translatedText = span.textContent;
            }
            span.textContent = span.dataset.originalText;
            span.dataset.showingOriginal = 'true';
            span.classList.remove('ai-translator-highlight');
            span.classList.add('ai-translator-original');
        }
    }
}

// 修改创建翻译span的函数，确保事件处理正确
function createTranslatedSpan(translatedText, originalText) {
    const span = document.createElement('span');
    span.classList.add('ai-translator-highlight');
    // Preserve whitespace and formatting
    span.style.whiteSpace = 'pre-wrap';
    span.style.display = 'inline';
    span.dataset.originalText = originalText;
    span.textContent = translatedText;

    let isMouseDown = false;
    let startX = 0;
    let startY = 0;

    // 鼠标按下时记录状态和位置
    span.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return; // 只处理左键
        isMouseDown = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    // 鼠标释放时检查是否应该触发切换
    span.addEventListener('mouseup', function (e) {
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
    span.title = "点击切换原文/译文";
    return span;
}

// Add functions: clear all translations and handle long press action
function clearAllTranslations() {
    const spans = document.querySelectorAll('.ai-translator-highlight, .ai-translator-original');
    if (!spans.length) {
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
}

function handleLongPress() {
    // mark that long press happened
    longPressTriggered = true;
    // Show spinner and start fade animation
    translationButton.classList.add('long-pressing', 'long-press-active');
    // After animation (1s), perform clear and show check
    setTimeout(() => {
        // Clear all translations (keep mode state)
        clearAllTranslations();
        // Feedback: show check icon
        const icon = aiTranslatorShadow.querySelector('#ai-translator-icon');
        if (icon) {
            const prevText = icon.textContent;
            icon.textContent = '✓';
            icon.style.color = 'white'; // Set checkmark color to white
            // Keep check for a moment
            setTimeout(() => {
                icon.textContent = prevText;
                icon.style.color = ''; // Reset color to default
                // remove animation classes
                translationButton.classList.remove('long-press-active', 'long-pressing');
            }, 500);
        } else {
            // remove animation classes
            translationButton.classList.remove('long-press-active', 'long-pressing');
        }
    }, 1000); // wait for fade animation
}

// Toggle button visibility
function toggleButtonVisibility(show) {
    showButton = show;

    if (show && !translationButton.parentNode) {
        aiTranslatorShadow.appendChild(translationButton);
        // When showing the button, keep default translation mode (do not activate)
    } else if (!show && translationButton.parentNode) {
        aiTranslatorShadow.removeChild(translationButton);
        // If hiding the button, also deactivate translation mode if active
        if (isActive) {
            deactivateTranslationMode();
            if (isChromeAPIAvailable()) {
                chrome.storage.sync.set({ isActive: false });
            }
        }
    }
}

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

    // Dynamic spinner style in Shadow DOM
    let styleElement = aiTranslatorShadow.querySelector('#ai-translator-dynamic-style');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'ai-translator-dynamic-style';
        aiTranslatorShadow.appendChild(styleElement);
    }

    // Calculate spinner parameters based on button size
    const spinnerSize = Math.max(Math.floor(size * 0.66), 30);
    const spinnerBorderWidth = Math.max(Math.floor(size * 0.05), 3);

    // 更新 spinner 动画位置和大小，确保居中，并覆盖 transform-origin
    styleElement.textContent = `
        /* 缩放时居中动画 */
        #ai-translator-button.long-pressing {
            transform-origin: center !important;
        }
        /* 动态计算 spinner 大小、位置和旋转中心 */
        #ai-translator-button.long-pressing::before {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%); /* 使用 transform 居中 (移除 !important 允许动画覆盖) */
            transform-origin: center center !important;
            width: ${spinnerSize}px !important;
            height: ${spinnerSize}px !important;
            margin-top: 0 !important;
            margin-left: 0 !important;
            border-width: ${spinnerBorderWidth}px !important;
        }
    `;
} 
