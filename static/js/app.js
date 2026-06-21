// AURA SORT — FRONTEND JAVASCRIPT

document.addEventListener('DOMContentLoaded', () => {
    // Navigation Tabs
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    const pageHeading = document.getElementById('page-heading');
    const pageSubheading = document.getElementById('page-subheading');

    const headings = {
        'sec-dashboard': { title: 'Dashboard', sub: 'Orchestrate face recognition, gender classification, and clustering pipeline' },
        'sec-configuration': { title: 'Pipeline Settings', sub: 'Configure folders, intervals, thresholds, and performance metrics' },
        'sec-results': { title: 'Sorted Library', sub: 'View identified profiles and sorted media folders' }
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('href').replace('#', 'sec-');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            sections.forEach(sec => sec.classList.remove('active'));
            
            item.classList.add('active');
            const targetSec = document.getElementById(targetId);
            if (targetSec) {
                targetSec.classList.add('active');
            }

            // Update page header text
            if (headings[targetId]) {
                pageHeading.textContent = headings[targetId].title;
                pageSubheading.textContent = headings[targetId].sub;
            }
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
            const res = await fetch('/api/config');
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
            document.getElementById('merge_on_name_conflict').checked = data.merge_on_name_conflict === true;
            
            document.getElementById('name_confidence_threshold').value = data.name_confidence_threshold !== undefined ? data.name_confidence_threshold : 0.5;
            document.getElementById('val-name_confidence_threshold').textContent = parseFloat(data.name_confidence_threshold !== undefined ? data.name_confidence_threshold : 0.5).toFixed(2);
            
            document.getElementById('name_search_delay').value = data.name_search_delay !== undefined ? data.name_search_delay : 4.0;
            
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
            merge_on_name_conflict: document.getElementById('merge_on_name_conflict').checked,
            name_confidence_threshold: parseFloat(document.getElementById('name_confidence_threshold').value),
            name_search_delay: parseFloat(document.getElementById('name_search_delay').value)
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
                    if (data.report) {
                        renderResults(data.report);
                    }
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

    // Render sorting results card grid
    const renderResults = (report) => {
        if (!report) return;
        
        const sortedCount = Object.keys(report.sorted_files || {}).length;
        const unsortedCount = (report.unsorted_files || []).length;
        const folders = report.cluster_folders || {};
        const numClusters = Object.keys(folders).length;

        // Update top summary cards
        statFemales.textContent = numClusters;
        statVideos.textContent = sortedCount;
        statUnsorted.textContent = unsortedCount;

        libraryCountTitle.textContent = `${numClusters} Distinct Identities Grouped`;

        // Clear grid
        libraryGrid.innerHTML = '';

        if (numClusters === 0 && unsortedCount === 0) {
            libraryGrid.innerHTML = `
                <div class="no-results-placeholder">
                    <i class="fa-solid fa-face-sad-tear placeholder-icon"></i>
                    <p>No faces could be recognized or clustered. Verify source media has clear female faces.</p>
                </div>
            `;
            return;
        }

        // 1. Render identity folders
        // To get item count per cluster:
        const folderCounts = {};
        Object.values(report.sorted_files).forEach(fileObj => {
            const clName = fileObj.cluster;
            folderCounts[clName] = (folderCounts[clName] || 0) + 1;
        });

        // Add sorting
        const sortedFolderKeys = Object.keys(folders).sort((a, b) => parseInt(a) - parseInt(b));

        sortedFolderKeys.forEach(clusterId => {
            const folderName = folders[clusterId];
            const fileCount = folderCounts[folderName] || 0;
            
            const card = document.createElement('div');
            card.className = 'library-card';
            
            // Set up dynamic reference image source
            const imgUrl = `/api/thumbnail/${folderName}?t=${new Date().getTime()}`; // Cache bust
            
            card.innerHTML = `
                <div class="thumbnail-container">
                    <img src="${imgUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="${folderName}">
                    <div class="no-image-placeholder" style="display:none;">
                        <i class="fa-solid fa-user-astronaut"></i>
                        <span>Thumbnail unavailable</span>
                    </div>
                </div>
                <div class="card-details">
                    <span class="cluster-name">${folderName.replace('_', ' ')}</span>
                    <span class="cluster-count">${fileCount} media items</span>
                </div>
            `;
            
            libraryGrid.appendChild(card);
        });

        // 2. Render Unsorted folder if present
        if (unsortedCount > 0) {
            const card = document.createElement('div');
            card.className = 'library-card';
            card.innerHTML = `
                <div class="thumbnail-container">
                    <div class="no-image-placeholder">
                        <i class="fa-solid fa-circle-question" style="color: var(--color-accent);"></i>
                        <span>Unknown Profile</span>
                    </div>
                </div>
                <div class="card-details">
                    <span class="cluster-name">_unsorted</span>
                    <span class="cluster-count">${unsortedCount} media items</span>
                </div>
            `;
            libraryGrid.appendChild(card);
        }
    };
    
    // Check initial status on load to sync UI if server restarted or was running
    const checkInitialStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            
            if (data.running) {
                appendLog('info', 'Reconnected to running pipeline...');
                connectSSE();
            } else if (data.stage === 'completed' && data.report) {
                renderResults(data.report);
            }
        } catch (e) {
            console.error('Failed to retrieve initial status', e);
        }
    };
    
    checkInitialStatus();

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
            const res = await fetch('/api/list-folders');
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

                const imgUrl = `/api/thumbnail/${folder.name}?t=${Date.now()}`;
                const thumbHtml = folder.has_thumbnail
                    ? `<img src="${imgUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="${folder.name}"><div class="merge-no-img" style="display:none;"><i class="fa-solid fa-user"></i></div>`
                    : `<div class="merge-no-img"><i class="fa-solid fa-user"></i></div>`;

                card.innerHTML = `
                    <div class="merge-check"><i class="fa-solid fa-check"></i></div>
                    <div class="merge-thumb">${thumbHtml}</div>
                    <div class="merge-card-info">
                        <span class="merge-card-name">${folder.name.replace(/_/g, ' ')}</span>
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
});
