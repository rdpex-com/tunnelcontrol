import fs from 'fs';
import { exec } from 'child_process';

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
