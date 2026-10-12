import { Platform } from './platform.js';
import { loadTabContent  } from './main.js';
import { logDebug } from './debug.js';

export function switchTab(tabIndex) {
    if (window.currentTab === tabIndex) return;

    window.currentTab = tabIndex;
    document.querySelectorAll('.tab-button').forEach(btn => {
        if (parseInt(btn.getAttribute('data-tab')) === tabIndex) {
            btn.classList.add('tab-active');
        } else {
            btn.classList.remove('tab-active');
        }
    });

    const hash = tabHashes[tabIndex];
    if (hash) window.location.hash = hash;
}

export function showContent(show = true) {
    const tabContainer = document.getElementById('tab-content');
    if (tabContainer) {
        if (show) {
            tabContainer.classList.remove('hidden');
        } else {
            tabContainer.classList.add('hidden');
        }
    }
}

export function showSystemInfo(tabIndex = window.currentTab) {
    if (Platform.isIOS() || Platform.isAndroid()) {
        if (tabIndex === 0) { 
            document.getElementById('system-info')?.classList.remove('hidden');
        }
    } else {
        document.getElementById('system-info')?.classList.remove('hidden');
    }
}

export function restoreTabFromHash() {
    const hash = window.location.hash.substring(1);
    let tabIndex = hashToTab[hash];
    if (tabIndex === undefined) tabIndex = 0;
    window.currentTab = tabIndex;    
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        if (parseInt(btn.getAttribute('data-tab')) === tabIndex) {
            btn.classList.add('tab-active');
        } else {
            btn.classList.remove('tab-active');
        }
    });

    loadTabContent(tabIndex);
    adaptForMobile(tabIndex);
    updateActiveBottomNavAndHideSystemInfo(tabIndex);
}

function updateActiveBottomNavAndHideSystemInfo(tabIndex) {
    if (Platform.isIOS() || Platform.isAndroid()) {
        updateActiveBottomNav();
    }
}

export function adaptForPwa() {
    if (!Platform.isPWA()) {
        logDebug('🌐 Running in regular web mode');
    } else {
        logDebug('🚀 Running in PWA Standalone mode');
    }
    
    const style = document.createElement('style')
    const viewport = document.createElement('meta');

    viewport.name = 'viewport';

    if (Platform.isIOS()) {
        logDebug('🍎 Detected iOS device - applying iOS-specific styles');

        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no, interactive-widget=resizes-content';

        style.textContent = `
            html { -webkit-text-size-adjust: 100% !important; }
            body { -webkit-text-size-adjust: 100% !important; }

            html, body, #background-overlay, .max-w-7xl, #tab-content {
                -webkit-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
            }

            /* Allow selection only in specially marked elements */
            .allow-select, .allow-select * {
                -webkit-user-select: text !important;
                user-select: text !important;
                -webkit-touch-callout: default !important;
            }
        `;
    } else if (Platform.isAndroid()) {
        logDebug('🤖 Detected Android device - applying Android-specific styles');

        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no, interactive-widget=resizes-content, viewport-fit=cover';

        style.textContent = `
            * { -webkit-tap-highlight-color: transparent !important; tap-highlight-color: transparent !important; }
            * { -webkit-touch-callout: none !important; -webkit-user-select: none !important; user-select: none !important; }
        `;
    } else {
        logDebug('🖥️ Detected Desktop');

        viewport.content = 'width=device-width, initial-scale=1.0';

        style.textContent = `
            html, body, #background-overlay, .max-w-7xl, #tab-content {
                -webkit-user-select: none !important;
                user-select: none !important;
            }

            .allow-select, .allow-select * {
                -webkit-user-select: text !important;
                user-select: text !important;
            }

            button, .tab-button, .bottom-nav-btn, img, canvas {
                -webkit-user-select: none !important;
                user-select: none !important;
            }
        `;
    }

    document.head.appendChild(viewport);

    style.textContent += `
        * {
            -webkit-tap-highlight-color: transparent;
            tap-highlight-color: transparent;
        }
        button, a, .tap-target {
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
            touch-action: manipulation;
        }
        html, body {
            overscroll-behavior: none;
            -webkit-overflow-scrolling: touch;
        }
    `;

    document.head.appendChild(style);

    document.documentElement.style.setProperty('-webkit-touch-callout', 'none');
    document.documentElement.style.setProperty('touch-action', 'manipulation');

    if (!Platform.isIOS() && !Platform.isAndroid()) {
        preventDesktopSelection();
        return;
    }

    preventPullToRefreshAndZoom();
    preventIosLongPressSelection();

    document.querySelectorAll('.tab-button').forEach(btn => {
        if (parseInt(btn.getAttribute('data-tab')) !== 0) {
            btn.style.display = 'none';
        }
    });
    
    logDebug('🚀 PWA mode: Bottom navigation enabled');

    adaptForMobile(window.currentTab);
    updateActiveBottomNav();
    document.documentElement.classList.add('layout-ready');
}

function adaptForMobile(tabIndex) {
    if (Platform.isIOS() || Platform.isAndroid()) {
        const mainContainer = document.getElementById('content-container');
        if (mainContainer) {
            if (tabIndex === 0) {
                mainContainer.classList.add('allow-scroll');
            } else {
                mainContainer.classList.remove('allow-scroll');
            }
        }
    }
}

function preventPullToRefreshAndZoom() {
    let startY = 0;
    const SCROLL_THRESHOLD = 12; // 10–15

    // === TOUCHSTART ===
    document.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;

        // Block pinch-zoom right away
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });

    // === TOUCHMOVE ===
    document.addEventListener('touchmove', (e) => {
        // Pinch zoom
        if (e.touches.length > 1) {
            if (e.cancelable) e.preventDefault();
            return;
        }

        // Allow scrolling inside .allow-scroll and interactive elements
        const target = e.target;
        if (isInsideScrollableElement(target) || isInteractiveElement(target)) {
            return;
        }

        const currentY = e.touches[0].clientY;
        const deltaY = Math.abs(currentY - startY);

        if (deltaY < SCROLL_THRESHOLD) {
            return;
        }

        const scrollY = window.scrollY;
        const isAtTop = scrollY <= 2;
        const isAtBottom = scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10;

        const movingDown = currentY > startY;
        const movingUp = currentY < startY;

        if ((isAtTop && movingDown) || (isAtBottom && movingUp)) {
            if (e.cancelable) {
                e.preventDefault();
            }
        }
    }, { passive: false });

    // === DOUBLE TAP (can be relaxed or removed when the viewport meta is set) ===
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            if (e.cancelable) e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
}

function isInteractiveElement(target) {
    return !!target.closest('button, a, input, select, textarea, [role="button"], .btn, [onclick]');
}

function isInsideScrollableElement(target) {
    let element = target;

    while (element && element !== document.body) {
        if (element.classList && element.classList.contains('allow-scroll')) {
            return true;
        }

        // Also check the styles (in case the class was forgotten)
        const style = window.getComputedStyle(element);
        const overflowY = style.overflowY;

        if (overflowY === 'auto' || overflowY === 'scroll') {
            // Check whether there is really something to scroll
            if (element.scrollHeight > element.clientHeight) {
                return true;
            }
        }

        element = element.parentElement;
    }

    return false;
}

function preventIosLongPressSelection() {
    // Extra protection in JS (in case CSS is not enough)
    document.addEventListener('touchstart', (e) => {
        const target = e.target;

        // Skip if the element or its parent has the allow-select class
        if (target.closest && target.closest('.allow-select')) {
            return;
        }

        // Disable the context menu and selection
        document.documentElement.style.setProperty('-webkit-touch-callout', 'none');
    }, { passive: true });

    // Context menu blocking
    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.allow-select')) {
            e.preventDefault();
        }
    }, false);

    // Also disable long press everywhere except the allowed elements
    document.addEventListener('selectionchange', () => {
        if (window.getSelection().toString().length > 0) {
            const activeElement = document.activeElement;
            if (!activeElement || !activeElement.closest('.allow-select')) {
                window.getSelection().removeAllRanges();
            }
        }
    });
}

function preventDesktopSelection() {
    // Text selection blocking
    document.addEventListener('selectstart', (e) => {
        let target = e.target;

        // If the target is a text node, go up to the parent element
        if (target.nodeType === Node.TEXT_NODE) {
            target = target.parentElement;
        }

        if (!target || !target.closest || !target.closest('.allow-select')) {
            e.preventDefault();
        }
    });

    // Context menu blocking (right mouse button)
    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.allow-select') && 
            !e.target.closest('input') && 
            !e.target.closest('textarea') && 
            !e.target.closest('[contenteditable]')) {
            e.preventDefault();
        }
    });

    // Extra protection against drag
    document.addEventListener('dragstart', (e) => {
        if (!e.target.closest('.allow-select')) {
            e.preventDefault();
        }
    });
}

export function updateActiveBottomNav() {
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
        if (parseInt(btn.getAttribute('data-tab')) === window.currentTab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

let lastState = null;

export function toggleOfflineMode(isOffline) {
    if (lastState !== isOffline) {
        lastState = isOffline;
    } else {
        return;
    }

    const overlay = document.getElementById('background-overlay');
    if (!overlay) return;

    if (isOffline) {
        document.body.classList.add('offline-mode');        
        overlay.classList.add('offline-overlay');
        
        overlay.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        color: white; text-align: center; pointer-events: none; text-shadow: 0 2px 8px rgba(0,0,0,0.6);">
                <div class="offline-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" 
                        fill="none" stroke="currentColor" stroke-width="2" 
                        stroke-linecap="round" stroke-linejoin="round">
                        <!-- same paths -->
                        <path d="M12 20h.01"/>
                        <path d="M8.5 16.429a5 5 0 0 1 7 0"/>
                        <path d="M5 12.859a10 10 0 0 1 14 0"/>
                        <path d="M2 8.82a15 15 0 0 1 20 0"/>
                        <line x1="2" y1="2" x2="22" y2="22"/>
                    </svg>
                </div>
            </div>
        `;
    } else {
        document.body.classList.remove('offline-mode');
        overlay.classList.remove('offline-overlay');
    }
}

/**
 * Universal confirmation dialog
 * @param {Object} options
 * @param {string} options.title - Title
 * @param {string} options.message - Message text
 * @param {string} [options.confirmText='Confirm'] - Confirm button text
 * @param {string} [options.discardText='Discard'] - "Discard" button text
 * @param {string} [options.cancelText='Cancel'] - Cancel button text
 * @param {boolean} [options.showDiscard=false] - Whether to show the Discard button
 * @returns {Promise<'confirm' | 'discard' | 'cancel'>}
 */
export function showConfirmDialog(options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Confirm action',
            message = 'Are you sure?',
            confirmText = 'Confirm',
            discardText = 'Discard',
            cancelText = 'Cancel',
            showDiscard = false
        } = options;

        const modal = document.createElement('div');
        modal.className = `fixed inset-0 z-[100] flex items-center justify-center 
                           bg-black/50 backdrop-blur-sm`;

        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    ${title}
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    ${message}
                </p>
                
                <div class="flex justify-end gap-3">
                    ${showDiscard ? `
                        <button id="btn-discard"
                                class="px-5 py-2.5 rounded-xl text-gray-700 dark:text-gray-300 
                                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            ${discardText}
                        </button>
                    ` : ''}
                    
                    <button id="btn-cancel"
                            class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600
                                   text-gray-700 dark:text-gray-300 hover:bg-gray-50 
                                   dark:hover:bg-gray-700 transition-colors">
                        ${cancelText}
                    </button>
                    
                    <button id="btn-confirm"
                            class="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 
                                   text-white font-medium transition-colors">
                        ${confirmText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // === Handlers ===
        const confirmBtn = modal.querySelector('#btn-confirm');
        const cancelBtn = modal.querySelector('#btn-cancel');
        const discardBtn = modal.querySelector('#btn-discard');

        const close = (result) => {
            modal.remove();
            document.removeEventListener('keydown', handleEsc);
            resolve(result);
        };

        const handleEsc = (e) => {
            if (e.key === 'Escape') close('cancel');
        };

        confirmBtn.onclick = () => close('confirm');
        cancelBtn.onclick = () => close('cancel');

        if (discardBtn) {
            discardBtn.onclick = () => close('discard');
        }

        // Close on a click on the backdrop
        modal.onclick = (e) => {
            if (e.target === modal) close('cancel');
        };

        // Close on Escape
        document.addEventListener('keydown', handleEsc);
    });
}

export function showToast(message, type = 'success', duration = 2800) {
    const toast = document.createElement('div');
    
    const bgColor = type === 'success' 
        ? 'bg-green-600' 
        : type === 'error' 
            ? 'bg-red-600' 
            : 'bg-gray-700';

    toast.className = `
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]
        ${bgColor} text-white px-6 py-3 rounded-2xl shadow-xl
        flex items-center gap-3 text-sm font-medium
        animate-[fadeIn_0.2s_ease-out]
    `;
    toast.innerHTML = `
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
};