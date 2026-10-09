export let PRODUCTION_MODE = false;
export let DEBUG_MODE = false;
export let LOG_MODULE = [
    'app',
    //'sw',
    //'notifications'
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
            <button type="button"
                    class="text-xs bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 px-3 py-1 rounded-lg">
                Clear
            </button>
        </div>
        <pre id="debug-content" class="font-mono text-xs whitespace-pre-wrap max-h-96 overflow-auto"></pre>
    `;
    panel.querySelector('button').addEventListener('click', clearDebug);
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
        const regex = new RegExp(`^\\[(?:${modules})\\]`, 'i');
        if (!regex.test(message)) {
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

export function clearDebug() {
    const content = document.getElementById('debug-content');
    if (content) {
        content.textContent = '';
        autoScroll = true;
    }
}