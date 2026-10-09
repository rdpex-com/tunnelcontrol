import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { ROOT_DIR } from '../paths.js';
import { execPromise } from '../helpers.js';

const LOG_FILES = {
    main: '/var/log/tun.log',
    verbose: '/var/log/tun.verbose.log',
    mon_total: '/var/log/tun.mon.total.log',
    mon_verbose: '/var/log/tun.mon.verbose.log'
};

const LOG_DIR = '/var/log';

const LOG_MIN_LEVEL = {
    'tun.verbose.log': 2,
    'tun.mon.total.log': 2,
    'tun.mon.verbose.log': 2,
    'tun.mon.debug.log': 3
};

function logLevel() {
    let value = '1';
    for (const file of ['tun.defaults', 'tun.config']) {
        try {
            const match = fs.readFileSync(path.join(ROOT_DIR, file), 'utf-8')
                .match(/^[ \t]*LOG_LEVEL=["']?([0-9]+)/m);
            if (match) value = match[1];
        } catch {
            continue;
        }
    }
    return Number(value);
}

function formatSize(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function leftoverNotice() {
    const level = logLevel();
    const bases = Object.keys(LOG_MIN_LEVEL).filter(base => LOG_MIN_LEVEL[base] > level);
    let total = 0;
    try {
        for (const name of fs.readdirSync(LOG_DIR)) {
            if (bases.some(base => name === base || name.startsWith(`${base}.`))) {
                total += fs.statSync(path.join(LOG_DIR, name)).size;
            }
        }
    } catch {
        return '';
    }
    return total > 0 ? `Logs above LOG_LEVEL=${level} are kept in ${LOG_DIR} (${formatSize(total)})` : '';
}

export default async function logsRoutes(app) {
    app.get('/api/logs/list', async () => {
        const types = Object.keys(LOG_FILES).filter(type => type === 'main' || fs.existsSync(LOG_FILES[type]));
        return { success: true, types, notice: leftoverNotice() };
    });

    app.get('/api/logs', async (request) => {
        const logType = request.query.type || 'main';
        const lines = parseInt(request.query.lines) || 100;
        const filePath = LOG_FILES[logType] || LOG_FILES.main;

        try {
            if (!fs.existsSync(filePath)) {
                return { success: true, type: logType, content: '', file: filePath };
            }

            const content = await execPromise(`tail -n ${lines} "${filePath}"`);
            return { success: true, type: logType, content: content.stdout || '', file: filePath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    app.get('/api/sysinfo', async () => {
        try {
            const scriptPath = path.join(ROOT_DIR, 'tun.sysinfo');

            if (!fs.existsSync(scriptPath)) {
                return { success: false, error: 'tun.sysinfo script not found' };
            }

            return new Promise((resolve) => {
                exec(`"${scriptPath}" --once`, { timeout: 5000 }, (error, stdout) => {
                    if (error) {
                        resolve({ success: false, error: error.message });
                    } else {
                        resolve({ success: true, output: stdout.trim() });
                    }
                });
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}
