export const CERT_CHECK_PORT = Number(location.port || 443) + 1;

async function probe(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        await fetch(url, { cache: 'no-store', signal: controller.signal, ...options });
        return null;
    } catch (err) {
        return `${err.name}: ${err.message}`;
    } finally {
        clearTimeout(timer);
    }
}

export async function checkCertificateTrust(timeoutMs = 5000) {
    const panelError = await probe('/cert.pem', { method: 'HEAD' }, timeoutMs);
    if (panelError) {
        return { trusted: null, error: `panel not reachable, ${panelError}` };
    }

    const checkError = await probe(`https://${location.hostname}:${CERT_CHECK_PORT}/`, {}, timeoutMs);
    if (checkError) {
        return { trusted: false, error: checkError };
    }

    return { trusted: true };
}

export function certificateInstallSteps() {
    if (window.Platform.isIOS()) {
        return [
            'Tap Download Certificate and allow the download.',
            'Settings → Profile Downloaded → Install.',
            `<b>Settings → General → About → Certificate Trust Settings → turn on ${location.hostname}.</b> ` +
                'Without this step the certificate is installed but not trusted.',
            'Reopen the panel.'
        ];
    }
    if (window.Platform.isAndroid()) {
        return [
            'Tap Download Certificate.',
            'Settings → Security → Encryption & credentials → Install a certificate → <b>CA certificate</b> ' +
                '(not "VPN & app user certificate").',
            'Reopen the panel.'
        ];
    }
    return [
        'Click Download Certificate.',
        'Import it as a <b>trusted root certificate</b> (Windows: Trusted Root Certification Authorities).',
        'Restart the browser.'
    ];
}

export function certificateInstallHtml() {
    return '<ol class="list-decimal pl-5 space-y-1">' +
        certificateInstallSteps().map(step => `<li>${step}</li>`).join('') +
        '</ol>';
}

export function describeCertificateCheck(result) {
    const state = result.trusted === true ? 'port check passed'
        : result.trusted === false ? 'port check FAILED (certificate not trusted)' : 'not checked';
    return `[App] Certificate check on port ${CERT_CHECK_PORT}: ${state}${result.error ? ' (' + result.error + ')' : ''}`;
}
