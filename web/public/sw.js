const VER = '1.3.261008.234225';
const CACHE_NAME = 'tunnel-control-v' + VER;
const DYNAMIC_CACHE = 'tunnel-dynamic-v' + VER;
const skipCache = false;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/manifest.json',
    '/favicon.png',
    '/css/style.css',
    '/css/fontawesome.min.css',
    '/js/tailwind.min.js',
    '/js/htmx.min.js',
    '/js/chart.umd.min.js',
    '/js/app/platform-early.js',
    '/js/app/cert-check.js',
    '/js/app/recovery.js',
    '/js/app/api.js',
    '/js/app/dashboard.js',
    '/js/app/debug.js',
    '/js/app/logs.js',
    '/js/app/main.js',
    '/js/app/platform.js',
    '/js/app/push-notifications.js',
    '/js/app/service.js',
    '/js/app/ui.js',
    '/js/app/utils.js',
    '/img/favicon64.png',
    '/img/favicon64w.png',
    '/img/favicon256.png',
    '/img/favicon256w.png',
    '/img/favicon512.png',
    '/img/favicon512w.png',
    '/img/image256.png',
    '/img/image512.png',
    '/webfonts/fa-brands-400.woff2',
    '/webfonts/fa-brands-400.ttf',
    '/webfonts/fa-regular-400.woff2',
    '/webfonts/fa-regular-400.ttf',
    '/webfonts/fa-solid-900.woff2',
    '/webfonts/fa-solid-900.ttf',
    '/webfonts/fa-v4compatibility.woff2',
    '/webfonts/fa-v4compatibility.ttf'
];

function logDebug(message, data = null) {
    const time = new Date().toTimeString().slice(0, 8);
    const millisecond = new Date().getMilliseconds().toString().padStart(3, '0');
    let text = `[${time}.${millisecond}] ${message}`;

    if (data) {
        text += '\n' + (typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data));
    }

    //console.log(text);

    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'LOG_DEBUG',
                message: message
            });
        });
    });
}

logDebug('[SW] Service Worker script loaded, version:', VER);

let broadcastTimeout = null;
let lastBroadcastStatus = null;
const BROADCAST_DEBOUNCE_MS = 100;

function broadcastOnlineStatus(isOnline) {
    lastBroadcastStatus = isOnline;

    if (broadcastTimeout) {
        clearTimeout(broadcastTimeout);
    }

    broadcastTimeout = setTimeout(() => {
        if (lastBroadcastStatus === null) return;

        //logDebug(`[SW] Broadcast online status: ${lastBroadcastStatus} (debounced)`);

        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'ONLINE_STATUS',
                    online: lastBroadcastStatus,
                    timestamp: Date.now()
                });
            });
        });

        broadcastTimeout = null;
    }, BROADCAST_DEBOUNCE_MS);
}

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
    logDebug('[SW] Installing Service Worker...');

    if (!skipCache) {
        event.waitUntil(        
            caches.open(CACHE_NAME).then((cache) => {
                logDebug('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }).then(() => {
                self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'VERSION', version: VER, event: 'install' });
                    });
                });
            })
        );
    }
    
    self.skipWaiting(); // Activate right away
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
    logDebug('[SW] Activating Service Worker...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE) {
                        logDebug('[SW] Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            logDebug('[SW] All old caches deleted');
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'VERSION', version: VER, event: 'activate' });
                });
            });
        })
    );
    
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const method = event.request.method;

    if (url.origin !== self.location.origin) {
        return;
    }

    if (method !== 'GET' || url.pathname === '/cert.pem') {
        event.respondWith(fetch(event.request));
        return;
    }

    //logDebug(`[SW] Fetch event for: ${url.pathname}`);

    // API and dynamic data: network first, caching the response
    if (url.pathname.startsWith('/api/') || 
        url.pathname.startsWith('/data/')) {
        
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(DYNAMIC_CACHE).then(cache => {
                            if (!skipCache) {
                                logDebug(`[SW] Caching dynamic response for: ${url.pathname}`);
                                cache.put(event.request, responseClone);
                            }
                        });
                    }
                    broadcastOnlineStatus(true);
                    return response;
                })
                .catch(() => {
                    broadcastOnlineStatus(false);                    
                    return caches.match(event.request)
                        .then(response => {
                            logDebug(`[SW] Network error for ${url.pathname}, cache ${response ? 'hit' : 'miss'}`);
                            return response || new Response('Offline', { status: 503 });
                        })
                        .catch(error => {
                            logDebug(`[SW] Cache lookup failed for ${url.pathname}`, error.message);
                            return new Response('Offline', { status: 503 });
                        });
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        if (!skipCache) {
                            logDebug(`[SW] Caching new resource: ${url.pathname}`);
                            cache.put(event.request, responseClone);
                        }
                    });
                }
                broadcastOnlineStatus(true);
                return response;
            }).catch(() => {
                broadcastOnlineStatus(false);
                // If even the network is unavailable: fallback
                if (event.request.destination === 'document') {
                    return caches.match('/index.html')
                        .then(response => {
                            logDebug(`[SW] Fallback to index.html for ${url.pathname}`, response ? 'cache hit' : 'cache miss');
                            return response || new Response('Offline', { status: 503 });
                        })
                        .catch(error => {
                            logDebug(`[SW] Failed to load fallback for ${url.pathname}`, error.message);
                            return new Response('Offline', { status: 503 });
                        });
                }

                return new Response('Offline', { status: 503 });
            });
        })
    );
});

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', (event) => {
    logDebug('[SW] Push notification received', event);

    let data = {};
    if (event.data) {
        data = event.data.json();
    }

    const notificationId = 'tunnel-' + Date.now();

    const options = {
        body: data.body || 'New notification from Tunnel Control',
        icon: '/img/image512.png',
        badge: '/img/favicon256.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        },
        tag: notificationId,
        requireInteraction: data.requireInteraction || false
    };

    event.waitUntil(
        self.registration.showNotification(
            data.title || 'Tunnel Control Panel', 
            options
        )
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        self.registration.getNotifications().then((notifications) => {
            notifications.forEach(notification => {
                notification.close();
            });
        })
    );

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                if (clientList.length > 0) {
                    const client = clientList[0];
                    client.focus();

                    client.postMessage({
                        type: 'OPEN_TAB',
                        tab: 0   // 0 = Dashboard
                    });

                    return;
                } 
                else {
                    const url = event.notification.data?.url || '/';
                    return clients.openWindow(url + '#dashboard');
                }
            })
    )
});

// ==================== VERSION API ====================
self.addEventListener('message', (event) => {
    logDebug('[SW] Received message:', event.data);
    if (event.data && event.data.type === 'GET_VERSION') {
        logDebug('[SW] Sending version info to client');
        event.source.postMessage({
            type: 'VERSION',
            version: VER,
            event: 'message'
        });
    }
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        logDebug('[SW] SKIP_WAITING received');
        self.skipWaiting();
    }
});