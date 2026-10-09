import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { ROOT_DIR } from '../paths.js';

const CONFIG_FILE = path.join(ROOT_DIR, 'tun.config');
const BACKUP_DIR = path.join(ROOT_DIR, 'bak');

async function checkConfig(content) {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tun-config-'));
    const tmpFile = path.join(tmpDir, 'tun.config');
    try {
        await fs.promises.writeFile(tmpFile, content, { encoding: 'utf-8', mode: 0o600 });
        return await new Promise((resolve) => {
            execFile(path.join(ROOT_DIR, 'tun.config.check'), [tmpFile], (error, stdout) => {
                if (!error) return resolve(null);
                const lines = stdout.trim().split('\n').filter(Boolean);
                resolve(lines.length ? lines.join('; ') : `check failed: ${error.message}`);
            });
        });
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
}

export default async function configRoutes(app) {
    app.get('/api/config', async () => {
        try {
            if (!fs.existsSync(CONFIG_FILE)) {
                return { success: false, error: 'Config file not found' };
            }
            return { success: true, content: fs.readFileSync(CONFIG_FILE, 'utf-8') };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    app.post('/api/config', async (request) => {
        try {
            const { content } = request.body;
            if (typeof content !== 'string') {
                return { success: false, error: 'Config content is required' };
            }

            const configErrors = await checkConfig(content);
            if (configErrors) {
                return { success: false, error: `Config not saved. ${configErrors}` };
            }

            if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
            if (fs.existsSync(CONFIG_FILE)) {
                fs.copyFileSync(CONFIG_FILE, path.join(BACKUP_DIR, `tun.config.${Date.now()}.bak`));
            }

            fs.writeFileSync(CONFIG_FILE, content, 'utf-8');

            return { success: true, message: 'Configuration saved' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}
