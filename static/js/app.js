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
                
                const imgUrl = `/api/thumbnail/${folder.name}?t=${Date.now()}`;
                
                const isUnsorted = folder.name === '_unsorted';
                const thumbHtml = folder.has_thumbnail
                    ? `<img src="${imgUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="${folder.name}"><div class="no-image-placeholder" style="display:none;"><i class="fa-solid fa-user-astronaut"></i><span>Thumbnail unavailable</span></div>`
                    : `<div class="no-image-placeholder">${isUnsorted ? '<i class="fa-solid fa-circle-question" style="color: var(--color-accent);"></i><span>Unknown Profile</span>' : '<i class="fa-solid fa-user-astronaut"></i><span>Thumbnail unavailable</span>'}</div>`;
                
                card.innerHTML = `
                    <div class="thumbnail-container">
                        ${thumbHtml}
                    </div>
                    <div class="card-details">
                        <span class="cluster-name">${folder.name.replace(/_/g, ' ')}</span>
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

    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxClose = document.getElementById('lightbox-close');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxVideo = document.getElementById('lightbox-video');

    let currentGalleryFolder = null;

    const openGallery = async (folderName) => {
        currentGalleryFolder = folderName;
        galleryTitle.textContent = folderName.replace(/_/g, ' ');
        galleryMediaGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading folder contents...</p>';
        galleryCountBadge.textContent = '0 items';
        
        galleryModal.classList.add('active');

        try {
            const res = await fetch(`/api/list-media/${folderName}`);
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
                
                const fileUrl = `/media/${folderName}/${file.name}`;
                
                if (file.is_video) {
                    const isNative = file.ext === '.mp4' || file.ext === '.webm';
                    const videoThumbUrl = `/api/video-thumbnail/${folderName}/${file.name}`;
                    item.innerHTML = `
                        <img src="${videoThumbUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="${file.name}">
                        <div class="video-placeholder" style="display:none; width:100%; height:100%;">
                            <i class="fa-solid fa-circle-play"></i>
                            <span>${file.name}</span>
                        </div>
                        <div class="play-badge"><i class="fa-solid fa-play"></i></div>
                        <div class="item-meta">${isNative ? 'Play in App' : 'Play Natively (VLC)'}</div>
                    `;
                    
                    item.addEventListener('click', () => {
                        if (isNative) {
                            playVideoInLightbox(fileUrl);
                        } else {
                            playFileNatively(folderName, file.name);
                        }
                    });
                } else {
                    item.innerHTML = `
                        <img src="${fileUrl}" alt="${file.name}">
                        <div class="item-meta">${file.name}</div>
                    `;
                    
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
        lightboxVideo.style.display = 'none';
        lightboxVideo.pause();
        lightboxVideo.src = '';
        
        lightboxImg.src = imgUrl;
        lightboxImg.style.display = 'block';
        lightboxModal.classList.add('active');
    };

    const playVideoInLightbox = (videoUrl) => {
        lightboxImg.style.display = 'none';
        lightboxImg.src = '';
        
        lightboxVideo.src = videoUrl;
        lightboxVideo.style.display = 'block';
        lightboxModal.classList.add('active');
        lightboxVideo.play().catch(e => console.log('Video play failed:', e));
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
            const res = await fetch(`/api/open-folder/${currentGalleryFolder}`, { method: 'POST' });
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

    lightboxClose.addEventListener('click', () => {
        lightboxModal.classList.remove('active');
        lightboxVideo.pause();
    });
    lightboxModal.addEventListener('click', (e) => {
        if (e.target === lightboxModal || e.target === document.querySelector('.lightbox-content')) {
            lightboxModal.classList.remove('active');
            lightboxVideo.pause();
        }
    });
});
