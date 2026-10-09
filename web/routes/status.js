import fs from 'fs';
import path from 'path';
import { DATA_PATH, ROOT_DIR } from '../paths.js';
import { readCleanFile } from '../helpers.js';

function parseState(content) {
    if (!content) return { status: 'UNKNOWN', timestamp: null };
    const parts = content.split(':');
    return {
        status: parts[0].trim().toUpperCase(),
        timestamp: parts[1] ? parseInt(parts[1]) : null
    };
}

function multiplySpeed(speed, factor) {
    switch (factor) {
        case 'GB':
            return speed * 1073741824;
        case 'MB':
            return speed * 1048576;
        case 'KB':
            return speed * 1024;
        default:
            return speed;
    }
}

function parseSpeed(content) {
    if (!content) return { rx: 0, tx: 0 };
    const rxMatch = content.match(/RX:\s*([\d.]+)[ ]?(GB|MB|KB|B)?/i);
    const txMatch = content.match(/TX:\s*([\d.]+)[ ]?(GB|MB|KB|B)?/i);
    return {
        rx: parseFloat(rxMatch ? multiplySpeed(parseFloat(rxMatch[1]), rxMatch[2]) : 0),
        tx: parseFloat(txMatch ? multiplySpeed(parseFloat(txMatch[1]), txMatch[2]) : 0)
    };
}

function parseBytes(content) {
    if (!content) return { rx: 0, tx: 0 };
    const numbers = content.match(/\d+/g) || [];
    return {
        rx: parseInt(numbers[0]) || 0,
        tx: parseInt(numbers[1]) || 0
    };
}

function parseWeight(content) {
    if (!content) return 0;
    const num = parseInt(content.replace(/[^0-9]/g, ''));
    return isNaN(num) ? 0 : num;
}

function parseHost(content) {
    if (!content) return { host: '—', port: null, public_ip: null };
    const [host, port, publicIp] = content.split(':');
    return {
        host: host || '—',
        port: port ? parseInt(port) : null,
        public_ip: publicIp && publicIp !== 'NA' ? publicIp : null
    };
}

function readTunnel(stateFile) {
    const id = stateFile.replace('tun_state_', '').replace(/[^0-9]/g, '');

    const stateContent  = readCleanFile(path.join(DATA_PATH, stateFile));
    const speedContent  = readCleanFile(path.join(DATA_PATH, `tun_speed_tun${id}`));
    const bytesContent  = readCleanFile(path.join(DATA_PATH, `tun_bytes_tun${id}`));
    const weightContent = readCleanFile(path.join(DATA_PATH, `tun_weight_${id}`));
    const hostContent   = readCleanFile(path.join(DATA_PATH, `tun_host_${id}`));
    const lastRotate    = readCleanFile(path.join(DATA_PATH, `tun_last_rotate_${id}`));
    const rotation      = readCleanFile(path.join(DATA_PATH, `tun_rotation_${id}`));

    let isEnabled = null;
    if (hostContent) {
        const host = hostContent.split(':')[0];
        const enabledFile  = path.join(DATA_PATH, `tun_host_${host}_enabled`);
        const disabledFile = path.join(DATA_PATH, `tun_host_${host}_disabled`);
        isEnabled = fs.existsSync(enabledFile) || (!fs.existsSync(disabledFile));
    }

    const stateInfo = parseState(stateContent);
    const speedInfo = parseSpeed(speedContent);
    const bytesInfo = parseBytes(bytesContent);
    const hostInfo  = parseHost(hostContent);

    return {
        id: parseInt(id),
        host: hostInfo.host,
        port: hostInfo.port,
        public_ip: hostInfo.public_ip,
        state: stateInfo.status,
        state_since: stateInfo.timestamp,
        speed_rx: speedInfo.rx,
        speed_tx: speedInfo.tx,
        bytes_rx: bytesInfo.rx,
        bytes_tx: bytesInfo.tx,
        weight: parseWeight(weightContent),
        last_rotate: lastRotate || '—',
        rotation: parseInt(rotation || '-1'),
        enabled: isEnabled
    };
}

export default async function statusRoutes(app) {
    app.get('/api/status', async () => {
        try {
            const stateFiles = fs.readdirSync(DATA_PATH).filter(f => f.startsWith('tun_state_'));
            const tunnels = stateFiles.map(readTunnel);

            const activeCount = tunnels.filter(t => t.state === 'ONLINE').length;
            const totalSpeed = parseSpeed(readCleanFile(path.join(DATA_PATH, 'tun_speed_total')));
            const totalBytes = parseBytes(readCleanFile(path.join(DATA_PATH, 'tun_bytes_total')));
            const lastOnline = readCleanFile(path.join(DATA_PATH, 'tun_last_online'));

            const overall_status = activeCount > 0 ? 'running' : (tunnels.length > 0 ? 'degraded' : 'stopped');

            return {
                success: true,
                timestamp: Date.now(),
                overall_status,
                active_count: activeCount,
                total_tunnels: tunnels.length,
                total_speed_rx: totalSpeed.rx,
                total_speed_tx: totalSpeed.tx,
                total_bytes_rx: totalBytes.rx,
                total_bytes_tx: totalBytes.tx,
                last_online: lastOnline || '—',
                tunnels: tunnels.sort((a, b) => a.id - b.id)
            };
        } catch (err) {
            console.error('Status API error:', err);
            return { success: false, error: err.message };
        }
    });

    app.get('/api/tun/status', async () => {
        try {
            const startTime = readCleanFile(path.join(DATA_PATH, 'tun_start'));
            const stopTime  = readCleanFile(path.join(DATA_PATH, 'tun_stop'));

            let phase = null;
            let phaseTime = null;

            if (stopTime !== '') {
                phase = 'stop';
                phaseTime = stopTime;
            } else if (startTime !== '') {
                phase = 'start';
                phaseTime = startTime;
            }

            return { success: true, phase, phaseTime };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    app.get('/api/version', async () => {
        try {
            return { success: true, version: fs.readFileSync(path.join(ROOT_DIR, 'VERSION'), 'utf-8').trim() };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}
