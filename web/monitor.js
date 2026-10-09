import { execPromise } from './helpers.js';
import { addToQueue } from './push.js';

let lastServiceState = null;

async function checkServiceStatus() {
    try {
        const { stdout } = await execPromise('systemctl is-active tun');
        const currentState = stdout.trim();

        if (currentState === 'inactive' || currentState === 'failed') {
            if (lastServiceState !== 'inactive') {
                console.log(`[Monitor] Tunnel service is DOWN. Sending notification...`);
                addToQueue("⚠️ Tunnel service is stopped or failed.\nPlease check the system.");
                lastServiceState = 'inactive';
            }
        } else {
            lastServiceState = 'active';
        }
    } catch (err) {
        console.error('[Monitor] Service check failed:', err.message);
    }
}

export function startServiceMonitor() {
    setInterval(checkServiceStatus, 1000);
}
