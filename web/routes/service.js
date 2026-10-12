import { exec } from 'child_process';
import { tunnelsRunning, markRestart } from '../helpers.js';

export default async function serviceRoutes(app) {
    app.post('/api/service', async (request) => {
        try {
            const { action } = request.body;

            if (!['start', 'stop', 'restart'].includes(action)) {
                return { success: false, error: 'Invalid action. Use start, stop or restart' };
            }

            if (action !== 'stop') markRestart();

            return new Promise((resolve) => {
                exec(`systemctl ${action === 'stop' ? '' : '--no-block '}${action} tun`, (error) => {
                    if (error) {
                        resolve({ success: false, error: error.message, action });
                    } else {
                        resolve({ success: true, message: `Tunnel service ${action}ed successfully`, action });
                    }
                });
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    app.get('/api/service/status', async () => {
        try {
            const { unitState, unitActive, running } = await tunnelsRunning();
            return { success: true, status: unitState, isActive: unitActive, isRunning: running };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}
