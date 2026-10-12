import { Platform } from './platform.js';
import { logDebug } from './debug.js';

let isPushEnabled = false;
let vapidPublicKey = null;
let pushDisabled = false;

export async function getVapidPublicKey(refresh = false) {
    if (vapidPublicKey && !refresh) return vapidPublicKey;
    try {
        const res = await fetch('/api/push/vapid-public-key');
        const data = await res.json();
        pushDisabled = data.disabled === true;
        if (pushDisabled) vapidPublicKey = null;
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

export async function pushIsOff() {
    if (!vapidPublicKey) await getVapidPublicKey();
    return pushDisabled;
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
    let subscription = null;
    try {
        logDebug('[Notifications] Attempting to subscribe...');
        const registration = await navigator.serviceWorker.ready;
        subscription = await registration.pushManager.subscribe({
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
            if (result.disabled) pushDisabled = true;
            await dropSubscription(subscription);
            return false;
        }
    } catch (err) {
        logDebug('[Notifications] Subscribe error', {
            name: err.name,
            message: err.message,
            stack: err.stack?.substring(0, 300)
        });
        await dropSubscription(subscription);
        return false;
    }
}

async function dropSubscription(subscription) {
    isPushEnabled = false;
    localStorage.removeItem('pushSubscribed');
    if (!subscription) return;
    try {
        await subscription.unsubscribe();
        logDebug('[Notifications] Browser subscription withdrawn');
    } catch (e) {
        logDebug('[Notifications] Cannot withdraw the browser subscription', e.message);
    }
}

function subscriptionKey(subscription) {
    const buffer = subscription.options && subscription.options.applicationServerKey;
    if (!buffer) return null;
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function resendSubscription() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const key = await getVapidPublicKey();
        const ownKey = subscriptionKey(subscription);
        if (key && ownKey && ownKey !== key) {
            logDebug('[Notifications] Subscription made with an old server key, subscribing again');
            await dropSubscription(subscription);
            if (Notification.permission === 'granted') await subscribeUser();
            return;
        }
        const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
        const result = await res.json();
        if (!result.success) {
            logDebug('[Notifications] Server rejected the existing subscription', result);
            if (result.disabled) pushDisabled = true;
            await dropSubscription(subscription);
        }
    } catch (e) {
        logDebug('[Notifications] Cannot resend the existing subscription', e.message);
    }
}

export async function ensurePushSubscription(requireUserGesture = false) {
    logDebug('[Notifications] ensurePushSubscription called', { requireUserGesture, isIOS: Platform.isIOS() });
    await checkExistingSubscription();
    if (isPushEnabled && !requireUserGesture) await resendSubscription();
    if (isPushEnabled) {
        logDebug('[Notifications] Already subscribed - hiding button');
        updateNotificationButton();
        return true;
    }
    const asksByItself = Platform.isAndroid() ||
        (/Chrome\//.test(navigator.userAgent) && !/Edg\/|OPR\//.test(navigator.userAgent));
    if (!asksByItself && !requireUserGesture && Notification.permission !== 'granted') {
        logDebug('[Notifications] Not Android or Chrome → showing button (this browser asks only on a click)');
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

const BLOCKED_MESSAGE = 'Notifications are blocked for this panel in the browser: allow them in the site settings ' +
    '(the lock icon next to the address), then reload the page.';

export async function requestNotificationPermission() {
    logDebug('[Notifications] User clicked Enable Push button');
    if (Notification.permission === 'denied') {
        window.showToast(BLOCKED_MESSAGE, 'error', 8000);
        return;
    }
    const success = await ensurePushSubscription(true);
    if (success) {
        updateNotificationButton();
        window.showToast("✅ Push notifications enabled successfully!");
    } else {
        if (Notification.permission === 'denied') {
            window.showToast(BLOCKED_MESSAGE, 'error', 8000);
        } else {
            window.showToast('Failed to enable push notifications', 'error');
        }
    }
}


export async function updateNotificationButton() {
    if (!Platform.supportsPush() || window.currentTab !== 3) return;

    await getVapidPublicKey(true);

    const btn = document.getElementById('enable-push-btn');
    if (!btn) {
        logDebug('[Notifications] ERROR: #enable-push-btn element not found!');
        return;
    }
    if (pushDisabled) {
        btn.style.display = 'none';
        logDebug('[Notifications] Button hidden (push notifications are off on the server)');
        return;
    }

    await checkExistingSubscription();

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
    await getVapidPublicKey();
    if (pushDisabled) {
        logDebug('[Notifications] Push notifications are off on the server');
        updateNotificationButton();
        return;
    }
    await ensurePushSubscription(false);
    updateNotificationButton();
    logDebug('[Notifications] === PUSH INIT FINISHED ===');
}