/**
 * AuraSort — Watch Party Top-Notch Playback Sync Infrastructure (Modular)
 * Handles micro-drift speed adjustments, real-time RTT latency compensation,
 * smart buffering room-wide pauses, and frame-accurate real-time drag scrubbing.
 */
(function () {
    let socket = null;
    let player = null;
    
    // Room reference timeline tracking
    let lastSyncPosition = 0;
    let lastSyncTime = 0; // ms epoch
    let isRoomPlaying = false;
    let roomSpeed = 1.0;
    
    // Latency calibration state
    let localLatencyOffset = 0; // estimated one-way transit delay in seconds
    let lastPingTime = 0;
    
    // Buffering state tracking
    let isLocalBuffering = false;
    let localBufferingTimer = null;
    const peersBuffering = new Map(); // client_id -> { name, timerId }
    const BUFFERING_TIMEOUT_MS = 9000;
    
    // Throttling for drag scrubbing
    let lastScrubSync = 0;
    const SCRUB_THROTTLE_INTERVAL = 100; // 10 FPS (100ms)
    
    // Micro-drift check timer
    let driftCheckInterval = null;
    let rttCheckInterval = null;
    
    // Initialize the module when page loads
    window.addEventListener('load', () => {
        initSyncInfrastructure();
    });
    function initSyncInfrastructure() {
        // Wait for Plyr and socket to initialize
        setupSocketAndPlayerBindingLoop();
    }
    /**
     * Periodically check for window.socket and window.player, then bind handlers
     */
    function setupSocketAndPlayerBindingLoop() {
        const checkInterval = setInterval(() => {
            // In watch_party.js, window.socket is set and plyr player is global/accessible
            const rawPlayer = document.getElementById('lightbox-video')?.__plyr;
            if (window.socket && rawPlayer) {
                socket = window.socket;
                player = rawPlayer;
                clearInterval(checkInterval);
                
                bindSocketListeners();
                bindPlayerEvents();
    
    // Throttling for drag scrubbing
    let lastScrubSync = 0;
    const SCRUB_THROTTLE_INTERVAL = 100; // 10 FPS (100ms)
    
    // Micro-drift check timer
    let driftCheckInterval = null;
    let rttCheckInterval = null;
    
    // Initialize the module when page loads
    window.addEventListener('load', () => {
        initSyncInfrastructure();
    });
    function initSyncInfrastructure() {
        // Wait for Plyr and socket to initialize
        setupSocketAndPlayerBindingLoop();
    }
    /**
     * Periodically check for window.socket and window.player, then bind handlers
     */
    function setupSocketAndPlayerBindingLoop() {
        const checkInterval = setInterval(() => {
            // In watch_party.js, window.socket is set and plyr player is global/accessible
            const rawPlayer = document.getElementById('lightbox-video')?.__plyr;
            if (window.socket && rawPlayer) {
                socket = window.socket;
                player = rawPlayer;
                clearInterval(checkInterval);
                
                bindSocketListeners();
                bindPlayerEvents();
                startSyncLoops();
                
                console.log("[SyncModule] Playback sync infrastructure bound successfully.");
            }
        }, 200);
    }
    let socketListenersBound = false;
    function bindSocketListeners() {
        if (socketListenersBound) return;
        socketListenersBound = true;
        if (!socket) return;
        
        // 1. Listen for peer latency pong responses
        socket.on('sync_pong', (data) => {
            if (data.client_timestamp) {
                const rtt = Date.now() - data.client_timestamp;
                localLatencyOffset = (rtt / 2) / 1000; // one-way delay in seconds
                console.log(`[SyncModule] RTT Calibration: RTT = ${rtt}ms, One-way Latency = ${Math.round(localLatencyOffset * 1000)}ms`);
            }
        });
        
        // 2. Intercept and record room reference timeline on sync_event
        socket.on('sync_event', (data) => {
            lastSyncPosition = data.position;
            lastSyncTime = Date.now();
            isRoomPlaying = typeof data.playing === 'boolean' ? data.playing : (data.action === 'play');
            if (data.speed !== undefined) {
                roomSpeed = Number(data.speed) || 1.0;
                window.watchPartyRoomSpeed = roomSpeed;
            }
            
            if (window.__watchPartyMainHandlesSync) {
                return;
            }
            
            // Handle Latency-Compensated Seeks / Plays
            if (data.action === 'play' || data.action === 'seek') {
                // Compute delay from host generation to local receipt
                const hostTimestamp = data.timestamp || Date.now();
                const networkDelay = (Date.now() - hostTimestamp) / 1000; // in seconds
                
                // Add the delay to target position
                const latencyCorrectedTarget = data.position + Math.max(0, networkDelay);
                
                console.log(`[SyncModule] Compensating network latency: delay = ${Math.round(networkDelay * 1000)}ms. Syncing to ${latencyCorrectedTarget.toFixed(3)}s.`);
                
                // Temporarily disable watch_party.js local player triggers to avoid echo loops
                window.ignorePlayerEvents = true;
                player.currentTime = latencyCorrectedTarget;
                
                if (data.action === 'play') {
                    player.play().catch(() => {});
                }
                
                setTimeout(() => {
                    window.ignorePlayerEvents = false;
                }, 150);
            } else if (data.action === 'pause') {
                window.ignorePlayerEvents = true;
                player.pause();
                player.speed = roomSpeed;
                setTimeout(() => {
                    window.ignorePlayerEvents = false;
                }, 150);
            }
        });

        socket.on('init_payload', (data) => {
            if (data && data.playback_state) {
                lastSyncPosition = Number(data.playback_state.position) || 0;
                lastSyncTime = Date.now();
                isRoomPlaying = !!data.playback_state.playing;
                roomSpeed = Number(data.playback_state.speed) || 1.0;
                window.watchPartyRoomSpeed = roomSpeed;
            }
            clearAllPeerBuffering();
            if (!data || !Array.isArray(data.buffering_peers)) return;

            data.buffering_peers.forEach(peer => {
                if (peer && peer.buffering) {
                    addPeerBuffering(peer.client_id, peer.client_name);
                }
            });
        });
        
        // 3. Listen for peer buffering events
        socket.on('peer_buffering_broadcast', (data) => {
            const myId = window.getClientId ? window.getClientId() : 'local';
            if (data.client_id === myId) {
                clearLocalBuffering();
                return;
            }

            if (window.isImageActive) {
                clearAllPeerBuffering();
                return;
            }
            
            if (data.buffering) {
                addPeerBuffering(data.client_id, data.client_name);
            } else {
                removePeerBuffering(data.client_id);
            }
        });

        socket.on('peer_left', (data) => {
            if (data && data.client_id) {
                removePeerBuffering(data.client_id);
            }
        });

        socket.on('peer_profile_updated', (data) => {
            if (data && data.client_id && peersBuffering.has(data.client_id)) {
                const peer = peersBuffering.get(data.client_id);
                peer.name = getPeerDisplayName(data.client_id, data.name);
                renderBufferingOverlay();
            }
        });

        socket.on('disconnect', () => {
            clearLocalBuffering();
            clearAllPeerBuffering();
        });

        socket.on('speed_changed_broadcast', (data) => {
            if (data && data.speed !== undefined) {
                roomSpeed = Number(data.speed) || 1.0;
                window.watchPartyRoomSpeed = roomSpeed;
            }
        });
        
        // 4. Listen for real-time scrub syncing
        socket.on('scrub_sync_broadcast', (data) => {
            if (player && data.position !== undefined) {
                window.ignorePlayerEvents = true;
                player.currentTime = data.position;
                setTimeout(() => { window.ignorePlayerEvents = false; }, 80);
            }
        });

        window.clearWatchPartyBufferingState = () => {
            clearLocalBuffering();
            clearAllPeerBuffering();
        };
    }
    let playerEventsBound = false;
    function bindPlayerEvents() {
        if (playerEventsBound) return;
        playerEventsBound = true;
        if (!player) return;
        
        // 1. Detect local buffering start
        player.on('waiting', () => {
            if (window.isImageActive) return; // Ignore if viewing an image
            if (!isLocalBuffering) {
                isLocalBuffering = true;
                emitBufferingState(true);
                if (localBufferingTimer) clearTimeout(localBufferingTimer);
                localBufferingTimer = setTimeout(() => {
                    console.warn("[SyncModule] Local buffering timeout reached. Clearing stale wait state.");
                    clearLocalBuffering();
                }, BUFFERING_TIMEOUT_MS);
            }
        });
        
        // 2. Detect local buffering end
        const markLocalReady = () => {
            if (window.isImageActive) return; // Ignore if viewing an image
            clearLocalBuffering();
        };
        player.on('playing', markLocalReady);
        player.on('canplay', markLocalReady);
        player.on('loadeddata', markLocalReady);
        player.on('canplaythrough', markLocalReady);
        player.on('seeked', markLocalReady);
        
        // 3. Frame-Accurate Synced Drag Scrubbing
        player.on('seeking', () => {
            if (window.ignorePlayerEvents) return;
            const now = Date.now();
            
            // Throttle to 10 FPS (100ms) to prevent Socket.IO traffic congestion
            if (now - lastScrubSync > SCRUB_THROTTLE_INTERVAL) {
                if (socket) {
                    socket.emit('scrub_sync', {
                        party_id: window.PARTY_ID,
                        client_id: window.getClientId ? window.getClientId() : 'local',
                        position: player.currentTime
                    });
                }
                lastScrubSync = now;
            }
        });
    }
    function startSyncLoops() {
        // 1. Run RTT network calibration every 10 seconds
        pingRTT();
        rttCheckInterval = setInterval(pingRTT, 10000);
        
        // 2. Run Micro-Drift Speed Compensation Loop every 2 seconds
        driftCheckInterval = setInterval(checkMicroDrift, 2000);
    }
    function pingRTT() {
        if (socket && socket.connected) {
            lastPingTime = Date.now();
            socket.emit('sync_ping', {
                client_timestamp: lastPingTime
            });
        }
    }
    /**
     * Micro-Drift Speed Compensation logic
     * Compares local playhead with estimated room reference time and silently accelerates/decelerates playback
     */
    function checkMicroDrift() {
        if (window.watchPartyRoomSpeed !== undefined) {
            roomSpeed = Number(window.watchPartyRoomSpeed) || 1.0;
        }
        if (!player || player.paused || !isRoomPlaying || peersBuffering.size > 0 || window.ignorePlayerEvents) {
            if (player && Math.abs(player.speed - roomSpeed) > 0.01) {
                player.speed = roomSpeed;
            }
            return;
        }
        
        // Calculate estimated playhead position of the room
        const timeSinceSync = (Date.now() - lastSyncTime) / 1000; // in seconds
        const estimatedRoomPos = lastSyncPosition + (timeSinceSync * roomSpeed);
        
        const localPos = player.currentTime;
        const drift = localPos - estimatedRoomPos; // positive if ahead, negative if behind
        const absDrift = Math.abs(drift);
        
        if (absDrift < 0.10) {
            // Perfect synchronization (under 100ms drift)
            if (Math.abs(player.speed - roomSpeed) > 0.01) {
                player.speed = roomSpeed;
                console.log(`[SyncModule] Micro-drift aligned. Playback speed reset to ${roomSpeed}x.`);
            }
        } else if (absDrift >= 0.10 && absDrift <= 1.0) {
            // Smooth speed compensation range (100ms to 1.0s drift)
            if (drift < 0) {
                // Local is behind: speed up slightly to catch up
                player.speed = roomSpeed * 1.04;
                console.log(`[SyncModule] Micro-drift detected: local is behind by -${Math.round(absDrift * 1000)}ms. Speeding up slightly.`);
            } else {
                // Local is ahead: slow down slightly to let others catch up
                player.speed = roomSpeed * 0.96;
                console.log(`[SyncModule] Micro-drift detected: local is ahead by +${Math.round(absDrift * 1000)}ms. Slowing down slightly.`);
            }
        } else {
            // Hard Sync (drift > 1.0s)
            // Drift is too large for speed compensation, do a silent hard seek
            console.log(`[SyncModule] Large drift detected (${Math.round(drift * 1000)}ms). Executing hard seek adjustment.`);
            window.ignorePlayerEvents = true;
            player.currentTime = estimatedRoomPos;
            player.speed = roomSpeed;
            setTimeout(() => { window.ignorePlayerEvents = false; }, 100);
        }
    }
    function emitBufferingState(isBuffering) {
        if (socket) {
            socket.emit('peer_buffering', {
                party_id: window.PARTY_ID,
                client_id: window.getClientId ? window.getClientId() : 'local',
                client_name: window.getClientName ? window.getClientName() : 'Guest',
                buffering: isBuffering
            });
        }
    }

    function clearLocalBuffering() {
        if (!isLocalBuffering) return;
        isLocalBuffering = false;
        if (localBufferingTimer) {
            clearTimeout(localBufferingTimer);
            localBufferingTimer = null;
        }
        emitBufferingState(false);
    }

    function addPeerBuffering(clientId, fallbackName) {
        if (!clientId) return;

        const existing = peersBuffering.get(clientId);
        if (existing && existing.timerId) {
            clearTimeout(existing.timerId);
        }

        const displayName = getPeerDisplayName(clientId, fallbackName);
        const timerId = setTimeout(() => {
            if (peersBuffering.has(clientId)) {
                console.warn(`[SyncModule] Buffering timeout reached for ${displayName}. Clearing stale wait state.`);
                peersBuffering.delete(clientId);
                renderBufferingOverlay();
            }
        }, BUFFERING_TIMEOUT_MS);

        peersBuffering.set(clientId, { name: displayName, timerId });
        console.log(`[SyncModule] Peer ${displayName} started buffering.`);
        renderBufferingOverlay();
    }

    function removePeerBuffering(clientId) {
        if (!clientId || !peersBuffering.has(clientId)) {
            renderBufferingOverlay();
            return;
        }

        const peer = peersBuffering.get(clientId);
        if (peer.timerId) {
            clearTimeout(peer.timerId);
        }
        peersBuffering.delete(clientId);
        console.log(`[SyncModule] Peer ${peer.name} finished buffering.`);
        renderBufferingOverlay();
    }

    function clearAllPeerBuffering() {
        peersBuffering.forEach(peer => {
            if (peer.timerId) clearTimeout(peer.timerId);
        });
        peersBuffering.clear();
        renderBufferingOverlay();
    }

    function getPeerDisplayName(clientId, fallbackName) {
        const activePeers = window.getActivePeers ? window.getActivePeers() : {};
        const peerName = activePeers && activePeers[clientId] ? activePeers[clientId].name : '';
        const trustedName = sanitizeDisplayName(peerName, true);
        const candidate = trustedName || sanitizeDisplayName(fallbackName, false);
        return candidate || 'a viewer';
    }

    function sanitizeDisplayName(name, allowSingleCharacter) {
        if (typeof name !== 'string') return '';
        const trimmed = name.trim();
        if (!trimmed) return '';
        if (trimmed.length === 1 && !allowSingleCharacter) return '';
        return trimmed.slice(0, 40);
    }

    function renderBufferingOverlay() {
        const overlay = document.getElementById('wp-buffering-overlay');
        const textEl = document.getElementById('wp-buffering-text');
        if (!overlay || !textEl) return;

        if (window.isImageActive || peersBuffering.size === 0) {
            overlay.classList.remove('active');
            resumeAfterPeerBuffering();
            return;
        }

        window.ignorePlayerEvents = true;
        player.pause();
        setTimeout(() => { window.ignorePlayerEvents = false; }, 100);

        const names = Array.from(peersBuffering.values())
            .map(peer => peer.name)
            .filter(Boolean);

        textEl.innerText = names.length === 1
            ? `Waiting for ${names[0]} to buffer...`
            : 'Waiting for viewers to buffer...';
        overlay.classList.add('active');
    }

    function resumeAfterPeerBuffering() {
        if (isRoomPlaying && player && player.paused && !window.isImageActive) {
            console.log("[SyncModule] All buffers ready. Resuming playback room-wide.");
            window.ignorePlayerEvents = true;
            player.play().catch(() => {});
            setTimeout(() => { window.ignorePlayerEvents = false; }, 100);
        }
    }
})();
