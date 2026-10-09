export function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes < 0) {
        return '0 KB';
    }

    if (bytes >= 1073741824) {                   // GB - 1024 * 1024 * 1024
        const value = bytes / 1073741824;
        return value.toFixed(3) + ' GB';
    } else if (bytes >= 1048576) {               // MB - 1024 * 1024
        const value = bytes / 1048576;
        return value.toFixed(3) + ' MB';
    } else {                                     // KB - 1024
        const value = bytes / 1024;
        return value.toFixed(3) + ' KB';
    }
}

export function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || isNaN(bytesPerSec) || bytesPerSec < 0) {
        return '0.000 KB/s';
    }

    if (bytesPerSec >= 1048576) {                // MB/s - 1024 * 1024
        const value = bytesPerSec / 1048576;
        return value.toFixed(3) + ' MB/s';
    } else {                                     // KB/s - 1024
        const value = bytesPerSec / 1024;
        return value.toFixed(3) + ' KB/s';
    }
}