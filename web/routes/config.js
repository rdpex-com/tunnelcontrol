import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { ROOT_DIR } from '../paths.js';

const CONFIG_FILE = path.join(ROOT_DIR, 'tun.config');

function readSetting(name) {
    let value = '';
    for (const file of ['tun.defaults', 'tun.config']) {
        try {
            const match = fs.readFileSync(path.join(ROOT_DIR, file), 'utf-8')
                .match(new RegExp(`^[ \\t]*${name}=["']?([^"'\\s#]*)`, 'm'));
            if (match) value = match[1];
        } catch {
            continue;
        }
    }
    return value;
}

const BACKUP_SETTING = readSetting('WEB_CONFIG_BACKUP_PATH');
const BACKUP_DIR = BACKUP_SETTING ? path.resolve(ROOT_DIR, BACKUP_SETTING) : '';

async function checkConfig(content) {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tun-config-'));
    const tmpFile = path.join(tmpDir, 'tun.config');
    try {
        await fs.promises.writeFile(tmpFile, content, { encoding: 'utf-8', mode: 0o600 });
        return await new Promise((resolve) => {
            execFile(path.join(ROOT_DIR, 'tun.config.check'), [tmpFile], (error, stdout) => {
                if (!error) return resolve(null);
                const lines = stdout.trim().split('\n').filter(Boolean);
                resolve(lines.length ? lines : [`check failed: ${error.message}`]);
            });
        });
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
}

function parseErrors(lines) {
    return lines.map(text => {
        const match = text.match(/^line (\d+): (.*)$/);
        return match ? { line: Number(match[1]), message: match[2] } : { line: 0, message: text };
    });
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

    app.post('/api/config/check', async (request) => {
        const { content } = request.body || {};
        if (typeof content !== 'string') {
            return { success: false, error: 'Config content is required' };
        }
        return { success: true, errors: parseErrors(await checkConfig(content) || []) };
    });

    app.post('/api/config', async (request) => {
        try {
            const { content } = request.body;
            if (typeof content !== 'string') {
                return { success: false, error: 'Config content is required' };
            }

            const configErrors = await checkConfig(content);
            if (configErrors) {
                return { success: false, error: `Config not saved. ${configErrors.join('; ')}`, errors: parseErrors(configErrors) };
            }

            if (BACKUP_DIR && fs.existsSync(CONFIG_FILE)) {
                if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
                fs.copyFileSync(CONFIG_FILE, path.join(BACKUP_DIR, `tun.config.${Date.now()}.bak`));
            }

            const mode = fs.existsSync(CONFIG_FILE) ? fs.statSync(CONFIG_FILE).mode & 0o777 : 0o600;
            const tmp = path.join(path.dirname(CONFIG_FILE), '.tun.config.tmp');
            fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode });
            fs.chmodSync(tmp, mode);
            fs.renameSync(tmp, CONFIG_FILE);

            return { success: true, message: 'Configuration saved' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}
