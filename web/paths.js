import path from 'path';
import { fileURLToPath } from 'url';

const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(WEB_DIR, '..');
export const PUBLIC_DIR = path.join(WEB_DIR, 'public');

export const DATA_PATH = process.env.DATA_PATH
    ? path.resolve(ROOT_DIR, process.env.DATA_PATH)
    : path.join(ROOT_DIR, 'data');
