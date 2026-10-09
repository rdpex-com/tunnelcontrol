import { exec } from 'child_process';

export default async function serviceRoutes(app) {
    app.post('/api/service', async (request) => {
        try {
            const { action } = request.body;

            if (!['start', 'stop', 'restart'].includes(action)) {
                return { success: false, error: 'Invalid action. Use start, stop or restart' };
            }

            return new Promise((resolve) => {
                exec(`sudo systemctl ${action} tun`, (error) => {
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
            return new Promise((resolve) => {
                exec('systemctl is-active tun', (error, stdout) => {
                    const status = stdout.trim();
                    const isActive = status === 'active';
                    resolve({ success: true, status, isActive, isRunning: isActive });
                });
            });
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}
