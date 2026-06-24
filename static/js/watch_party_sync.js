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
    
    // Latency calibration state
    let localLatencyOffset = 0; // estimated one-way transit delay in seconds
    let lastPingTime = 0;
    
    // Buffering state tracking
    let isLocalBuffering = false;
    const peersBuffering = new Set(); // set of client names currently buffering
    
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
    function bindSocketListeners() {
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
            isRoomPlaying = (data.action === 'play');
            
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
                player.speed = 1.0; // reset speed
                setTimeout(() => {
                    window.ignorePlayerEvents = false;
                }, 150);
            }
        });
        
        // 3. Listen for peer buffering events
        socket.on('peer_buffering_broadcast', (data) => {
            const overlay = document.getElementById('wp-buffering-overlay');
            const textEl = document.getElementById('wp-buffering-text');
            
            const myId = window.getClientId ? window.getClientId() : 'local';
            if (data.client_id === myId) return; // Skip if it's our own buffering state
            
            if (window.isImageActive) {
                if (overlay) overlay.classList.remove('active');
                return;
            }
            
            if (data.buffering) {
                peersBuffering.add(data.client_name);
                console.log(`[SyncModule] Peer ${data.client_name} started buffering.`);
            } else {
                peersBuffering.delete(data.client_name);
                console.log(`[SyncModule] Peer ${data.client_name} finished buffering.`);
            }
            
            if (peersBuffering.size > 0) {
                // Pause local playback
                window.ignorePlayerEvents = true;
                player.pause();
                setTimeout(() => { window.ignorePlayerEvents = false; }, 100);
                
                // Show buffering overlay
                if (overlay && textEl) {
                    const list = Array.from(peersBuffering).join(', ');
                    textEl.innerText = `Waiting for ${list} to buffer...`;
                    overlay.classList.add('active');
                }
            } else {
                // Hide overlay
                if (overlay) {
                    overlay.classList.remove('active');
                }
                
                // If room was playing, automatically resume
                if (isRoomPlaying && player.paused) {
                    console.log("[SyncModule] All buffers ready. Resuming playback room-wide.");
                    window.ignorePlayerEvents = true;
                    player.play().catch(() => {});
                    setTimeout(() => { window.ignorePlayerEvents = false; }, 100);
                }
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
    }
    function bindPlayerEvents() {
        if (!player) return;
        
        // 1. Detect local buffering start
        player.on('waiting', () => {
            if (window.isImageActive) return; // Ignore if viewing an image
            if (!isLocalBuffering) {
                isLocalBuffering = true;
                emitBufferingState(true);
            }
        });
        
        // 2. Detect local buffering end
        player.on('playing', () => {
            if (window.isImageActive) return; // Ignore if viewing an image
            if (isLocalBuffering) {
                isLocalBuffering = false;
                emitBufferingState(false);
            }
        });
        
        // 3. Frame-Accurate Synced Drag Scrubbing
        player.on('seeking', () => {
            if (window.ignorePlayerEvents) return;
            const now = Date.now();
            
            // Throttle to 10 FPS (100ms) to prevent Socket.IO traffic congestion
            if (now - lastScrubSync > SCRUB_THROTTLE_INTERVAL) {
                if (socket) {
                    socket.emit('scrub_sync', {
                        party_id: window.PARTY_ID,
                        client_id: window.clientId || 'local',
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
        if (!player || player.paused || !isRoomPlaying || peersBuffering.size > 0 || window.ignorePlayerEvents) {
            if (player && player.speed !== 1.0) {
                player.speed = 1.0; // reset speed if paused or inactive
            }
            return;
        }
        
        // Calculate estimated playhead position of the room
        const timeSinceSync = (Date.now() - lastSyncTime) / 1000; // in seconds
        const estimatedRoomPos = lastSyncPosition + (timeSinceSync * 1.0); // assume normal speed
        
        const localPos = player.currentTime;
        const drift = localPos - estimatedRoomPos; // positive if ahead, negative if behind
        const absDrift = Math.abs(drift);
        
        if (absDrift < 0.10) {
            // Perfect synchronization (under 100ms drift)
            if (player.speed !== 1.0) {
                player.speed = 1.0;
                console.log(`[SyncModule] Micro-drift aligned. Playback speed reset to 1.0x.`);
            }
        } else if (absDrift >= 0.10 && absDrift <= 1.0) {
            // Smooth speed compensation range (100ms to 1.0s drift)
            if (drift < 0) {
                // Local is behind: speed up slightly to catch up
                player.speed = 1.04;
                console.log(`[SyncModule] Micro-drift detected: local is behind by -${Math.round(absDrift * 1000)}ms. Speeding up to 1.04x.`);
            } else {
                // Local is ahead: slow down slightly to let others catch up
                player.speed = 0.96;
                console.log(`[SyncModule] Micro-drift detected: local is ahead by +${Math.round(absDrift * 1000)}ms. Slowing down to 0.96x.`);
            }
        } else {
            // Hard Sync (drift > 1.0s)
            // Drift is too large for speed compensation, do a silent hard seek
            console.log(`[SyncModule] Large drift detected (${Math.round(drift * 1000)}ms). Executing hard seek adjustment.`);
            window.ignorePlayerEvents = true;
            player.currentTime = estimatedRoomPos;
            player.speed = 1.0;
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
})();
