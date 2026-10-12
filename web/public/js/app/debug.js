export let PRODUCTION_MODE = false;
export let DEBUG_MODE = false;
export let LOG_MODULE = [
    'app',
    //'sw',
    'notifications',
    '*'
];

let autoScroll = true;

export function initDebugMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    const enable = debugParam === '1' || debugParam === 'true' || debugParam === '';
    const disable = debugParam === '0' || debugParam === 'false';

    try {
        if (enable) {
            localStorage.setItem('debugMode', '1');
        } else if (disable) {
            localStorage.removeItem('debugMode');
        }
        DEBUG_MODE = localStorage.getItem('debugMode') === '1';
    } catch (e) {
        DEBUG_MODE = enable;
    }

    if (DEBUG_MODE) {
        console.log('%c🔧 DEBUG MODE ENABLED (?debug=0 turns it off)', 'color: #22d3ee; font-weight: bold');
    }

    if (DEBUG_MODE) {
        initDebugScroll();
    }
}

function ensureDebugPanel() {
    let panel = document.getElementById('debug-info');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'debug-info';
    panel.className = 'w-full max-w-sm text-sm text-gray-500 dark:text-gray-400 mt-6 p-4 bg-gray-100 dark:bg-gray-950 ' +
        'border border-gray-200 dark:border-gray-800 rounded-2xl';
    panel.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <strong>Debug Info:</strong>
            <div class="flex gap-2">
                <button type="button" data-debug="copy"
                        class="text-xs bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 px-3 py-1 rounded-lg">
                    Copy
                </button>
                <button type="button" data-debug="clear"
                        class="text-xs bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 px-3 py-1 rounded-lg">
                    Clear
                </button>
                <button type="button" data-debug="off"
                        class="text-xs bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 px-3 py-1 rounded-lg">
                    Hide
                </button>
            </div>
        </div>
        <pre id="debug-content" class="font-mono text-xs whitespace-pre-wrap max-h-96 overflow-auto"></pre>
    `;
    panel.querySelector('[data-debug="clear"]').addEventListener('click', clearDebug);
    panel.querySelector('[data-debug="off"]').addEventListener('click', disableDebug);
    panel.querySelector('[data-debug="copy"]').addEventListener('click', (event) => copyDebug(event.currentTarget));
    document.body.appendChild(panel);
    initDebugScroll();
    return panel;
}

export function initDebugScroll() {
    const content = document.getElementById('debug-content');
    if (!content) return;

    content.addEventListener('scroll', () => {
        const isAtBottom = 
            content.scrollHeight - content.scrollTop - content.clientHeight < 50;

        autoScroll = isAtBottom;
    });
}

export function logDebug(message, ...args) {
    if (!DEBUG_MODE && !PRODUCTION_MODE) return;

    const modules = LOG_MODULE.join('|');

    // Filtering by module (if configured)
    if (LOG_MODULE && Array.isArray(LOG_MODULE) && LOG_MODULE.length > 0) {
        const tag = /^\[([^\]]+)\]/.exec(message);
        if (tag ? !LOG_MODULE.some(m => m.toLowerCase() === tag[1].toLowerCase()) : !LOG_MODULE.includes('*')) {
            return;
        }
    }

    // Update the active modules display in the UI (if present)
    if (modules) {
        const debugModules = document.getElementById('debug-modules');
        if (debugModules) {
            debugModules.innerHTML = `(${modules})`;
        }
    }

    const time = new Date().toTimeString().slice(0, 8);
    const millisecond = new Date().getMilliseconds().toString().padStart(3, '0');

    let text = `[${time}.${millisecond}] ${message}`;

    if (args.length > 0) {
        const formattedArgs = args.map(arg => {
            if (arg === null || arg === undefined) {
                return String(arg);
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        });

        text += ' ' + formattedArgs.join(' ');
    }

    console.log(text);

    if (!DEBUG_MODE) return;

    const debugPanel = ensureDebugPanel();
    debugPanel.style.display = 'block';

    const content = document.getElementById('debug-content');
    if (!content) return;

    content.textContent += text + '\n';

    if (autoScroll) {
        content.scrollTop = content.scrollHeight;
    }
}

export async function copyDebug(button) {
    const text = document.getElementById('debug-content')?.textContent || '';
    let copied = false;
    try {
        await navigator.clipboard.writeText(text);
        copied = true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
            copied = document.execCommand('copy');
        } catch {
            copied = false;
        }
        area.remove();
    }
    if (button) {
        const label = button.textContent;
        button.textContent = copied ? 'Copied' : 'Copy failed';
        setTimeout(() => { button.textContent = label; }, 1500);
    }
}

export function disableDebug() {
    try {
        localStorage.removeItem('debugMode');
    } catch {
        DEBUG_MODE = false;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('debug');
    window.location.replace(url.toString());
}

export function clearDebug() {
    const content = document.getElementById('debug-content');
    if (content) {
        content.textContent = '';
        autoScroll = true;
    }
}