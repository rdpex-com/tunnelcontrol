import { initDebugMode, logDebug, clearDebug, copyDebug, disableDebug } from './debug.js';
import { Platform } from './platform.js';
import { toggleOfflineMode, adaptForPwa, restoreTabFromHash, switchTab, showContent, showSystemInfo, showConfirmDialog, showToast } from './ui.js';
import { loadStatus, startChart } from './dashboard.js';
import { updateServiceStatus, controlService } from './service.js';
import { loadConfig, saveConfig, loadLogs, updateSysInfo, updateTunStatus } from './api.js';
import { initPushNotifications, updateNotificationButton, requestNotificationPermission, pushIsOff } from './push-notifications.js';
import { changeLogType, refreshLogs, toggleAutoScroll, startLogAutoRefresh } from './logs.js';
import { checkCertificateTrust, describeCertificateCheck, certificateInstallHtml } from './cert-check.js';

async function updateLogoutButton() {
    try {
        const res = await fetch('/api/auth/status', { cache: 'no-store' });
        const data = await res.json();
        const button = document.getElementById('logout-btn');
        if (button && data.enabled && data.authenticated) {
            button.classList.remove('hidden');
        }
    } catch (e) {
        logDebug('updateLogoutButton error', e.message);
    }
}

window.logout = async () => {
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                const res = await fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
                const result = await res.json();
                if (result.unsubscribed) await subscription.unsubscribe();
            }
        }
    } catch (e) {
        logDebug('logout push error', e.message);
    }
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
        logDebug('logout error', e.message);
    }
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter(key => key.startsWith('tunnel-dynamic-')).map(key => caches.delete(key)));
        }
    } catch (e) {
        logDebug('logout cache error', e.message);
    }
    location.replace('/login.html');
};

window.currentTab = 0;
window.currentLogType = 'main';
window.appVersion = 'unknown';

let contentHidden = true;
let updateStatusInterval = null;

window.originalConfig = '';
window.configDirty = false;
window.configLoaded = false;

window.hasUnsavedConfigChanges = () => {
    const textarea = document.getElementById('config-editor');
    if (!textarea) return false;
    window.configDirty = textarea.value !== window.originalConfig;
    return window.configDirty;
};

window.showButtonSave = (textarea) => {
    window.configDirty = textarea.value !== window.originalConfig;

    const buttonSave = document.getElementById('config-save');
    if (buttonSave) {
        buttonSave.disabled = !window.configDirty;
    }
}

// ====================== LOAD TAB CONTENT ======================
export function loadTabContent(tabIndex) {
    document.body.classList.remove(
        'dashboard-active', 
        'config-active', 
        'logs-active', 
        'system-active'
    );

    const tabNames = ['dashboard', 'config', 'logs', 'system'];
    if (tabNames[tabIndex]) {
        document.body.classList.add(tabNames[tabIndex] + '-active');
    }

    const content = document.getElementById('tab-content');

    document.getElementById('system-info')?.classList.add('hidden');

    if (tabIndex === 0) { // Dashboard
        document.getElementById('dashboard-container')?.classList.add('hidden');

        content.innerHTML = `
            <div id="dashboard-container" class="allow-scroll hidden">
                <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    
                    <!-- Active Tunnels -->
                    <div class="xl:col-span-8">
                        <h2 class="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Active Tunnels</h2>
                        <div id="tunnels-container" class="space-y-8"></div>
                    </div>

                    <div class="xl:col-span-1"></div>

                    <!-- Right Column -->
                    <div class="xl:col-span-3">
                        
                        <!-- Global Stats -->
                        <h2 class="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Global Stats</h2>
                        <div id="global-stats" 
                            class="bg-gray-100 dark:bg-gray-900 p-6 space-y-2 rounded-xl border border-gray-300 dark:border-gray-700">
                        </div>

                        <br>

                        <!-- Total Traffic Speed -->
                        <h2 class="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Total Traffic Speed</h2>
                        <div id="total-speed-chart" 
                            class="bg-gray-100 dark:bg-gray-900 p-6 rounded-xl border border-gray-300 dark:border-gray-700">
                            
                            <div class="flex justify-between items-center mb-4">
                                <div class="text-xs text-gray-500 dark:text-gray-400" id="chart-last-update">
                                    Last update: —
                                </div>
                            </div>
                            
                            <div class="h-60 relative">
                                <canvas id="totalSpeedChart"></canvas>
                            </div>

                            <div id="customTooltip" class="custom-tooltip">
                                <div id="tooltipTitle"></div>
                                <div id="tooltipBody"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        function showDashboard() {
            setTimeout(() => {
                document.getElementById('dashboard-container')?.classList.remove('hidden');                
                showSystemInfo(tabIndex);

                if (contentHidden) {
                    contentHidden = false;
                    showContent(true);
                }
            }, 100);
        }
        
        let statusReady = false;
        let chartReady = false;

        function checkAndShowDashboard() {
            if (statusReady && chartReady) {
                showDashboard();
            }
        }

        loadStatus((success) => {
            statusReady = true;
            checkAndShowDashboard();
        });

        startChart((chartSuccess) => {
            chartReady = true;
            checkAndShowDashboard();
        });

        if (updateStatusInterval) {
            clearInterval(updateStatusInterval);
            updateStatusInterval = null;
        }

        updateStatusInterval = setInterval(() => { if (window.currentTab === 0) loadStatus(); }, 5000);
    }
    else if (tabIndex === 1) { // Configuration
        content.innerHTML = `
            <div id="config-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">tun.config</h2>
                    <button id="config-save" onclick="window.saveConfig()"
                            class="bg-green-600 hover:bg-green-700 active:bg-green-800
                                px-6 py-2.5 rounded-xl font-medium text-white
                                transition-colors disabled:opacity-50" disabled>Save
                    </button>
                </div>

                <div class="relative flex-1 min-h-0 rounded-2xl bg-gray-100 dark:bg-gray-900">
                    <div id="config-backdrop" aria-hidden="true"
                        class="absolute inset-0 overflow-hidden pointer-events-none
                            font-mono text-sm p-5 rounded-2xl border border-transparent
                            whitespace-pre-wrap break-words text-transparent"></div>
                    <textarea id="config-editor"
                        class="allow-scroll allow-select absolute inset-0 block w-full h-full
                            bg-transparent
                            text-gray-900 dark:text-gray-100
                            font-mono text-sm p-5 rounded-2xl
                            border border-gray-300 dark:border-gray-700
                            focus:border-blue-500 dark:focus:border-blue-500
                            outline-none resize-none"
                            spellcheck="false">Loading config...
                    </textarea>
                </div>
                <div id="config-error-hint" class="min-h-[1.25rem] mt-2 text-xs text-red-600 dark:text-red-400"></div>

                <div class="flex justify-end mt-3">
                    <label class="relative inline-flex cursor-pointer items-center gap-2">
                        <input type="checkbox" id="theme-toggle"
                            class="sr-only peer"
                            onchange="window.toggleTheme(this)">
                        <div class="w-11 h-6 bg-gray-300 dark:bg-gray-700
                            peer-focus:outline-none peer-focus:ring-2
                            peer-focus:ring-blue-500 rounded-full peer
                            peer-checked:after:translate-x-full
                            peer-checked:after:border-white
                            after:content-[''] after:absolute after:top-0.5
                            after:left-0.5 after:bg-white
                            after:border-gray-300 after:border
                            after:rounded-full after:h-5 after:w-5
                            after:transition-all
                            peer-checked:bg-green-600">
                        </div>
                        <span class="text-sm text-gray-500 dark:text-gray-400 select-none">Dark Theme</span>
                    </label>
                </div>
            </div>
        `;

        let configHintElement = null;

        function showConfigHint(textarea) {
            if (configHintElement) return;
            configHintElement = document.createElement('div');
            configHintElement.style.cssText = `margin-top:6px; font-size:12px; color:#6b7280; display:flex; flex-wrap:wrap; gap:12px;`;
            configHintElement.innerHTML = `
                <span><strong>Tab</strong> — indent</span>
                <span><strong>Shift+Tab</strong> — outdent</span>
                <span><strong>Esc</strong> — exit editor</span>
                <span><strong>Ctrl+S</strong> — save</span>
            `;
            textarea.parentNode.parentNode.insertBefore(configHintElement, textarea.parentNode.nextSibling);
        }

        function hideConfigHint() {
            if (configHintElement) {
                configHintElement.remove();
                configHintElement = null;
            }
        }

        let configErrors = [];

        function escapeHtml(text) {
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function configErrorLines(lines) {
            return configErrors.map(error => {
                let best = -1;
                lines.forEach((line, index) => {
                    if (line.trim() && line === error.text &&
                        (best === -1 || Math.abs(index - error.line) < Math.abs(best - error.line))) best = index;
                });
                return best;
            });
        }

        function renderConfigErrors() {
            const textarea = document.getElementById('config-editor');
            const backdrop = document.getElementById('config-backdrop');
            if (!textarea || !backdrop) return;

            const lines = textarea.value.split('\n');
            const marked = new Set(configErrorLines(lines));
            backdrop.style.paddingRight = `${20 + textarea.offsetWidth - textarea.clientWidth - 2}px`;
            backdrop.innerHTML = lines.map((line, index) =>
                marked.has(index)
                    ? `<mark class="rounded bg-red-500/30 text-transparent">${escapeHtml(line)}</mark>`
                    : escapeHtml(line)
            ).join('\n') + '\n';
            backdrop.scrollTop = textarea.scrollTop;
            showConfigErrorHint();
        }

        function showConfigErrorHint() {
            const textarea = document.getElementById('config-editor');
            const hint = document.getElementById('config-error-hint');
            if (!textarea || !hint) return;

            const value = textarea.value;
            const current = value.substring(0, textarea.selectionStart).split('\n').length - 1;
            const errorLines = configErrorLines(value.split('\n'));

            hint.textContent = configErrors
                .filter((error, index) => errorLines[index] === current)
                .map(error => error.message)
                .join('; ');
        }

        let recheckTimer = null;

        function scheduleConfigRecheck(delay = 600) {
            clearTimeout(recheckTimer);
            recheckTimer = setTimeout(async () => {
                const textarea = document.getElementById('config-editor');
                if (!textarea || !window.configLoaded) return;
                const content = textarea.value;
                try {
                    const res = await fetch('/api/config/check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content })
                    });
                    const data = await res.json();
                    if (data.success && Array.isArray(data.errors) && textarea.value === content) window.showConfigErrors(content, data.errors);
                } catch (e) {
                    logDebug('config recheck error', e.message);
                }
            }, delay);
        }

        window.showConfigErrors = (content, errors) => {
            const lines = content.split('\n');
            configErrors = errors.map(error => ({ text: lines[error.line - 1] ?? '', line: error.line - 1, message: error.message }));
            renderConfigErrors();
        };

        // === Handling of Tab / Shift+Tab / Esc / Ctrl+S ===
        function enableTabForTextarea(textarea) {
            if (!textarea) return;

            textarea.addEventListener('keydown', async function(e) {
                // Ctrl/Cmd + S
                if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
                    e.preventDefault();
                    if (typeof window.saveConfig === 'function') {
                        await window.saveConfig();
                    }
                    return;
                }

                // Tab
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = this.selectionStart;
                    const end = this.selectionEnd;
                    const value = this.value;
                    const tab = '\t';

                    if (e.shiftKey) {
                        if (start > 0) {
                            const charBefore = value[start - 1];
                            if (charBefore === '\t' || charBefore === ' ') {
                                this.value = value.substring(0, start - 1) + value.substring(end);
                                this.selectionStart = this.selectionEnd = start - 1;
                            }
                        }
                    } else {
                        this.value = value.substring(0, start) + tab + value.substring(end);
                        this.selectionStart = this.selectionEnd = start + tab.length;
                    }

                    window.showButtonSave(textarea);
                    return;
                }

                // Esc
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.blur();
                }
            });

            if (Platform.isDesktop()) {
                textarea.addEventListener('focus', () => showConfigHint(textarea));
                textarea.addEventListener('blur', hideConfigHint);
            }

            // Change tracking
            textarea.addEventListener('input', () => {
                window.showButtonSave(textarea);
                renderConfigErrors();
                scheduleConfigRecheck();
            });

            textarea.addEventListener('scroll', () => {
                const backdrop = document.getElementById('config-backdrop');
                if (backdrop) backdrop.scrollTop = textarea.scrollTop;
            });
            ['click', 'keyup', 'select'].forEach(type => textarea.addEventListener(type, showConfigErrorHint));
            window.onConfigResize = renderConfigErrors;
            if (!window.configResizeBound) {
                window.configResizeBound = true;
                window.addEventListener('resize', () => window.onConfigResize());
            }
        }

        window.configLoaded = false;

        setTimeout(async () => {
            await loadConfig();

            const textarea = document.getElementById('config-editor');
            if (textarea) {
                window.originalConfig = textarea.value;
                window.configDirty = false;
                enableTabForTextarea(textarea);
                scheduleConfigRecheck(0);
            }
        }, 100);

        const toggle = document.getElementById('theme-toggle');
        if (toggle) toggle.checked = document.documentElement.classList.contains('dark');
    }
    else if (tabIndex === 2) { // Logs
        content.innerHTML = `
            <div id="logs-container" style="display: flex; flex-direction: column; height: 100%;">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">Logs</h2>
                    
                    <div class="flex items-center gap-3">
                        <select id="log-type" onchange="window.changeLogType()" 
                                class="bg-gray-100 dark:bg-gray-800 
                                    border border-gray-300 dark:border-gray-600 
                                    text-gray-900 dark:text-gray-100
                                    rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500">
                            <option value="main">Main Log</option>
                            <option value="verbose">Verbose Log</option>
                            <option value="mon_total">Monitor Total</option>
                            <option value="mon_verbose">Monitor Verbose</option>
                            <option value="mon_debug">Monitor Debug</option>
                            <option value="mon_errors">Monitor Errors</option>
                        </select>
                        
                        <button onclick="window.refreshLogs()" 
                            class="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 
                                px-6 py-2 rounded-xl font-medium text-white 
                                flex items-center justify-center gap-2 transition-colors">
                            Refresh
                        </button>
                    </div>
                </div>
                
                <div id="logs-notice" class="hidden mb-3 px-4 py-2 rounded-xl text-sm
                    bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300
                    border border-yellow-300 dark:border-yellow-700"></div>
                
                <pre id="logs-content" 
                    class="allow-scroll allow-select 
                        bg-gray-100 dark:bg-gray-900 
                        text-gray-800 dark:text-gray-300 
                        p-5 font-mono text-sm 
                        overflow-auto whitespace-pre-wrap border 
                        border-gray-300 dark:border-gray-800 
                        rounded-2xl leading-relaxed min-h-0 flex-1">Loading logs...
                </pre>
                
                <div class="flex justify-end mt-3">
                    <label class="relative inline-flex cursor-pointer items-center gap-2">
                        <input type="checkbox" id="auto-scroll-toggle"
                            class="sr-only peer"
                            onchange="window.toggleAutoScroll(this)">
                        <div class="w-11 h-6 bg-gray-300 dark:bg-gray-700 
                            peer-focus:outline-none peer-focus:ring-2 
                            peer-focus:ring-blue-500 rounded-full peer
                            peer-checked:after:translate-x-full 
                            peer-checked:after:border-white
                            after:content-[''] after:absolute after:top-0.5 
                            after:left-0.5 after:bg-white 
                            after:border-gray-300 after:border 
                            after:rounded-full after:h-5 after:w-5 
                            after:transition-all 
                            peer-checked:bg-green-600"></div>
                        <span class="text-sm text-gray-500 dark:text-gray-400">Auto-scroll</span>
                    </label>
                </div>
            </div>
        `;

        // State initialization
        if (typeof window.autoScrollLogs === 'undefined') {
            window.autoScrollLogs = true;
        }

        const toggle = document.getElementById('auto-scroll-toggle');
        if (toggle) toggle.checked = window.autoScrollLogs;           

        setTimeout(() => {
            loadLogs(window.currentLogType, true);
            startLogAutoRefresh();
        }, 100);
    }
    else if (tabIndex === 3) { // System
        content.innerHTML = `
            <div id="system-container">
                <div class="max-w-md mx-auto p-1">
                    <h2 class="text-2xl font-semibold mb-6 text-gray-900 dark:text-white">System Actions</h2>
                    
                    <div id="tun-status-card" class="mb-6 p-5 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl min-h-[102px] flex flex-col">
                        <div class="flex justify-between items-start flex-1">
                            <div class="flex-1">
                                <div id="tun-status-text" class="text-lg font-semibold leading-tight min-h-[1.8em]">
                                    Loading...
                                </div>
                            </div>
                            <div id="tun-status-badge" class="px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap"></div>
                        </div>
                        
                        <div id="tun-status-time" class="text-xs text-gray-500 dark:text-gray-400 mt-3 min-h-[1.25em] leading-tight"></div>
                    </div>

                    <div class="space-y-4">
                        <button id="btn-start" 
                                onclick="window.controlService('start')" 
                                class="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 
                                    px-6 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 
                                    text-white disabled:opacity-50 transition-colors" disabled>
                            <i class="fas fa-play"></i> 
                            Start Tunnel Service
                        </button>
                        
                        <button id="btn-stop" 
                                onclick="window.controlService('stop')" 
                                class="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 
                                    px-6 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 
                                    text-white disabled:opacity-50 transition-colors" disabled>
                            <i class="fas fa-stop"></i> 
                            Stop Tunnel Service
                        </button>
                        
                        <button id="btn-restart" 
                                onclick="window.controlService('restart')" 
                                class="w-full bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 
                                    px-6 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 
                                    text-white disabled:opacity-50 transition-colors" disabled>
                            <i class="fas fa-redo"></i> 
                            Restart Tunnel Service
                        </button>
                        
                        <div class="mb-6">
                            <button id="enable-push-btn" 
                                    onclick="window.requestNotificationPermission()" 
                                    class="hidden w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 
                                        px-6 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 
                                        text-white transition-colors">
                                <i class="fas fa-bell"></i>
                                Enable Push Notifications
                            </button>
                        </div>

                        <button id="logout-btn"
                                onclick="window.logout()"
                                class="hidden w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                                    px-6 py-3 rounded-2xl font-medium flex items-center justify-center gap-2
                                    text-gray-900 dark:text-white transition-colors">
                            <i class="fas fa-sign-out-alt"></i>
                            Log Out
                        </button>
                    </div>
                </div>                
            </div>
        `;
        
        updateServiceStatus();
        updateTunStatus();
        setTimeout(updateNotificationButton, 100);
        updateLogoutButton();
    }

    if (tabIndex !== 0) {
        showSystemInfo(tabIndex);
        
        if (contentHidden) {
            contentHidden = false;
            showContent(true);
        }
    }

    if (tabIndex !== 3) {
        updateServiceStatus();
    }
    
    updateSysInfo();
}

const confirmLeaveConfig = async () => {
    if (window.currentTab === 1 && window.configLoaded && window.hasUnsavedConfigChanges()) {
        const result = await window.showConfirmDialog({
            title: 'Unsaved changes',
            message: 'You have unsaved changes in tun.config.\nDo you want to save them before leaving?',
            confirmText: 'Save',
            discardText: 'Discard changes',
            cancelText: 'Cancel',
            showDiscard: true
        });

        if (result === 'confirm') {
            let saved = false;
            if (typeof window.saveConfig === 'function') {
                try {
                    saved = await window.saveConfig();
                } catch (e) {
                    console.error('[Config] Failed to save on tab switch:', e);
                }
            }
            if (!saved) return false;
        } else if (result === 'cancel') {
            return false;
        }
    }
    return true;
};

const protectedSwitchTab = async (newTabIndex) => {
    if (newTabIndex === window.currentTab) return;
    if (!(await confirmLeaveConfig())) return;

    window.configLoaded = false;

    // Call the original tab switching function    
    switchTab(newTabIndex);
};

Object.assign(window, {
    switchTab: protectedSwitchTab,
    saveConfig,
    loadConfig,
    changeLogType,
    refreshLogs,
    toggleAutoScroll,
    controlService,
    requestNotificationPermission,
    clearDebug,
    copyDebug,
    disableDebug,
    showConfirmDialog,
    showToast
});

// ====================== VERSION CHECK & AUTO RELOAD ======================
let updating = false;

function checkAppVersion() {
    const currentStoredVersion = localStorage.getItem('appVersion');

    if (!currentStoredVersion) {
        localStorage.setItem('appVersion', window.appVersion);
        logDebug('[App] First launch, saved version:', window.appVersion);
        window.updateApp();
        return;
    }

    if (window.appVersion !== 'unknown') {
        if (window.appVersion !== currentStoredVersion) {
            logDebug(`[App] Version changed! Old: ${currentStoredVersion} → New: ${window.appVersion}`);            
            localStorage.setItem('appVersion', window.appVersion);
            return true;
        } else {
            logDebug(`[App] Version is up to date: ${window.appVersion}`);
            return false;
        }
    } else {
        logDebug('[App] Restore version from localStorage:', currentStoredVersion);
        window.appVersion = currentStoredVersion;
        return true;
    }
}

function showUpdateBanner() {
    if (updating) return;

    const text = `New version available: ${window.appVersion}`;    
    var banner = document.getElementById('update-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'update-banner';
        banner.className = `
            fixed bottom-4 left-1/2 transform -translate-x-1/2 
            bg-blue-600 text-white 
            px-5 py-4 rounded-3xl shadow-2xl 
            flex flex-col sm:flex-row items-center gap-3 
            max-w-md w-fit min-w-[280px] z-[100000]
        `.trim();
        banner.innerHTML = `
            <span class="font-medium text-center sm:text-left flex-1 px-1">
                ${text}
            </span>
            <button onclick="window.updateApp()" 
                    class="bg-white text-blue-600 hover:bg-gray-100 
                        px-6 py-2.5 rounded-2xl font-semibold text-sm 
                        whitespace-nowrap flex-shrink-0">
                Update Now
            </button>
        `;
        document.body.appendChild(banner);
    } else {
        banner.querySelector('span').textContent = text;
    }
}

async function showCertificateBanner() {
    if (document.getElementById('cert-banner')) return;
    const features = (await pushIsOff()) ? 'updates and offline mode' : 'updates, push notifications and offline mode';
    if (document.getElementById('cert-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'cert-banner';
    banner.className = `
        fixed bottom-4 left-1/2 transform -translate-x-1/2
        bg-yellow-600 text-white
        px-5 py-4 rounded-3xl shadow-2xl
        flex flex-col gap-3
        max-w-md w-[calc(100%-2rem)] z-[100000]
    `.trim();
    banner.innerHTML = `
        <span class="font-medium px-1">
            This device does not trust the panel certificate, so ${features} may not work.
        </span>
        <div class="text-sm px-1 opacity-90">${certificateInstallHtml()}</div>
        <div class="flex gap-3">
            <a href="/cert.pem"
               class="bg-white text-yellow-700 hover:bg-gray-100
                   px-6 py-2.5 rounded-2xl font-semibold text-sm text-center flex-1">
                Download Certificate
            </a>
            <button onclick="document.getElementById('cert-banner').remove()"
                    class="bg-yellow-700 hover:bg-yellow-800 px-4 py-2.5 rounded-2xl font-semibold text-sm">
                Close
            </button>
        </div>
    `;
    document.body.appendChild(banner);
}

let updateFailures = 0;
let certLostBannerClosed = false;
const UPDATE_FAILURES_BEFORE_BANNER = 6;
window.closeCertificateLostBanner = function() {
    certLostBannerClosed = true;
    document.getElementById('cert-lost-banner')?.remove();
};

function showCertificateLostBanner() {
    if (certLostBannerClosed || document.getElementById('cert-lost-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'cert-lost-banner';
    banner.className = `
        fixed bottom-4 left-1/2 transform -translate-x-1/2
        bg-yellow-600 text-white
        px-5 py-4 rounded-3xl shadow-2xl
        flex flex-col gap-3
        max-w-md w-[calc(100%-2rem)] z-[100000]
    `.trim();
    banner.innerHTML = `
        <span class="font-medium px-1">
            The server is not responding. The device is online, so the app only shows cached data.
        </span>
        <span class="text-sm px-1 opacity-90">
            Possible reasons: the server is down or restarting; you are on another network (the panel is reachable
            only from the local network); the device no longer trusts the panel certificate (it was removed, or the
            server has a new one). If the server is up and you are on the local network, tap Reset App and open the panel in the
            browser: it will show the real error. For a certificate warning, accept it, install the certificate from
            the yellow banner and reinstall the app.
        </span>
        <div class="flex gap-3">
            <button onclick="window.resetApp()"
                    class="bg-white text-yellow-700 hover:bg-gray-100
                        px-6 py-2.5 rounded-2xl font-semibold text-sm flex-1">
                Reset App
            </button>
            <button onclick="window.closeCertificateLostBanner()"
                    class="bg-yellow-700 hover:bg-yellow-800 px-4 py-2.5 rounded-2xl font-semibold text-sm">
                Close
            </button>
        </div>
    `;
    document.body.appendChild(banner);
}

window.resetApp = async function() {
    try {
        sessionStorage.setItem('swReset', '1');
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
    } catch (e) {
        logDebug('[App] resetApp error', e.message);
    }
    window.location.reload();
};

window.updateApp = function() {
    updating = true;

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => {
            if (registration && registration.waiting) {
                logDebug('[App] Sending skipWaiting message to Service Worker');
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        });

        setTimeout(() => {
            logDebug('[App] Reloading page to apply new version');
            window.location.reload(true);
        }, 300);
    } else {
        logDebug('[App] Service Worker not available, reloading page directly');
        window.location.reload(true);
    }
};

let coreVersion = null;

async function showVersion(appVersion) {
    logDebug(`[App] showVersion: ${appVersion}`);
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        if (coreVersion === null) {
            try {
                const data = await (await fetch('/api/version')).json();
                if (data.success && data.version) coreVersion = data.version;
            } catch (e) {
                logDebug('[App] Failed to get the version', e.message);
            }
        }
        let os = (Platform.isAndroid() ? '|Android)' : (Platform.isIOS() ? '|iOS)' : ')'));
        versionEl.textContent = `Version: ${coreVersion ? `${coreVersion} / ` : ''}${appVersion} ` +
            (Platform.isPWA() ? '(PWA' + os : '(Web' + os);
    }
}

// ====================== INIT ======================
function fitMobileHeader() {
    const title = document.getElementById('main-title');
    if (!title || !document.documentElement.classList.contains('mobile')) return;

    let size = 30;
    title.style.fontSize = `${size}px`;
    while (size > 18 && title.getBoundingClientRect().height > size * 1.5) {
        size -= 0.5;
        title.style.fontSize = `${size}px`;
    }
    document.querySelectorAll('.header-mark').forEach(mark => {
        mark.style.width = mark.style.height = `${Math.round(size * 1.93)}px`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setInterval(() => {
        toggleOfflineMode(!window.online);
    }, 200);

    initDebugMode();
    restoreTabFromHash();
    adaptForPwa();
    fitMobileHeader();
    document.fonts?.ready.then(fitMobileHeader);
    window.addEventListener('resize', fitMobileHeader);
    window.addEventListener('hashchange', async () => {
        const target = hashToTab[window.location.hash.substring(1)] ?? 0;
        if (target !== window.currentTab) {
            if (!(await confirmLeaveConfig())) {
                history.pushState(null, '', `#${tabHashes[window.currentTab]}`);
                return;
            }
            window.configLoaded = false;
        }
        restoreTabFromHash();
    });

    logDebug(`[App] Environment: secureContext=${window.isSecureContext}, serviceWorker=${'serviceWorker' in navigator}, ` +
        `pwa=${!!Platform.isPWA()}, ios=${Platform.isIOS()}, android=${Platform.isAndroid()}, ua=${navigator.userAgent}`);

    if (!('serviceWorker' in navigator)) {
        logDebug('[App] Service Worker API is not available on this page');
    }

    checkCertificateTrust().then((result) => {
        logDebug(describeCertificateCheck(result));
        if (result.trusted === false) {
            showCertificateBanner();
        }
    });

    if ('serviceWorker' in navigator) {
        let registration;

        let workerUrl = '/sw.js';
        try {
            if (sessionStorage.getItem('swReset') === '1') {
                sessionStorage.removeItem('swReset');
                workerUrl = `/sw.js?reset=${Date.now()}`;
                logDebug('[App] Reset App: installing the service worker again');
            }
        } catch (e) {
            logDebug('[App] Reset App mark error', e.message);
        }

        window.addEventListener('load', () => {
            navigator.serviceWorker.register(workerUrl)
                .then(reg => {
                    registration = reg;
                    initPushNotifications();
                    logDebug('[App] Service Worker registered');

                    // Check for updates every 30 seconds (for development)
                    setInterval(() => {
                        if (registration) {
                            registration.update().then(() => {
                                updateFailures = 0;
                                document.getElementById('cert-lost-banner')?.remove();
                            }).catch(err => {
                                logDebug('[App] Update check failed:', err.message);
                                updateFailures = navigator.onLine && err.name === 'TypeError' ? updateFailures + 1 : 0;
                                if (/SSL|certificate/i.test(err.message || '') || updateFailures >= UPDATE_FAILURES_BEFORE_BANNER) {
                                    showCertificateLostBanner();
                                }
                            });
                        }
                    }, 10000);

                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                            logDebug('[App] New Service Worker found, installing...');

                            newWorker.addEventListener('statechange', () => {
                                logDebug(`[App] New SW state: ${newWorker.state}`);

                                if (newWorker.state === 'installed') {
                                    logDebug('[App] New version is installed and waiting');
                                }
                            });
                        }
                    });

                    const waitingWorker = registration.waiting;
                    if (waitingWorker) {
                        logDebug('[App] Service Worker is waiting to activate');

                        if (waitingWorker.state === 'installed') {
                            logDebug('[App] New version is installed and waiting');
                         
                            if (checkAppVersion()) {
                                logDebug('[App] New version detected, showing update banner');
                                showUpdateBanner();
                            }
                        }
                    }

                    const versionWorker = navigator.serviceWorker.controller || registration.active;
                    if (versionWorker) {
                        versionWorker.postMessage({ type: 'GET_VERSION' });
                    }
                })
                .catch(err => {
                    console.error('[App] SW registration failed:', err);
                    logDebug('[App] SW registration failed:', `${err.name}: ${err.message}`);
                    if (/SSL|certificate/i.test(err.message || '')) {
                        showCertificateBanner();
                    }
                });
        });

        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'VERSION') {
                window.appVersion = event.data.version || 'unknown';
                logDebug(`[App] Current version:`, window.appVersion, event.data.event ? `(received on ${event.data.event} event)` : '');
                if (event.data.event === 'install') {
                    logDebug('[App] Version info received during install event');

                    if (checkAppVersion()) {
                        logDebug('[App] New version detected, showing update banner');
                        showUpdateBanner();
                    }
                } else if (event.data.event === 'activate') {
                    logDebug('[App] Version info received during activate event');
                    showVersion(window.appVersion);
                } else {
                    if (!localStorage.getItem('appVersion') && window.appVersion !== 'unknown') {
                        localStorage.setItem('appVersion', window.appVersion);
                    }
                    showVersion(window.appVersion);
                }
            }

            if (event.data && event.data.type === 'OPEN_TAB') {
                const tabIndex = event.data.tab;
                logDebug(`[App] Received request to open tab ${tabIndex} from Service Worker`);
                if (typeof window.switchTab === 'function') {
                    window.switchTab(tabIndex);
                }
                window.scrollTo(0, 0);
            }

            if (event.data && event.data.type === 'ONLINE_STATUS') {
                if (window.online !== event.data.online) {
                    logDebug(`[App] Received online status from SW: ${event.data.online}`);
                }
                window.online = event.data.online;
            }

            if (event.data && event.data.type === 'LOG_DEBUG') {
                logDebug(event.data.message);
            }
        });
    }
});