import { logDebug } from './debug.js';
import { Platform } from './platform.js';

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function configNotLoaded(reason) {
    const editor = document.getElementById('config-editor');
    if (editor) editor.value = `Config not loaded: ${reason}. Reload the page to try again.`;
    window.showToast('Config not loaded', 'error');
}

export async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.success) {
            const editor = document.getElementById('config-editor');
            if (editor) {
                editor.value = data.content;
                window.configLoaded = true;
            }
        } else {
            configNotLoaded(data.error || 'the server refused');
        }
    } catch (e) {
        logDebug('loadConfig error', e.message);
        configNotLoaded(e.message);
    }
}

export async function saveConfig() {
    if (!window.configLoaded) return false;

    if (!window.hasUnsavedConfigChanges()) return true;

    const editor = document.getElementById('config-editor');
    if (!editor) return false;

    const content = editor.value;

    if (!content.trim()) {
        window.showToast("Config cannot be empty", 'error');
        return false;
    }

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        const data = await res.json();

        if (data.success) {
            window.showConfigErrors(content, []);
            window.originalConfig = editor.value;
            window.showButtonSave(editor);
            window.showToast("Configuration saved, restart the tunnels to apply it");
            return true;
        }
        if (Array.isArray(data.errors) && data.errors.length) {
            window.showConfigErrors(content, data.errors);
            const count = data.errors.length;
            window.showToast(`Config not saved: ${count} error${count === 1 ? '' : 's'}`, 'error');
            return false;
        }
        window.showToast("Error: " + (data.error || 'Unknown error'), 'error');
        return false;
    } catch (e) {
        window.showToast("Failed to save configuration", 'error');
        console.error('saveConfig error:', e);
        return false;
    }
}

export async function loadLogs(logType = 'main', scrollToBottom = true) {
    const select = document.getElementById('log-type');
    if (select) {
        try {
            const list = await (await fetch('/api/logs/list')).json();
            if (list.success) {
                for (const option of [...select.options]) {
                    if (!list.types.includes(option.value)) option.remove();
                }
                if (!list.types.includes(logType)) logType = list.types[0] || 'main';
                const notice = document.getElementById('logs-notice');
                if (notice) {
                    notice.textContent = list.notice || '';
                    notice.classList.toggle('hidden', !list.notice);
                }
            }
        } catch (e) {
            logDebug('loadLogs list error', e.message);
        }
    }

    window.currentLogType = logType;
    if (select) {
        select.value = logType;
    }

    try {
        const res = await fetch(`/api/logs?type=${logType}&lines=200`);
        const data = await res.json();
        const contentEl = document.getElementById('logs-content');

        if (!contentEl) {
            return;
        }
        
        if (data.success) {
            let logText = data.content || '';
            logText = logText.replace(/\n+$/, '');
            contentEl.textContent = logText || '(log is empty)';
            
            if (scrollToBottom) {
                contentEl.scrollTop = contentEl.scrollHeight;
            }
        } else {
            contentEl.textContent = `Error: ${data.error}`;
        }
    } catch (e) {
        console.error(e);
        logDebug('loadLogs error', e.message);
    }
}

let updateSysInfoTimeout = null;

export async function updateSysInfo(timeout = 10000) {
    if (updateSysInfoTimeout) {
        clearTimeout(updateSysInfoTimeout);
        updateSysInfoTimeout = null;
    }

    try {
        const res = await fetch('/api/sysinfo');
        const data = await res.json();
        
        const el = document.getElementById('sysinfo-content');
        if (!data.success || !data.output) {
            el.textContent = data.error || 'No data';
            return;
        }

        const output = data.output.trim();
        const items = output.split('|').map(item => item.trim()).filter(Boolean);
        const valueClass = (key) => key === 'Update'
            ? 'px-2 py-0.5 rounded-lg border border-blue-500 text-blue-600 dark:text-blue-400'
            : 'text-gray-900 dark:text-gray-100';

        if (Platform.isIOS() || Platform.isAndroid()) {
            let html = `<div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">`;
            items.forEach(item => {
                const [key, value] = item.split(':').map(s => s.trim());
                if (key && value) {
                    html += `
                        <div class="text-gray-500 dark:text-gray-400">${escapeHtml(key)}:</div>
                        <div class="font-mono text-right ${valueClass(key)}">${escapeHtml(value)}</div>
                    `;
                }
            });
            html += `</div>`;
            el.innerHTML = html;
        } else {
            let html = `<div class="text-sm">`;
            items.forEach(item => {
                const [key, value] = item.split(':').map(s => s.trim());
                if (key && value) {
                    html += `
                        <span class="text-gray-500 dark:text-gray-400">${escapeHtml(key)}: </span>
                        <span class="font-mono ${valueClass(key)}">${escapeHtml(value)}</span>
                    `;
                }
            });
            html += `</div>`;
            el.innerHTML = html;
        }
    } catch (e) {
        console.error(e);
        logDebug('loadSysInfo error', e.message);
        document.getElementById('sysinfo-content').textContent = 'Failed to load sysinfo';
    }

    updateSysInfoTimeout = setTimeout(updateSysInfo, timeout);
}

let updateTunStatusTimeout = null;

export async function updateTunStatus() {
    const statusCard = document.getElementById('tun-status-card');
    const statusText = document.getElementById('tun-status-text');
    const statusBadge = document.getElementById('tun-status-badge');
    const statusTime = document.getElementById('tun-status-time');

    if (!statusText || !statusBadge) return;

    if (updateTunStatusTimeout) {
        clearTimeout(updateTunStatusTimeout);
        updateTunStatusTimeout = null;
    }

    try {
        const res = await fetch('/api/tun/status');
        const data = await res.json();

        if (!data.success) {
            statusText.textContent = 'Error';
            statusBadge.textContent = 'ERROR';
            statusBadge.className = 'px-4 py-1.5 text-sm font-medium rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400';
            return;
        }

        const now = Date.now();

        if (data.phase === 'start' && data.phaseTime) {
            const date = new Date(data.phaseTime * 1000);
            const timeStr = date.toLocaleString('en-GB', {
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit', 
                minute: '2-digit'
            });

            statusText.textContent = 'Running';
            statusBadge.textContent = 'ACTIVE';
            statusBadge.className = 'px-4 py-1.5 text-sm font-medium rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400';

            statusTime.textContent = `Started: ${timeStr}`;

        } else if (data.phase === 'stop' && data.phaseTime) {
            const date = new Date(data.phaseTime * 1000);
            const timeStr = date.toLocaleString('en-GB', {
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit', 
                minute: '2-digit'
            });

            statusText.textContent = 'Stopped';
            statusBadge.textContent = 'INACTIVE';
            statusBadge.className = 'px-4 py-1.5 text-sm font-medium rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400';

            statusTime.textContent = `Stopped: ${timeStr}`;

        } else {
            statusText.textContent = 'Unknown';
            statusBadge.textContent = 'UNKNOWN';
            statusBadge.className = 'px-4 py-1.5 text-sm font-medium rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
            statusTime.textContent = '';
        }
    } catch (e) {
        console.error('Failed to update tun status:', e);
        statusText.textContent = 'Unavailable';
        statusBadge.textContent = 'OFFLINE';
        statusBadge.className = 'px-4 py-1.5 text-sm font-medium rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    }

    if (window.currentTab === 3) {
        updateTunStatusTimeout = setTimeout(updateTunStatus, 1000);
    }
}