import fs from 'fs';
import os from 'os';
import path from 'path';
import fastifyStatic from '@fastify/static';
import { PUBLIC_DIR, DATA_PATH, ROOT_DIR } from '../paths.js';

function readSetting(name) {
    let value = '';
    for (const file of ['tun.defaults', 'tun.config']) {
        try {
            const match = fs.readFileSync(path.join(ROOT_DIR, file), 'utf-8')
                .match(new RegExp(`^[ \\t]*${name}=(?:"([^"]*)"|'([^']*)'|([^\\s#]*))`, 'm'));
            if (match) value = match[1] ?? match[2] ?? match[3] ?? '';
        } catch {
            continue;
        }
    }
    return value;
}

const APP_NAME = `Tunnel Control ${readSetting('WEB_APP_NAME') || os.hostname()}`;

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

    app.get('/manifest.json', async (request, reply) => {
        const manifest = JSON.parse(await fs.promises.readFile(path.join(PUBLIC_DIR, 'manifest.json'), 'utf-8'));
        manifest.name = APP_NAME;
        return reply.type('application/manifest+json').header('Cache-Control', 'no-store').send(manifest);
    });

    app.get('/cert.pem', async (request, reply) => {
        try {
            const authority = path.join(DATA_PATH, 'cert', 'ca.pem');
            const file = fs.existsSync(authority) ? authority : path.join(DATA_PATH, 'cert', 'fullchain.pem');
            const content = await fs.promises.readFile(file);
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
