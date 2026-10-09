import { formatBytes, formatSpeed } from './utils.js';
import { logDebug } from './debug.js';
import { Platform } from './platform.js';

let totalChart = null;
const MAX_POINTS = 360;

let lastMouseX = 0;
let lastMouseY = 0;
let mouseMoveListener = null;
let mouseLeaveListener = null;

let updateChartTimeout = null;

export async function loadStatus(callback) {
    try {
        const res = await fetch('/api/status');
        const result = await res.json();

        if (!result.success) {
            if (typeof callback === 'function') callback(false);
            return;
        }

        renderTunnels(result.tunnels || []);
        renderGlobalStats(result);

        if (typeof callback === 'function') callback(true);
    } catch (e) {
        console.warn('Load status failed:', e);

        if (typeof callback === 'function') callback(false);
    }
}

function renderTunnels(tunnels) {
    const container = document.getElementById('tunnels-container');
    if (!container) return;

    const grouped = {};
    tunnels.forEach(t => {
        const hostKey = t.host || 'Unknown';
        if (!grouped[hostKey]) grouped[hostKey] = [];
        grouped[hostKey].push(t);
    });

    const sortedHosts = Object.keys(grouped).sort((hostA, hostB) => {
        const minIdA = Math.min(...grouped[hostA].map(t => t.id));
        const minIdB = Math.min(...grouped[hostB].map(t => t.id));
        return minIdA - minIdB;
    });

    let html = '';

    sortedHosts.forEach(host => {
        if (!host.match(/^\d+\.\d+\.\d+\.\d+$/)) return;

        const tunnelsGroup = grouped[host];
        tunnelsGroup.sort((a, b) => a.id - b.id);

        const firstTunnel = tunnelsGroup[0];
        const isEnabled = firstTunnel.enabled !== false;
        const padding = Platform.isAndroid() ? 'style="padding-right: 2px;"' : '';

        html += `
            <div class="tunnel-group mb-10">
                <div class="flex justify-between mb-4">
                    <div>
                        <div class="text-xl font-bold text-blue-600 dark:text-blue-400">${host}${firstTunnel.public_ip ? `${Platform.isDesktop() ? ' ' : '<br>'}(${firstTunnel.public_ip})` : ''}</div>
                        <div class="text-gray-500 dark:text-gray-400 text-sm">
                            (${tunnelsGroup.length} tunnels)
                        </div>
                    </div>
                  
                    <label class="relative inline-flex cursor-pointer" ${padding}>
                        <input type="checkbox"
                            class="sr-only peer"
                            ${isEnabled ? 'checked' : ''}
                            onchange="toggleHost('${host}', this)">
                        <div class="w-11 h-6 bg-gray-300 dark:bg-gray-700
                                    peer-focus:outline-none peer-focus:ring-2
                                    peer-focus:ring-blue-500 rounded-full peer
                                    peer-checked:after:translate-x-full
                                    peer-checked:after:border-white
                                    after:content-[''] after:absolute after:top-0.5
                                    after:left-0.5 after:bg-white
                                    after:border-gray-300 after:border
                                    after:rounded-full after:h-5 after:w-5
                                    after:transition-all
                                    peer-checked:bg-green-600"></div>
                    </label>
                </div>
              
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4
                            ${!isEnabled ? 'opacity-50' : ''}">
        `;

        tunnelsGroup.forEach(t => {
            const isUp = t.state === 'ONLINE';
            html += `
                <div class="bg-gray-100 dark:bg-gray-900 p-5 border border-gray-300 dark:border-gray-700 rounded-2xl ${isEnabled && t.rotation >= 0 ? 'opacity-50 transition-all duration-200' : ''}">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <div class="font-semibold text-gray-900 dark:text-white">
                                Tunnel ${t.id}
                                <span class="text-xs text-gray-500 dark:text-gray-400">
                                    (${t.port || ''} | ${t.weight})
                                </span>
                            </div>
                        </div>
                      
                        <span class="px-4 py-1 text-xs font-medium rounded-full
                                    ${isUp
                                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400'
                                        : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400'}">
                            ${t.state || 'OFFLINE'}
                        </span>
                    </div>
                  
                    <div class="grid grid-cols-2 gap-y-3 text-sm">
                        <div class="text-gray-500 dark:text-gray-400">RX Speed</div>
                        <div class="font-mono text-right text-gray-900 dark:text-gray-100">${formatSpeed(t.speed_rx)}</div>
                      
                        <div class="text-gray-500 dark:text-gray-400">TX Speed</div>
                        <div class="font-mono text-right text-gray-900 dark:text-gray-100">${formatSpeed(t.speed_tx)}</div>
                      
                        <div class="text-gray-500 dark:text-gray-400">RX Total</div>
                        <div class="font-mono text-right text-gray-900 dark:text-gray-100">${formatBytes(t.bytes_rx)}</div>
                      
                        <div class="text-gray-500 dark:text-gray-400">TX Total</div>
                        <div class="font-mono text-right text-gray-900 dark:text-gray-100">${formatBytes(t.bytes_tx)}</div>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html || '<p class="text-gray-500 p-8">No tunnels found</p>';
}

function renderGlobalStats(data) {
    const container = document.getElementById('global-stats');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between py-2 border-b border-gray-300 dark:border-gray-700">
            <span class="text-gray-500 dark:text-gray-400">Total RX Speed</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">${formatSpeed(data.total_speed_rx || 0)}</span>
        </div>
        <div class="flex justify-between py-2 border-b border-gray-300 dark:border-gray-700">
            <span class="text-gray-500 dark:text-gray-400">Total TX Speed</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">${formatSpeed(data.total_speed_tx || 0)}</span>
        </div>
        <div class="flex justify-between py-2 border-b border-gray-300 dark:border-gray-700">
            <span class="text-gray-500 dark:text-gray-400">Total RX Bytes</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">${formatBytes(data.total_bytes_rx || 0)}</span>
        </div>
        <div class="flex justify-between py-2 border-b border-gray-300 dark:border-gray-700">
            <span class="text-gray-500 dark:text-gray-400">Total TX Bytes</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">${formatBytes(data.total_bytes_tx || 0)}</span>
        </div>
        <div class="flex justify-between py-2">
            <span class="text-gray-500 dark:text-gray-400">Active Tunnels</span>
            <span class="font-medium text-gray-900 dark:text-white">
                ${data.active_count || 0} / ${data.total_tunnels || 0}
            </span>
        </div>
    `;
}

function initChart() {
    const canvas = document.getElementById('totalSpeedChart');
    if (!canvas) {
        console.warn('Canvas #totalSpeedChart not found yet. Retrying...');
        setTimeout(initChart, 500);
        return;
    }

    if (totalChart) {
        totalChart.destroy();
        totalChart = null;
    }

    const ctx = canvas.getContext('2d');
   
    totalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'RX Speed',
                    borderColor: '#22d3ee',
                    backgroundColor: 'rgba(34, 211, 238, 0.08)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    data: [],
                    pointRadius: 0,
                    pointHoverRadius: 3
                },
                {
                    label: 'TX Speed',
                    borderColor: '#a78bfa',
                    backgroundColor: 'rgba(167, 139, 250, 0.08)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    data: [],
                    pointRadius: 0,
                    pointHoverRadius: 3
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                hover: {},
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#e5e7eb', boxWidth: 12, padding: 15 }
                },
                tooltip: {
                    enabled: false,
                    mode: 'nearest',
                    intersect: false,  // true = only when the cursor intersects the element
                    position: 'nearest',
                    
                    external: function(context) {
                        const tooltipEl = document.getElementById('customTooltip');
                        if (!tooltipEl) return;

                        if (!context?.tooltip || 
                            context.tooltip.opacity === 0 || 
                            !context.tooltip.dataPoints?.length) {
                            
                            tooltipEl.style.display = 'none';
                            return;
                        }

                        // Extra guard: check the distance to the nearest point
                        const tooltip = context.tooltip;
                        if (tooltip.dataPoints.length > 0) {
                            const point = tooltip.dataPoints[0];
                            const distance = Math.hypot(
                                tooltip.caretX - point.element.x,
                                tooltip.caretY - point.element.y
                            );
                            
                            // If the distance is too large, treat it as a miss
                            if (distance > 30) {  // (15-30)
                                tooltipEl.style.display = 'none';
                                return;
                            }
                        }

                        scheduleChartUpdate();

                        tooltipEl.style.display = 'block';

                        let bodyHTML = '';
                        tooltip.dataPoints.forEach(point => {
                            bodyHTML += `
                                <div style="display:flex; align-items:center; gap:8px; margin:3px 0;">
                                    <span style="color:${point.dataset.borderColor}; font-size:16px;">●</span>
                                    <span>${point.dataset.label}:</span>
                                    <span style="margin-left:auto; font-weight:600; color:#e5e7eb;">
                                        ${formatSpeed(point.raw)}
                                    </span>
                                </div>
                            `;
                        });
                        document.getElementById('tooltipBody').innerHTML = bodyHTML;

                        if (!Platform.isDesktop()) return;

                        requestAnimationFrame(() => {
                            const tooltipRect = tooltipEl.getBoundingClientRect();
                            let left = lastMouseX + 18;
                            let top = lastMouseY + 10;

                            const tooltipWidth = tooltipRect.width || 240;
                            const tooltipHeight = tooltipRect.height || 70;

                            if (left + tooltipWidth + 25 > window.innerWidth) {
                                left = lastMouseX - tooltipWidth - 18;
                            }
                            if (left < 10) left = 10;
                            if (top < 15) top = 15;
                            else if (top + tooltipHeight + 25 > window.innerHeight) {
                                top = window.innerHeight - tooltipHeight - 25;
                            }

                            tooltipEl.style.left = `${left}px`;
                            tooltipEl.style.top = `${top}px`;
                            tooltipEl.style.transform = 'none';
                        });
                    }
                }
            },
            scales: {
                x: { 
                    grid: { color: '#374151' }, 
                    ticks: { 
                        color: '#9ca3af', 
                        maxTicksLimit: 12 
                    } 
                },
                y: {
                    beginAtZero: true,
                    max: undefined,
                    grid: { color: '#374151' },
                    ticks: {
                        color: '#9ca3af',
                        maxTicksLimit: 8,
                        stepSize: undefined,
                        callback: function(value) {
                            if (value === 0) {
                                return (this._range?.max >= 1024 * 1024) ? '0 MB/s' : '0 KB/s';
                            }
                            const mb = value / (1024 * 1024);
                            if (mb >= 1) {
                                return Math.round(mb) + ' MB/s';
                            } else {
                                const kb = value / 1024;
                                return Math.round(kb) + ' KB/s';
                            }
                        }
                    }
                }
            }
        }
    });

    if (mouseMoveListener) {
        canvas.removeEventListener('mousemove', mouseMoveListener);
    }

    mouseMoveListener = (e) => {
        const rect = canvas.getBoundingClientRect();
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    };

    canvas.addEventListener('mousemove', mouseMoveListener, { passive: true });

    if (mouseLeaveListener) {
        canvas.removeEventListener('mouseleave', mouseLeaveListener);
    }
    
    mouseLeaveListener = () => {
        const tooltipEl = document.getElementById('customTooltip');
        if (tooltipEl) tooltipEl.style.display = 'none';
    };

    if (mouseLeaveListener) {
        canvas.addEventListener('mouseleave', mouseLeaveListener);
    }
}

function getNiceYScale(maxValue) {
    if (maxValue <= 0) return { max: 0, step: 0 };

    const candidates = [];

    [4, 5, 6].forEach(intervals => {
        const r = getNiceYScaleByDesiredIntervals(maxValue, intervals);
        if (r.max >= maxValue * 0.98) {   // a small tolerance is allowed
            candidates.push(r);
        }
    });

    if (candidates.length === 0) {
        return getNiceYScaleByDesiredIntervals(maxValue, 5);
    }

    return candidates.reduce((best, current) => {
        const bestScore = scoreScale(best, maxValue);
        const currScore = scoreScale(current, maxValue);
        return currScore < bestScore ? current : best;
    });
}

// Rating of the scale "quality"
function scoreScale(scale, originalValue) {
    const excess = scale.max / originalValue;
    const points = Math.round(scale.max / scale.step) + 1;

    let score = scale.step;                             // top priority: a small step
    score += (excess - 1) * 120000;                     // heavy penalty for a large overshoot
    if (points < 4 || points > 8) score += 300000;      // penalty for too few or too many points

    return score;
}

function getNiceYScaleByDesiredIntervals(maxValue, desiredIntervals) {
    if (maxValue <= 0) return { max: 0, step: 0 };

    const KB = 1024;
    const MB = 1024 * 1024;
    const isMB = maxValue >= MB;
    const unitSize = isMB ? MB : KB;
    let valueInUnit = maxValue / unitSize;

    let roughStep = valueInUnit / desiredIntervals;

    function niceStep(step) {
        if (step <= 0) return 1;
        const exp = Math.floor(Math.log10(step));
        let f = step / Math.pow(10, exp);

        if (f <= 1) return 1 * Math.pow(10, exp);
        if (f <= 2) return 2 * Math.pow(10, exp);
        if (f <= 5) return 5 * Math.pow(10, exp);
        return 10 * Math.pow(10, exp);
    }

    let stepInUnit = niceStep(roughStep);
    let niceMaxInUnit = Math.ceil(valueInUnit / stepInUnit) * stepInUnit;

    if (niceMaxInUnit < valueInUnit * 1.01) {
        niceMaxInUnit += stepInUnit;
    }

    if (niceMaxInUnit / stepInUnit < desiredIntervals - 1) {
        niceMaxInUnit = stepInUnit * Math.ceil(desiredIntervals);
    }

    const maxBytes = Math.ceil(niceMaxInUnit) * unitSize;
    const stepBytes = Math.ceil(stepInUnit) * unitSize;

    return { max: maxBytes, step: stepBytes };
}

async function updateChart(callback) {
    if (!totalChart || window.currentTab !== 0) return;

    const tooltipEl = document.getElementById('customTooltip');
    if (tooltipEl) tooltipEl.style.display = 'none';

    if (totalChart.tooltip) {
        totalChart.tooltip.setActiveElements([]);
        totalChart.tooltip.opacity = 0;
    }

    try {
        const response = await fetch('/data/total_history.json');
        if (!response.ok) throw new Error('Fetch error');
        const data = await response.json();
        
        if (!data.history?.length) {
            if (typeof callback === 'function') callback(false);
            return;
        }

        const labels = [];
        const rxData = [];
        const txData = [];

        let maxSpeed = 0;

        data.history.forEach(point => {
            const time = new Date(point.ts * 1000);
            labels.push(time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
            rxData.push(point.rx);
            txData.push(point.tx);

            maxSpeed = Math.max(maxSpeed, point.rx, point.tx);
        });

        const { max: suggestedMax, step: stepSize } = getNiceYScale(maxSpeed);

        totalChart.data.labels = labels;
        totalChart.data.datasets[0].data = rxData;
        totalChart.data.datasets[1].data = txData;

        totalChart.options.scales.y.max = suggestedMax;
        totalChart.options.scales.y.ticks.stepSize = stepSize;
        totalChart.options.scales.y.ticks.maxTicksLimit = 8;

        totalChart.update('none');

        const lastTime = new Date(data.last_update * 1000);
        document.getElementById('chart-last-update').textContent =
            `Last update: ${lastTime.toLocaleTimeString('en-GB')}`;

        if (typeof callback === 'function') callback(true);
    } catch (e) {
        console.warn('Chart update failed:', e);

        if (typeof callback === 'function') callback(false);
    }
}

function scheduleChartUpdate() {
    if (updateChartTimeout) {
        clearInterval(updateChartTimeout);
    }
    updateChartTimeout = setInterval(updateChart, 10000);
}

export function startChart(onChartReady) {
    initChart();
    updateChart(onChartReady);
    scheduleChartUpdate();    
}

// Global toggleHost function (used in the HTML)
window.toggleHost = async function(host, checkbox) {
    try {
        const res = await fetch('/api/host/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: host })
        });
        const data = await res.json();
        if (data.success) {
            setTimeout(loadStatus, 400);
        } else {
            window.showToast("Error: " + (data.error || 'Unknown error'), 'error');
            checkbox.checked = !checkbox.checked;
        }
    } catch (e) {
        console.error(e);
        window.showToast("Failed to toggle host");
        checkbox.checked = !checkbox.checked;
    }
};