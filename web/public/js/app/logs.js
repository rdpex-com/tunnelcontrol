import { loadLogs } from './api.js';

let logAutoRefreshInterval = null;

export function changeLogType() {
    const selected = document.getElementById('log-type').value;
    loadLogs(selected, true);
}

export function refreshLogs() {
    loadLogs(window.currentLogType, true);
}

export function startLogAutoRefresh() {
    if (!window.autoScrollLogs) return;
    if (logAutoRefreshInterval) clearInterval(logAutoRefreshInterval);
   
    logAutoRefreshInterval = setInterval(() => {
        if (window.currentTab === 2) {
            const shouldScroll = !!window.autoScrollLogs;
            loadLogs(window.currentLogType, shouldScroll);
        }
    }, 3000);
}

export function toggleAutoScroll(checkbox) {
    window.autoScrollLogs = checkbox.checked;
    
    if (window.autoScrollLogs) {
        const logsContent = document.getElementById('logs-content');
        if (logsContent) logsContent.scrollTop = logsContent.scrollHeight;

        startLogAutoRefresh();
    } else {
        if (logAutoRefreshInterval) {
            clearInterval(logAutoRefreshInterval);
            logAutoRefreshInterval = null;
        }
    }
};