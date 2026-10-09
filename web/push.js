import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { DATA_PATH, ROOT_DIR } from './paths.js';

const SUBSCRIPTIONS_FILE = path.join(DATA_PATH, 'push_subscriptions.json');
const VAPID_PATH = path.join(DATA_PATH, 'vapid.json');
const QUEUE_DIR = path.join(DATA_PATH, 'queue');
const MAX_MESSAGES_PER_MINUTE = 10;

let pushSubscriptions = [];
let vapidKeys = null;
let messagesSentThisMinute = 0;
let currentMinute = Math.floor(Date.now() / 60000);

function loadSubscriptions() {
    try {
        if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
            pushSubscriptions = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'));
            console.log(`[Push] Loaded ${pushSubscriptions.length} subscriptions from file`);
        }
    } catch (e) {
        console.error('[Push] Failed to load subscriptions:', e.message);
        pushSubscriptions = [];
    }
}

function saveSubscriptions() {
    try {
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(pushSubscriptions, null, 2));
    } catch (e) {
        console.error('[Push] Failed to save subscriptions:', e.message);
    }
}

function generateVapidKeys() {
    console.log('[VAPID] Generating new keys...');
    const keys = webpush.generateVAPIDKeys();

    fs.writeFileSync(VAPID_PATH, JSON.stringify({
        publicKey: keys.publicKey,
        privateKey: keys.privateKey
    }, null, 2), { mode: 0o600 });

    console.log('[VAPID] ✅ New keys generated and saved');
    return keys;
}

function loadVapidKeys() {
    if (!fs.existsSync(VAPID_PATH)) {
        return generateVapidKeys();
    }
    try {
        const keys = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf-8'));
        console.log('[VAPID] Keys loaded successfully');
        return keys;
    } catch (e) {
        console.warn('[VAPID] Invalid vapid.json, regenerating...');
        return generateVapidKeys();
    }
}

function pushEmail() {
    let value = '';
    for (const file of ['tun.defaults', 'tun.config']) {
        try {
            const match = fs.readFileSync(path.join(ROOT_DIR, file), 'utf-8')
                .match(/^[ \t]*WEB_PUSH_EMAIL=["']?([^"'\s#]*)/m);
            if (match) value = match[1];
        } catch {
            continue;
        }
    }
    return value || 'root@localhost';
}

async function sendNotification(subscription, body) {
    const payload = {
        title: "Tunnel Control Panel",
        body: body,
        url: "/",
        requireInteraction: false
    };

    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), {
            TTL: 60,
            urgency: 'normal',
            vapidDetails: {
                subject: 'mailto:' + pushEmail(),
                publicKey: vapidKeys.publicKey,
                privateKey: vapidKeys.privateKey
            }
        });

        console.log('[Push] Sent successfully', subscription.endpoint);
        return true;
    } catch (error) {
        console.warn('[Push] Send failed:', subscription.endpoint, error.statusCode, error.message);

        if (error.statusCode === 404 || error.statusCode === 410 || error.statusCode === 401) {
            console.log('[Push] Removing dead subscription', subscription.endpoint);
            pushSubscriptions = pushSubscriptions.filter(sub => sub.endpoint !== subscription.endpoint);
            saveSubscriptions();
        }

        return false;
    }
}

async function sendNotificationsToAll(msg) {
    if (pushSubscriptions.length === 0) return;

    console.log(`[Push] Sending notification to ${pushSubscriptions.length} subscribers`);

    const results = await Promise.allSettled(pushSubscriptions.map(sub => sendNotification(sub, msg)));

    const validCount = results.filter(r => r.value === true).length;
    console.log(`[Push] Sent successfully to ${validCount}/${pushSubscriptions.length} clients`);
}

async function checkMessageQueue() {
    try {
        if (!fs.existsSync(QUEUE_DIR)) {
            fs.mkdirSync(QUEUE_DIR, { recursive: true });
            return;
        }

        const nowMinute = Math.floor(Date.now() / 60000);
        if (nowMinute !== currentMinute) {
            messagesSentThisMinute = 0;
            currentMinute = nowMinute;
        }

        if (messagesSentThisMinute >= MAX_MESSAGES_PER_MINUTE) {
            return;
        }

        const files = fs.readdirSync(QUEUE_DIR)
            .filter(f => f.startsWith('message_'))
            .map(filename => ({
                name: filename,
                path: path.join(QUEUE_DIR, filename),
                time: fs.statSync(path.join(QUEUE_DIR, filename)).mtimeMs
            }))
            .sort((a, b) => a.time - b.time);

        if (files.length === 0) return;

        const oldestFile = files[0];
        const content = fs.readFileSync(oldestFile.path, 'utf-8').trim();
        fs.unlinkSync(oldestFile.path);

        if (!content) return;

        console.log(`[Queue] Processing: ${oldestFile.name}`);
        await sendNotificationsToAll(content);
        messagesSentThisMinute++;
    } catch (err) {
        console.error('[Queue] Error:', err.message);
    }
}

async function processQueueLoop() {
    await checkMessageQueue();
    setTimeout(processQueueLoop, 1000);
}

export function addToQueue(message) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    fs.writeFileSync(path.join(QUEUE_DIR, `message_${timestamp}_${random}`), message);
}

export function startPush() {
    vapidKeys = loadVapidKeys();

    loadSubscriptions();

    if (!fs.existsSync(QUEUE_DIR)) {
        fs.mkdirSync(QUEUE_DIR, { recursive: true });
    }

    processQueueLoop();
}

export default async function pushRoutes(app) {
    app.get('/api/push/vapid-public-key', async () => {
        if (!vapidKeys || !vapidKeys.publicKey) {
            return { success: false, error: 'VAPID keys not available' };
        }
        return { success: true, publicKey: vapidKeys.publicKey };
    });

    app.post('/api/push/subscribe', async (request) => {
        try {
            const subscription = request.body;
            if (!subscription || !subscription.endpoint) {
                return { success: false, error: 'Invalid subscription' };
            }

            const wasExisting = pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);

            pushSubscriptions = pushSubscriptions.filter(sub => sub.endpoint !== subscription.endpoint);
            pushSubscriptions.push(subscription);
            saveSubscriptions();

            console.log(`[Push] Subscription saved. Total: ${pushSubscriptions.length}`);

            if (!wasExisting) {
                try {
                    await sendNotification(subscription, "✅ Connection successful!\nYou will now receive important notifications about tunnel status.");
                    console.log('[Push] Welcome notification sent to new subscription');
                } catch (e) {
                    console.warn('[Push] Welcome notification failed:', e.message);
                }
            } else {
                console.log('[Push] Subscription updated (already existed)');
            }

            return { success: true };
        } catch (err) {
            console.error('[Push] Subscribe error:', err);
            return { success: false, error: err.message };
        }
    });
}
