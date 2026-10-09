import fastify from 'fastify';
import { ROOT_DIR, DATA_PATH } from './paths.js';
import { createAuth } from './auth.js';
import { startPush } from './push.js';
import { startServiceMonitor } from './monitor.js';
import { startServer } from './listen.js';
import staticRoutes from './routes/static.js';
import statusRoutes from './routes/status.js';
import configRoutes from './routes/config.js';
import serviceRoutes from './routes/service.js';
import logsRoutes from './routes/logs.js';
import hostsRoutes from './routes/hosts.js';
import pushRoutes from './push.js';

console.log(`[Web] ROOT_DIR  → ${ROOT_DIR}`);
console.log(`[Web] DATA_PATH → ${DATA_PATH}`);

const app = fastify({
    logger: {
        level: process.env.NODE_ENV === 'production'
            ? (Number(process.env.LOG_LEVEL) >= 3 ? 'info' : 'warn')
            : 'debug'
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.addHook('onSend', async (request, reply) => {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
    });
    console.log('[Dev] Global cache disabling enabled via onSend hook');
}

const auth = createAuth(ROOT_DIR, DATA_PATH);
app.addHook('onRequest', auth.onRequest);

app.get('/api/auth/status', async (request) => auth.status(request));
app.post('/api/auth/login', async (request, reply) => auth.login(request, reply));
app.post('/api/auth/logout', async (request, reply) => auth.logout(request, reply));

app.register(staticRoutes);
app.register(statusRoutes);
app.register(configRoutes);
app.register(serviceRoutes);
app.register(logsRoutes);
app.register(hostsRoutes);
app.register(pushRoutes);

startPush();
startServiceMonitor();

await startServer(app);
