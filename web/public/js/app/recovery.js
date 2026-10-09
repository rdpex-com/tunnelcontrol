let errorMessage = null;

function showRecoveryBanner(message, subMessage = '') {
    let banner = document.getElementById('recovery-banner');
   
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'recovery-banner';
        banner.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #dc2626;
            color: white;
            padding: 20px 28px;
            border-radius: 12px;
            font-weight: bold;
            font-size: 15px;
            box-shadow: 0 10px 25px -3px rgb(0 0 0 / 0.4);
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            flex-direction: column;
            min-width: 340px;
            max-width: 90vw;
            line-height: 1.4;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            pointer-events: none;
        `;
        document.body.appendChild(banner);
    }

    banner.innerHTML = `
        ⚠️ Critical error on load<br>
        <span style="font-size:14px; opacity:0.9;">${message}</span>
    `;

    if (subMessage) {
        banner.innerHTML += `<span style="font-size:13px; opacity:0.8; margin-top:6px;">${subMessage}</span>`;
    }

    if (errorMessage) {
        banner.innerHTML += `<span style="font-size:12px; opacity:0.7; margin-top:6px;">${errorMessage}</span>`;
    }
}
    
window.__recoveryAttempted = false;

function forceUpdateAndReload() {
    if (window.__recoveryAttempted) return;
    window.__recoveryAttempted = true;

    console.error('%c[EMERGENCY RECOVERY] Critical error! Forcing SW update...', 
                'color: red; font-weight: bold; font-size: 14px');

    setInterval(() => {
        waitingForUpdateAndReload();
    }, 1000);
}

function reloadWithRecovery() {    
    console.error('%c[RECOVERY] Reloading with ?recovery parameter...', 'color: orange; font-weight: bold');

    let url = new URL(window.location.href);
    let current = url.searchParams.get('recovery');
    let next = current ? parseInt(current, 10) + 1 : 1;

    url.searchParams.set('recovery', next);
    console.log(`%c[RECOVERY] Counter → ${next}`, 'color: orange');

    window.location.replace(url.toString());
}

function waitingForUpdateAndReload() {
    const message = 'Attempting to recover from error...';
    let reload = false;

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {                        
            if (reg) {
                console.log('[Recovery] Registration found. installing:', !!reg.installing, 'waiting:', !!reg.waiting);

                let subMessage = '';
                if (!reg.waiting && !reg.installing) {
                    subMessage = 'Attempting to update...';
                } else if (reg.installing) {
                    subMessage = 'Installing new version...';
                } else if (reg.waiting) {
                    subMessage = 'New version ready. Finalizing recovery...';
                }
                showRecoveryBanner(message, subMessage);
                
                if (reg.installing) {
                    reg.installing.onstatechange = function() {
                        if (this.state === 'installed') {
                            console.log('[Recovery] New SW installed. Forcing skipWaiting...');
                            showRecoveryBanner(message, 'New version installed. Finalizing recovery...');
                            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                            reload = 1000;
                        }
                    };
                }
                
                if (reg.waiting) {
                    console.log('[Recovery] SW is waiting. Forcing skipWaiting...');
                    showRecoveryBanner(message, 'New version available. Forcing update...');
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    reload = 1000;
                }
                
                reg.update().catch(() => {});
            }
            
            if (reload) {
                console.log('[Recovery] Reloading page...');
                showRecoveryBanner(message, 'Reloading application to complete recovery...');
            }
        }).catch(() => {
            console.error('[Recovery] Error occurred while trying to update Service Worker.');
            showRecoveryBanner(message, 'Failed to update new version. Reloading application...');
        });
    } else {
        console.error('[Recovery] Service Worker not supported. Reloading page...');
        showRecoveryBanner(message, 'SW not supported. Reloading application...');
    }

    if (!reload) {
        reload = 10000;
    }

    setTimeout(() => {
        reloadWithRecovery();
    }, reload);
}

function isNetworkOrLoadingError(error) {
    const badKeywords = [
        'failed to update',
        'fetching',
        'failed to fetch',
        'fetch',
        'networkerror',
        'load failed',
        'could not load',
        //'serviceworker',
        //'service worker',
        'offline',
        'no network',
        'connection',
        'timeout'
    ];

    return (badKeywords.some(keyword => error.includes(keyword)));
}

function shouldTriggerRecovery(error) {
    if (!error) return false;

    if (isNetworkOrLoadingError(error)) {        
        console.log('%c[Recovery] Network/Loading error ignored', 'color: orange');
        window.online = false;
        return false;
    }

    return true;
}

function errorToString(e) {
    if (!e) return false;

    let msg = '';
    let stack = '';

    if (e.message || e.reason?.message) msg = e.message || e.reason.message;
    if (e.stack || e.reason?.stack) stack = e.stack || e.reason.stack;

    return (msg || stack).toString().toLowerCase();
}

window.addEventListener('error', (e) => {
    const errorString = errorToString(e);
    console.error('[Recovery] Global error caught:', errorString);
    
    if (shouldTriggerRecovery(errorString)) {
        forceUpdateAndReload();
    }
});

window.addEventListener('unhandledrejection', (e) => {
    const errorString = errorToString(e);
    console.error('[Recovery] Unhandled rejection:', errorString);

    if (shouldTriggerRecovery(errorString)) {
        forceUpdateAndReload();
    }
});