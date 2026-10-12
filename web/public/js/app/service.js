import { logDebug } from './debug.js';

let updateServiceStatusTimeout = null;

export async function updateServiceStatus(timeout = 1000) {
    if (updateServiceStatusTimeout) {
        clearTimeout(updateServiceStatusTimeout);
        updateServiceStatusTimeout = null;
    }

    try {
        const res = await fetch('/api/service/status');
        const data = await res.json();
        if (!data.success) return;

        updateTopServiceStatus(data.isRunning);

        if (window.currentTab === 3) {
            const btnStart = document.getElementById('btn-start');
            const btnStop = document.getElementById('btn-stop');
            const btnRestart = document.getElementById('btn-restart');

            if (data.isActive) {
                if (btnStart) btnStart.disabled = true;
                if (btnStop) btnStop.disabled = false;
                if (btnRestart) btnRestart.disabled = false;
            } else {
                if (btnStart) btnStart.disabled = false;
                if (btnStop) btnStop.disabled = true;
                if (btnRestart) btnRestart.disabled = true;
            }
        }
    } catch (e) {
        console.error('Failed to update service status:', e);
        logDebug('updateServiceStatus error', e.message);
    }

    updateServiceStatusTimeout = setTimeout(updateServiceStatus, timeout);
}

function updateTopServiceStatus(isRunning) {
    const dot = document.getElementById('service-dot');
    const statusText = document.getElementById('service-status');

    if (isRunning) {
        dot.className = "w-4 h-4 rounded-full bg-green-500";
        statusText.textContent = "RUNNING";
        statusText.className = "text-xl font-semibold text-green-400";
    } else {
        dot.className = "w-4 h-4 rounded-full bg-red-500";
        statusText.textContent = "STOPPED";
        statusText.className = "text-xl font-semibold text-red-400";
    }
}

export async function controlService(action) {
    const actionNames = { start: "Start", stop: "Stop", restart: "Restart" };
    
    if (!confirm(`${actionNames[action]} tunnel service?`)) return;

    try {
        const res = await fetch('/api/service', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        const data = await res.json();

        if (data.success) {
            updateServiceStatus();
        } else {
            window.showToast(`✗ ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (e) {
        window.showToast("Failed to send command", 'error');
    }
}