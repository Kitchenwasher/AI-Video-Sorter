/**
 * AuraSort — Watch Party Advanced Co-Watching Playback Controller (Modular)
 * Handles sidebar tabs, collaborative media queue (HTML5 drag & drop), 
 * synced autoplay next, synced playback speed, dynamic subtitle tracks,
 * and multi-audio track selection.
 */

(function () {
    let socket = null;
    let player = null;
    
    // In-memory queue state
    let currentQueue = [];
    let subtitleFiles = [];
    
    // Drag and drop state
    let dragSrcEl = null;

    // Initialize module when page loads
    window.addEventListener('load', () => {
        initQueueModule();
    });

    function initQueueModule() {
        // Expose tab switching function globally
        window.switchSidebarTab = switchSidebarTab;
        
        // Expose add to queue hook
        window.addToQueue = addToQueue;
        
        // Expose play next hook
        window.playNextInQueue = playNextInQueue;
        
        // Expose subtitle refresh hook
        window.refreshSubtitlesList = refreshSubtitlesList;
        
        // Bind clear queue button
        const clearBtn = document.getElementById('btn-clear-queue');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearQueue);
        }

        // Wait for Plyr and socket to initialize
        setupBindingsLoop();
    }

    /**
     * Periodically check for window.socket and Plyr player, then bind handlers
     */
    function setupBindingsLoop() {
        const checkInterval = setInterval(() => {
            const rawPlayer = document.getElementById('lightbox-video')?.__plyr;
            if (window.socket && rawPlayer) {
                socket = window.socket;
                player = rawPlayer;
                clearInterval(checkInterval);
                
                bindSocketListeners();
                bindUIEventListeners();
                startPeriodicChecks();
                
                // Request initial queue state immediately if connected, or on connect event
                if (socket.connected) {
                    requestInitialQueue();
                }
                socket.on('connect', () => {
                    requestInitialQueue();
                });
                
                console.log("[QueueModule] Advanced playback and queue infrastructure initialized and bound.");
            }
        }, 200);
    }

    function requestInitialQueue() {
        if (socket && socket.connected) {
            console.log("[QueueModule] Requesting active queue state from server...");
            socket.emit('get_queue', {
                party_id: window.PARTY_ID
            });
        }
    }

    /**
     * Tab switching logic for the right sidebar
     */
    function switchSidebarTab(tabName) {
        const chatContainer = document.getElementById('sidebar-chat-container');
        const queueContainer = document.getElementById('sidebar-queue-container');
        const chatBtn = document.getElementById('tab-btn-chat');
        const queueBtn = document.getElementById('tab-btn-queue');

        if (tabName === 'chat') {
            if (chatContainer) chatContainer.style.display = 'flex';
            if (queueContainer) queueContainer.style.display = 'none';
            if (chatBtn) {
                chatBtn.classList.add('active');
                chatBtn.style.borderBottom = '2px solid var(--accent)';
                chatBtn.style.color = 'var(--text-main)';
            }
            if (queueBtn) {
                queueBtn.classList.remove('active');
                queueBtn.style.borderBottom = '2px solid transparent';
                queueBtn.style.color = 'var(--text-muted)';
            }
        } else if (tabName === 'queue') {
            if (chatContainer) chatContainer.style.display = 'none';
            if (queueContainer) queueContainer.style.display = 'flex';
            if (chatBtn) {
                chatBtn.classList.remove('active');
                chatBtn.style.borderBottom = '2px solid transparent';
                chatBtn.style.color = 'var(--text-muted)';
            }
            if (queueBtn) {
                queueBtn.classList.add('active');
                queueBtn.style.borderBottom = '2px solid var(--accent)';
                queueBtn.style.color = 'var(--text-main)';
            }
            // Trigger rendering when opening tab to ensure correct states
            renderQueueList();
        }
    }

    function bindSocketListeners() {
        if (!socket) return;

        // Listen for initial payload and extract queue state
        socket.on('init_payload', (data) => {
            if (data.queue) {
                currentQueue = data.queue;
                renderQueueList();
            }
            if (data.playback_state && data.playback_state.speed !== undefined) {
                const speed = data.playback_state.speed;
                const speedSelect = document.getElementById('wp-speed-select');
                if (speedSelect) speedSelect.value = speed.toString();
                if (player) player.speed = speed;
            }
        });

        // Listen for queue updates
        socket.on('queue_updated', (data) => {
            console.log("[QueueModule] Queue updated from server:", data.queue);
            currentQueue = data.queue || [];
            renderQueueList();
        });

        // Listen for playback speed changes
        socket.on('speed_changed_broadcast', (data) => {
            console.log(`[QueueModule] Speed changed by peer to ${data.speed}x`);
            const speedSelect = document.getElementById('wp-speed-select');
            if (speedSelect) {
                speedSelect.value = data.speed.toString();
            }
            if (player) {
                player.speed = data.speed;
            }
            // Show toast using main controller toast system
            if (window.showToast) {
                window.showToast(`Playback speed set to ${data.speed}x`, 'info');
            }
        });

        // Listen for subtitle changes
        socket.on('subtitle_changed_broadcast', (data) => {
            console.log("[QueueModule] Subtitle changed by peer:", data.filename);
            const subSelect = document.getElementById('wp-subtitle-select');
            if (subSelect) {
                subSelect.value = data.filename || 'none';
            }
            applySubtitleTrack(data.filename);
            if (window.showToast) {
                const label = data.filename && data.filename !== 'none' ? data.filename : 'Disabled';
                window.showToast(`Subtitles changed: ${label}`, 'info');
            }
        });

        // Listen for audio track changes
        socket.on('audio_track_changed_broadcast', (data) => {
            console.log("[QueueModule] Audio track changed by peer:", data.index);
            const audioSelect = document.getElementById('wp-audio-select');
            if (audioSelect) {
                audioSelect.value = data.index.toString();
            }
            if (window.hlsInstance && window.hlsInstance.audioTrack !== data.index) {
                window.hlsInstance.audioTrack = data.index;
            }
            if (window.showToast) {
                window.showToast(`Audio track switched`, 'info');
            }
        });
    }

    function bindUIEventListeners() {
        // 1. Speed Select
        const speedSelect = document.getElementById('wp-speed-select');
        if (speedSelect) {
            speedSelect.addEventListener('change', function () {
                const isLocked = window.getIsPlaybackLocked();
                const isAdmin = !!window.getAdminToken();
                
                if (isLocked && !isAdmin) {
                    if (window.showToast) {
                        window.showToast('Playback settings are locked by the host.', 'warning');
                    }
                    // Revert value
                    this.value = player ? player.speed.toString() : "1.0";
                    return;
                }

                const speed = parseFloat(this.value);
                if (player) player.speed = speed;
                
                if (socket) {
                    socket.emit('speed_change', {
                        party_id: window.PARTY_ID,
                        client_id: window.getClientId(),
                        speed: speed
                    });
                }
            });
        }

        // 2. Subtitle Select
        const subSelect = document.getElementById('wp-subtitle-select');
        if (subSelect) {
            subSelect.addEventListener('change', function () {
                const isLocked = window.getIsPlaybackLocked();
                const isAdmin = !!window.getAdminToken();
                
                if (isLocked && !isAdmin) {
                    if (window.showToast) {
                        window.showToast('Playback settings are locked by the host.', 'warning');
                    }
                    // Revert
                    this.value = 'none'; // fallback
                    return;
                }

                const val = this.value;
                applySubtitleTrack(val);

                if (socket) {
                    socket.emit('subtitle_change', {
                        party_id: window.PARTY_ID,
                        client_id: window.getClientId(),
                        filename: val
                    });
                }
            });
        }

        // 3. Audio Select
        const audioSelect = document.getElementById('wp-audio-select');
        if (audioSelect) {
            audioSelect.addEventListener('change', function () {
                const isLocked = window.getIsPlaybackLocked();
                const isAdmin = !!window.getAdminToken();
                
                if (isLocked && !isAdmin) {
                    if (window.showToast) {
                        window.showToast('Playback settings are locked by the host.', 'warning');
                    }
                    this.value = window.hlsInstance ? window.hlsInstance.audioTrack.toString() : "default";
                    return;
                }

                const idx = parseInt(this.value);
                if (window.hlsInstance && !isNaN(idx)) {
                    window.hlsInstance.audioTrack = idx;
                }

                if (socket) {
                    socket.emit('audio_track_change', {
                        party_id: window.PARTY_ID,
                        client_id: window.getClientId(),
                        index: idx
                    });
                }
            });
        }
    }

    /**
     * Subtitle track scanner
     * Triggered by watch_party.js whenever the file list changes
     */
    function refreshSubtitlesList(files) {
        subtitleFiles = files.filter(file => {
            const ext = file.filename.split('.').pop().toLowerCase();
            return ext === 'srt' || ext === 'vtt';
        });

        console.log("[QueueModule] Found subtitle files in folder:", subtitleFiles);
        const subSelect = document.getElementById('wp-subtitle-select');
        if (!subSelect) return;

        // Preserve selected value
        const prevVal = subSelect.value;
        subSelect.innerHTML = '<option value="none" selected>Disabled</option>';

        subtitleFiles.forEach(file => {
            const opt = document.createElement('option');
            opt.value = file.filename;
            
            // Clean display name (strip prefix single_ etc)
            let displayName = file.filename;
            if (file.folder_name && file.folder_name.startsWith('single_') && file.filename.length > 9) {
                displayName = file.filename.substring(9);
            }
            opt.innerText = displayName;
            subSelect.appendChild(opt);
        });

        // Restore if still exists
        if (subtitleFiles.some(f => f.filename === prevVal)) {
            subSelect.value = prevVal;
        } else {
            subSelect.value = 'none';
            applySubtitleTrack('none'); // clear subtitle track if old one vanished
        }
    }

    /**
     * Load subtitle file onto the Plyr video element dynamically
     */
    function applySubtitleTrack(filename) {
        const videoEl = document.getElementById('lightbox-video');
        if (!videoEl) return;

        // Remove previous subtitle tracks
        const oldTracks = videoEl.querySelectorAll('track');
        oldTracks.forEach(t => t.remove());

        if (!filename || filename === 'none') {
            if (player) player.toggleCaptions(false);
            return;
        }

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.srclang = 'en';
        track.label = filename.split('.').slice(0, -1).join('.'); // file name without extension
        track.src = `/api/watch-party/${window.PARTY_ID}/subtitle/${encodeURIComponent(filename)}`;
        track.default = true;

        videoEl.appendChild(track);
        track.track.mode = 'showing';
        
        if (player) {
            // Trigger Plyr caption refresh
            setTimeout(() => {
                player.toggleCaptions(true);
            }, 200);
        }
    }

    /**
     * Add a file to the room's collaborative media queue
     */
    function addToQueue(filename) {
        if (!socket) return;
        
        socket.emit('queue_add', {
            party_id: window.PARTY_ID,
            filename: filename
        });
        
        if (window.showToast) {
            // Trim display name
            let disp = filename;
            if (disp.length > 25) disp = disp.substring(0, 22) + '...';
            window.showToast(`Added to Queue: ${disp}`, 'success');
        }
    }

    /**
     * Remove a queue item at a specific index
     */
    function removeQueueItem(index) {
        if (!socket) return;
        socket.emit('queue_remove', {
            party_id: window.PARTY_ID,
            index: index
        });
    }

    /**
     * Clear all items from the queue
     */
    function clearQueue() {
        const isLocked = window.getIsPlaybackLocked();
        const isAdmin = !!window.getAdminToken();
        
        if (isLocked && !isAdmin) {
            if (window.showToast) {
                window.showToast('Playback controls are locked by the host.', 'warning');
            }
            return;
        }

        if (!socket) return;
        socket.emit('queue_clear', {
            party_id: window.PARTY_ID
        });
    }

    /**
     * Autoplay next track in the queue when the current video ends
     * Triggered by the Plyr 'ended' hook in watch_party.js
     */
    function playNextInQueue() {
        if (currentQueue.length === 0) {
            console.log("[QueueModule] Queue is empty. Autoplay finished.");
            return;
        }

        const isLocked = window.getIsPlaybackLocked();
        const isAdmin = !!window.getAdminToken();

        // Autoplay next should only be triggered by clients allowed to control playback
        if (isLocked && !isAdmin) {
            console.log("[QueueModule] Autoplay ignored (playback is locked and client is not host).");
            return;
        }

        // Pop the first item
        const nextFilename = currentQueue[0];
        console.log("[QueueModule] Autoplay loading next file:", nextFilename);
        
        // Remove from queue on server
        removeQueueItem(0);

        // Load and play the file room-wide
        if (window.selectAndBroadcastMedia) {
            window.selectAndBroadcastMedia(nextFilename);
            
            // Wait a moment for media to load, then trigger play synced
            setTimeout(() => {
                if (window.broadcastSync) {
                    window.broadcastSync('play', 0.0);
                }
            }, 800);
        }
    }

    /**
     * Renders the collaborative queue list UI in the sidebar
     */
    function renderQueueList() {
        const queueList = document.getElementById('wp-queue-list');
        if (!queueList) return;

        queueList.innerHTML = '';

        if (currentQueue.length === 0) {
            queueList.innerHTML = `
                <div class="queue-empty-state" style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                    <i class="fa-solid fa-film" style="font-size: 1.5rem; color: rgba(255,255,255,0.15);"></i>
                    <span>Queue is empty.<br>Add media using the <b>+</b> buttons.</span>
                </div>
            `;
            return;
        }

        currentQueue.forEach((filename, idx) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            item.setAttribute('draggable', 'true');
            item.setAttribute('data-index', idx);
            item.setAttribute('data-filename', filename);
            
            // Clean display name
            let displayName = filename;
            if (window.FOLDER_NAME && window.FOLDER_NAME.startsWith('single_') && filename.length > 9) {
                displayName = filename.substring(9);
            }

            // Generate thumbnail
            const isVideo = /\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v|mpg|mpeg)$/i.test(filename);
            let thumbUrl;
            if (isVideo) {
                thumbUrl = `/api/video-thumbnail/${window.FOLDER_NAME}/${filename}`;
            } else {
                thumbUrl = `/media/${window.FOLDER_NAME}/${filename}`;
            }

            item.innerHTML = `
                <div class="queue-drag-handle"><i class="fa-solid fa-grip-vertical"></i></div>
                <img src="${thumbUrl}" style="width: 44px; aspect-ratio: 16/9; object-fit: cover; border-radius: 4px; background: #0c0c0e;" onerror="this.src='https://placehold.co/80x45/101013/ffffff?text=Media'">
                <div class="queue-item-title" style="flex: 1; font-size: 0.75rem; font-weight: 600; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${displayName}">${displayName}</div>
                <button class="queue-remove-btn" title="Remove from Queue"><i class="fa-solid fa-xmark"></i></button>
            `;

            // Drag and drop event listeners
            item.addEventListener('dragstart', handleDragStart, false);
            item.addEventListener('dragenter', handleDragEnter, false);
            item.addEventListener('dragover', handleDragOver, false);
            item.addEventListener('dragleave', handleDragLeave, false);
            item.addEventListener('drop', handleDrop, false);
            item.addEventListener('dragend', handleDragEnd, false);

            // Bind remove button
            const removeBtn = item.querySelector('.queue-remove-btn');
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                
                const isLocked = window.getIsPlaybackLocked();
                const isAdmin = !!window.getAdminToken();
                
                if (isLocked && !isAdmin) {
                    if (window.showToast) {
                        window.showToast('Playback controls are locked by the host.', 'warning');
                    }
                    return;
                }
                
                removeQueueItem(idx);
            };

            queueList.appendChild(item);
        });
    }

    /* --- HTML5 Drag and Drop Handlers --- */

    function handleDragStart(e) {
        const isLocked = window.getIsPlaybackLocked();
        const isAdmin = !!window.getAdminToken();
        
        if (isLocked && !isAdmin) {
            if (window.showToast) {
                window.showToast('Playback controls are locked by the host.', 'warning');
            }
            e.preventDefault();
            return;
        }

        this.classList.add('dragging');
        dragSrcEl = this;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault(); // Necessary. Allows us to drop.
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        this.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation(); // stops the browser from redirecting.
        }

        if (dragSrcEl !== this) {
            // Reorder queue array based on DOM positions
            const queueList = document.getElementById('wp-queue-list');
            const items = Array.from(queueList.querySelectorAll('.queue-item'));
            
            const srcIndex = parseInt(dragSrcEl.getAttribute('data-index'));
            const targetIndex = parseInt(this.getAttribute('data-index'));
            
            // Move item in currentQueue array
            const movedItem = currentQueue.splice(srcIndex, 1)[0];
            currentQueue.splice(targetIndex, 0, movedItem);
            
            // Emit reorder event
            if (socket) {
                socket.emit('queue_reorder', {
                    party_id: window.PARTY_ID,
                    queue: currentQueue
                });
            }
        }
        return false;
    }

    function handleDragEnd(e) {
        const queueList = document.getElementById('wp-queue-list');
        const items = queueList.querySelectorAll('.queue-item');
        items.forEach(item => {
            item.classList.remove('dragging');
            item.classList.remove('drag-over');
        });
        dragSrcEl = null;
    }

    /**
     * Periodically check and bind HLS audio tracks
     * HLS.js might load tracks dynamically or reload on transcoding
     */
    function startPeriodicChecks() {
        setInterval(() => {
            const audioSelect = document.getElementById('wp-audio-select');
            if (!audioSelect) return;

            if (window.hlsInstance && window.hlsInstance.audioTracks) {
                const tracks = window.hlsInstance.audioTracks;
                // Only rebuild option list if count differs or it's empty
                const currentOptionsCount = audioSelect.options.length;
                if (tracks.length > 0 && currentOptionsCount !== tracks.length + 1) {
                    const activeIdx = window.hlsInstance.audioTrack;
                    audioSelect.innerHTML = '<option value="default">Default Audio</option>';
                    
                    tracks.forEach((track, idx) => {
                        const opt = document.createElement('option');
                        opt.value = idx;
                        opt.innerText = track.name || track.lang || `Track ${idx + 1}`;
                        audioSelect.appendChild(opt);
                    });
                    
                    if (activeIdx >= 0 && activeIdx < tracks.length) {
                        audioSelect.value = activeIdx.toString();
                    } else {
                        audioSelect.value = "default";
                    }
                    console.log("[QueueModule] Rebuilt audio track selection dropdown.");
                }
            } else {
                if (audioSelect.options.length > 1) {
                    audioSelect.innerHTML = '<option value="default" selected>Default Audio</option>';
                }
            }
        }, 2000);
    }
})();
