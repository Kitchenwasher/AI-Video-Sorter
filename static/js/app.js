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
            tabBtnInfo.style.borderBottom = '2px solid var(--color-primary, #ec4899)';
            tabBtnInfo.style.color = 'white';
            
            tabBtnQueue.classList.remove('active');
            tabBtnQueue.style.borderBottom = '2px solid transparent';
            tabBtnQueue.style.color = 'var(--text-muted, #9ca3af)';
            
            if (panelContentInfo) panelContentInfo.style.display = 'flex';
            if (panelContentQueue) panelContentQueue.style.display = 'none';
        });
        
        tabBtnQueue.addEventListener('click', (e) => {
            e.stopPropagation();
            tabBtnQueue.classList.add('active');
            tabBtnQueue.style.borderBottom = '2px solid var(--color-primary, #ec4899)';
            tabBtnQueue.style.color = 'white';
            
            tabBtnInfo.classList.remove('active');
            tabBtnInfo.style.borderBottom = '2px solid transparent';
            tabBtnInfo.style.color = 'var(--text-muted, #9ca3af)';
            
            if (panelContentQueue) panelContentQueue.style.display = 'flex';
            if (panelContentInfo) panelContentInfo.style.display = 'none';
            renderQueueUI();
        });
    }

    if (playlistShuffleBtn) {
        playlistShuffleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playlistIsShuffle = !playlistIsShuffle;
            updateShuffleBtnUI();
            generateShuffledIndices();
            if (panelContentQueue && panelContentQueue.style.display === 'flex') {
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
                            const filenames = dragData.filenames || (dragData.filename ? [dragData.filename] : null);
                            if (!filenames || filenames.length === 0) return;

                            const moveRes = await fetch('/api/move-media', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    from_folder: currentGalleryFolder,
                                    to_folder: folder.name,
                                    filenames: filenames
                                })
                            });
                            const moveData = await moveRes.json();

                            if (moveData.status === 'success') {
                                const targetDisplayName = folder.name === '_unsorted' ? 'Unsorted' : folder.name.replace(/_/g, ' ').trim();
                                const fileCountStr = filenames.length === 1 ? filenames[0] : `${filenames.length} files`;
                                appendLog('info', `Successfully moved ${fileCountStr} to ${targetDisplayName}`);
                                
                                // Reset selection
                                clearAllSelections();
                                
                                // Refresh current gallery (preserving search query and re-filtering targets)
                                await openGallery(currentGalleryFolder, true);
                                // Refresh library page details & counts
                                await loadLibrary();
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
        
        galleryModal.classList.add('active');

        // Load target folders in sidebar
        await loadSidebarFolders();

        try {
            const res = await fetch(`/api/list-media/${encodeURIComponent(folderName)}`);
            const data = await res.json();
            
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
                return;
            }

            galleryCountBadge.textContent = `${data.files.length} items`;

            data.files.forEach(file => {
                const isSelected = selectedFilenames.has(file.name);
                const item = document.createElement('div');
                item.className = `gallery-item${isSelected ? ' selected' : ''}`;
                item.setAttribute('draggable', 'true');
                
                const fileUrl = `/media/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}`;
                
                // Drag and drop event listeners on gallery items
                item.addEventListener('dragstart', (e) => {
                    item.classList.add('dragging');
                    
                    let dragFiles = [];
                    if (selectedFilenames.has(file.name)) {
                        dragFiles = Array.from(selectedFilenames);
                        // Add dragging class to all selected cards
                        galleryMediaGrid.querySelectorAll('.gallery-item.selected').forEach(el => {
                            el.classList.add('dragging');
                        });
                    } else {
                        dragFiles = [file.name];
                    }
                    
                    e.dataTransfer.setData('text/plain', JSON.stringify({ filenames: dragFiles }));
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    galleryMediaGrid.querySelectorAll('.gallery-item').forEach(el => {
                        el.classList.remove('dragging');
                    });
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
                            playFileNatively(folderName, file.name);
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
                                playFileNatively(folderName, file.name);
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
        if (playlistFolder !== currentGalleryFolder || !playlistQueue || playlistQueue.length === 0 || !playlistQueue.some(f => f.name === filename)) {
            try {
                const folder = encodeURIComponent(currentGalleryFolder);
                const res = await fetch(`/api/list-media/${folder}`);
                const data = await res.json();
                playlistQueue = (data.files || []).filter(f => f.is_video);
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
        if (panelContentQueue && panelContentQueue.style.display === 'flex') {
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
    galleryModalClose.addEventListener('click', () => {
        galleryModal.classList.remove('active');
    });
    galleryModal.addEventListener('click', (e) => {
        if (e.target === galleryModal) galleryModal.classList.remove('active');
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

    const loadRecentlyWatched = async () => {
        const container = document.getElementById('recently-watched-card');
        const list = document.getElementById('recently-watched-list');
        if (!container || !list) return;
        
        try {
            const res = await fetch('/api/recently-watched');
            const data = await res.json();
            
            if (data.status === 'success' && data.items && data.items.length > 0) {
                list.innerHTML = '';
                
                data.items.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'recent-video-card';
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
                            <img src="${videoThumbUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/static/img/placeholder.jpg';">
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
                
                container.style.display = 'flex';
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

    const renderSearchResults = (results) => {
        if (!searchResultsGrid) return;
        searchResultsGrid.innerHTML = '';
        searchResultsGrid.style.display = 'grid';

        const defaultPlayer = document.getElementById('default_video_player')?.value || 'browser';

        results.forEach(file => {
            const card = document.createElement('div');
            card.className = 'search-result-card';
            
            const fileUrl = `/media/${encodeURIComponent(file.folder_name)}/${encodeURIComponent(file.filename)}`;
            const isNative = file.ext === '.mp4' || file.ext === '.webm';
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

    loadRecentlyWatched();
});

