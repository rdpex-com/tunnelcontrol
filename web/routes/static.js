import fs from 'fs';
import path from 'path';
import fastifyStatic from '@fastify/static';
import { PUBLIC_DIR, DATA_PATH } from '../paths.js';

export default async function staticRoutes(app) {
    app.register(fastifyStatic, {
        root: PUBLIC_DIR,
        prefix: '/',
        decorateReply: true,
        etag: false,
        lastModified: false,
        cacheControl: false,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'no-store');
        }
    });

    app.get('/cert.pem', async (request, reply) => {
        try {
            const content = await fs.promises.readFile(path.join(DATA_PATH, 'cert', 'fullchain.pem'));
            reply.header('Content-Disposition', 'attachment; filename="tun-panel.crt"');
            return reply.type('application/x-x509-ca-cert').send(content);
        } catch (err) {
            return reply.code(404).send({ success: false, error: 'Certificate not found' });
        }
    });

    app.get('/data/total_history.json', async (request, reply) => {
        try {
            const content = await fs.promises.readFile(path.join(DATA_PATH, 'total_history.json'), 'utf-8');
            reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            reply.header('Pragma', 'no-cache');
            return reply.type('application/json').send(content);
        } catch (err) {
            return reply.code(404).send({ success: false, error: 'Not found' });
        }
    });

    app.get('/', async (request, reply) => {
        return reply.sendFile('index.html');
    });
}
