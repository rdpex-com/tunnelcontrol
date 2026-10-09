import fs from 'fs';
import path from 'path';
import https from 'https';
import { DATA_PATH } from './paths.js';

const USE_HTTPS = process.env.USE_HTTPS === 'true' || !process.env.USE_HTTPS;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 8443;
const CERT_CHECK_PORT = parseInt(process.env.CERT_CHECK_PORT) || HTTPS_PORT + 1;
const CERT_DIR = path.join(DATA_PATH, 'cert');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT) || 3000;

function startCertificateCheck(httpsOptions) {
    const server = https.createServer(httpsOptions, (req, res) => {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end();
    });
    server.on('error', (err) => console.error(`[HTTPS] Certificate check port ${CERT_CHECK_PORT}:`, err.message));
    server.listen(CERT_CHECK_PORT, HOST, () => {
        console.log(`[HTTPS] Certificate check on https://${HOST}:${CERT_CHECK_PORT}`);
    });
}

export async function startServer(app) {
    if (!USE_HTTPS) {
        console.log(`[HTTP] Starting plain HTTP server...`);
        await app.listen({ port: PORT, host: HOST });
        console.log(`🚀 HTTP Web server running on http://${HOST}:${PORT}`);
        return;
    }

    const keyPath  = path.join(CERT_DIR, 'privkey.pem');
    const certPath = path.join(CERT_DIR, 'fullchain.pem');

    console.log(`[HTTPS] Checking certs in: ${CERT_DIR}`);
    console.log(`[HTTPS] privkey exists: ${fs.existsSync(keyPath)}`);
    console.log(`[HTTPS] fullchain exists: ${fs.existsSync(certPath)}`);

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.error(`[HTTPS] ❌ Certificates not found!`);
        return;
    }

    const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };

    console.log(`[HTTPS] ✅ Certificates loaded, starting HTTPS server...`);

    await app.ready();

    https.createServer(httpsOptions, app.routing).listen(HTTPS_PORT, HOST, (err) => {
        if (err) {
            console.error('HTTPS Server error:', err);
            process.exit(1);
        }
        console.log(`🚀 HTTPS Web server running on https://${HOST}:${HTTPS_PORT}`);
    });

    startCertificateCheck(httpsOptions);

    await app.listen();
}
