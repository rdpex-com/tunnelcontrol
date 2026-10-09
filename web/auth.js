import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = 'tun_session';
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const SESSION_REFRESH = 24 * 3600 * 1000;
const MAX_FAILS = 5;
const LOCK_TIME = 5 * 60 * 1000;
const FAIL_DELAY = 1000;
const KEY_LENGTH = 64;

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = (await scrypt(password, salt, KEY_LENGTH)).toString('hex');
    return { salt, hash };
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest();
}

function sameHex(a, b) {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseCookies(header) {
    const cookies = {};
    for (const part of (header || '').split(';')) {
        const index = part.indexOf('=');
        if (index > 0) {
            cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
        }
    }
    return cookies;
}

export function createAuth(rootDir, dataPath) {
    const authFile = path.join(dataPath, 'web_auth.json');
    const sessionsFile = path.join(dataPath, 'web_sessions.json');
    const sessions = new Map();
    const fails = new Map();
    let saveTimer = null;

    try {
        const saved = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
        const now = Date.now();
        for (const [id, session] of Object.entries(saved)) {
            if (session.expires > now) sessions.set(id, session);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('[Auth] Cannot read sessions:', err.message);
    }

    function saveSessions() {
        if (saveTimer) return;
        saveTimer = setTimeout(() => {
            saveTimer = null;
            const now = Date.now();
            for (const [id, session] of sessions) {
                if (session.expires <= now) sessions.delete(id);
            }
            try {
                const tmp = `${sessionsFile}.tmp`;
                fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
                fs.renameSync(tmp, sessionsFile);
            } catch (err) {
                console.error('[Auth] Cannot save sessions:', err.message);
            }
        }, 1000);
    }

    function enabled() {
        let value = '1';
        for (const file of ['tun.defaults', 'tun.config']) {
            try {
                const match = fs.readFileSync(path.join(rootDir, file), 'utf-8')
                    .match(/^[ \t]*WEB_AUTH=["']?([^"'\s#]*)/m);
                if (match) value = match[1];
            } catch {
                continue;
            }
        }
        return value !== '0';
    }

    function readCredentials() {
        try {
            const credentials = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
            if (credentials.user && credentials.salt && credentials.hash) return credentials;
        } catch {
            return null;
        }
        return null;
    }

    function sessionId(token) {
        return sha256(token).toString('hex');
    }

    function cookie(request, token, maxAge) {
        const secure = request.protocol === 'https' ? '; Secure' : '';
        return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
    }

    function currentSession(request, credentials) {
        const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
        if (!token) return null;

        const id = sessionId(token);
        const session = sessions.get(id);
        if (!session) return null;

        if (session.expires <= Date.now() || session.created < (credentials.changed || 0)) {
            sessions.delete(id);
            saveSessions();
            return null;
        }
        return { id, token, session };
    }

    async function onRequest(request, reply) {
        const url = request.url.split('?')[0];
        if (!url.startsWith('/api/') && !url.startsWith('/data/')) return;
        if (url.startsWith('/api/auth/')) return;
        if (!enabled()) return;

        const credentials = readCredentials();
        if (!credentials) {
            return reply.code(401).send({ success: false, error: 'not_configured' });
        }

        const current = currentSession(request, credentials);
        if (!current) {
            return reply.code(401).send({ success: false, error: 'unauthorized' });
        }

        const now = Date.now();
        if (current.session.expires - now < SESSION_TTL - SESSION_REFRESH) {
            current.session.expires = now + SESSION_TTL;
            saveSessions();
            reply.header('Set-Cookie', cookie(request, current.token, SESSION_TTL / 1000));
        }
    }

    function status(request) {
        const isEnabled = enabled();
        const credentials = readCredentials();
        const loggedIn = !!(isEnabled && credentials && currentSession(request, credentials));
        return {
            success: true,
            enabled: isEnabled,
            configured: !!credentials,
            authenticated: !isEnabled || loggedIn,
            user: loggedIn ? credentials.user : null
        };
    }

    async function login(request, reply) {
        const ip = request.ip;
        const now = Date.now();
        const record = fails.get(ip);

        if (record && record.until > now) {
            const minutes = Math.ceil((record.until - now) / 60000);
            return reply.code(429).send({ success: false, error: `Too many attempts, try again in ${minutes} min` });
        }

        const credentials = readCredentials();
        if (!credentials) {
            return reply.code(401).send({ success: false, error: 'not_configured' });
        }

        const { login: user, password } = request.body || {};
        let valid = false;
        if (typeof user === 'string' && typeof password === 'string') {
            const { hash } = await hashPassword(password, credentials.salt);
            const passwordOk = sameHex(hash, credentials.hash);
            const userOk = crypto.timingSafeEqual(sha256(user), sha256(credentials.user));
            valid = passwordOk && userOk;
        }

        if (!valid) {
            const count = (record && record.until === 0 ? record.count : 0) + 1;
            fails.set(ip, count >= MAX_FAILS ? { count: 0, until: now + LOCK_TIME } : { count, until: 0 });
            console.warn(`[Auth] Failed login from ${ip}`);
            await new Promise(resolve => setTimeout(resolve, FAIL_DELAY));
            return reply.code(401).send({ success: false, error: 'Invalid login or password' });
        }

        fails.delete(ip);
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(sessionId(token), { created: now, expires: now + SESSION_TTL });
        saveSessions();
        console.log(`[Auth] Login of ${credentials.user} from ${ip}`);
        reply.header('Set-Cookie', cookie(request, token, SESSION_TTL / 1000));
        return { success: true };
    }

    function logout(request, reply) {
        const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
        if (token && sessions.delete(sessionId(token))) saveSessions();
        reply.header('Set-Cookie', cookie(request, '', 0));
        return { success: true };
    }

    return { onRequest, status, login, logout };
}
