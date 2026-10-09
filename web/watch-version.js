import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = __dirname;
const SW_PATH = path.join(PROJECT_ROOT, 'public', 'sw.js');

let isUpdating = false;

function updateVersion() {
    if (isUpdating) return;
    isUpdating = true;

    setTimeout(() => {
        try {
            let content = fs.readFileSync(SW_PATH, 'utf8');

            const now = new Date();
            const year = now.getFullYear().toString().slice(2);
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');

            const newVersion = `1.3.${year}${month}${day}.${hour}${minute}${second}`;

            const match = content.match(/const VER = ['"](.*?)['"]/);
            const oldVersion = match ? match[1] : 'unknown';

            console.log(`🔄 Updating version from ${oldVersion} to ${newVersion}`);

            content = content.replace(
                /const VER = ['"](.*?)['"]/,
                `const VER = '${newVersion}'`
            );

            fs.writeFileSync(SW_PATH, content);
            console.log(`✅ Version updated → ${newVersion}`);
        } catch (err) {
            console.error('❌ Error updating version:', err.message);
        } finally {
            setTimeout(() => {
                isUpdating = false;
            }, 1000);
        }
    }, 1000);
}

// ==================== WATCHER ====================
console.log('🚀 Watching for file changes...');

chokidar.watch(path.join(PROJECT_ROOT, 'public'), {
    persistent: true,
    ignoreInitial: true,
    ignored: []
}).on('all', (event, filePath) => {
    if (isUpdating) return;
    console.log(`📁 Event: ${event} | File: ${filePath}`);
    
    if (/\.(js|html|css|json|png|svg|ico|jpe?g|webp|woff2?|ttf)$/.test(filePath)) {
        updateVersion();
    }
});

process.stdin.resume();