import fs from 'fs';
import path from 'path';
import { ROOT_DIR, DATA_PATH } from '../paths.js';
import { readCleanFile } from '../helpers.js';

function configuredHosts() {
    const hosts = new Set();
    try {
        const content = fs.readFileSync(path.join(ROOT_DIR, 'tun.config'), 'utf-8');
        for (const match of content.matchAll(/^\s*["']?(\d+\.\d+\.\d+\.\d+):/gm)) {
            hosts.add(match[1]);
        }
    } catch (err) {
        console.error('Error reading hosts from tun.config:', err);
    }
    return hosts;
}

function getActiveEnabledHosts() {
    try {
        const uniqueActiveHosts = new Set();
        const stateFiles = fs.readdirSync(DATA_PATH).filter(f => f.startsWith('tun_state_'));

        for (const stateFile of stateFiles) {
            const id = stateFile.replace('tun_state_', '').replace(/[^0-9]/g, '');

            const hostContent = readCleanFile(path.join(DATA_PATH, `tun_host_${id}`));
            if (!hostContent) continue;

            const host = hostContent.split(':')[0];
            if (fs.existsSync(path.join(DATA_PATH, `tun_host_${host}_disabled`))) continue;

            if (readCleanFile(path.join(DATA_PATH, stateFile)).startsWith('ONLINE')) {
                uniqueActiveHosts.add(host);
            }
        }

        return uniqueActiveHosts;
    } catch (e) {
        console.error('Error counting active hosts:', e);
        return null;
    }
}

function otherEnabledHostsCount(host) {
    let count = 0;
    for (const entry of configuredHosts()) {
        if (entry === host) continue;
        if (fs.existsSync(path.join(DATA_PATH, `tun_host_${entry}_held`))) continue;
        if (!fs.existsSync(path.join(DATA_PATH, `tun_host_${entry}_loaded`))) continue;
        if (fs.existsSync(path.join(DATA_PATH, `tun_host_${entry}_enabled`))
            || !fs.existsSync(path.join(DATA_PATH, `tun_host_${entry}_disabled`))) count++;
    }
    return count;
}

export default async function hostsRoutes(app) {
    app.post('/api/host/toggle', async (request) => {
        try {
            const { host } = request.body;
            if (!host) return { success: false, error: 'Host is required' };
            if (!configuredHosts().has(host)) return { success: false, error: 'Unknown host' };

            const enabledFile  = path.join(DATA_PATH, `tun_host_${host}_enabled`);
            const disabledFile = path.join(DATA_PATH, `tun_host_${host}_disabled`);

            const currentlyEnabled = fs.existsSync(enabledFile) || !fs.existsSync(disabledFile);

            const activeHosts = currentlyEnabled ? getActiveEnabledHosts() : null;
            if (currentlyEnabled && (!activeHosts
                    || otherEnabledHostsCount(host) === 0
                    || (activeHosts.has(host) && activeHosts.size === 1))) {
                return {
                    success: false,
                    error: 'Cannot disable the last active host. At least one host must remain enabled.'
                };
            }

            if (fs.existsSync(enabledFile)) fs.unlinkSync(enabledFile);
            if (fs.existsSync(disabledFile)) fs.unlinkSync(disabledFile);

            if (currentlyEnabled) {
                fs.writeFileSync(disabledFile, '', { mode: 0o644 });
                return { success: true, action: 'disabled', message: `Host ${host} disabled` };
            }

            fs.writeFileSync(enabledFile, '', { mode: 0o644 });
            return { success: true, action: 'enabled', message: `Host ${host} enabled` };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}
