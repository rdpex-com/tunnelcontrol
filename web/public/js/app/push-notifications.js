import { Platform } from './platform.js';
import { logDebug } from './debug.js';

let isPushEnabled = false;
let vapidPublicKey = null;

export async function getVapidPublicKey() {
    if (vapidPublicKey) return vapidPublicKey;
    try {
        const res = await fetch('/api/push/vapid-public-key');
        const data = await res.json();
        if (data.success && data.publicKey) {
            vapidPublicKey = data.publicKey;
            logDebug('[Notifications] VAPID key received', { length: vapidPublicKey.length });
            return vapidPublicKey;
        }
    } catch (e) {
        logDebug('[Notifications] Failed to get VAPID key', e.message);
    }
    return null;
}

export async function checkExistingSubscription() {
    if (!Platform.supportsPush()) {
        logDebug('[Notifications] Push not supported by browser');
        return false;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        const hasSub = !!subscription;
        const hasPermission = Notification.permission === 'granted';
        
        isPushEnabled = hasSub && hasPermission;
        logDebug('[Notifications] Check subscription', {
            hasSubscription: hasSub,
            permission: Notification.permission,
            isPushEnabled: isPushEnabled
        });
        return isPushEnabled;
    } catch (err) {
        logDebug('[Notifications] checkExistingSubscription failed', err.message);
        return false;
    }
}

export async function subscribeUser() {
    const key = await getVapidPublicKey();
    if (!key) {
        logDebug('[Notifications] Cannot subscribe - no VAPID key');
        return false;
    }
    try {
        logDebug('[Notifications] Attempting to subscribe...');
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key
        });
        const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
        const result = await res.json();
        if (result.success) {
            localStorage.setItem('pushSubscribed', 'true');
            isPushEnabled = true;
            logDebug('[Notifications] ✅ Successfully subscribed to push');
            return true;
        } else {
            logDebug('[Notifications] Server rejected subscription', result);
            return false;
        }
    } catch (err) {
        logDebug('[Notifications] Subscribe error', {
            name: err.name,
            message: err.message,
            stack: err.stack?.substring(0, 300)
        });
        return false;
    }
}

export async function ensurePushSubscription(requireUserGesture = false) {
    logDebug('[Notifications] ensurePushSubscription called', { requireUserGesture, isIOS: Platform.isIOS() });
    await checkExistingSubscription();
    if (isPushEnabled) {
        logDebug('[Notifications] Already subscribed - hiding button');
        updateNotificationButton();
        return true;
    }
    if (Platform.isIOS() && !requireUserGesture) {
        logDebug('[Notifications] iOS detected → showing button (no auto-subscribe)');
        updateNotificationButton();
        return false;
    }
    if (!requireUserGesture) {
        if (Notification.permission === 'denied') {
            logDebug('[Notifications] Notification permission denied');
            return false;
        }
        if (Notification.permission === 'default') {
            logDebug('[Notifications] Requesting notification permission...');
            const perm = await Notification.requestPermission();
            logDebug('[Notifications] Permission result', perm);
            if (perm !== 'granted') return false;
        }
        return await subscribeUser();
    } else {
        return await subscribeUser();
    }
}

export async function requestNotificationPermission() {
    logDebug('[Notifications] User clicked Enable Push button');
    const success = await ensurePushSubscription(true);
    if (success) {
        updateNotificationButton();
        window.showToast("✅ Push notifications enabled successfully!");
    } else {
        window.showToast("Error: Failed to enable push notifications. Check debug info.", 'error');
    }
}

export function updateNotificationButton() {
    if (!Platform.isPWA() || window.currentTab !== 3) return;
    
    const btn = document.getElementById('enable-push-btn');
    if (!btn) {
        logDebug('[Notifications] ERROR: #enable-push-btn element not found!');
        return;
    }
    if (isPushEnabled) {
        btn.style.display = 'none';
        logDebug('[Notifications] Button hidden (already enabled)');
    } else {
        btn.style.display = 'block';
        logDebug('[Notifications] Button shown');
    }
}

export async function initPushNotifications() {
    if (
        typeof window === 'undefined' || 
        !('Notification' in window) || 
        typeof Notification !== 'function'
    ) {
        logDebug('[Notifications] Notification API not supported');
        return;
    }

    logDebug('[Notifications] === PUSH INIT START ===', {
        isPWA: Platform.isPWA(),
        isIOS: Platform.isIOS(),
        isAndroid: Platform.isAndroid(),
        supportsPush: Platform.supportsPush(),
        permission: Notification.permission
    });
    await ensurePushSubscription(false);
    updateNotificationButton();
    logDebug('[Notifications] === PUSH INIT FINISHED ===');
}