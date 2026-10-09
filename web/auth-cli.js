import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword } from './auth.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.resolve(ROOT_DIR, process.env.DATA_PATH || 'data');
const AUTH_FILE = path.join(DATA_PATH, 'web_auth.json');

const [user, password] = fs.readFileSync(0, 'utf-8').split('\n');

if (!user || !password) {
    console.error('Login and password must not be empty');
    process.exit(1);
}

const { salt, hash } = await hashPassword(password);
const tmp = `${AUTH_FILE}.tmp`;

fs.mkdirSync(DATA_PATH, { recursive: true, mode: 0o700 });
fs.writeFileSync(tmp, JSON.stringify({ user, salt, hash, changed: Date.now() }), { mode: 0o600 });
fs.renameSync(tmp, AUTH_FILE);

console.log(`Web panel password set for ${user}; existing sessions are signed out`);
