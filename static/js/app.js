// AURA SORT — FRONTEND JAVASCRIPT

// SAFE STORAGE WRAPPERS FOR BROWSER STORAGE RESTRICTIONS / TRACKING PREVENTION
if (!window.safeLocalStorage) {
    window.safeLocalStorage = {
        _memDb: {},
        getItem(key) {
            try {
                const storage = window.localStorage;
                if (storage) return storage.getItem(key);
            } catch (e) {
                console.warn(`[SafeStorage] Failed to read ${key} from localStorage:`, e);
            }
            return this._memDb[key] !== undefined ? this._memDb[key] : null;
        },
        setItem(key, value) {
            try {
                const storage = window.localStorage;
                if (storage) {
                    storage.setItem(key, value);
                    return;
                }
            } catch (e) {
                console.warn(`[SafeStorage] Failed to write ${key} to localStorage:`, e);
            }
            this._memDb[key] = String(value);
        },
        removeItem(key) {
            try {
                const storage = window.localStorage;
                if (storage) {
                    storage.removeItem(key);
                    return;
                }
            } catch (e) {
                console.warn(`[SafeStorage] Failed to remove ${key} from localStorage:`, e);
            }
            delete this._memDb[key];
        }
    };
}

if (!window.safeSessionStorage) {
    window.safeSessionStorage = {
        _memDb: {},
        getItem(key) {
            try {
                const storage = window.sessionStorage;
                if (storage) return storage.getItem(key);
            } catch (e) {
                console.warn(`[SafeStorage] Failed to read ${key} from sessionStorage:`, e);
            }
            return this._memDb[key] !== undefined ? this._memDb[key] : null;
        },
        setItem(key, value) {
            try {
                const storage = window.sessionStorage;
                if (storage) {
                    storage.setItem(key, value);
                    return;
                }
            } catch (e) {
                console.warn(`[SafeStorage] Failed to write ${key} to sessionStorage:`, e);
            }
            this._memDb[key] = String(value);
        },
        removeItem(key) {
            try {
                const storage = window.sessionStorage;
                if (storage) {
                    storage.removeItem(key);
                    return;
                }
            } catch (e) {
                console.warn(`[SafeStorage] Failed to remove ${key} from sessionStorage:`, e);
            }
            delete this._memDb[key];
        }
    };
}

// GLOBAL TOAST NOTIFICATION SYSTEM
(function () {
    // Dynamic CSS injection for toasts
    if (!document.getElementById('custom-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'custom-toast-styles';
        style.innerHTML = `
            #custom-toast-container {
                position: fixed;
                top: 24px;
                right: 24px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                z-index: 999999;
                pointer-events: none;
                max-width: 380px;
                width: calc(100% - 48px);
            }
            .custom-toast {
                background: rgba(18, 18, 22, 0.95);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 2px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                padding: 14px 18px;
                color: #F3F3F3;
                font-family: 'Outfit', 'Inter', system-ui, sans-serif;
                font-size: 0.9rem;
                line-height: 1.4;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                pointer-events: auto;
                display: flex;
                align-items: center;
                gap: 14px;
                transform: translateX(120%);
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
            }
            .custom-toast.show {
                transform: translateX(0);
                opacity: 1;
            }
            .custom-toast.hide {
                transform: translateX(120%) scale(0.9);
                opacity: 0;
            }
            .custom-toast-icon {
                font-size: 1.25rem;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .custom-toast-content {
                flex-grow: 1;
                font-weight: 500;
                letter-spacing: -0.1px;
            }
            .custom-toast-close {
                background: transparent;
                border: none;
                color: #888890;
                cursor: pointer;
                padding: 4px;
                font-size: 1.2rem;
                line-height: 1;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s, transform 0.2s;
            }
            .custom-toast-close:hover {
                color: #F3F3F3;
                transform: scale(1.1);
            }
            .custom-toast-success { border-left: 4px solid #22c55e; }
            .custom-toast-success .custom-toast-icon { color: #22c55e; }
            .custom-toast-error { border-left: 4px solid #ef4444; }
            .custom-toast-error .custom-toast-icon { color: #ef4444; }
            .custom-toast-warning { border-left: 4px solid #eab308; }
            .custom-toast-warning .custom-toast-icon { color: #eab308; }
            .custom-toast-info { border-left: 4px solid #FF8C00; }
            .custom-toast-info .custom-toast-icon { color: #FF8C00; }
        `;
        document.head.appendChild(style);
    }

    window.showToast = function (message, type = 'info', duration = 4000) {
        let container = document.getElementById('custom-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'custom-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast custom-toast-${type}`;

        let iconClass = 'fa-circle-info';
        if (type === 'success') iconClass = 'fa-circle-check';
        else if (type === 'error') iconClass = 'fa-circle-xmark';
        else if (type === 'warning') iconClass = 'fa-triangle-exclamation';

        toast.innerHTML = `
            <div class="custom-toast-icon"><i class="fa-solid ${iconClass}"></i></div>
            <div class="custom-toast-content">${message}</div>
            <button class="custom-toast-close">&times;</button>
        `;

        container.appendChild(toast);

        // Force a reflow and then add class
        setTimeout(() => toast.classList.add('show'), 10);

        const closeBtn = toast.querySelector('.custom-toast-close');
        const dismiss = () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 400);
        };
        closeBtn.addEventListener('click', dismiss);

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }
    };

    // Override default alert
    window.alert = function (message) {
        if (typeof message !== 'string') {
            try { message = String(message); } catch (e) { message = '[Complex Object]'; }
        }
        let type = 'info';
        const msgLower = message.toLowerCase();
        if (msgLower.includes('fail') || msgLower.includes('error') || msgLower.includes('incorrect') || msgLower.includes('invalid') || msgLower.includes('not empty') || msgLower.includes('cannot be empty')) {
            type = 'error';
        } else if (msgLower.includes('success') || msgLower.includes('complete') || msgLower.includes('saved') || msgLower.includes('cleared')) {
            type = 'success';
        } else if (msgLower.includes('warning') || msgLower.includes('please paste') || msgLower.includes('need at least')) {
            type = 'warning';
        }
        window.showToast(message, type);
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    const localStorage = window.safeLocalStorage;
    const sessionStorage = window.safeSessionStorage;

    // Hover video preview helpers
    let hoverPreviewTimeout = null;
    let activeHoverVideo = null;
    let activeHoverCard = null;

    const attachHoverPreview = (card) => {
        if (card.dataset.isVideo !== 'true' || card.dataset.isNative !== 'true') return;

        card.addEventListener('mouseenter', () => {
            if (hoverPreviewTimeout) clearTimeout(hoverPreviewTimeout);
            
            hoverPreviewTimeout = setTimeout(() => {
                const folder = card.dataset.folder;
                const filename = card.dataset.filename;
                if (!folder || !filename) return;

                const videoUrl = `/media/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
                cleanupHoverPreview();

                const video = document.createElement('video');
                video.className = 'hover-preview-video';
                video.muted = true;
                video.loop = true;
                video.setAttribute('playsinline', '');
                
                video.addEventListener('loadedmetadata', () => {
                    if (video.duration) {
                        video.currentTime = video.duration * 0.5;
                    }
                });
                
                video.src = videoUrl;

                const thumbContainer = card.querySelector('.thumbnail-container');
                if (thumbContainer) {
                    thumbContainer.appendChild(video);
                } else {
                    card.appendChild(video);
                }

                activeHoverVideo = video;
                activeHoverCard = card;
                
                video.play().then(() => {
                    card.classList.add('hovering-video');
                }).catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error('Hover preview play failed:', err);
                    }
                });
            }, 350);
        });

        const handleLeave = () => {
            if (hoverPreviewTimeout) {
                clearTimeout(hoverPreviewTimeout);
                hoverPreviewTimeout = null;
            }
            if (activeHoverCard === card) {
                cleanupHoverPreview();
            }
        };

        card.addEventListener('mouseleave', handleLeave);
        card.addEventListener('dragstart', handleLeave);
    };

    const cleanupHoverPreview = () => {
        if (hoverPreviewTimeout) {
            clearTimeout(hoverPreviewTimeout);
            hoverPreviewTimeout = null;
        }
        if (activeHoverCard) {
            activeHoverCard.classList.remove('hovering-video');
            activeHoverCard = null;
        }
        if (activeHoverVideo) {
            try {
                activeHoverVideo.pause();
                activeHoverVideo.src = '';
                activeHoverVideo.load();
                activeHoverVideo.remove();
            } catch (err) {
                console.error('Error cleaning up hover video:', err);
            }
            activeHoverVideo = null;
        }
    };

    // Navigation Tabs
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    const pageHeading = document.getElementById('page-heading');
    const pageSubheading = document.getElementById('page-subheading');

    const headings = {
        'sec-results': { title: 'Library', sub: 'View identified profiles and sorted media folders' },
        'sec-profiles': { title: 'Face Profiles', sub: 'Manage detected identities, assign images, and merge duplicates' },
        'sec-dashboard': { title: 'Pipeline', sub: 'Orchestrate face recognition, gender classification, and clustering pipeline' },
        'sec-duplicates': { title: 'Duplicate Finder', sub: 'Scan library folders using perceptual hashing to group duplicate photos and videos' },
        'sec-configuration': { title: 'Settings', sub: 'Configure folders, intervals, thresholds, and performance metrics' },
        'sec-gallery': { title: 'Profile Gallery', sub: 'Browse media files and correct sorting' }
    };

    window.switchSection = (targetId) => {
        sections.forEach(sec => sec.classList.remove('active'));
        
        // Find if this is a main nav item
        const navHref = targetId.replace('sec-', '#');
        navItems.forEach(nav => {
            if (nav.getAttribute('href') === navHref) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        });
        
        const targetSec = document.getElementById(targetId);
        if (targetSec) {
            targetSec.classList.add('active');
        }

        // Update page header text
        if (headings[targetId]) {
            pageHeading.textContent = headings[targetId].title;
            pageSubheading.textContent = headings[targetId].sub;
        }
        
        if (targetId === 'sec-results') {
            loadLibrary();
        } else if (targetId === 'sec-profiles') {
            loadProfiles();
        } else if (targetId === 'sec-duplicates') {
            loadDuplicates();
        } else if (targetId === 'sec-dashboard') {
            if (typeof checkInitialStatus === 'function') {
                checkInitialStatus();
            }
        }
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('href').replace('#', 'sec-');
            window.switchSection(targetId);
        });
    });

    // Form inputs and sliders range indicators
    const rangeSliders = [
        { id: 'face_det_threshold', displayId: 'val-face_det_threshold', precision: 2, suffix: '' },
        { id: 'gender_threshold', displayId: 'val-gender_threshold', precision: 2, suffix: '' },
        { id: 'cluster_epsilon', displayId: 'val-cluster_epsilon', precision: 2, suffix: '' },
        { id: 'min_eye_dist_ratio', displayId: 'val-min_eye_dist_ratio', precision: 2, suffix: '' },
        { id: 'extraction_percent', displayId: 'val-extraction_percent', precision: 0, suffix: '%' },
        { id: 'name_confidence_threshold', displayId: 'val-name_confidence_threshold', precision: 2, suffix: '' }
    ];

    rangeSliders.forEach(sliderInfo => {
        const slider = document.getElementById(sliderInfo.id);
        const display = document.getElementById(sliderInfo.displayId);
        if (slider && display) {
            slider.addEventListener('input', () => {
                const suffix = sliderInfo.suffix !== undefined ? sliderInfo.suffix : '';
                display.textContent = parseFloat(slider.value).toFixed(sliderInfo.precision) + suffix;
            });
        }
    });

    // Fetch Config on Load
    const loadConfig = async () => {
        try {
            const res = await fetch(`/api/config?t=${Date.now()}`);
            const data = await res.json();
            
            // Populate form inputs
            document.getElementById('input_dir').value = data.input_dir || '';
            document.getElementById('output_dir').value = data.output_dir || '';
            document.getElementById('mode').value = data.mode || 'move';
            document.getElementById('model_pack').value = data.model_pack || 'buffalo_l';
            document.getElementById('keyframe_interval').value = data.keyframe_interval !== undefined ? data.keyframe_interval : 0;
            document.getElementById('max_keyframes').value = data.max_keyframes || 100;
            document.getElementById('use_cache').checked = data.use_cache !== false;
            document.getElementById('keep_keyframes').checked = data.keep_keyframes === true;
            document.getElementById('prefer_popular_identities').checked = data.prefer_popular_identities === true;
            
            // Slider values
            document.getElementById('face_det_threshold').value = data.face_det_threshold || 0.5;
            document.getElementById('val-face_det_threshold').textContent = parseFloat(data.face_det_threshold || 0.5).toFixed(2);
            
            document.getElementById('gender_threshold').value = data.gender_threshold || 0.65;
            document.getElementById('val-gender_threshold').textContent = parseFloat(data.gender_threshold || 0.65).toFixed(2);
            
            document.getElementById('cluster_epsilon').value = data.cluster_epsilon || 0.55;
            document.getElementById('val-cluster_epsilon').textContent = parseFloat(data.cluster_epsilon || 0.55).toFixed(2);
            
            document.getElementById('min_eye_dist_ratio').value = data.min_eye_dist_ratio !== undefined ? data.min_eye_dist_ratio : 0.20;
            document.getElementById('val-min_eye_dist_ratio').textContent = parseFloat(data.min_eye_dist_ratio !== undefined ? data.min_eye_dist_ratio : 0.20).toFixed(2);
            
            document.getElementById('min_cluster_size').value = data.min_cluster_size || 2;
            document.getElementById('min_face_size').value = data.min_face_size || 60;
            
            document.getElementById('extraction_percent').value = data.extraction_percent || 100;
            document.getElementById('val-extraction_percent').textContent = parseInt(data.extraction_percent || 100) + '%';
            
            document.getElementById('auto_name_folders').checked = data.auto_name_folders === true;
            document.getElementById('only_name_unnamed').checked = data.only_name_unnamed !== false;
            document.getElementById('merge_on_name_conflict').checked = data.merge_on_name_conflict === true;
            
            document.getElementById('name_confidence_threshold').value = data.name_confidence_threshold !== undefined ? data.name_confidence_threshold : 0.5;
            document.getElementById('val-name_confidence_threshold').textContent = parseFloat(data.name_confidence_threshold !== undefined ? data.name_confidence_threshold : 0.5).toFixed(2);
            
            document.getElementById('name_search_delay').value = data.name_search_delay !== undefined ? data.name_search_delay : 4.0;
            document.getElementById('default_video_player').value = data.default_video_player || 'browser';
            
            // Watch Party Settings Loading
            document.getElementById('wp_use_cloudflare').checked = data.wp_use_cloudflare !== false;
            document.getElementById('wp_cloudflare_token').value = data.wp_cloudflare_token || '';
            document.getElementById('wp_custom_domain').value = data.wp_custom_domain || '';
            document.getElementById('wp_turn_server').value = data.wp_turn_server || '';
            document.getElementById('wp_turn_username').value = data.wp_turn_username || '';
            document.getElementById('wp_turn_credential').value = data.wp_turn_credential || '';
            document.getElementById('wp_use_hls').checked = data.wp_use_hls === true;
            document.getElementById('wp_hls_bitrate').value = data.wp_hls_bitrate || '2500k';
            document.getElementById('wp_hls_resolution').value = data.wp_hls_resolution || '1280x720';
            
            appendLog('info', 'Loaded current configuration settings.');
        } catch (err) {
            appendLog('error', `Failed to load configuration: ${err.message}`);
        }
    };

    loadConfig();

    // Save Config Form
    const configForm = document.getElementById('config-form');
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            input_dir: document.getElementById('input_dir').value,
            output_dir: document.getElementById('output_dir').value,
            mode: document.getElementById('mode').value,
            model_pack: document.getElementById('model_pack').value,
            keyframe_interval: parseInt(document.getElementById('keyframe_interval').value),
            max_keyframes: parseInt(document.getElementById('max_keyframes').value),
            use_cache: document.getElementById('use_cache').checked,
            keep_keyframes: document.getElementById('keep_keyframes').checked,
            prefer_popular_identities: document.getElementById('prefer_popular_identities').checked,
            face_det_threshold: parseFloat(document.getElementById('face_det_threshold').value),
            gender_threshold: parseFloat(document.getElementById('gender_threshold').value),
            min_eye_dist_ratio: parseFloat(document.getElementById('min_eye_dist_ratio').value),
            cluster_epsilon: parseFloat(document.getElementById('cluster_epsilon').value),
            min_cluster_size: parseInt(document.getElementById('min_cluster_size').value),
            min_face_size: parseInt(document.getElementById('min_face_size').value),
            extraction_percent: parseInt(document.getElementById('extraction_percent').value),
            auto_name_folders: document.getElementById('auto_name_folders').checked,
            only_name_unnamed: document.getElementById('only_name_unnamed').checked,
            merge_on_name_conflict: document.getElementById('merge_on_name_conflict').checked,
            name_confidence_threshold: parseFloat(document.getElementById('name_confidence_threshold').value),
            name_search_delay: parseFloat(document.getElementById('name_search_delay').value),
            default_video_player: document.getElementById('default_video_player').value,
            
            // Watch Party configuration fields
            wp_use_cloudflare: document.getElementById('wp_use_cloudflare').checked,
            wp_cloudflare_token: document.getElementById('wp_cloudflare_token').value,
            wp_custom_domain: document.getElementById('wp_custom_domain').value,
            wp_turn_server: document.getElementById('wp_turn_server').value,
            wp_turn_username: document.getElementById('wp_turn_username').value,
            wp_turn_credential: document.getElementById('wp_turn_credential').value,
            wp_use_hls: document.getElementById('wp_use_hls').checked,
            wp_hls_bitrate: document.getElementById('wp_hls_bitrate').value,
            wp_hls_resolution: document.getElementById('wp_hls_resolution').value
        };

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                appendLog('info', 'Configuration saved successfully!');
                alert('Configuration saved successfully!');
            } else {
                appendLog('error', `Failed to save configuration: ${data.message}`);
            }
        } catch (err) {
            appendLog('error', `Error sending configuration: ${err.message}`);
        }
    });

    // Settings Sub-Tab Switching Logic
    const tabBtns = document.querySelectorAll('.settings-tab-btn');
    const tabPanels = document.querySelectorAll('.settings-tab-panel');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-settings-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const activePanel = document.getElementById('tab-' + target);
            if (activePanel) {
                activePanel.classList.add('active');
            }
        });
    });


    // Logging & Console utilities
    const consoleOutput = document.getElementById('console-logs');
    const clearConsoleBtn = document.getElementById('btn-clear-console');

    const appendLog = (level, message) => {
        const line = document.createElement('div');
        line.className = `log-line ${level}`;
        
        const timestamp = new Date().toLocaleTimeString();
        line.innerHTML = `<span style="color: var(--text-dark); margin-right: 0.5rem;">[${timestamp}]</span> ${message}`;
        
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    };

    clearConsoleBtn.addEventListener('click', () => {
        consoleOutput.innerHTML = '';
        appendLog('info', 'Console logs cleared by user.');
    });

    // Pipeline runner controls
    const startBtn = document.getElementById('btn-start');
    const clearCacheBtn = document.getElementById('btn-clear-cache-db');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressMessage = document.getElementById('progress-message');
    const currentStage = document.getElementById('current-stage');
    
    // Status sidebar elements
    const systemDot = document.getElementById('system-dot');
    const systemStatusText = document.getElementById('system-status-text');
    
    // Stats elements
    const statFemales = document.getElementById('stat-females');
    const statVideos = document.getElementById('stat-videos');
    const statUnsorted = document.getElementById('stat-unsorted');
    
    // Results Grid
    const libraryGrid = document.getElementById('library-grid');
    const libraryCountTitle = document.getElementById('library-count-title');

    let eventSource = null;

    const connectSSE = () => {
        if (eventSource) {
            eventSource.close();
        }

        eventSource = new EventSource('/api/stream-progress');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // Update UI elements
            const pct = parseFloat(data.percent).toFixed(1);
            progressBar.style.width = `${pct}%`;
            progressPercent.textContent = `${pct}%`;
            progressMessage.textContent = data.message;
            currentStage.textContent = data.stage.toUpperCase();

            // Append logs
            if (data.new_logs && data.new_logs.length > 0) {
                data.new_logs.forEach(logStr => {
                    let level = 'info';
                    if (logStr.includes('WARNING')) level = 'warning';
                    if (logStr.includes('ERROR') || logStr.includes('Failed') || logStr.includes('error')) level = 'error';
                    
                    // Strip timestamp prefix if logger already has one to avoid double timestamp
                    // E.g. "2026-06-08 01:23:45,678 - INFO - ..."
                    const cleanMsg = logStr.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - \w+ - /, '');
                    appendLog(level, cleanMsg);
                });
            }

            // Running state colors
            const manualAutoNameBtn = document.getElementById('btn-manual-auto-name');
            if (data.running) {
                startBtn.disabled = true;
                clearCacheBtn.disabled = true;
                if (manualAutoNameBtn) manualAutoNameBtn.disabled = true;
                systemDot.className = 'status-indicator-dot active';
                systemStatusText.textContent = 'Processing Media';
            } else {
                startBtn.disabled = false;
                clearCacheBtn.disabled = false;
                if (manualAutoNameBtn) manualAutoNameBtn.disabled = false;
                
                if (data.stage === 'completed') {
                    systemDot.className = 'status-indicator-dot';
                    systemStatusText.textContent = 'System Idle';
                    
                    // Render report results
                    loadLibrary();
                    eventSource.close();
                } else if (data.stage === 'error') {
                    systemDot.className = 'status-indicator-dot error';
                    systemStatusText.textContent = 'Pipeline Error';
                    eventSource.close();
                } else {
                    systemDot.className = 'status-indicator-dot';
                    systemStatusText.textContent = 'System Idle';
                }
            }
        };

        eventSource.onerror = (err) => {
            console.error('SSE Error:', err);
            eventSource.close();
        };
    };

    // Start Sorting Process
    startBtn.addEventListener('click', async () => {
        try {
            // First save config just in case
            appendLog('info', 'Triggering pipeline launch...');
            const res = await fetch('/api/start', { method: 'POST' });
            const data = await res.json();
            
            if (data.status === 'success') {
                appendLog('info', 'Pipeline process launched in background.');
                connectSSE();
            } else {
                appendLog('error', `Failed to start pipeline: ${data.message}`);
            }
        } catch (err) {
            appendLog('error', `Launch HTTP Error: ${err.message}`);
        }
    });

    // Clear Cache Button
    clearCacheBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear the embedding database cache? Next run will analyze all files from scratch.')) {
            return;
        }
        try {
            const res = await fetch('/api/clear-cache', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                appendLog('info', 'Embedding cache database successfully cleared.');
                alert('Embedding cache cleared.');
            } else {
                appendLog('error', `Failed to clear cache: ${data.message}`);
            }
        } catch (err) {
            appendLog('error', `Cache HTTP Error: ${err.message}`);
        }
    });

    // Manual Auto-Name Button
    const manualAutoNameBtn = document.getElementById('btn-manual-auto-name');
    if (manualAutoNameBtn) {
        manualAutoNameBtn.addEventListener('click', async () => {
            try {
                appendLog('info', 'Triggering manual folder auto-naming process...');
                manualAutoNameBtn.disabled = true;
                const res = await fetch('/api/auto-name', { method: 'POST' });
                const data = await res.json();
                
                if (data.status === 'success') {
                    appendLog('info', 'Folder auto-naming process launched in background.');
                    connectSSE();
                } else {
                    appendLog('error', `Failed to start auto-naming: ${data.message}`);
                    manualAutoNameBtn.disabled = false;
                }
            } catch (err) {
                appendLog('error', `Manual Auto-Name HTTP Error: ${err.message}`);
                manualAutoNameBtn.disabled = false;
            }
        });
    }

    // ===== LIBRARY HOME PAGE STATE & CONTROLLERS =====
    window.libraryFolders = [];
    let currentFilter = 'all';
    let currentSort = 'most';
    let currentView = localStorage.getItem('libraryViewPref') || 'grid';

    // Skeleton loader function
    const showLibrarySkeletons = () => {
        libraryGrid.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-card skeleton';
            libraryGrid.appendChild(skeleton);
        }
    };

    const sortLibraryFolders = (folders, criteria) => {
        const sorted = [...folders];
        switch (criteria) {
            case 'a-z':
                sorted.sort((a, b) => {
                    const nameA = (a.name === '_unsorted' ? 'Unsorted' : a.name).toLowerCase();
                    const nameB = (b.name === '_unsorted' ? 'Unsorted' : b.name).toLowerCase();
                    return nameA.localeCompare(nameB);
                });
                break;
            case 'z-a':
                sorted.sort((a, b) => {
                    const nameA = (a.name === '_unsorted' ? 'Unsorted' : a.name).toLowerCase();
                    const nameB = (b.name === '_unsorted' ? 'Unsorted' : b.name).toLowerCase();
                    return nameB.localeCompare(nameA);
                });
                break;
            case 'most':
                sorted.sort((a, b) => b.file_count - a.file_count);
                break;
            case 'least':
                sorted.sort((a, b) => a.file_count - b.file_count);
                break;
            case 'rating':
                sorted.sort((a, b) => (b.avg_rating || 0.0) - (a.avg_rating || 0.0));
                break;
        }
        return sorted;
    };

    const filterLibraryFolders = (folders, filter) => {
        switch (filter) {
            case 'named':
                return folders.filter(f => f.name !== '_unsorted' && !f.name.startsWith('female_'));
            case 'unnamed':
                return folders.filter(f => f.name.startsWith('female_'));
            case 'rated':
                return folders.filter(f => (f.avg_rating || 0.0) > 0);
            default:
                return folders;
        }
    };

    const renderLibraryCards = (folders) => {
        libraryGrid.innerHTML = '';
        
        if (folders.length === 0) {
            libraryGrid.innerHTML = `
                <div class="no-results-placeholder" style="grid-column: 1/-1;">
                    <i class="fa-solid fa-folder-open placeholder-icon"></i>
                    <p>No profiles match the active filter. Try resetting filters.</p>
                </div>
            `;
            return;
        }
        
        // Apply view class
        libraryGrid.className = `library-grid ${currentView === 'list' ? 'list-view' : ''}`;

        folders.forEach((folder, index) => {
            const card = document.createElement('div');
            card.className = 'identity-card';
            card.style.animationDelay = `${index * 0.03}s`;
            
            const isUnsorted = folder.name === '_unsorted';
            const displayName = isUnsorted ? 'Unsorted' : folder.name.replace(/_/g, ' ').trim();
            const imgUrl = `/api/thumbnail/${encodeURIComponent(folder.name)}?t=${Date.now()}`;
            
            // Thumbnail markup
            const thumbHtml = folder.has_thumbnail
                ? `<img class="identity-thumb" src="${imgUrl}" loading="lazy" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${imgUrl}&retry=' + Date.now(); }, 1000); } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }"><div class="no-image-placeholder" style="display:none;"><i class="fa-solid fa-user-astronaut"></i><span>Thumbnail unavailable</span></div>`
                : `<div class="no-image-placeholder">${isUnsorted ? '<i class="fa-solid fa-circle-question" style="color: var(--color-accent);"></i><span>Unknown Profile</span>' : '<i class="fa-solid fa-user-astronaut"></i><span>Thumbnail unavailable</span>'}</div>`;
            
            // Watch progress bar logic
            let progressHtml = '';
            if (folder.watched_count > 0 && folder.file_count > 0) {
                const percent = Math.min(100, Math.round((folder.watched_count / folder.file_count) * 100));
                progressHtml = `
                    <div class="identity-watch-progress" title="${folder.watched_count} of ${folder.file_count} files watched">
                        <div class="identity-watch-bar" style="width: ${percent}%"></div>
                    </div>
                `;
            }
            
            // Rating label
            const ratingText = folder.avg_rating > 0 ? `★ ${folder.avg_rating.toFixed(1)}` : 'Unrated';
            const sizeText = folder.total_size_human || '';
            const metaInfo = sizeText ? `${folder.file_count} files • ${sizeText} • ${ratingText}` : `${folder.file_count} files • ${ratingText}`;

            card.innerHTML = `
                <div class="identity-card-cover">
                    ${thumbHtml}
                    <div class="identity-card-gradient"></div>
                    <div class="identity-card-overlay">
                        <div class="overlay-stats">
                            <span><i class="fa-solid fa-film"></i> ${folder.file_count} files</span>
                            ${folder.avg_rating > 0 ? `<span><i class="fa-solid fa-star"></i> ${folder.avg_rating.toFixed(1)}</span>` : ''}
                        </div>
                        <button class="btn-open-gallery"><i class="fa-solid fa-play"></i> Browse</button>
                    </div>
                    ${progressHtml}
                </div>
                <div class="identity-card-footer">
                    <h4 class="identity-name" title="${displayName}">${displayName}</h4>
                    <span class="identity-meta">${metaInfo}</span>
                </div>
            `;
            
            card.addEventListener('click', () => {
                openGallery(folder.name);
            });
            
            libraryGrid.appendChild(card);
        });
    };

    const applyLibraryView = () => {
        let items = filterLibraryFolders(window.libraryFolders, currentFilter);
        items = sortLibraryFolders(items, currentSort);
        renderLibraryCards(items);
    };

    async function loadLibrary() {
        showLibrarySkeletons();
        try {
            const res = await fetch(`/api/list-folders?t=${Date.now()}`);
            const data = await res.json();
            
            if (!data.folders || data.folders.length === 0) {
                libraryGrid.innerHTML = `
                    <div class="no-results-placeholder" style="grid-column: 1/-1;">
                        <i class="fa-solid fa-folder-open placeholder-icon"></i>
                        <p>No sorted directories found. Start sorting from the Pipeline tab.</p>
                    </div>
                `;
                libraryCountTitle.textContent = 'No library processed yet';
                statFemales.textContent = '-';
                statVideos.textContent = '-';
                statUnsorted.textContent = '-';
                const statsLabel = document.getElementById('library-stats-label');
                if (statsLabel) statsLabel.textContent = '0 profiles';
                return;
            }

            window.libraryFolders = data.folders;
            
            // Compute overall stats
            let totalFiles = 0;
            let unsortedCount = 0;
            const validFolders = window.libraryFolders.filter(f => f.name !== '_unsorted');
            const numClusters = validFolders.length;
            
            const unsortedFolder = window.libraryFolders.find(f => f.name === '_unsorted');
            if (unsortedFolder) {
                unsortedCount = unsortedFolder.file_count;
            }

            window.libraryFolders.forEach(folder => {
                if (folder.name !== '_unsorted') {
                    totalFiles += folder.file_count;
                }
            });

            // Update stats labels
            statFemales.textContent = numClusters;
            statVideos.textContent = totalFiles;
            statUnsorted.textContent = unsortedCount;
            libraryCountTitle.textContent = `${numClusters} Distinct Identities Grouped`;
            
            const statsLabel = document.getElementById('library-stats-label');
            if (statsLabel) {
                statsLabel.textContent = `${window.libraryFolders.length} profiles • ${totalFiles} sorted files`;
            }

            // Apply sort, filter, and render
            applyLibraryView();
            
            // Load recently watched list
            loadRecentlyWatched();
            
        } catch (err) {
            console.error('Failed to load library:', err);
            appendLog('error', `Failed to load library: ${err.message}`);
        }
    };

    // Register Toolbar Event Listeners
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            applyLibraryView();
        });
    }

    const filterPills = document.querySelectorAll('.filter-pill');
    filterPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.getAttribute('data-filter');
            applyLibraryView();
        });
    });

    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewList = document.getElementById('btn-view-list');
    
    if (btnViewGrid && btnViewList) {
        const updateViewButtons = () => {
            if (currentView === 'list') {
                btnViewList.classList.add('active');
                btnViewGrid.classList.remove('active');
            } else {
                btnViewGrid.classList.add('active');
                btnViewList.classList.remove('active');
            }
        };

        btnViewGrid.addEventListener('click', () => {
            currentView = 'grid';
            localStorage.setItem('libraryViewPref', 'grid');
            updateViewButtons();
            applyLibraryView();
        });

        btnViewList.addEventListener('click', () => {
            currentView = 'list';
            localStorage.setItem('libraryViewPref', 'list');
            updateViewButtons();
            applyLibraryView();
        });

        updateViewButtons();
    }

    // Back to library button in gallery hero
    const btnBackLibrary = document.getElementById('btn-back-library');
    if (btnBackLibrary) {
        btnBackLibrary.addEventListener('click', () => {
            window.switchSection('sec-results');
        });
    }

    // Clear recently watched button
    const btnClearRecent = document.getElementById('btn-clear-recent');
    if (btnClearRecent) {
        btnClearRecent.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear your recently played history?')) {
                try {
                    const res = await fetch('/api/recently-watched/clear', { method: 'POST' });
                    const data = await res.json();
                    if (data.status === 'success') {
                        loadRecentlyWatched();
                        showToast('Watch history cleared successfully.');
                    }
                } catch (e) {
                    console.error('Failed to clear watch history', e);
                }
            }
        });
    }

    
    // Check initial status on load to sync UI if server restarted or was running
    const checkInitialStatus = async () => {
        try {
            const res = await fetch(`/api/status?t=${Date.now()}`);
            const data = await res.json();
            
            if (data.running) {
                appendLog('info', 'Reconnected to running pipeline...');
                connectSSE();
            } else {
                loadLibrary();
            }
        } catch (e) {
            console.error('Failed to retrieve initial status', e);
            loadLibrary();
        }
    };
    
    // Trigger initial status check immediately after DOM parsing to render the library
    setTimeout(checkInitialStatus, 100);

    // ===== MERGE FOLDERS FEATURE =====
    const mergeModal = document.getElementById('merge-modal');
    const mergeModalClose = document.getElementById('merge-modal-close');
    const mergeFolderGrid = document.getElementById('merge-folder-grid');
    const mergeSelectedCount = document.getElementById('merge-selected-count');
    const btnExecuteMerge = document.getElementById('btn-execute-merge');
    const btnMergeFolders = document.getElementById('btn-merge-folders');
    const mergeTargetName = document.getElementById('merge-target-name');

    const jsonMergeModal = document.getElementById('json-merge-modal');
    const jsonMergeModalClose = document.getElementById('json-merge-modal-close');
    const btnJsonMergeBack = document.getElementById('btn-json-merge-back');
    const btnJsonMergeExec = document.getElementById('btn-json-merge-exec');
    const jsonMergeInput = document.getElementById('json-merge-input');

    let mergeSelectedFolders = new Set();

    // Open merge modal
    btnMergeFolders.addEventListener('click', async () => {
        mergeSelectedFolders.clear();
        mergeTargetName.value = '';
        updateMergeCount();
        mergeModal.classList.add('active');
        await loadMergeFolders();
    });

    // Close merge modal
    mergeModalClose.addEventListener('click', () => {
        mergeModal.classList.remove('active');
    });
    mergeModal.addEventListener('click', (e) => {
        if (e.target === mergeModal) mergeModal.classList.remove('active');
    });

    // Load folders into the merge grid
    async function loadMergeFolders() {
        mergeFolderGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading folders...</p>';
        try {
            const res = await fetch(`/api/list-folders?t=${Date.now()}`);
            const data = await res.json();
            mergeFolderGrid.innerHTML = '';

            if (!data.folders || data.folders.length === 0) {
                mergeFolderGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No sorted folders found.</p>';
                return;
            }

            data.folders.forEach(folder => {
                const card = document.createElement('div');
                card.className = 'merge-folder-card';
                card.dataset.folderName = folder.name;

                const imgUrl = `/api/thumbnail/${encodeURIComponent(folder.name)}?t=${Date.now()}`;
                const thumbHtml = folder.has_thumbnail
                    ? `<img src="${imgUrl}" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${imgUrl}&retry=' + Date.now(); }, 1000); } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }" alt="${folder.name}"><div class="merge-no-img" style="display:none;"><i class="fa-solid fa-user"></i></div>`
                    : `<div class="merge-no-img"><i class="fa-solid fa-user"></i></div>`;

                card.innerHTML = `
                    <div class="merge-check"><i class="fa-solid fa-check"></i></div>
                    <div class="merge-thumb">${thumbHtml}</div>
                    <div class="merge-card-info">
                        <span class="merge-card-name">${folder.name === '_unsorted' ? 'Unsorted' : folder.name.replace(/_/g, ' ').trim()}</span>
                        <span class="merge-card-count">${folder.file_count} files</span>
                    </div>
                `;

                card.addEventListener('click', () => {
                    if (mergeSelectedFolders.has(folder.name)) {
                        mergeSelectedFolders.delete(folder.name);
                        card.classList.remove('selected');
                    } else {
                        mergeSelectedFolders.add(folder.name);
                        card.classList.add('selected');
                    }
                    updateMergeCount();
                });

                mergeFolderGrid.appendChild(card);
            });
        } catch (err) {
            mergeFolderGrid.innerHTML = `<p style="color: #ff6b6b; grid-column: 1/-1; text-align: center;">Failed to load folders: ${err.message}</p>`;
        }
    }

    function updateMergeCount() {
        const count = mergeSelectedFolders.size;
        mergeSelectedCount.textContent = count;
        btnExecuteMerge.disabled = count < 2;
    }

    // Execute merge
    btnExecuteMerge.addEventListener('click', async () => {
        if (mergeSelectedFolders.size < 2) return;

        const folders = Array.from(mergeSelectedFolders);
        const targetName = mergeTargetName.value.trim() || null;

        if (!confirm(`Merge ${folders.length} folders${targetName ? ' into "' + targetName + '"' : ''}? This will move all files and delete source folders.`)) {
            return;
        }

        btnExecuteMerge.disabled = true;
        btnExecuteMerge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Merging...';

        try {
            const res = await fetch('/api/merge-folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folders, target_name: targetName })
            });
            const data = await res.json();

            if (data.status === 'success') {
                alert(`Merge complete! ${data.files_moved} files moved to "${data.target_folder}". Deleted folders: ${data.merged_folders.join(', ')}`);
                mergeModal.classList.remove('active');
                appendLog('info', `Merged ${data.merged_folders.length} folders into "${data.target_folder}" (${data.files_moved} files moved)`);
                loadLibrary();
            } else {
                alert(`Merge failed: ${data.message}`);
                appendLog('error', `Merge failed: ${data.message}`);
            }
        } catch (err) {
            alert(`Merge error: ${err.message}`);
            appendLog('error', `Merge error: ${err.message}`);
        } finally {
            btnExecuteMerge.disabled = false;
            btnExecuteMerge.innerHTML = '<i class="fa-solid fa-merge"></i> Merge Selected';
        }
    });

    // JSON Merge - open from merge modal footer (use keyboard shortcut or a link)
    // Add a small "or use JSON" link inside merge modal footer
    const mergeFooter = document.querySelector('#merge-modal .modal-footer');
    const jsonLink = document.createElement('a');
    jsonLink.href = '#';
    jsonLink.style.cssText = 'color: var(--text-muted); font-size: 0.8rem; text-decoration: underline; cursor: pointer;';
    jsonLink.textContent = 'or paste JSON';
    jsonLink.addEventListener('click', (e) => {
        e.preventDefault();
        mergeModal.classList.remove('active');
        jsonMergeModal.classList.add('active');
    });
    mergeFooter.insertBefore(jsonLink, mergeFooter.lastElementChild);

    // JSON merge modal controls
    jsonMergeModalClose.addEventListener('click', () => {
        jsonMergeModal.classList.remove('active');
    });
    jsonMergeModal.addEventListener('click', (e) => {
        if (e.target === jsonMergeModal) jsonMergeModal.classList.remove('active');
    });
    btnJsonMergeBack.addEventListener('click', () => {
        jsonMergeModal.classList.remove('active');
        mergeModal.classList.add('active');
    });

    btnJsonMergeExec.addEventListener('click', async () => {
        const raw = jsonMergeInput.value.trim();
        if (!raw) {
            alert('Please paste a JSON array or object.');
            return;
        }

        let payload;
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                payload = { folders: parsed, target_name: null };
            } else if (parsed.folders && Array.isArray(parsed.folders)) {
                payload = { folders: parsed.folders, target_name: parsed.target_name || null };
            } else {
                alert('Invalid JSON format. Use an array of folder names or {folders: [...], target_name: "..."}');
                return;
            }
        } catch (e) {
            alert('Invalid JSON: ' + e.message);
            return;
        }

        if (payload.folders.length < 2) {
            alert('Need at least 2 folder names to merge.');
            return;
        }

        if (!confirm(`Merge ${payload.folders.length} folders${payload.target_name ? ' into "' + payload.target_name + '"' : ''}?`)) {
            return;
        }

        btnJsonMergeExec.disabled = true;
        btnJsonMergeExec.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Merging...';

        try {
            const res = await fetch('/api/merge-folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                alert(`Merge complete! ${data.files_moved} files moved to "${data.target_folder}".`);
                jsonMergeModal.classList.remove('active');
                jsonMergeInput.value = '';
                appendLog('info', `JSON Merge: ${data.merged_folders.length} folders into "${data.target_folder}" (${data.files_moved} files)`);
                loadLibrary();
            } else {
                alert(`Merge failed: ${data.message}`);
            }
        } catch (err) {
            alert(`Merge error: ${err.message}`);
        } finally {
            btnJsonMergeExec.disabled = false;
            btnJsonMergeExec.innerHTML = '<i class="fa-solid fa-play"></i> Execute Merge';
        }
    });

    // ===== DYNAMIC GALLERY & LIGHTBOX CONTROLLERS =====
    const galleryModal = document.getElementById('gallery-modal');
    const galleryModalClose = document.getElementById('gallery-modal-close');
    const galleryTitle = document.getElementById('gallery-title');
    const galleryCountBadge = document.getElementById('gallery-count-badge');
    const galleryMediaGrid = document.getElementById('gallery-media-grid');
    const btnOpenExplorer = document.getElementById('btn-open-explorer');
    const gallerySidebarSearch = document.getElementById('gallery-sidebar-search');
    const gallerySidebarList = document.getElementById('gallery-sidebar-list');
    const btnRenameGalleryFolder = document.getElementById('btn-rename-gallery-folder');
    const btnRenameSave = document.getElementById('btn-rename-save');
    const btnRenameCancel = document.getElementById('btn-rename-cancel');
    const galleryRenameInput = document.getElementById('gallery-rename-input');
    const galleryTitleContainer = document.getElementById('gallery-title-container');
    const galleryRenameContainer = document.getElementById('gallery-rename-container');

    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxClose = document.getElementById('lightbox-close');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxVideo = document.getElementById('lightbox-video');
    let plyrPlayer = null;

    // Playlist & Queue state variables
    let playlistQueue = [];
    let playlistFolder = null;
    let playlistCurrentIndex = -1;
    let playlistIsShuffle = false;
    let playlistLoopMode = 'off'; // 'off' | 'one' | 'all'
    let shuffledIndices = [];

    // Playlist UI elements
    const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
    const lightboxNextBtn = document.getElementById('lightbox-next-btn');
    const tabBtnInfo = document.getElementById('tab-btn-info');
    const tabBtnQueue = document.getElementById('tab-btn-queue');
    const panelContentInfo = document.getElementById('panel-content-info');
    const panelContentQueue = document.getElementById('panel-content-queue');
    const playlistShuffleBtn = document.getElementById('playlist-shuffle-btn');
    const playlistLoopBtn = document.getElementById('playlist-loop-btn');
    const playlistQueueList = document.getElementById('playlist-queue-list');
    const queueCountLabel = document.getElementById('queue-count-label');

    // Clean up any potential legacy inline styles on tab buttons to let CSS classes take over
    if (tabBtnInfo) {
        tabBtnInfo.style.borderBottom = '';
        tabBtnInfo.style.color = '';
    }
    if (tabBtnQueue) {
        tabBtnQueue.style.borderBottom = '';
        tabBtnQueue.style.color = '';
    }

    // Playlist Functions
    const generateShuffledIndices = () => {
        shuffledIndices = Array.from({ length: playlistQueue.length }, (_, i) => i);
        if (playlistIsShuffle && playlistQueue.length > 0) {
            if (playlistCurrentIndex !== -1) {
                // Keep the current playing index at the front and shuffle the rest
                shuffledIndices = shuffledIndices.filter(idx => idx !== playlistCurrentIndex);
                for (let i = shuffledIndices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
                }
                shuffledIndices.unshift(playlistCurrentIndex);
            } else {
                for (let i = shuffledIndices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
                }
            }
        }
    };

    const updateShuffleBtnUI = () => {
        if (!playlistShuffleBtn) return;
        if (playlistIsShuffle) {
            playlistShuffleBtn.classList.add('active');
            playlistShuffleBtn.title = "Shuffle: On";
        } else {
            playlistShuffleBtn.classList.remove('active');
            playlistShuffleBtn.title = "Shuffle: Off";
        }
    };

    const updateLoopBtnUI = () => {
        if (!playlistLoopBtn) return;
        const existingBadge = playlistLoopBtn.querySelector('.loop-badge');
        if (existingBadge) existingBadge.remove();
        
        if (playlistLoopMode === 'off') {
            playlistLoopBtn.classList.remove('active');
            playlistLoopBtn.title = "Loop: Off";
            playlistLoopBtn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
        } else if (playlistLoopMode === 'one') {
            playlistLoopBtn.classList.add('active');
            playlistLoopBtn.title = "Loop: Video";
            playlistLoopBtn.innerHTML = '<i class="fa-solid fa-repeat"></i><span class="loop-badge" style="position: absolute; font-size: 0.55rem; bottom: 2px; right: 4px; font-weight: 800; background: var(--color-primary, #ec4899); color: white; border-radius: 50%; width: 12px; height: 12px; display: flex; align-items: center; justify-content: center; line-height: 1;">1</span>';
        } else if (playlistLoopMode === 'all') {
            playlistLoopBtn.classList.add('active');
            playlistLoopBtn.title = "Loop: Folder";
            playlistLoopBtn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
        }
    };

    const renderQueueUI = () => {
        if (!playlistQueueList) return;
        playlistQueueList.innerHTML = '';
        
        playlistQueue.forEach((file, index) => {
            file.name = file.name || file.filename;
            file.filename = file.filename || file.name;
            const isActive = index === playlistCurrentIndex;
            const thumbUrl = `/api/video-thumbnail/${encodeURIComponent(currentGalleryFolder)}/${encodeURIComponent(file.name)}`;
            
            const card = document.createElement('div');
            card.className = `queue-item-card${isActive ? ' active' : ''}`;
            card.dataset.index = index;
            
            const statusIconHtml = isActive ? `<i class="fa-solid fa-play queue-item-status-icon"></i>` : '';
            
            card.innerHTML = `
                <div class="queue-item-thumb">
                    <img src="${thumbUrl}" onerror="this.style.display='none';" alt="${file.name}">
                </div>
                <div class="queue-item-details">
                    <div class="queue-item-name" title="${file.name}">
                        ${statusIconHtml}${file.name}
                    </div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                const fileUrl = `/media/${encodeURIComponent(currentGalleryFolder)}/${encodeURIComponent(file.name)}`;
                playVideoInLightbox(fileUrl, file.name);
            });
            
            playlistQueueList.appendChild(card);
            
            if (isActive) {
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }
        });
    };

    const playVideoByIndex = (index) => {
        if (index < 0 || index >= playlistQueue.length) return;
        const file = playlistQueue[index];
        const fileUrl = `/media/${encodeURIComponent(currentGalleryFolder)}/${encodeURIComponent(file.name)}`;
        playVideoInLightbox(fileUrl, file.name);
    };

    const skipToNext = () => {
        if (playlistQueue.length === 0) return;
        
        let nextIndex = -1;
        if (playlistIsShuffle) {
            const shuffledPos = shuffledIndices.indexOf(playlistCurrentIndex);
            if (shuffledPos !== -1 && shuffledPos < shuffledIndices.length - 1) {
                nextIndex = shuffledIndices[shuffledPos + 1];
            } else {
                if (playlistLoopMode === 'all') {
                    generateShuffledIndices();
                    nextIndex = shuffledIndices[0];
                }
            }
        } else {
            nextIndex = playlistCurrentIndex + 1;
            if (nextIndex >= playlistQueue.length) {
                if (playlistLoopMode === 'all') {
                    nextIndex = 0;
                } else {
                    nextIndex = -1;
                }
            }
        }
        
        if (nextIndex !== -1) {
            playVideoByIndex(nextIndex);
        }
    };

    const skipToPrev = () => {
        if (playlistQueue.length === 0) return;
        
        let prevIndex = -1;
        if (playlistIsShuffle) {
            const shuffledPos = shuffledIndices.indexOf(playlistCurrentIndex);
            if (shuffledPos > 0) {
                prevIndex = shuffledIndices[shuffledPos - 1];
            } else {
                if (playlistLoopMode === 'all') {
                    prevIndex = shuffledIndices[shuffledIndices.length - 1];
                }
            }
        } else {
            prevIndex = playlistCurrentIndex - 1;
            if (prevIndex < 0) {
                if (playlistLoopMode === 'all') {
                    prevIndex = playlistQueue.length - 1;
                } else {
                    prevIndex = -1;
                }
            }
        }
        
        if (prevIndex !== -1) {
            playVideoByIndex(prevIndex);
        }
    };

    const showToast = (message, isError = false) => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = 'position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        toast.className = 'glass-toast';
        toast.style.cssText = `
            background: ${isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(236, 72, 153, 0.15)'};
            border: 1px solid ${isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(236, 72, 153, 0.4)'};
            backdrop-filter: blur(12px);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 12px;
            font-size: 0.9rem;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                toast.remove();
            }, 350);
        }, 2200);
    };

    const rateCurrentFile = async (rating) => {
        if (!currentLightboxFile) return;
        const relPath = currentGalleryFolder + '/' + currentLightboxFile;
        try {
            const res = await fetch('/api/rate-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: relPath,
                    rating: rating
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                showToast(`Rated ${rating} ★`);
                fetchAndDisplayMetadata(currentLightboxFile);
            } else {
                showToast(`Failed to save rating: ${data.message}`, true);
            }
        } catch (err) {
            console.error('Error saving rating:', err);
            showToast(`Error saving rating: ${err.message}`, true);
        }
    };

    const seekVideo = (seconds) => {
        if (plyrPlayer) {
            plyrPlayer.currentTime = Math.max(0, Math.min(plyrPlayer.duration || 0, plyrPlayer.currentTime + seconds));
        } else if (lightboxVideo) {
            lightboxVideo.currentTime = Math.max(0, Math.min(lightboxVideo.duration || 0, lightboxVideo.currentTime + seconds));
        }
    };

    const toggleFullscreen = () => {
        if (plyrPlayer) {
            plyrPlayer.fullscreen.toggle();
        } else if (lightboxVideo) {
            if (!document.fullscreenElement) {
                lightboxVideo.requestFullscreen().catch(err => console.log(err));
            } else {
                document.exitFullscreen();
            }
        }
    };

    const toggleMute = () => {
        if (plyrPlayer) {
            plyrPlayer.muted = !plyrPlayer.muted;
        } else if (lightboxVideo) {
            lightboxVideo.muted = !lightboxVideo.muted;
        }
    };

    // Playlist UI Listeners
    if (tabBtnInfo && tabBtnQueue) {
        tabBtnInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            tabBtnInfo.classList.add('active');
            tabBtnQueue.classList.remove('active');
            
            if (panelContentInfo) panelContentInfo.classList.add('active');
            if (panelContentQueue) panelContentQueue.classList.remove('active');
        });
        
        tabBtnQueue.addEventListener('click', (e) => {
            e.stopPropagation();
            tabBtnQueue.classList.add('active');
            tabBtnInfo.classList.remove('active');
            
            if (panelContentQueue) panelContentQueue.classList.add('active');
            if (panelContentInfo) panelContentInfo.classList.remove('active');
            renderQueueUI();
        });
    }

    if (playlistShuffleBtn) {
        playlistShuffleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playlistIsShuffle = !playlistIsShuffle;
            updateShuffleBtnUI();
            generateShuffledIndices();
            if (panelContentQueue && panelContentQueue.classList.contains('active')) {
                renderQueueUI();
            }
        });
    }

    if (playlistLoopBtn) {
        playlistLoopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (playlistLoopMode === 'off') {
                playlistLoopMode = 'one';
            } else if (playlistLoopMode === 'one') {
                playlistLoopMode = 'all';
            } else {
                playlistLoopMode = 'off';
            }
            updateLoopBtnUI();
        });
    }

    if (lightboxPrevBtn) {
        lightboxPrevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            skipToPrev();
        });
    }

    if (lightboxNextBtn) {
        lightboxNextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            skipToNext();
        });
    }

    // Initialize UI states
    updateShuffleBtnUI();
    updateLoopBtnUI();



    if (typeof Plyr !== 'undefined') {
        plyrPlayer = new Plyr('#lightbox-video', {
            controls: [
                'play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration',
                'mute', 'volume', 'settings', 'pip', 'fullscreen'
            ],
            seekTime: 5,
            settings: ['speed', 'loop']
        });
    }

    let currentVideoPath = null;
    let currentLightboxFile = null;
    let lastSavedTime = 0;

    const handleVideoEnded = () => {
        saveWatchProgress(true);
        if (playlistQueue.length > 0) {
            skipToNext();
        }
    };

    const saveWatchProgress = async (force = false) => {
        if (!currentVideoPath) return;
        
        let position = 0;
        let duration = 0;
        
        if (plyrPlayer) {
            position = plyrPlayer.currentTime;
            duration = plyrPlayer.duration;
        } else if (lightboxVideo) {
            position = lightboxVideo.currentTime;
            duration = lightboxVideo.duration;
        }
        
        const now = Date.now();
        if (!force && now - lastSavedTime < 4000) {
            return;
        }
        
        if (duration > 0) {
            lastSavedTime = now;
            try {
                await fetch('/api/watch-progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_path: currentVideoPath,
                        position: position,
                        duration: duration
                    })
                });
            } catch (err) {
                console.error('Failed to save watch progress:', err);
            }
        }
    };

    if (typeof Plyr !== 'undefined' && plyrPlayer) {
        plyrPlayer.on('timeupdate', () => {
            saveWatchProgress(false);
        });
        
        plyrPlayer.on('pause', () => {
            saveWatchProgress(true);
        });
        
        plyrPlayer.on('ended', () => {
            handleVideoEnded();
        });
    }

    if (lightboxVideo) {
        lightboxVideo.addEventListener('timeupdate', () => {
            if (!plyrPlayer) saveWatchProgress(false);
        });
        lightboxVideo.addEventListener('pause', () => {
            if (!plyrPlayer) saveWatchProgress(true);
        });
        lightboxVideo.addEventListener('ended', () => {
            if (!plyrPlayer) handleVideoEnded();
        });
    }

    let metadataPanelOpen = localStorage.getItem('metadataPanelOpen') === 'true';

    const updateMetadataPanelUI = () => {
        const panel = document.getElementById('lightbox-metadata-panel');
        const container = document.querySelector('.lightbox-container');
        const toggleBtn = document.getElementById('lightbox-info-toggle');
        const modal = document.getElementById('lightbox-modal');
        
        if (panel) {
            if (metadataPanelOpen) {
                panel.classList.add('active');
                if (container) container.classList.add('panel-open');
                if (modal) modal.classList.add('panel-open');
                if (toggleBtn) toggleBtn.style.color = 'var(--color-primary, #ec4899)';
            } else {
                panel.classList.remove('active');
                if (container) container.classList.remove('panel-open');
                if (modal) modal.classList.remove('panel-open');
                if (toggleBtn) toggleBtn.style.color = 'white';
            }
        }
    };

    const getStarsHtml = (rating) => {
        if (!rating) return '<span style="color: var(--text-muted, #9ca3af);">Unrated</span>';
        let html = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                html += '<i class="fa-solid fa-star" style="color: #fbbf24; font-size: 0.85rem;"></i>';
            } else {
                html += '<i class="fa-regular fa-star" style="color: rgba(255,255,255,0.15); font-size: 0.85rem;"></i>';
            }
        }
        return html;
    };

    const fetchAndDisplayMetadata = async (filename) => {
        const els = {
            filename: document.getElementById('meta-val-filename'),
            size: document.getElementById('meta-val-size'),
            resolution: document.getElementById('meta-val-resolution'),
            duration: document.getElementById('meta-val-duration'),
            codec: document.getElementById('meta-val-codec'),
            fps: document.getElementById('meta-val-fps'),
            bitrate: document.getElementById('meta-val-bitrate'),
            folder: document.getElementById('meta-val-folder-name'),
            faces: document.getElementById('meta-val-faces-count'),
            genders: document.getElementById('meta-val-genders'),
            modified: document.getElementById('meta-val-modified'),
            rating: document.getElementById('meta-val-rating')
        };
        
        if (els.filename) els.filename.textContent = filename;
        if (els.size) els.size.textContent = 'Loading...';
        if (els.resolution) els.resolution.textContent = 'Loading...';
        if (els.duration) els.duration.textContent = 'Loading...';
        if (els.codec) els.codec.textContent = 'Loading...';
        if (els.fps) els.fps.textContent = 'Loading...';
        if (els.bitrate) els.bitrate.textContent = 'Loading...';
        if (els.folder) els.folder.textContent = currentGalleryFolder || '-';
        if (els.faces) els.faces.textContent = 'Loading...';
        if (els.genders) els.genders.textContent = 'Loading...';
        if (els.modified) els.modified.textContent = 'Loading...';
        if (els.rating) els.rating.innerHTML = 'Loading...';
        
        try {
            const folder = encodeURIComponent(currentGalleryFolder);
            const file = encodeURIComponent(filename);
            const res = await fetch(`/api/file-info/${folder}/${file}`);
            const data = await res.json();
            
            if (data.status === 'success' && data.metadata) {
                const meta = data.metadata;
                if (els.size) els.size.textContent = meta.file_size || '-';
                if (els.resolution) els.resolution.textContent = meta.resolution || '-';
                if (els.duration) els.duration.textContent = meta.duration || 'N/A';
                if (els.codec) els.codec.textContent = meta.codec || '-';
                if (els.fps) els.fps.textContent = meta.fps || 'N/A';
                if (els.bitrate) els.bitrate.textContent = meta.bitrate || 'N/A';
                if (els.faces) els.faces.textContent = meta.face_count !== undefined ? meta.face_count : '-';
                if (els.genders) els.genders.textContent = meta.gender_breakdown || 'None';
                if (els.modified) els.modified.textContent = meta.date_modified || '-';
                if (els.rating) els.rating.innerHTML = getStarsHtml(meta.rating);
            }
        } catch (err) {
            console.error('Error fetching metadata:', err);
        }
    };

    let currentGalleryFolder = null;
    let selectedFilenames = new Set();
    let lastSelectedIndex = -1;

    const gallerySelectionBanner = document.getElementById('gallery-selection-banner');
    const selectionCount = document.getElementById('selection-count');
    const btnSelectAll = document.getElementById('btn-select-all');
    const btnClearSelection = document.getElementById('btn-clear-selection');

    const updateSelectionBanner = () => {
        if (!gallerySelectionBanner || !selectionCount) return;
        const count = selectedFilenames.size;
        if (count > 0) {
            selectionCount.textContent = `${count} items selected`;
            gallerySelectionBanner.style.display = 'flex';
        } else {
            gallerySelectionBanner.style.display = 'none';
        }
    };

    const clearAllSelections = () => {
        selectedFilenames.clear();
        lastSelectedIndex = -1;
        const items = galleryMediaGrid.querySelectorAll('.gallery-item');
        items.forEach(item => {
            item.classList.remove('selected');
            const checkbox = item.querySelector('.gallery-item-checkbox');
            if (checkbox) checkbox.checked = false;
        });
        updateSelectionBanner();
    };

    const selectAllItems = () => {
        const items = galleryMediaGrid.querySelectorAll('.gallery-item');
        items.forEach(item => {
            const checkbox = item.querySelector('.gallery-item-checkbox');
            if (checkbox) {
                const filename = checkbox.dataset.filename;
                selectedFilenames.add(filename);
                checkbox.checked = true;
                item.classList.add('selected');
            }
        });
        updateSelectionBanner();
    };

    const toggleItemSelection = (item) => {
        const checkbox = item.querySelector('.gallery-item-checkbox');
        if (!checkbox) return;
        const filename = checkbox.dataset.filename;
        if (selectedFilenames.has(filename)) {
            selectedFilenames.delete(filename);
            checkbox.checked = false;
            item.classList.remove('selected');
        } else {
            selectedFilenames.add(filename);
            checkbox.checked = true;
            item.classList.add('selected');
        }
        updateSelectionBanner();
        
        // Update last selected index
        const items = Array.from(galleryMediaGrid.querySelectorAll('.gallery-item'));
        lastSelectedIndex = items.indexOf(item);
    };

    const selectRange = (endItem) => {
        const items = Array.from(galleryMediaGrid.querySelectorAll('.gallery-item'));
        if (lastSelectedIndex === -1) {
            // No previous selection, just toggle current
            toggleItemSelection(endItem);
            return;
        }
        
        const endIndex = items.indexOf(endItem);
        const start = Math.min(lastSelectedIndex, endIndex);
        const end = Math.max(lastSelectedIndex, endIndex);
        
        // Check if starting item is currently selected, range matches its state
        const startItem = items[lastSelectedIndex];
        const isStartSelected = startItem ? startItem.classList.contains('selected') : true;
        
        for (let i = start; i <= end; i++) {
            const currentItem = items[i];
            const checkbox = currentItem.querySelector('.gallery-item-checkbox');
            if (checkbox) {
                const filename = checkbox.dataset.filename;
                if (isStartSelected) {
                    selectedFilenames.add(filename);
                    checkbox.checked = true;
                    currentItem.classList.add('selected');
                } else {
                    selectedFilenames.delete(filename);
                    checkbox.checked = false;
                    currentItem.classList.remove('selected');
                }
            }
        }
        updateSelectionBanner();
    };

    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', selectAllItems);
    }
    if (btnClearSelection) {
        btnClearSelection.addEventListener('click', clearAllSelections);
    }

    // Filter folders in sidebar
    const filterSidebarFolders = () => {
        if (!gallerySidebarSearch || !gallerySidebarList) return;
        const query = gallerySidebarSearch.value.toLowerCase().trim();
        const items = gallerySidebarList.querySelectorAll('.sidebar-folder-item');
        items.forEach(item => {
            const folderName = item.dataset.folder.replace(/_/g, ' ').trim().toLowerCase();
            if (folderName.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    };

    if (gallerySidebarSearch) {
        gallerySidebarSearch.addEventListener('input', filterSidebarFolders);
    }

    const loadSidebarFolders = async () => {
        if (!gallerySidebarList) return;
        try {
            const res = await fetch(`/api/list-folders?t=${Date.now()}`);
            const data = await res.json();
            
            gallerySidebarList.innerHTML = '';
            
            const targetFolders = data.folders.filter(f => f.name !== '_unsorted');
            
            if (targetFolders.length === 0) {
                gallerySidebarList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem 0; font-size: 0.85rem;">No target folders found</p>';
                return;
            }

            targetFolders.forEach(folder => {
                const isCurrent = folder.name === currentGalleryFolder;
                const item = document.createElement('div');
                item.className = `sidebar-folder-item${isCurrent ? ' current-folder' : ''}`;
                item.dataset.folder = folder.name;
                
                const isUnsorted = folder.name === '_unsorted';
                const displayName = folder.name === '_unsorted' ? 'Unsorted' : folder.name.replace(/_/g, ' ').trim();
                const fallbackIcon = isUnsorted ? 'fa-circle-question' : 'fa-user';
                
                const imgUrl = `/api/thumbnail/${encodeURIComponent(folder.name)}?t=${Date.now()}`;
                let thumbHtml = '';
                if (folder.has_thumbnail) {
                    thumbHtml = `<img src="${imgUrl}" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="">`;
                }
                
                const placeholderHtml = `
                    <div class="sidebar-folder-avatar-placeholder" style="width:38px; height:38px; border-radius:50%; display:${folder.has_thumbnail ? 'none' : 'flex'}; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); flex-shrink:0;">
                        <i class="fa-solid ${fallbackIcon}" style="font-size:0.9rem;"></i>
                    </div>
                `;

                item.innerHTML = `
                    ${thumbHtml}
                    ${placeholderHtml}
                    <div class="folder-info">
                        <span class="folder-name">${displayName}</span>
                        <span class="folder-count">${folder.file_count} media items</span>
                    </div>
                `;

                if (!isCurrent) {
                    item.addEventListener('click', () => {
                        openGallery(folder.name);
                    });

                    item.addEventListener('dragenter', (e) => {
                        e.preventDefault();
                        item.classList.add('drag-over');
                    });

                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        item.classList.add('drag-over');
                    });

                    item.addEventListener('dragleave', () => {
                        item.classList.remove('drag-over');
                    });

                    item.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        item.classList.remove('drag-over');
                        
                        try {
                            const dragDataRaw = e.dataTransfer.getData('text/plain');
                            if (!dragDataRaw) return;
                            
                            const dragData = JSON.parse(dragDataRaw);
                            
                            let filesToMove = [];
                            if (dragData.files) {
                                filesToMove = dragData.files;
                            } else {
                                const filenames = dragData.filenames || (dragData.filename ? [dragData.filename] : []);
                                filesToMove = filenames.map(name => ({ name: name, folder: currentGalleryFolder }));
                            }
                            
                            if (filesToMove.length === 0) return;

                            // Group by source folder
                            const groups = {};
                            filesToMove.forEach(f => {
                                if (!groups[f.folder]) {
                                    groups[f.folder] = [];
                                }
                                groups[f.folder].push(f.name);
                            });

                            let overallSuccess = true;
                            let totalMoved = 0;
                            let errorMsg = '';

                            for (const [fromFolder, filenames] of Object.entries(groups)) {
                                const moveRes = await fetch('/api/move-media', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        from_folder: fromFolder,
                                        to_folder: folder.name,
                                        filenames: filenames
                                    })
                                });
                                const moveData = await moveRes.json();
                                if (moveData.status === 'success') {
                                    totalMoved += filenames.length;
                                } else {
                                    overallSuccess = false;
                                    errorMsg = moveData.message;
                                }
                            }

                            if (totalMoved > 0) {
                                const targetDisplayName = folder.name === '_unsorted' ? 'Unsorted' : folder.name.replace(/_/g, ' ').trim();
                                appendLog('info', `Successfully moved ${totalMoved} file(s) to ${targetDisplayName}`);
                                
                                // Reset selection
                                clearAllSelections();
                                
                                // Refresh current gallery
                                await openGallery(currentGalleryFolder, true);
                                // Refresh library page details & counts
                                await loadLibrary();
                                
                                // If profiles tab is active, refresh profiles list
                                const secProfiles = document.getElementById('sec-profiles');
                                if (secProfiles && secProfiles.classList.contains('active')) {
                                    loadProfiles();
                                }
                            }
                            
                            if (!overallSuccess) {
                                alert(`Some moves failed: ${errorMsg}`);
                            }
                        } catch (err) {
                            console.error('Error handling dropped media:', err);
                            alert(`Error: ${err.message}`);
                        }
                    });
                }

                gallerySidebarList.appendChild(item);
            });

            filterSidebarFolders();
        } catch (err) {
            console.error('Failed to load sidebar folders:', err);
        }
    };

    const openGallery = async (folderName, isRefresh = false) => {
        currentGalleryFolder = folderName;
        selectedFilenames.clear();
        lastSelectedIndex = -1;
        updateSelectionBanner();
        
        galleryTitle.textContent = folderName === '_unsorted' ? 'Unsorted' : folderName.replace(/_/g, ' ').trim();
        galleryMediaGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading folder contents...</p>';
        galleryCountBadge.textContent = '0 items';
        
        // Reset rename view to normal
        if (!isRefresh) {
            if (galleryRenameContainer && galleryTitleContainer) {
                galleryRenameContainer.style.display = 'none';
                galleryTitleContainer.style.display = 'flex';
            }
            if (btnRenameGalleryFolder) {
                btnRenameGalleryFolder.style.display = folderName === '_unsorted' ? 'none' : 'flex';
            }
            
            if (gallerySidebarSearch) {
                gallerySidebarSearch.value = '';
            }
        }
        
        if (!isRefresh) {
            window.switchSection('sec-gallery');
        } else if (galleryModal) {
            galleryModal.classList.add('active');
        }

        // Set hero avatar thumbnail
        const heroAvatar = document.getElementById('gallery-hero-face');
        if (heroAvatar) {
            heroAvatar.src = `/api/thumbnail/${encodeURIComponent(folderName)}?t=${Date.now()}`;
        }

        // Load target folders in sidebar
        await loadSidebarFolders();

        try {
            const res = await fetch(`/api/profile/${encodeURIComponent(folderName)}/media`);
            const data = await res.json();
            
            // Normalize filenames for profile media API responses
            if (data.files) {
                data.files.forEach(f => {
                    if (!f.name && f.filename) {
                        f.name = f.filename;
                    }
                });
            }
            
            // Filter video files to populate playlistQueue
            playlistQueue = (data.files || []).filter(f => f.is_video);
            playlistFolder = folderName;
            if (queueCountLabel) {
                queueCountLabel.textContent = playlistQueue.length;
            }
            
            galleryMediaGrid.innerHTML = '';
            
            if (!data.files || data.files.length === 0) {
                galleryMediaGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No media files inside this folder.</p>';
                galleryCountBadge.textContent = '0 items';
                const subtitleEl = document.getElementById('gallery-info-subtitle');
                if (subtitleEl) subtitleEl.textContent = '0 items';
                return;
            }

            galleryCountBadge.textContent = `${data.files.length} items`;
            
            // Dynamic subtitle stats calculation
            const folderInfo = (window.libraryFolders || []).find(f => f.name === folderName);
            const sizeStr = folderInfo ? folderInfo.total_size_human : '';
            const ratingVal = folderInfo ? folderInfo.avg_rating : 0;
            const ratingStr = ratingVal > 0 ? `★ ${ratingVal.toFixed(1)}` : '';
            
            const subtitleParts = [];
            if (playlistQueue.length > 0) subtitleParts.push(`${playlistQueue.length} videos`);
            const imgCount = data.files.length - playlistQueue.length;
            if (imgCount > 0) subtitleParts.push(`${imgCount} images`);
            if (sizeStr) subtitleParts.push(sizeStr);
            if (ratingStr) subtitleParts.push(ratingStr);
            
            const subtitleEl = document.getElementById('gallery-info-subtitle');
            if (subtitleEl) {
                subtitleEl.textContent = subtitleParts.join(' • ');
            }

            data.files.forEach(file => {
                const actualFolder = file.folder_name || folderName;
                const isSelected = selectedFilenames.has(file.name);
                const item = document.createElement('div');
                item.className = `gallery-item${isSelected ? ' selected' : ''}`;
                item.setAttribute('draggable', 'true');
                
                item.dataset.folder = actualFolder;
                item.dataset.filename = file.name;
                item.dataset.isVideo = file.is_video ? "true" : "false";
                const isNative = file.ext === '.mp4' || file.ext === '.webm';
                item.dataset.isNative = isNative ? "true" : "false";
                
                attachHoverPreview(item);

                const fileUrl = `/media/${encodeURIComponent(actualFolder)}/${encodeURIComponent(file.name)}`;
                
                // Drag and drop event listeners on gallery items
                item.addEventListener('dragstart', (e) => {
                    item.classList.add('dragging');
                    
                    let dragFiles = [];
                    if (selectedFilenames.has(file.name)) {
                        const checkedItems = galleryMediaGrid.querySelectorAll('.gallery-item-checkbox:checked');
                        checkedItems.forEach(cb => {
                            const parentItem = cb.closest('.gallery-item');
                            const fFolder = parentItem ? parentItem.dataset.folder : folderName;
                            dragFiles.push({ name: cb.dataset.filename, folder: fFolder });
                        });
                        
                        // Add dragging class to all selected cards
                        galleryMediaGrid.querySelectorAll('.gallery-item.selected').forEach(el => {
                            el.classList.add('dragging');
                        });
                    } else {
                        dragFiles = [{ name: file.name, folder: actualFolder }];
                    }
                    
                    e.dataTransfer.setData('text/plain', JSON.stringify({ files: dragFiles }));
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    galleryMediaGrid.querySelectorAll('.gallery-item').forEach(el => {
                        el.classList.remove('dragging');
                    });
                });
                
                if (file.is_video) {
                    const videoThumbUrl = `/api/video-thumbnail/${encodeURIComponent(actualFolder)}/${encodeURIComponent(file.name)}?t=${Date.now()}`;
                    
                    // Check user preference from DOM
                    const defaultPlayer = document.getElementById('default_video_player')?.value || 'browser';
                    const useVLC = !isNative || defaultPlayer === 'vlc';
                    const metaLabel = useVLC ? 'Play Natively (VLC)' : 'Play in App';
                    const btnLabel = useVLC ? 'Play in VLC' : 'Play in Browser';
                    const btnIcon = useVLC ? 'fa-laptop' : 'fa-circle-play';
                    const btnClass = useVLC ? 'play-native-btn' : 'play-browser-btn';
                    
                    const progress = file.watch_progress || { playback_position: 0, duration: 0, is_completed: false, progress_percent: 0 };
                    let badgeHtml = '';
                    let progressHtml = '';
                    
                    if (progress.is_completed) {
                        badgeHtml = `<span class="watch-badge watched" title="Watched"><i class="fa-solid fa-circle-check"></i> Watched</span>`;
                    } else if (progress.progress_percent > 0) {
                        badgeHtml = `<span class="watch-badge watching" title="Resume play"><i class="fa-solid fa-spinner"></i> ${progress.progress_percent}%</span>`;
                        progressHtml = `
                            <div class="gallery-item-progress-container" style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: rgba(0,0,0,0.4); z-index: 5;">
                                <div class="gallery-item-progress-bar" style="width: ${progress.progress_percent}%; height: 100%; background: var(--color-primary, #ec4899);"></div>
                            </div>
                        `;
                    } else {
                        badgeHtml = `<span class="watch-badge unwatched"><i class="fa-solid fa-circle-play"></i> Unwatched</span>`;
                    }
 
                    item.innerHTML = `
                        <input type="checkbox" class="gallery-item-checkbox" data-filename="${file.name}" ${isSelected ? 'checked' : ''}>
                        <button class="item-info-btn" data-filename="${file.name}" title="View Info"><i class="fa-solid fa-circle-info"></i></button>
                        ${badgeHtml}
                        <img src="${videoThumbUrl}" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${videoThumbUrl}&retry=' + Date.now(); }, 1500); } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }" alt="${file.name}">
                        <div class="video-placeholder" style="display:none; width:100%; height:100%;">
                            <i class="fa-solid fa-circle-play"></i>
                            <span>${file.name}</span>
                        </div>
                        <div class="gallery-item-hover-overlay">
                            <button class="hover-btn play-video-btn ${btnClass}"><i class="fa-solid ${btnIcon}"></i> ${btnLabel}</button>
                        </div>
                        <div class="item-meta">${metaLabel}</div>
                        ${progressHtml}
                    `;
                    
                    const playBtn = item.querySelector('.play-video-btn');
                    const handlePlay = (e) => {
                        if (e) e.stopPropagation();
                        if (useVLC) {
                            playFileNatively(actualFolder, file.name);
                        } else {
                            playVideoInLightbox(fileUrl, file.name);
                        }
                    };
                    
                    if (playBtn) {
                        playBtn.addEventListener('click', handlePlay);
                    }
                    
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.gallery-item-checkbox') || e.target.closest('.item-info-btn')) {
                            e.stopPropagation();
                            return;
                        }
                        if (e.ctrlKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleItemSelection(item);
                        } else if (e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            selectRange(item);
                        } else {
                            handlePlay(e);
                        }
                    });
                } else {
                    item.innerHTML = `
                        <input type="checkbox" class="gallery-item-checkbox" data-filename="${file.name}" ${isSelected ? 'checked' : ''}>
                        <button class="item-info-btn" data-filename="${file.name}" title="View Info"><i class="fa-solid fa-circle-info"></i></button>
                        <img src="${fileUrl}" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${fileUrl}&retry=' + Date.now(); }, 1000); }" alt="${file.name}">
                        <div class="gallery-item-hover-overlay">
                            <button class="hover-btn view-img-btn"><i class="fa-solid fa-eye"></i> View Image</button>
                        </div>
                        <div class="item-meta">${file.name}</div>
                    `;
                    
                    const viewBtn = item.querySelector('.view-img-btn');
                    if (viewBtn) {
                        viewBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            showImageInLightbox(fileUrl, file.name);
                        });
                    }
                    
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.gallery-item-checkbox') || e.target.closest('.item-info-btn')) {
                            e.stopPropagation();
                            return;
                        }
                        if (e.ctrlKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleItemSelection(item);
                        } else if (e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            selectRange(item);
                        } else {
                            showImageInLightbox(fileUrl, file.name);
                        }
                    });
                }
                
                // Info button click listener
                const infoBtn = item.querySelector('.item-info-btn');
                if (infoBtn) {
                    infoBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        metadataPanelOpen = true;
                        localStorage.setItem('metadataPanelOpen', 'true');
                        updateMetadataPanelUI();
                        if (file.is_video) {
                            const isNative = file.ext === '.mp4' || file.ext === '.webm';
                            const defaultPlayer = document.getElementById('default_video_player')?.value || 'browser';
                            if (!isNative || defaultPlayer === 'vlc') {
                                playFileNatively(actualFolder, file.name);
                            } else {
                                playVideoInLightbox(fileUrl, file.name);
                            }
                        } else {
                            showImageInLightbox(fileUrl, file.name);
                        }
                    });
                }
                
                // Checkbox change listener
                const checkbox = item.querySelector('.gallery-item-checkbox');
                if (checkbox) {
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const isChecked = checkbox.checked;
                        if (isChecked) {
                            selectedFilenames.add(file.name);
                            item.classList.add('selected');
                        } else {
                            selectedFilenames.delete(file.name);
                            item.classList.remove('selected');
                        }
                        updateSelectionBanner();
                        
                        // Update lastSelectedIndex
                        const items = Array.from(galleryMediaGrid.querySelectorAll('.gallery-item'));
                        lastSelectedIndex = items.indexOf(item);
                    });
                }
                
                galleryMediaGrid.appendChild(item);
            });
            
        } catch (err) {
            console.error('Failed to load gallery files:', err);
            galleryMediaGrid.innerHTML = `<p style="color: #ff6b6b; grid-column: 1/-1; text-align: center;">Error loading gallery: ${err.message}</p>`;
        }
    };

    const showImageInLightbox = (imgUrl, filename) => {
        currentLightboxFile = filename;
        const plyrContainer = document.querySelector('.plyr');
        if (plyrContainer) {
            plyrContainer.style.display = 'none';
        }
        lightboxVideo.style.display = 'none';
        if (plyrPlayer) {
            plyrPlayer.pause();
        } else {
            lightboxVideo.pause();
        }
        lightboxVideo.src = '';
        
        lightboxImg.src = imgUrl;
        lightboxImg.style.display = 'block';
        lightboxModal.classList.add('active');
        
        // Hide playlist controls/chevrons and queue tab for static images
        if (lightboxPrevBtn) lightboxPrevBtn.style.display = 'none';
        if (lightboxNextBtn) lightboxNextBtn.style.display = 'none';
        if (tabBtnQueue) tabBtnQueue.style.display = 'none';
        // Auto-switch to Info tab if Queue tab was active
        if (tabBtnInfo) tabBtnInfo.click();
        
        if (filename) {
            fetchAndDisplayMetadata(filename);
        }
    };

    const playVideoInLightbox = async (videoUrl, filename) => {
        currentLightboxFile = filename;
        lightboxImg.style.display = 'none';
        lightboxImg.src = '';
        
        const plyrContainer = document.querySelector('.plyr');
        if (plyrContainer) {
            plyrContainer.style.display = 'block';
        } else {
            lightboxVideo.style.display = 'block';
        }
        
        lightboxModal.classList.add('active');
        
        currentVideoPath = currentGalleryFolder + '/' + filename;
        let resumeTime = 0;
        
        // Fetch folder media list in the background if playlist is not for the current folder or is empty or doesn't have filename
        if (playlistFolder !== currentGalleryFolder || !playlistQueue || playlistQueue.length === 0 || !playlistQueue.some(f => (f.name || f.filename) === filename)) {
            try {
                const folder = encodeURIComponent(currentGalleryFolder);
                const res = await fetch(`/api/list-media/${folder}`);
                const data = await res.json();
                playlistQueue = (data.files || []).filter(f => f.is_video);
                playlistQueue.forEach(f => {
                    f.name = f.name || f.filename;
                    f.filename = f.filename || f.name;
                });
                playlistFolder = currentGalleryFolder;
                if (queueCountLabel) {
                    queueCountLabel.textContent = playlistQueue.length;
                }
            } catch (err) {
                console.error('Error fetching playlist queue in background:', err);
            }
        }
        
        // Update index
        playlistCurrentIndex = playlistQueue.findIndex(f => f.name === filename);
        
        // Ensure shuffled indices are generated if shuffle is enabled
        generateShuffledIndices();
        
        // Update chevrons visibility
        if (playlistQueue.length > 1) {
            if (lightboxPrevBtn) lightboxPrevBtn.style.display = 'flex';
            if (lightboxNextBtn) lightboxNextBtn.style.display = 'flex';
        } else {
            if (lightboxPrevBtn) lightboxPrevBtn.style.display = 'none';
            if (lightboxNextBtn) lightboxNextBtn.style.display = 'none';
        }
        
        if (tabBtnQueue) {
            tabBtnQueue.style.display = 'flex';
        }
        
        // Update the queue list UI if it's currently visible
        if (panelContentQueue && panelContentQueue.classList.contains('active')) {
            renderQueueUI();
        }
        
        try {
            const folder = encodeURIComponent(currentGalleryFolder);
            const file = encodeURIComponent(filename);
            const progressRes = await fetch(`/api/watch-progress/${folder}/${file}`);
            const progressData = await progressRes.json();
            if (progressData.status === 'success' && !progressData.is_completed) {
                resumeTime = progressData.playback_position || 0;
            }
        } catch (err) {
            console.error('Error fetching resume position:', err);
        }
        
        if (plyrPlayer) {
            plyrPlayer.source = {
                type: 'video',
                sources: [
                    {
                        src: videoUrl,
                        type: 'video/mp4'
                    }
                ]
            };
            
            if (resumeTime > 0) {
                plyrPlayer.once('ready', () => {
                    plyrPlayer.currentTime = resumeTime;
                });
            }
            
            plyrPlayer.play().catch(e => console.log('Video play failed:', e));
        } else {
            lightboxVideo.src = videoUrl;
            if (resumeTime > 0) {
                lightboxVideo.currentTime = resumeTime;
            }
            lightboxVideo.play().catch(e => console.log('Video play failed:', e));
        }
        
        if (filename) {
            fetchAndDisplayMetadata(filename);
        }
    };

    const playFileNatively = async (folderName, filename) => {
        try {
            appendLog('info', `Requesting native OS playback for: ${filename}...`);
            
            const path = folderName + '/' + filename;
            fetch('/api/watch-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: path,
                    position: 1.0,
                    duration: 1.0
                })
            }).catch(e => console.error('Error saving progress for native play:', e));

            const res = await fetch('/api/play-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_name: folderName, filename })
            });
            const data = await res.json();
            if (data.status === 'success') {
                appendLog('info', `Successfully launched native player for ${filename}`);
                setTimeout(() => { openGallery(currentGalleryFolder, true); }, 1000);
            } else {
                alert(`Failed to play natively: ${data.message}`);
            }
        } catch (e) {
            alert(`Error opening file: ${e.message}`);
        }
    };

    const stopLightboxMedia = () => {
        if (currentVideoPath) {
            saveWatchProgress(true);
            currentVideoPath = null;
        }
        currentLightboxFile = null;
        if (plyrPlayer) {
            plyrPlayer.pause();
        } else {
            lightboxVideo.pause();
        }
        
        if (currentGalleryFolder) {
            openGallery(currentGalleryFolder, true);
        }
        
        loadRecentlyWatched();
    };

    lightboxClose.addEventListener('click', () => {
        lightboxModal.classList.remove('active');
        stopLightboxMedia();
    });

    const lightboxInfoToggle = document.getElementById('lightbox-info-toggle');
    const metadataPanelClose = document.getElementById('metadata-panel-close');
    
    if (lightboxInfoToggle) {
        lightboxInfoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            metadataPanelOpen = !metadataPanelOpen;
            localStorage.setItem('metadataPanelOpen', metadataPanelOpen);
            updateMetadataPanelUI();
        });
    }
    
    if (metadataPanelClose) {
        metadataPanelClose.addEventListener('click', (e) => {
            e.stopPropagation();
            metadataPanelOpen = false;
            localStorage.setItem('metadataPanelOpen', 'false');
            updateMetadataPanelUI();
        });
    }

    updateMetadataPanelUI();

    btnOpenExplorer.addEventListener('click', async () => {
        if (!currentGalleryFolder) return;
        try {
            const res = await fetch(`/api/open-folder/${encodeURIComponent(currentGalleryFolder)}`, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                appendLog('info', `Opened output folder "${currentGalleryFolder}" in Windows File Explorer.`);
            } else {
                alert(`Failed to open folder: ${data.message}`);
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    });

    // Close Modals events
    if (galleryModalClose && galleryModal) {
        galleryModalClose.addEventListener('click', () => {
            galleryModal.classList.remove('active');
        });
    }
    if (galleryModal) {
        galleryModal.addEventListener('click', (e) => {
            if (e.target === galleryModal) galleryModal.classList.remove('active');
        });
    }

    // Automatically manage body scroll lock when modals are opened/closed
    const modalObserver = new MutationObserver(() => {
        const anyModalActive = document.querySelector('.modal-overlay.active') !== null;
        if (anyModalActive) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    });
    // Observe class attribute changes on all modal-overlay elements
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    // ===== GALLERY FOLDER RENAMING CONTROLLERS =====
    if (btnRenameGalleryFolder) {
        btnRenameGalleryFolder.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!currentGalleryFolder || currentGalleryFolder === '_unsorted') return;
            
            // Show edit input, populate it with current folder name (nicely cleaned)
            galleryTitleContainer.style.display = 'none';
            galleryRenameContainer.style.display = 'flex';
            galleryRenameInput.value = currentGalleryFolder.replace(/_/g, ' ').trim();
            galleryRenameInput.focus();
            galleryRenameInput.select();
        });
    }

    const cancelRename = () => {
        galleryRenameContainer.style.display = 'none';
        galleryTitleContainer.style.display = 'flex';
    };

    if (btnRenameCancel) {
        btnRenameCancel.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelRename();
        });
    }

    const executeRename = async () => {
        if (!currentGalleryFolder || currentGalleryFolder === '_unsorted') return;
        const newNameClean = galleryRenameInput.value.trim();
        
        if (!newNameClean) {
            alert('Folder name cannot be empty.');
            return;
        }
        
        const formattedNewName = newNameClean.replace(/\s+/g, ' ');
        const formattedOldName = currentGalleryFolder.replace(/_/g, ' ').trim();
        
        if (formattedNewName === formattedOldName) {
            cancelRename();
            return;
        }

        btnRenameSave.disabled = true;
        galleryRenameInput.disabled = true;
        
        try {
            const res = await fetch('/api/rename-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    old_name: currentGalleryFolder,
                    new_name: formattedNewName
                })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                appendLog('info', `Renamed identity folder: "${formattedOldName}" -> "${formattedNewName}"`);
                
                // Update current gallery folder reference
                currentGalleryFolder = formattedNewName;
                
                // Refresh title
                galleryTitle.textContent = formattedNewName;
                
                // Close edit mode
                cancelRename();
                
                // Reload main library lists & numbers
                await loadLibrary();
                
                // Reload sidebar folders list
                await loadSidebarFolders();
            } else {
                alert(`Failed to rename folder: ${data.message}`);
            }
        } catch (err) {
            alert(`Rename error: ${err.message}`);
        } finally {
            btnRenameSave.disabled = false;
            galleryRenameInput.disabled = false;
        }
    };

    if (btnRenameSave) {
        btnRenameSave.addEventListener('click', (e) => {
            e.stopPropagation();
            executeRename();
        });
    }

    async function loadRecentlyWatched() {
        const container = document.getElementById('recently-watched-card');
        const list = document.getElementById('recently-watched-list');
        if (!container || !list) return;
        
        try {
            const res = await fetch(`/api/recently-watched?t=${Date.now()}`);
            const data = await res.json();
            
            if (data.status === 'success' && data.items && data.items.length > 0) {
                list.innerHTML = '';
                
                data.items.forEach(item => {
                    item.filename = item.filename || item.name;
                    item.name = item.name || item.filename;
                    const card = document.createElement('div');
                    card.className = 'recent-video-card';
                    
                    card.dataset.folder = item.folder_name;
                    card.dataset.filename = item.filename;
                    card.dataset.isVideo = "true";
                    const isNative = item.ext === '.mp4' || item.ext === '.webm';
                    card.dataset.isNative = isNative ? "true" : "false";
                    
                    attachHoverPreview(card);

                    card.style.flex = '0 0 200px';
                    card.style.position = 'relative';
                    card.style.borderRadius = '12px';
                    card.style.overflow = 'hidden';
                    card.style.background = 'rgba(255,255,255,0.03)';
                    card.style.border = '1px solid rgba(255,255,255,0.08)';
                    card.style.cursor = 'pointer';
                    card.style.transition = 'all 0.2s';
                    
                    const videoThumbUrl = `/api/video-thumbnail/${encodeURIComponent(item.folder_name)}/${encodeURIComponent(item.filename)}`;
                    
                    let badgeHtml = '';
                    if (item.is_completed) {
                        badgeHtml = `<span class="watch-badge watched" style="bottom: auto; top: 10px; left: 10px; font-size: 0.6rem; padding: 0.15rem 0.35rem;"><i class="fa-solid fa-circle-check"></i> Watched</span>`;
                    } else if (item.progress_percent > 0) {
                        badgeHtml = `<span class="watch-badge watching" style="bottom: auto; top: 10px; left: 10px; font-size: 0.6rem; padding: 0.15rem 0.35rem;"><i class="fa-solid fa-spinner"></i> ${item.progress_percent}%</span>`;
                    }
                    
                    card.innerHTML = `
                        <div style="position: relative; aspect-ratio: 16/9; overflow: hidden; background: rgba(0,0,0,0.2);">
                            ${badgeHtml}
                            <img src="${videoThumbUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/video.svg';">
                            <div class="play-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;">
                                <i class="fa-solid fa-play" style="color: white; font-size: 1.5rem;"></i>
                            </div>
                            <div class="progress-bar-container" style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: rgba(255,255,255,0.2);">
                                <div class="progress-bar-fill" style="width: ${item.progress_percent}%; height: 100%; background: var(--color-primary, #ec4899);"></div>
                            </div>
                        </div>
                        <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0;">
                            <span style="font-size: 0.8rem; font-weight: 500; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.filename}">${item.filename}</span>
                            <span style="font-size: 0.65rem; color: var(--text-muted);"><i class="fa-solid fa-folder" style="color: #fbbf24; margin-right: 0.2rem;"></i> ${item.folder_name}</span>
                        </div>
                    `;
                    
                    const playOverlay = card.querySelector('.play-overlay');
                    card.addEventListener('mouseenter', () => {
                        card.style.transform = 'translateY(-2px)';
                        card.style.borderColor = 'var(--color-primary, #ec4899)';
                        if (playOverlay) playOverlay.style.opacity = '1';
                    });
                    card.addEventListener('mouseleave', () => {
                        card.style.transform = 'translateY(0)';
                        card.style.borderColor = 'rgba(255,255,255,0.08)';
                        if (playOverlay) playOverlay.style.opacity = '0';
                    });
                    
                    card.addEventListener('click', async () => {
                        currentGalleryFolder = item.folder_name;
                        const fileUrl = `/media/${encodeURIComponent(item.folder_name)}/${encodeURIComponent(item.filename)}`;
                        openGallery(item.folder_name);
                        playVideoInLightbox(fileUrl, item.filename);
                    });
                    
                    list.appendChild(card);
                });
                
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
                list.innerHTML = '';
            }
        } catch (err) {
            console.error('Failed to load recently watched videos:', err);
            container.style.display = 'none';
        }
    };

    const btnClearHistory = document.getElementById('btn-clear-history');
    if (btnClearHistory) {
        btnClearHistory.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm("Are you sure you want to clear your watch history?")) {
                try {
                    const res = await fetch('/api/recently-watched/clear', { method: 'POST' });
                    const data = await res.json();
                    if (data.status === 'success') {
                        appendLog('info', 'Watch history cleared.');
                        loadRecentlyWatched();
                        if (currentGalleryFolder) {
                            openGallery(currentGalleryFolder, true);
                        }
                    }
                } catch (err) {
                    console.error('Failed to clear watch history:', err);
                }
            }
        });
    }
    if (galleryRenameInput) {
        galleryRenameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelRename();
            }
        });
    }

    // ===== GLOBAL MEDIA SEARCH CONTROLLER =====
    const globalSearchTrigger = document.getElementById('header-search-trigger');
    const globalSearchModal = document.getElementById('global-search-modal');
    const globalSearchClose = document.getElementById('global-search-close');
    const modalSearchInput = document.getElementById('modal-search-input');
    const searchSpinner = document.getElementById('search-spinner');
    const searchInitialPlaceholder = document.getElementById('search-initial-placeholder');
    const searchNoResults = document.getElementById('search-no-results');
    const searchQueryHighlight = document.getElementById('search-query-highlight');
    const searchResultsGrid = document.getElementById('search-results-grid');
    const searchModalBox = document.getElementById('search-modal-box');
    const searchDropOverlay = document.getElementById('search-drop-overlay');
    const btnImageSearch = document.getElementById('btn-image-search');
    const imageSearchUpload = document.getElementById('image-search-upload');

    const openSearchModal = () => {
        if (!globalSearchModal) return;
        globalSearchModal.classList.add('active');
        if (modalSearchInput) {
            modalSearchInput.value = '';
            setTimeout(() => { modalSearchInput.focus(); }, 100);
        }
        resetSearchResults();
    };

    const closeSearchModal = () => {
        if (!globalSearchModal) return;
        globalSearchModal.classList.remove('active');
        if (modalSearchInput) modalSearchInput.blur();
    };

    const resetSearchResults = () => {
        if (searchInitialPlaceholder) searchInitialPlaceholder.style.display = 'flex';
        if (searchNoResults) searchNoResults.style.display = 'none';
        if (searchResultsGrid) {
            searchResultsGrid.style.display = 'none';
            searchResultsGrid.innerHTML = '';
        }
        if (searchSpinner) searchSpinner.style.display = 'none';
        if (imageSearchUpload) imageSearchUpload.value = '';
    };

    if (globalSearchTrigger) {
        globalSearchTrigger.style.cursor = 'pointer';
        globalSearchTrigger.addEventListener('click', openSearchModal);
    }

    if (globalSearchClose) {
        globalSearchClose.addEventListener('click', closeSearchModal);
    }

    if (globalSearchModal) {
        globalSearchModal.addEventListener('click', (e) => {
            if (e.target === globalSearchModal) closeSearchModal();
        });
    }

    // Keyboard Shortcuts (Ctrl+K or / to open, Escape to close, arrows in lightbox)
    document.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isTyping = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.isContentEditable
        );

        if (lightboxModal && lightboxModal.classList.contains('active')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                lightboxClose.click();
            } else if (e.key === ' ' && !isTyping) {
                e.preventDefault();
                if (plyrPlayer) {
                    if (plyrPlayer.paused) plyrPlayer.play().catch(err => console.log(err));
                    else plyrPlayer.pause();
                } else if (lightboxVideo) {
                    if (lightboxVideo.paused) lightboxVideo.play().catch(err => console.log(err));
                    else lightboxVideo.pause();
                }
            } else if (e.key === 'ArrowLeft' && !isTyping) {
                e.preventDefault();
                seekVideo(-5);
            } else if (e.key === 'ArrowRight' && !isTyping) {
                e.preventDefault();
                seekVideo(5);
            } else if (e.key.toLowerCase() === 'j' && !isTyping) {
                e.preventDefault();
                seekVideo(-10);
            } else if (e.key.toLowerCase() === 'l' && !isTyping) {
                e.preventDefault();
                seekVideo(10);
            } else if (e.key.toLowerCase() === 'f' && !isTyping) {
                e.preventDefault();
                toggleFullscreen();
            } else if (e.key.toLowerCase() === 'm' && !isTyping) {
                e.preventDefault();
                toggleMute();
            } else if (e.key.toLowerCase() === 'n' && !isTyping) {
                e.preventDefault();
                skipToNext();
            } else if (e.key.toLowerCase() === 'p' && !isTyping) {
                e.preventDefault();
                skipToPrev();
            } else if (['1', '2', '3', '4', '5'].includes(e.key) && !isTyping) {
                e.preventDefault();
                rateCurrentFile(parseInt(e.key));
            }
            return;
        }

        if ((e.key === '/' && !isTyping) || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
            e.preventDefault();
            openSearchModal();
        } else if (e.key === 'Escape') {
            if (globalSearchModal && globalSearchModal.classList.contains('active')) {
                e.preventDefault();
                closeSearchModal();
            }
        }
    });

    let searchDebounceTimeout = null;

    const performSearch = async () => {
        if (!modalSearchInput) return;
        const query = modalSearchInput.value.strip ? modalSearchInput.value.strip() : modalSearchInput.value.trim();
        if (!query) {
            resetSearchResults();
            return;
        }

        if (searchSpinner) searchSpinner.style.display = 'inline-block';
        if (searchInitialPlaceholder) searchInitialPlaceholder.style.display = 'none';
        if (searchNoResults) searchNoResults.style.display = 'none';

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (searchSpinner) searchSpinner.style.display = 'none';

            if (data.status === 'success' && data.results && data.results.length > 0) {
                renderSearchResults(data.results);
            } else {
                if (searchQueryHighlight) searchQueryHighlight.textContent = query;
                if (searchNoResults) searchNoResults.style.display = 'flex';
                if (searchResultsGrid) {
                    searchResultsGrid.style.display = 'none';
                    searchResultsGrid.innerHTML = '';
                }
            }
        } catch (err) {
            console.error('Global search error:', err);
            if (searchSpinner) searchSpinner.style.display = 'none';
            if (searchQueryHighlight) searchQueryHighlight.textContent = `Error: ${err.message}`;
            if (searchNoResults) searchNoResults.style.display = 'flex';
        }
    };

    if (modalSearchInput) {
        modalSearchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimeout);
            searchDebounceTimeout = setTimeout(performSearch, 300);
        });
    }

    const handleImageFile = async (file) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please select or drop an image file.');
            return;
        }

        if (modalSearchInput) {
            modalSearchInput.value = `Image: ${file.name}`;
        }

        if (searchSpinner) searchSpinner.style.display = 'inline-block';
        if (searchInitialPlaceholder) searchInitialPlaceholder.style.display = 'none';
        if (searchNoResults) searchNoResults.style.display = 'none';
        if (searchResultsGrid) {
            searchResultsGrid.style.display = 'none';
            searchResultsGrid.innerHTML = '';
        }

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/api/search-by-image', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (searchSpinner) searchSpinner.style.display = 'none';

            if (data.status === 'success') {
                if (data.results && data.results.length > 0) {
                    renderSearchResults(data.results);
                } else {
                    if (searchQueryHighlight) {
                        let msg = `Image: ${file.name}`;
                        if (data.matches && data.matches.length > 0) {
                            const topMatch = data.matches[0];
                            msg += ` (Best match: ${topMatch.display_folder_name} - ${Math.round(topMatch.similarity_score * 100)}% match, but folder empty)`;
                        } else {
                            msg += ` (No matching model profiles found in database)`;
                        }
                        searchQueryHighlight.textContent = msg;
                    }
                    if (searchNoResults) searchNoResults.style.display = 'flex';
                }
            } else {
                if (searchQueryHighlight) searchQueryHighlight.textContent = data.message || 'Error processing image search';
                if (searchNoResults) searchNoResults.style.display = 'flex';
            }
        } catch (err) {
            console.error('Image search error:', err);
            if (searchSpinner) searchSpinner.style.display = 'none';
            if (searchQueryHighlight) searchQueryHighlight.textContent = `Error: ${err.message}`;
            if (searchNoResults) searchNoResults.style.display = 'flex';
        }
    };

    if (btnImageSearch && imageSearchUpload) {
        btnImageSearch.addEventListener('click', (e) => {
            e.preventDefault();
            imageSearchUpload.click();
        });

        imageSearchUpload.addEventListener('change', () => {
            if (imageSearchUpload.files && imageSearchUpload.files.length > 0) {
                handleImageFile(imageSearchUpload.files[0]);
            }
        });
    }

    if (searchModalBox && searchDropOverlay) {
        let dragCounter = 0;

        searchModalBox.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (e.dataTransfer.types.includes('Files')) {
                dragCounter++;
                searchDropOverlay.style.display = 'flex';
            }
        });

        searchModalBox.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        searchModalBox.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                searchDropOverlay.style.display = 'none';
            }
        });

        searchModalBox.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            searchDropOverlay.style.display = 'none';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleImageFile(e.dataTransfer.files[0]);
            }
        });
    }

    const renderSearchResults = (results) => {
        if (!searchResultsGrid) return;
        searchResultsGrid.innerHTML = '';
        searchResultsGrid.style.display = 'grid';

        const defaultPlayer = document.getElementById('default_video_player')?.value || 'browser';

        results.forEach(file => {
            file.filename = file.filename || file.name;
            file.name = file.name || file.filename;
            const card = document.createElement('div');
            card.className = 'search-result-card';
            
            card.dataset.folder = file.folder_name;
            card.dataset.filename = file.filename;
            card.dataset.isVideo = file.is_video ? "true" : "false";
            const isNative = file.ext === '.mp4' || file.ext === '.webm';
            card.dataset.isNative = isNative ? "true" : "false";
            
            attachHoverPreview(card);

            const fileUrl = `/media/${encodeURIComponent(file.folder_name)}/${encodeURIComponent(file.filename)}`;
            const useVLC = file.is_video && (!isNative || defaultPlayer === 'vlc');

            let thumbHtml = '';
            if (file.is_video) {
                const videoThumbUrl = `/api/video-thumbnail/${encodeURIComponent(file.folder_name)}/${encodeURIComponent(file.filename)}?t=${Date.now()}`;
                thumbHtml = `
                    <img src="${videoThumbUrl}" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${videoThumbUrl}&retry=' + Date.now(); }, 1500); } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }" alt="${file.filename}">
                    <div class="video-placeholder" style="display:none; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5);"><i class="fa-solid fa-circle-play" style="font-size: 2.2rem; color: rgba(255,255,255,0.7);"></i></div>
                    <div class="video-play-indicator"><i class="fa-solid ${useVLC ? 'fa-laptop' : 'fa-circle-play'}"></i></div>
                `;
            } else {
                thumbHtml = `<img src="${fileUrl}" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${fileUrl}&retry=' + Date.now(); }, 1000); }" alt="${file.filename}">`;
            }

            let progressHtml = '';
            const progress = file.watch_progress || { playback_position: 0, duration: 0, is_completed: false, progress_percent: 0 };
            
            if (file.is_video) {
                if (progress.is_completed) {
                    progressHtml = `<span class="watch-badge watched" style="position: absolute; top: 8px; left: 8px; z-index: 5;" title="Watched"><i class="fa-solid fa-circle-check"></i> Watched</span>`;
                } else if (progress.progress_percent > 0) {
                    progressHtml = `
                        <span class="watch-badge watching" style="position: absolute; top: 8px; left: 8px; z-index: 5;" title="In Progress"><i class="fa-solid fa-spinner"></i> ${progress.progress_percent}%</span>
                        <div class="gallery-item-progress-container" style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: rgba(0,0,0,0.4); z-index: 5;">
                            <div class="gallery-item-progress-bar" style="width: ${progress.progress_percent}%; height: 100%; background: var(--color-primary, #ec4899);"></div>
                        </div>
                    `;
                }
            }

            card.innerHTML = `
                <div class="thumbnail-container">
                    ${thumbHtml}
                    ${progressHtml}
                </div>
                <div class="card-details">
                    <span class="filename-label" title="${file.filename}">${file.filename}</span>
                    <button class="search-card-folder-badge" data-folder="${file.folder_name}" title="Open Folder">
                        <i class="fa-solid fa-folder"></i> ${file.display_folder_name}
                    </button>
                </div>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.search-card-folder-badge')) {
                    e.stopPropagation();
                    return;
                }
                
                closeSearchModal();
                currentGalleryFolder = file.folder_name;
                if (file.is_video) {
                    if (useVLC) {
                        playFileNatively(file.folder_name, file.filename);
                    } else {
                        playVideoInLightbox(fileUrl, file.filename);
                    }
                } else {
                    showImageInLightbox(fileUrl, file.filename);
                }
            });

            const folderBadge = card.querySelector('.search-card-folder-badge');
            if (folderBadge) {
                folderBadge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeSearchModal();
                    
                    const resultsTab = document.getElementById('btn-nav-results');
                    if (resultsTab) {
                        resultsTab.click();
                    }
                    
                    setTimeout(() => {
                        openGallery(file.folder_name);
                    }, 150);
                });
            }

            searchResultsGrid.appendChild(card);
        });
    };

    // ===== FACE PROFILE MANAGER =====
    let allProfiles = [];
    let isIndexingPolling = false;
    let indexerPollInterval = null;

    const profilesGrid = document.getElementById('profiles-grid');
    const profilesCountTitle = document.getElementById('profiles-count-title');
    const profilesSearchInput = document.getElementById('profiles-search-input');
    const btnIndexLibrary = document.getElementById('btn-index-library');
    const indexerProgressPanel = document.getElementById('indexer-progress-panel');
    const indexerProgressBar = document.getElementById('indexer-progress-bar');
    const indexerPercent = document.getElementById('indexer-percent');
    const indexerStatusText = document.getElementById('indexer-status-text');

    window.loadProfiles = async () => {
        try {
            profilesCountTitle.textContent = "Loading profiles...";
            const res = await fetch(`/api/profiles?t=${Date.now()}`);
            const data = await res.json();
            
            if (data.status === 'success') {
                allProfiles = data.profiles || [];
                renderProfilesList(allProfiles);
                
                // Also check if indexer is running in background
                checkIndexerStatus();
            } else {
                profilesGrid.innerHTML = `<p style="color: #ff6b6b; text-align: center; grid-column: 1/-1;">Failed to load profiles: ${data.message}</p>`;
            }
        } catch (err) {
            console.error("Error loading profiles:", err);
            profilesGrid.innerHTML = `<p style="color: #ff6b6b; text-align: center; grid-column: 1/-1;">Error: ${err.message}</p>`;
        }
    };

    const renderProfilesList = (profiles) => {
        profilesGrid.innerHTML = '';
        const query = profilesSearchInput.value.toLowerCase().trim();
        
        const filtered = profiles.filter(p => 
            p.folder_name.toLowerCase().includes(query) || 
            p.display_name.toLowerCase().includes(query)
        );
        
        profilesCountTitle.textContent = `${profiles.length} detected identities`;
        
        if (filtered.length === 0) {
            profilesGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                    <i class="fa-solid fa-users-slash" style="font-size: 2.5rem; margin-bottom: 1rem; display: block; opacity: 0.3;"></i>
                    <p>No matching profiles found.</p>
                </div>
            `;
            return;
        }
        
        filtered.forEach(p => {
            const card = document.createElement('div');
            card.className = 'dashboard-card glass profile-card';
            card.setAttribute('draggable', 'true');
            card.dataset.folder = p.folder_name;
            
            const avatarUrl = p.avatar_url ? `${p.avatar_url}?t=${Date.now()}` : 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/user-astronaut.svg';
            const genderIcon = p.gender === 'male' ? '<i class="fa-solid fa-mars" style="color: #3b82f6;" title="Male"></i>' : '<i class="fa-solid fa-venus" style="color: #ec4899;" title="Female"></i>';
            
            card.innerHTML = `
                <button class="avatar-refresh-btn" title="Auto-extract best avatar" style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255,255,255,0.05); border: none; color: var(--text-muted); padding: 0.35rem; border-radius: 50%; cursor: pointer; transition: background 0.2s, color 0.2s; display: flex; align-items: center; justify-content: center; z-index: 5;">
                    <i class="fa-solid fa-arrows-rotate" style="font-size: 0.75rem;"></i>
                </button>
                <div class="avatar-container" style="position: relative; margin-bottom: 0.75rem; border-radius: 50%; padding: 3px; background: linear-gradient(135deg, var(--color-primary) 0%, #a855f7 100%); width: 86px; height: 86px;">
                    <img class="profile-avatar-img" src="${avatarUrl}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; display: block; background: rgba(0,0,0,0.3);" onerror="this.src='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/user-astronaut.svg';">
                </div>
                <div style="font-weight: 600; text-align: center; margin-bottom: 0.25rem; font-size: 0.9rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main);">
                    ${p.display_name}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.75rem; color: var(--text-muted);">
                    ${genderIcon}
                    <span>${p.media_count} files</span>
                </div>
            `;
            
            // Navigate to gallery on click
            card.addEventListener('click', (e) => {
                if (e.target.closest('.avatar-refresh-btn')) {
                    e.stopPropagation();
                    return;
                }
                openGallery(p.folder_name);
            });
            
            // Refresh avatar action
            const refreshBtn = card.querySelector('.avatar-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    refreshBtn.querySelector('i').classList.add('fa-spin');
                    try {
                        const response = await fetch('/api/profile/extract-avatar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ folder_name: p.folder_name })
                        });
                        const resData = await response.json();
                        if (resData.status === 'success') {
                            appendLog('info', `Successfully extracted best avatar for ${p.display_name}`);
                            const img = card.querySelector('.profile-avatar-img');
                            if (img) img.src = `/api/thumbnail/${encodeURIComponent(p.folder_name)}?t=${Date.now()}`;
                        } else {
                            alert(`Failed to extract avatar: ${resData.message}`);
                        }
                    } catch (err) {
                        console.error(err);
                        alert(`Error: ${err.message}`);
                    } finally {
                        refreshBtn.querySelector('i').classList.remove('fa-spin');
                    }
                });
            }
            
            // Drag and Drop support on Profile Cards (for Reassignment AND Merging!)
            card.addEventListener('dragstart', (e) => {
                card.classList.add('dragging');
                e.dataTransfer.setData('text/plain', JSON.stringify({ profile_folder: p.folder_name }));
                e.dataTransfer.effectAllowed = 'copyMove';
            });
            
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                profilesGrid.querySelectorAll('.profile-card').forEach(el => el.classList.remove('dragging'));
            });
            
            card.addEventListener('dragenter', (e) => {
                e.preventDefault();
                card.classList.add('drag-over');
            });
            
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.classList.add('drag-over');
            });
            
            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });
            
            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                
                try {
                    const dragDataRaw = e.dataTransfer.getData('text/plain');
                    if (!dragDataRaw) return;
                    
                    const dragData = JSON.parse(dragDataRaw);
                    
                    // Case A: Dragging files from gallery (Reassignment)
                    if (dragData.files || dragData.filenames) {
                        let filesToMove = [];
                        if (dragData.files) {
                            filesToMove = dragData.files;
                        } else {
                            const filenames = dragData.filenames || (dragData.filename ? [dragData.filename] : []);
                            filesToMove = filenames.map(name => ({ name: name, folder: currentGalleryFolder }));
                        }
                        
                        if (filesToMove.length === 0) return;
                        
                        // Group by source folder
                        const groups = {};
                        filesToMove.forEach(f => {
                            if (!groups[f.folder]) {
                                groups[f.folder] = [];
                            }
                            groups[f.folder].push(f.name);
                        });
                        
                        let totalMoved = 0;
                        let errorMsg = '';
                        
                        for (const [fromFolder, filenames] of Object.entries(groups)) {
                            if (fromFolder === p.folder_name) continue;
                            
                            const moveRes = await fetch('/api/move-media', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    from_folder: fromFolder,
                                    to_folder: p.folder_name,
                                    filenames: filenames
                                })
                            });
                            const moveData = await moveRes.json();
                            if (moveData.status === 'success') {
                                totalMoved += filenames.length;
                            } else {
                                errorMsg = moveData.message;
                            }
                        }
                        
                        if (totalMoved > 0) {
                            appendLog('info', `Successfully re-assigned ${totalMoved} file(s) to profile ${p.display_name}`);
                            loadProfiles();
                            clearAllSelections();
                        }
                        if (errorMsg) {
                            alert(`Error: ${errorMsg}`);
                        }
                    }
                    // Case B: Dragging a Profile Card onto another Profile Card (Merging!)
                    else if (dragData.profile_folder) {
                        const sourceFolder = dragData.profile_folder;
                        const targetFolder = p.folder_name;
                        
                        if (sourceFolder === targetFolder) return;
                        
                        const sourceProfile = allProfiles.find(prof => prof.folder_name === sourceFolder);
                        const sourceName = sourceProfile ? sourceProfile.display_name : sourceFolder;
                        const targetName = p.display_name;
                        
                        const confirmMerge = confirm(`Are you sure you want to merge "${sourceName}" into "${targetName}"?\n\nThis will physically move all files from "${sourceName}" into "${targetName}", combine their face embeddings, and delete "${sourceName}". This cannot be undone.`);
                        
                        if (confirmMerge) {
                            appendLog('info', `Merging profile "${sourceName}" into "${targetName}"...`);
                            
                            const mergeRes = await fetch('/api/profiles/merge', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    source_folder: sourceFolder,
                                    target_folder: targetFolder
                                })
                            });
                            const mergeData = await mergeRes.json();
                            
                            if (mergeData.status === 'success') {
                                appendLog('info', `Successfully merged "${sourceName}" into "${targetName}". Moved ${mergeData.files_moved} file(s).`);
                                loadProfiles();
                            } else {
                                alert(`Failed to merge profiles: ${mergeData.message}`);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Drop error on profile card:", err);
                    alert(`Error handling drop: ${err.message}`);
                }
            });
            
            profilesGrid.appendChild(card);
        });
    };

    // Filter profiles on search input
    if (profilesSearchInput) {
        profilesSearchInput.addEventListener('input', () => {
            renderProfilesList(allProfiles);
        });
    }

    // Index Library faces in background
    if (btnIndexLibrary) {
        btnIndexLibrary.addEventListener('click', async () => {
            const confirmIndex = confirm("Do you want to index all faces in the output folders?\n\nThis will scan all folders recursively, extract face embeddings for any new files, and cache them in the database. This allows complete cross-profile search and auto-avatar extraction. It will run in the background.");
            if (!confirmIndex) return;
            
            try {
                const res = await fetch('/api/profiles/index', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    appendLog('info', 'Library indexing started in the background.');
                    startIndexerPolling();
                } else {
                    alert(`Failed to start indexing: ${data.message}`);
                }
            } catch (err) {
                console.error(err);
                alert(`Error: ${err.message}`);
            }
        });
    }

    const startIndexerPolling = () => {
        if (isIndexingPolling) return;
        isIndexingPolling = true;
        
        indexerProgressPanel.style.display = 'block';
        
        indexerPollInterval = setInterval(async () => {
            try {
                const res = await fetch('/api/profiles/index/status');
                const data = await res.json();
                
                if (data.status === 'success') {
                    const state = data.state;
                    if (state.running) {
                        indexerProgressBar.style.width = `${state.percent}%`;
                        indexerPercent.textContent = `${state.percent.toFixed(1)}%`;
                        indexerStatusText.textContent = `Processing file [${state.processed_files}/${state.total_files}]: ${state.current_file}`;
                    } else {
                        // Stopped/Complete
                        clearInterval(indexerPollInterval);
                        isIndexingPolling = false;
                        indexerProgressPanel.style.display = 'none';
                        appendLog('info', 'Library indexing complete.');
                        loadProfiles();
                    }
                }
            } catch (err) {
                console.error("Indexer polling error:", err);
            }
        }, 1000);
    };

    const checkIndexerStatus = async () => {
        try {
            const res = await fetch(`/api/profiles/index/status?t=${Date.now()}`);
            const data = await res.json();
            if (data.status === 'success' && data.state.running) {
                startIndexerPolling();
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Trigger indexer status check and watch history loading immediately after DOM parsing
    setTimeout(checkIndexerStatus, 100);
    setTimeout(loadRecentlyWatched, 100);

    // ===== DUPLICATE FINDER CONTROLLER =====
    const btnScanDuplicates = document.getElementById('btn-scan-duplicates');
    const btnResolveAllDuplicates = document.getElementById('btn-resolve-all-duplicates');
    const duplicatesProgressContainer = document.getElementById('duplicates-progress-container');
    const duplicatesProgressFile = document.getElementById('duplicates-progress-file');
    const duplicatesProgressPercent = document.getElementById('duplicates-progress-percent');
    const duplicatesProgressBar = document.getElementById('duplicates-progress-bar');
    const duplicatesStatsContainer = document.getElementById('duplicates-stats-container');
    const duplicatesStatsText = document.getElementById('duplicates-stats-text');
    const duplicatesList = document.getElementById('duplicates-list');

    let duplicatesScanInterval = null;

    const renderDuplicatesList = (groups) => {
        duplicatesList.innerHTML = '';
        
        if (!groups || groups.length === 0) {
            duplicatesList.innerHTML = `
                <div class="no-duplicates-placeholder">
                    <i class="fa-solid fa-circle-check placeholder-icon" style="color: var(--color-success);"></i>
                    <p>Clean Library! No duplicate or near-duplicate files detected.</p>
                </div>
            `;
            if (btnResolveAllDuplicates) btnResolveAllDuplicates.style.display = 'none';
            if (duplicatesStatsContainer) {
                duplicatesStatsContainer.style.display = 'block';
                duplicatesStatsText.textContent = '0 duplicate groups found.';
            }
            return;
        }

        if (duplicatesStatsContainer) {
            duplicatesStatsContainer.style.display = 'block';
            duplicatesStatsText.textContent = `${groups.length} duplicate groups found.`;
        }
        if (btnResolveAllDuplicates) btnResolveAllDuplicates.style.display = 'inline-flex';

        groups.forEach((group, groupIdx) => {
            const groupCard = document.createElement('div');
            groupCard.className = 'duplicate-group-card';
            groupCard.dataset.groupIdx = groupIdx;

            const isVideo = group.file_type === 'video';
            const groupHeaderHtml = `
                <div class="duplicate-group-header">
                    <div class="duplicate-group-title">
                        <i class="${isVideo ? 'fa-solid fa-video' : 'fa-solid fa-image'}"></i>
                        <span>Set ${groupIdx + 1}: ${isVideo ? 'Video' : 'Photo'} Duplicates (${group.files.length} files)</span>
                    </div>
                    <button class="btn btn-secondary btn-resolve-group" style="padding: 0.4rem 1rem; font-size: 0.8rem;" data-group-idx="${groupIdx}">
                        <i class="fa-solid fa-trash-can"></i> Resolve Set
                    </button>
                </div>
            `;

            let filesHtml = '';
            group.files.forEach((file, fileIdx) => {
                const isBest = file.is_best;
                const sizeHuman = file.size > 1024*1024*1024 
                    ? (file.size / (1024*1024*1024)).toFixed(2) + ' GB'
                    : (file.size / (1024*1024)).toFixed(2) + ' MB';

                let mediaElementHtml = '';
                const fileUrl = `/media/${encodeURIComponent(file.rel_path)}`;
                if (isVideo) {
                    const thumbUrl = `/api/video-thumbnail/${encodeURIComponent(file.folder)}/${encodeURIComponent(file.name)}?t=${Date.now()}`;
                    mediaElementHtml = `
                        <div class="duplicate-media-wrapper thumbnail-container" 
                             data-folder="${file.folder}" 
                             data-filename="${file.name}" 
                             data-is-video="true" 
                             data-is-native="true">
                            <img src="${thumbUrl}" alt="Video thumbnail" loading="lazy">
                            <div class="duplicate-video-overlay"><i class="fa-solid fa-play"></i></div>
                        </div>
                    `;
                } else {
                    mediaElementHtml = `
                        <div class="duplicate-media-wrapper">
                            <img src="${fileUrl}" alt="Duplicate image" loading="lazy">
                        </div>
                    `;
                }

                const resolution = file.width && file.height ? `${file.width}x${file.height}` : 'Unknown';
                const durationHtml = isVideo && file.duration
                    ? `<tr><td class="label">Duration</td><td class="value">${formatDuration(file.duration)}</td></tr>`
                    : '';

                const displayName = file.name.replace(/_/g, ' ').trim();

                filesHtml += `
                    <div class="duplicate-file-card ${isBest ? 'to-keep' : 'to-delete'}" data-file-idx="${fileIdx}" data-path="${file.path}">
                        <span class="quality-badge ${isBest ? 'best' : 'copy'}">${isBest ? 'Keep (Best)' : 'Duplicate'}</span>
                        ${mediaElementHtml}
                        <div class="duplicate-file-details">
                            <h4 style="font-size: 0.9rem; font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.2rem;" title="${file.name}">${displayName}</h4>
                            <div class="duplicate-file-meta" style="margin-bottom: 0.4rem;">Folder: ${file.folder}</div>
                            <table class="duplicate-comparison-table">
                                <tr>
                                    <td class="label">Resolution</td>
                                    <td class="value">${resolution}</td>
                                </tr>
                                <tr>
                                    <td class="label">File Size</td>
                                    <td class="value">${sizeHuman}</td>
                                </tr>
                                ${durationHtml}
                            </table>
                            
                            <div class="duplicate-action-selector">
                                <input type="radio" 
                                       name="dup-action-group-${groupIdx}" 
                                       id="dup-action-keep-${groupIdx}-${fileIdx}" 
                                       class="duplicate-action-input" 
                                       value="keep" 
                                       ${isBest ? 'checked' : ''}
                                       data-path="${file.path}">
                                <label for="dup-action-keep-${groupIdx}-${fileIdx}" class="duplicate-action-btn keep">Keep</label>
                                
                                <input type="radio" 
                                       name="dup-action-group-${groupIdx}" 
                                       id="dup-action-del-${groupIdx}-${fileIdx}" 
                                       class="duplicate-action-input" 
                                       value="delete" 
                                       ${!isBest ? 'checked' : ''}
                                       data-path="${file.path}">
                                <label for="dup-action-del-${groupIdx}-${fileIdx}" class="duplicate-action-btn delete">Delete</label>
                            </div>
                        </div>
                    </div>
                `;
            });

            groupCard.innerHTML = `
                ${groupHeaderHtml}
                <div class="duplicate-group-files">
                    ${filesHtml}
                </div>
            `;

            const videoCards = groupCard.querySelectorAll('.thumbnail-container');
            videoCards.forEach(card => {
                if (typeof attachHoverPreview === 'function') {
                    attachHoverPreview(card);
                }
                
                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const folder = card.dataset.folder;
                    const filename = card.dataset.filename;
                    if (typeof playVideoInLightbox === 'function') {
                        playVideoInLightbox(folder, filename);
                    }
                });
            });

            const fileCards = groupCard.querySelectorAll('.duplicate-file-card');
            const radios = groupCard.querySelectorAll('.duplicate-action-input');
            radios.forEach(radio => {
                radio.addEventListener('change', () => {
                    fileCards.forEach(card => {
                        const cardPath = card.dataset.path;
                        const keepChecked = groupCard.querySelector(`.duplicate-action-input[value="keep"][data-path="${cardPath}"]`).checked;
                        if (keepChecked) {
                            card.classList.add('to-keep');
                            card.classList.remove('to-delete');
                        } else {
                            card.classList.add('to-delete');
                            card.classList.remove('to-keep');
                        }
                    });
                });
            });

            duplicatesList.appendChild(groupCard);
        });

        const resolveGroupBtns = duplicatesList.querySelectorAll('.btn-resolve-group');
        resolveGroupBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const groupIdx = btn.dataset.groupIdx;
                const groupCard = duplicatesList.querySelector(`.duplicate-group-card[data-group-idx="${groupIdx}"]`);
                if (!groupCard) return;

                const deleteInputs = groupCard.querySelectorAll('.duplicate-action-input[value="delete"]:checked');
                const filesToDelete = Array.from(deleteInputs).map(inp => inp.dataset.path);

                if (filesToDelete.length === 0) {
                    showToast('No files are marked for deletion in this set.', true);
                    return;
                }

                if (confirm(`Are you sure you want to permanently delete these ${filesToDelete.length} duplicate file(s)?`)) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resolving...';
                    await resolveSelectedFiles(filesToDelete);
                }
            });
        });
    };

    const formatDuration = (sec) => {
        if (!sec || isNaN(sec)) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const padS = s.toString().padStart(2, '0');
        if (h > 0) {
            const padM = m.toString().padStart(2, '0');
            return `${h}:${padM}:${padS}`;
        }
        return `${m}:${padS}`;
    };

    const loadDuplicates = async () => {
        try {
            const res = await fetch(`/api/duplicates?t=${Date.now()}`);
            const data = await res.json();
            if (data.status === 'success') {
                renderDuplicatesList(data.groups);
            }
        } catch (err) {
            console.error('Failed to load duplicates:', err);
            duplicatesList.innerHTML = `
                <div class="no-duplicates-placeholder">
                    <i class="fa-solid fa-circle-exclamation placeholder-icon" style="color: var(--color-danger);"></i>
                    <p>Failed to load duplicates list: ${err.message}</p>
                </div>
            `;
        }
    };

    const resolveSelectedFiles = async (filesToDelete) => {
        try {
            const res = await fetch('/api/duplicates/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files_to_delete: filesToDelete })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                showToast(`Successfully deleted ${data.deleted_count} duplicate file(s).`);
                renderDuplicatesList(data.groups);
            } else if (data.status === 'partial') {
                showToast(`Deleted ${data.deleted_count} files with errors: ${data.errors.join(', ')}`, true);
                renderDuplicatesList(data.groups);
            } else {
                showToast(`Failed to delete files: ${data.errors.join(', ')}`, true);
            }
        } catch (err) {
            console.error('Failed to resolve duplicates:', err);
            showToast(`HTTP Error resolving duplicates: ${err.message}`, true);
        }
    };

    if (btnResolveAllDuplicates) {
        btnResolveAllDuplicates.addEventListener('click', async () => {
            const deleteInputs = duplicatesList.querySelectorAll('.duplicate-action-input[value="delete"]:checked');
            const filesToDelete = Array.from(deleteInputs).map(inp => inp.dataset.path);

            if (filesToDelete.length === 0) {
                showToast('No files are marked for deletion across any duplicate sets.', true);
                return;
            }

            if (confirm(`Are you sure you want to permanently delete ALL selected duplicates (${filesToDelete.length} files)?`)) {
                btnResolveAllDuplicates.disabled = true;
                btnResolveAllDuplicates.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
                await resolveSelectedFiles(filesToDelete);
                btnResolveAllDuplicates.disabled = false;
                btnResolveAllDuplicates.innerHTML = '<i class="fa-solid fa-trash-can"></i> Resolve All Selected';
            }
        });
    }

    const startDuplicatesPolling = () => {
        if (duplicatesScanInterval) clearInterval(duplicatesScanInterval);
        
        duplicatesScanInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/duplicates/status?t=${Date.now()}`);
                const data = await res.json();
                
                if (data.running) {
                    if (btnScanDuplicates) {
                        btnScanDuplicates.disabled = true;
                        btnScanDuplicates.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...';
                    }
                    if (duplicatesProgressContainer) duplicatesProgressContainer.style.display = 'block';
                    if (duplicatesProgressFile) duplicatesProgressFile.textContent = `Scanning: ${data.current_file}`;
                    if (duplicatesProgressPercent) duplicatesProgressPercent.textContent = `${data.percent}%`;
                    if (duplicatesProgressBar) duplicatesProgressBar.style.width = `${data.percent}%`;
                    if (duplicatesStatsContainer) duplicatesStatsContainer.style.display = 'none';
                    if (btnResolveAllDuplicates) btnResolveAllDuplicates.style.display = 'none';
                } else {
                    clearInterval(duplicatesScanInterval);
                    duplicatesScanInterval = null;
                    
                    if (btnScanDuplicates) {
                        btnScanDuplicates.disabled = false;
                        btnScanDuplicates.innerHTML = '<i class="fa-solid fa-clone"></i> Scan For Duplicates';
                    }
                    if (duplicatesProgressContainer) duplicatesProgressContainer.style.display = 'none';
                    
                    loadDuplicates();
                }
            } catch (err) {
                console.error('Error polling duplicate status:', err);
            }
        }, 1000);
    };

    if (btnScanDuplicates) {
        btnScanDuplicates.addEventListener('click', async () => {
            try {
                btnScanDuplicates.disabled = true;
                btnScanDuplicates.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Starting scan...';
                
                const res = await fetch('/api/duplicates/scan', { method: 'POST' });
                const data = await res.json();
                
                if (data.status === 'success') {
                    showToast('Background duplicate scan started.');
                    startDuplicatesPolling();
                } else {
                    showToast(data.message || 'Failed to start scan.', true);
                    btnScanDuplicates.disabled = false;
                    btnScanDuplicates.innerHTML = '<i class="fa-solid fa-clone"></i> Scan For Duplicates';
                }
            } catch (err) {
                console.error(err);
                showToast(`Error starting duplicate scan: ${err.message}`, true);
                btnScanDuplicates.disabled = false;
                btnScanDuplicates.innerHTML = '<i class="fa-solid fa-clone"></i> Scan For Duplicates';
            }
        });
    }

    // ===== WATCH PARTY LAUNCHER =====
    const btnCreateWatchParty = document.getElementById('btn-create-watch-party');
    const watchPartyModal = document.getElementById('watch-party-modal');
    const watchPartyModalClose = document.getElementById('watch-party-modal-close');
    const btnWpGenerate = document.getElementById('btn-wp-generate');
    const btnWpCopy = document.getElementById('btn-wp-copy');
    const btnWpBack = document.getElementById('btn-wp-back');
    const btnWpJoin = document.getElementById('btn-wp-join');
    
    const wpHostName = document.getElementById('wp-host-name');
    const wpPassword = document.getElementById('wp-password');
    const wpShareUrl = document.getElementById('wp-share-url');
    
    const wpCreateStep = document.getElementById('wp-create-step');
    const wpShareStep = document.getElementById('wp-share-step');

    const radioWpSourceFolder = document.getElementById('wp-source-type-folder');
    const radioWpSourceCustom = document.getElementById('wp-source-type-custom');
    const wpCustomFileContainer = document.getElementById('wp-custom-file-container');
    const wpCustomFile = document.getElementById('wp-custom-file');
    const wpSourceFolderName = document.getElementById('wp-source-folder-name');
    const wpSourceFolderLabel = document.getElementById('wp-source-folder-label');
    
    let createdPartyId = null;
    let createdPartyUrl = null;

    if (radioWpSourceFolder && radioWpSourceCustom && wpCustomFileContainer) {
        radioWpSourceFolder.addEventListener('change', () => {
            if (radioWpSourceFolder.checked) {
                wpCustomFileContainer.style.display = 'none';
            }
        });
        radioWpSourceCustom.addEventListener('change', () => {
            if (radioWpSourceCustom.checked) {
                wpCustomFileContainer.style.display = 'flex';
            }
        });
    }

    const triggerWatchPartyModal = () => {
        if (watchPartyModal) {
            // Reset steps
            if (wpCreateStep) wpCreateStep.style.display = 'flex';
            if (wpShareStep) wpShareStep.style.display = 'none';
            if (wpPassword) wpPassword.value = '';
            if (wpCustomFile) wpCustomFile.value = '';
            if (wpCustomFileContainer) wpCustomFileContainer.style.display = 'none';
            if (wpHostName) {
                wpHostName.value = localStorage.getItem('wp_nickname') || 'Host';
            }
            
            if (currentGalleryFolder) {
                if (wpSourceFolderName) wpSourceFolderName.innerText = currentGalleryFolder;
                if (wpSourceFolderLabel) wpSourceFolderLabel.style.display = 'flex';
                if (radioWpSourceFolder) radioWpSourceFolder.checked = true;
            } else {
                if (wpSourceFolderLabel) wpSourceFolderLabel.style.display = 'none';
                if (radioWpSourceCustom) radioWpSourceCustom.checked = true;
                if (wpCustomFileContainer) wpCustomFileContainer.style.display = 'flex';
            }
            
            watchPartyModal.classList.add('active');
        }
    };

    if (btnCreateWatchParty) {
        btnCreateWatchParty.addEventListener('click', triggerWatchPartyModal);
    }
    const btnGlobalWatchParty = document.getElementById('btn-global-watch-party');
    if (btnGlobalWatchParty) {
        btnGlobalWatchParty.addEventListener('click', (e) => {
            e.preventDefault();
            triggerWatchPartyModal();
        });
    }

    if (watchPartyModalClose) {
        watchPartyModalClose.addEventListener('click', () => {
            watchPartyModal.classList.remove('active');
        });
    }

    if (btnWpGenerate) {
        btnWpGenerate.addEventListener('click', async () => {
            const hostName = (wpHostName ? wpHostName.value.trim() : '') || 'Host';
            const password = wpPassword ? wpPassword.value : '';
            
            const isCustom = radioWpSourceCustom ? radioWpSourceCustom.checked : false;
            let folderName = currentGalleryFolder;
            let filename = null;

            try {
                btnWpGenerate.disabled = true;
                btnWpGenerate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

                if (isCustom) {
                    const fileInput = wpCustomFile;
                    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                        alert('Please select a custom video or image file.');
                        btnWpGenerate.disabled = false;
                        btnWpGenerate.innerHTML = '<i class="fa-solid fa-magic"></i> Generate Shareable Link';
                        return;
                    }
                    
                    const file = fileInput.files[0];
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    const uploadRes = await fetch('/api/watch-party/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const uploadData = await uploadRes.json();
                    if (uploadData.status !== 'success') {
                        throw new Error(uploadData.message || 'File upload failed');
                    }
                    
                    folderName = uploadData.folder_name;
                    filename = uploadData.filename;
                } else {
                    if (!folderName) {
                        alert('No active folder selected.');
                        btnWpGenerate.disabled = false;
                        btnWpGenerate.innerHTML = '<i class="fa-solid fa-magic"></i> Generate Shareable Link';
                        return;
                    }
                }
                
                const res = await fetch('/api/watch-party/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folder_name: folderName,
                        filename: filename,
                        password: password
                    })
                });
                
                const data = await res.json();
                btnWpGenerate.disabled = false;
                btnWpGenerate.innerHTML = '<i class="fa-solid fa-magic"></i> Generate Shareable Link';
                
                if (data.status === 'success') {
                    createdPartyId = data.party_id;
                    if (data.admin_token) {
                        localStorage.setItem(`wp_admin_token_${data.party_id}`, data.admin_token);
                    }
                    
                    // Construct absolute URL (use public tunnel URL if provided by backend)
                    if (data.public_url) {
                        createdPartyUrl = data.public_url;
                    } else {
                        const port = window.location.port ? `:${window.location.port}` : '';
                        createdPartyUrl = `${window.location.protocol}//${window.location.hostname}${port}${data.url}`;
                    }
                    
                    if (wpShareUrl) {
                        wpShareUrl.value = createdPartyUrl;
                    }
                    
                    if (wpCreateStep) wpCreateStep.style.display = 'none';
                    if (wpShareStep) wpShareStep.style.display = 'flex';
                } else {
                    alert(`Failed to create party: ${data.message}`);
                }
            } catch (err) {
                btnWpGenerate.disabled = false;
                btnWpGenerate.innerHTML = '<i class="fa-solid fa-magic"></i> Generate Shareable Link';
                console.error(err);
                alert(`Error: ${err.message}`);
            }
        });
    }

    if (btnWpCopy) {
        btnWpCopy.addEventListener('click', () => {
            if (wpShareUrl) {
                wpShareUrl.select();
                document.execCommand('copy');
                
                // Visual feedback
                const icon = btnWpCopy.querySelector('i');
                if (icon) {
                    icon.className = 'fa-solid fa-check';
                    setTimeout(() => {
                        icon.className = 'fa-solid fa-copy';
                    }, 2000);
                }
            }
        });
    }

    if (btnWpBack) {
        btnWpBack.addEventListener('click', () => {
            if (wpCreateStep) wpCreateStep.style.display = 'flex';
            if (wpShareStep) wpShareStep.style.display = 'none';
        });
    }

    if (btnWpJoin) {
        btnWpJoin.addEventListener('click', () => {
            if (createdPartyId) {
                const nickname = (wpHostName ? wpHostName.value.trim() : '') || 'Host';
                
                // Store nickname in localStorage so watch party page can retrieve it
                localStorage.setItem('wp_nickname', nickname);
                
                // Open party URL
                window.location.href = `/watch-party/${createdPartyId}`;
            }
        });
    }
});
