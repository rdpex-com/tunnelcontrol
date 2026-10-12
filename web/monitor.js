import { managerAlive, restartPlanned } from './helpers.js';
import { addToQueue } from './push.js';

const DOWN_GRACE_MS = 30000;

let firstCheck = true;
let downSince = 0;
let notified = false;

async function checkServiceStatus() {
    try {
        const running = managerAlive();
        const now = Date.now();

        if (running || restartPlanned()) {
            downSince = 0;
            notified = false;
        } else if (firstCheck) {
            notified = true;
        } else {
            if (!downSince) downSince = now;
            if (!notified && now - downSince >= DOWN_GRACE_MS) {
                console.log(`[Monitor] Tunnels are not running for ${DOWN_GRACE_MS / 1000} s. Sending notification...`);
                addToQueue("⚠️ Tunnel service is stopped or failed.\nPlease check the system.");
                notified = true;
            }
        }
        firstCheck = false;
    } catch (err) {
        console.error('[Monitor] Service check failed:', err.message);
    }
}

export function startServiceMonitor() {
    setInterval(checkServiceStatus, 1000);
}
