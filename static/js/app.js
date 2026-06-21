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
            
            if (targetId === 'sec-results') {
                loadLibrary();
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
            document.getElementById('only_name_unnamed').checked = data.only_name_unnamed !== false;
            document.getElementById('merge_on_name_conflict').checked = data.merge_on_name_conflict === true;
            
            document.getElementById('name_confidence_threshold').value = data.name_confidence_threshold !== undefined ? data.name_confidence_threshold : 0.5;
            document.getElementById('val-name_confidence_threshold').textContent = parseFloat(data.name_confidence_threshold !== undefined ? data.name_confidence_threshold : 0.5).toFixed(2);
            
            document.getElementById('name_search_delay').value = data.name_search_delay !== undefined ? data.name_search_delay : 4.0;
            document.getElementById('default_video_player').value = data.default_video_player || 'browser';
            
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
            default_video_player: document.getElementById('default_video_player').value
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

    // Load dynamic library from filesystem (replaces static renderResults)
    const loadLibrary = async () => {
        try {
            const res = await fetch('/api/list-folders');
            const data = await res.json();
            
            libraryGrid.innerHTML = '';
            
            if (!data.folders || data.folders.length === 0) {
                libraryGrid.innerHTML = `
                    <div class="no-results-placeholder">
                        <i class="fa-solid fa-folder-open placeholder-icon"></i>
                        <p>No sorted directories found. Start sorting from the Dashboard tab.</p>
                    </div>
                `;
                libraryCountTitle.textContent = 'No library processed yet';
                statFemales.textContent = '-';
                statVideos.textContent = '-';
                statUnsorted.textContent = '-';
                return;
            }

            let totalFiles = 0;
            let unsortedCount = 0;
            const validFolders = data.folders.filter(f => f.name !== '_unsorted');
            const numClusters = validFolders.length;
            
            const unsortedFolder = data.folders.find(f => f.name === '_unsorted');
            if (unsortedFolder) {
                unsortedCount = unsortedFolder.file_count;
            }

            data.folders.forEach(folder => {
                if (folder.name !== '_unsorted') {
                    totalFiles += folder.file_count;
                }
                
                const card = document.createElement('div');
                card.className = 'library-card';
                card.style.cursor = 'pointer'; // Ensure cursor shows it is clickable
                
                const imgUrl = `/api/thumbnail/${encodeURIComponent(folder.name)}?t=${Date.now()}`;
                
                const isUnsorted = folder.name === '_unsorted';
                const thumbHtml = folder.has_thumbnail
                    ? `<img src="${imgUrl}" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${imgUrl}&retry=' + Date.now(); }, 1000); } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }" alt="${folder.name}"><div class="no-image-placeholder" style="display:none;"><i class="fa-solid fa-user-astronaut"></i><span>Thumbnail unavailable</span></div>`
                    : `<div class="no-image-placeholder">${isUnsorted ? '<i class="fa-solid fa-circle-question" style="color: var(--color-accent);"></i><span>Unknown Profile</span>' : '<i class="fa-solid fa-user-astronaut"></i><span>Thumbnail unavailable</span>'}</div>`;
                
                card.innerHTML = `
                    <div class="thumbnail-container">
                        ${thumbHtml}
                    </div>
                    <div class="card-details">
                        <span class="cluster-name">${folder.name === '_unsorted' ? 'Unsorted' : folder.name.replace(/_/g, ' ').trim()}</span>
                        <span class="cluster-count">${folder.file_count} media items</span>
                    </div>
                `;
                
                card.addEventListener('click', () => {
                    openGallery(folder.name);
                });
                
                libraryGrid.appendChild(card);
            });

            // Update stats
            statFemales.textContent = numClusters;
            statVideos.textContent = totalFiles;
            statUnsorted.textContent = unsortedCount;
            libraryCountTitle.textContent = `${numClusters} Distinct Identities Grouped`;
            
        } catch (err) {
            console.error('Failed to load library:', err);
            appendLog('error', `Failed to load library: ${err.message}`);
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
            } else {
                loadLibrary();
            }
        } catch (e) {
            console.error('Failed to retrieve initial status', e);
            loadLibrary();
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

    if (typeof Plyr !== 'undefined') {
        plyrPlayer = new Plyr('#lightbox-video', {
            controls: [
                'play-large', 'play', 'progress', 'current-time', 'duration',
                'mute', 'volume', 'settings', 'pip', 'fullscreen'
            ],
            settings: ['speed', 'loop']
        });
    }

    let currentGalleryFolder = null;

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
            const res = await fetch('/api/list-folders');
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
                            const filename = dragData.filename;
                            if (!filename) return;

                            const moveRes = await fetch('/api/move-media', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    from_folder: currentGalleryFolder,
                                    to_folder: folder.name,
                                    filename: filename
                                })
                            });
                            const moveData = await moveRes.json();

                            if (moveData.status === 'success') {
                                const targetDisplayName = folder.name === '_unsorted' ? 'Unsorted' : folder.name.replace(/_/g, ' ').trim();
                                appendLog('info', `Successfully moved ${filename} to ${targetDisplayName}`);
                                // Refresh current gallery
                                await openGallery(currentGalleryFolder);
                                // Refresh library page details & counts
                                await loadLibrary();
                                // Refresh sidebar folder items list
                                await loadSidebarFolders();
                            } else {
                                alert(`Failed to move: ${moveData.message}`);
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

    const openGallery = async (folderName) => {
        currentGalleryFolder = folderName;
        galleryTitle.textContent = folderName === '_unsorted' ? 'Unsorted' : folderName.replace(/_/g, ' ').trim();
        galleryMediaGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading folder contents...</p>';
        galleryCountBadge.textContent = '0 items';
        
        // Reset rename view to normal
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
        
        galleryModal.classList.add('active');

        // Load target folders in sidebar
        loadSidebarFolders();

        try {
            const res = await fetch(`/api/list-media/${encodeURIComponent(folderName)}`);
            const data = await res.json();
            
            galleryMediaGrid.innerHTML = '';
            
            if (!data.files || data.files.length === 0) {
                galleryMediaGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No media files inside this folder.</p>';
                galleryCountBadge.textContent = '0 items';
                return;
            }

            galleryCountBadge.textContent = `${data.files.length} items`;

            data.files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.setAttribute('draggable', 'true');
                
                const fileUrl = `/media/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}`;
                
                // Drag and drop event listeners on gallery items
                item.addEventListener('dragstart', (e) => {
                    item.classList.add('dragging');
                    e.dataTransfer.setData('text/plain', JSON.stringify({ filename: file.name }));
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                });
                
                if (file.is_video) {
                    const isNative = file.ext === '.mp4' || file.ext === '.webm';
                    const videoThumbUrl = `/api/video-thumbnail/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}?t=${Date.now()}`;
                    
                    // Check user preference from DOM
                    const defaultPlayer = document.getElementById('default_video_player')?.value || 'browser';
                    const useVLC = !isNative || defaultPlayer === 'vlc';
                    const metaLabel = useVLC ? 'Play Natively (VLC)' : 'Play in App';
                    const btnLabel = useVLC ? 'Play in VLC' : 'Play in Browser';
                    const btnIcon = useVLC ? 'fa-laptop' : 'fa-circle-play';
                    const btnClass = useVLC ? 'play-native-btn' : 'play-browser-btn';
                    
                    item.innerHTML = `
                        <img src="${videoThumbUrl}" onerror="if (!this.dataset.retried) { this.dataset.retried = true; const self = this; setTimeout(() => { self.src = '${videoThumbUrl}&retry=' + Date.now(); }, 1500); } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }" alt="${file.name}">
                        <div class="video-placeholder" style="display:none; width:100%; height:100%;">
                            <i class="fa-solid fa-circle-play"></i>
                            <span>${file.name}</span>
                        </div>
                        <div class="gallery-item-hover-overlay">
                            <button class="hover-btn play-video-btn ${btnClass}"><i class="fa-solid ${btnIcon}"></i> ${btnLabel}</button>
                        </div>
                        <div class="item-meta">${metaLabel}</div>
                    `;
                    
                    const playBtn = item.querySelector('.play-video-btn');
                    const handlePlay = (e) => {
                        if (e) e.stopPropagation();
                        if (useVLC) {
                            playFileNatively(folderName, file.name);
                        } else {
                            playVideoInLightbox(fileUrl);
                        }
                    };
                    
                    if (playBtn) {
                        playBtn.addEventListener('click', handlePlay);
                    }
                    item.addEventListener('click', handlePlay);
                } else {
                    item.innerHTML = `
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
                            showImageInLightbox(fileUrl);
                        });
                    }
                    
                    item.addEventListener('click', () => {
                        showImageInLightbox(fileUrl);
                    });
                }
                
                galleryMediaGrid.appendChild(item);
            });
            
        } catch (err) {
            console.error('Failed to load gallery files:', err);
            galleryMediaGrid.innerHTML = `<p style="color: #ff6b6b; grid-column: 1/-1; text-align: center;">Error loading gallery: ${err.message}</p>`;
        }
    };

    const showImageInLightbox = (imgUrl) => {
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
    };

    const playVideoInLightbox = (videoUrl) => {
        lightboxImg.style.display = 'none';
        lightboxImg.src = '';
        
        const plyrContainer = document.querySelector('.plyr');
        if (plyrContainer) {
            plyrContainer.style.display = 'block';
        } else {
            lightboxVideo.style.display = 'block';
        }
        
        lightboxModal.classList.add('active');
        
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
            plyrPlayer.play().catch(e => console.log('Video play failed:', e));
        } else {
            lightboxVideo.src = videoUrl;
            lightboxVideo.play().catch(e => console.log('Video play failed:', e));
        }
    };

    const playFileNatively = async (folderName, filename) => {
        try {
            appendLog('info', `Requesting native OS playback for: ${filename}...`);
            const res = await fetch('/api/play-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_name: folderName, filename })
            });
            const data = await res.json();
            if (data.status === 'success') {
                appendLog('info', `Successfully launched native player for ${filename}`);
            } else {
                alert(`Failed to play natively: ${data.message}`);
            }
        } catch (e) {
            alert(`Error opening file: ${e.message}`);
        }
    };

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
    galleryModalClose.addEventListener('click', () => {
        galleryModal.classList.remove('active');
    });
    galleryModal.addEventListener('click', (e) => {
        if (e.target === galleryModal) galleryModal.classList.remove('active');
    });

    const stopLightboxMedia = () => {
        if (plyrPlayer) {
            plyrPlayer.pause();
        } else {
            lightboxVideo.pause();
        }
    };

    lightboxClose.addEventListener('click', () => {
        lightboxModal.classList.remove('active');
        stopLightboxMedia();
    });
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
});
