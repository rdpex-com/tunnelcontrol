import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { DATA_PATH } from './paths.js';

export function readCleanFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf-8').trim();
    } catch {
        return '';
    }
}

export function execPromise(command) {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            resolve({ error, stdout, stderr });
        });
    });
}

export function managerAlive() {
    const pid = Number(readCleanFile(path.join(DATA_PATH, 'tun_pid')));
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').split('\0').includes('./tun.manager');
    } catch {
        return false;
    }
}

const RESTART_GRACE_MS = 15 * 60 * 1000;

export function markRestart() {
    try {
        fs.writeFileSync(path.join(DATA_PATH, 'tun_restarting'), `${Math.floor(Date.now() / 1000)}\n`);
    } catch (err) {
        console.error('[Service] Cannot write the restart mark:', err.message);
    }
}

export function restartPlanned() {
    try {
        const since = fs.statSync(path.join(DATA_PATH, 'tun_restarting')).mtimeMs;
        return Date.now() - since < RESTART_GRACE_MS;
    } catch {
        return false;
    }
}

export async function tunnelsRunning() {
    const { stdout } = await execPromise('systemctl is-active tun');
    const unitState = (stdout || '').trim();
    const unitActive = unitState === 'active';
    return { unitState, unitActive, running: managerAlive() };
}
