/**
 * AuraSort — Watch Party Client Controller
 * Handles synchronization, WebRTC P2P voice mesh, and playlist controls.
 */

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

(function () {
    // Unique client ID persisted per session to survive refreshes
    let clientId = sessionStorage.getItem('wp_client_id');
    if (!clientId) {
        clientId = 'client_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('wp_client_id', clientId);
    }

    let clientName = sessionStorage.getItem('wp_client_name') || 'Viewer';
    let partyPassword = sessionStorage.getItem(`wp_password_${window.PARTY_ID}`) || '';
    
    let localStream = null;
    let sseSource = null;
    let currentFilename = null;
    let mediaFilesList = [];
    let ignorePlayerEvents = false;
    let adminToken = null;
    let selectedFolder = null;
    let isPlaybackLocked = false;
    let isSlowMode = false;
    let slowModeTimer = null;
    let lastChatSentTime = 0;

    function showToast(message, type = 'info') {
        const container = document.getElementById('wp-toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = 'wp-toast';
        if (type === 'error') {
            toast.style.borderLeftColor = '#ef4444';
        } else if (type === 'success') {
            toast.style.borderLeftColor = '#22c55e';
        } else if (type === 'warning') {
            toast.style.borderLeftColor = '#eab308';
        }
        
        toast.innerText = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'none';
            toast.offsetHeight; // trigger reflow
            toast.style.transition = 'opacity 0.5s, transform 0.5s';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 500);
        }, 3500);
    }

    // WebRTC connection and audio maps
    const peerConnections = {};
    const remoteAudioElements = {};
    const activePeers = {};
    const iceCandidateQueues = {};

    // Google public STUN servers for WebRTC ICE exchange
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // Initialize Plyr player
    const player = new Plyr('#lightbox-video', {
        controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'],
        keyboard: { focused: true, global: true },
        clickToPlay: true
    });

    // Run setup after the page is fully loaded to prevent EventSource from blocking DOM load event
    window.addEventListener('load', () => {
        initAuthFlow();
    });

    /**
     * 1. Authentication Flow
     */
    function initAuthFlow() {
        // Attempt authentication with stored password (or empty)
        checkAuth(partyPassword)
            .then(authSuccess => {
                if (authSuccess) {
                    showNicknameModal();
                } else {
                    showPasswordModal();
                }
            })
            .catch(() => {
                showPasswordModal();
            });
    }

    function checkAuth(password) {
        return fetch(`/api/watch-party/${window.PARTY_ID}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        })
        .then(res => {
            if (res.ok) return true;
            if (res.status === 401) return false;
            throw new Error('Auth error');
        });
    }

    function showPasswordModal() {
        const overlay = document.getElementById('wp-password-overlay');
        overlay.classList.add('active');

        const submitBtn = document.getElementById('btn-wp-auth-submit');
        const passwordInput = document.getElementById('wp-join-password');

        const handleAuthSubmit = async () => {
            const pwd = passwordInput.value.trim();
            submitBtn.disabled = true;
            submitBtn.innerText = 'Verifying...';

            try {
                const success = await checkAuth(pwd);
                if (success) {
                    partyPassword = pwd;
                    sessionStorage.setItem(`wp_password_${window.PARTY_ID}`, pwd);
                    overlay.classList.remove('active');
                    showNicknameModal();
                } else {
                    alert('Incorrect password. Please try again.');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            } catch (err) {
                alert('An error occurred during authentication.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Unlock & Join';
            }
        };

        submitBtn.onclick = handleAuthSubmit;
        passwordInput.onkeydown = (e) => {
            if (e.key === 'Enter') handleAuthSubmit();
        };
    }

    async function setupVoiceAndStart() {
        // Request microphone permission for P2P voice chat
        try {
            addLogEntry('System', 'Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream = stream;
            
            // Mute microphone by default to prevent sudden feedback/noise
            localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
            
            updateMicUI(false);
            const btnMic = document.getElementById('btn-mic-toggle');
            btnMic.disabled = false;
            document.getElementById('local-voice-status').innerText = 'Muted';
        } catch (err) {
            console.warn('Microphone access denied or not available:', err);
            addLogEntry('System', 'Voice chat in receive-only mode (mic not allowed).');
            updateMicUI(false);
            const btnMic = document.getElementById('btn-mic-toggle');
            btnMic.disabled = true;
            document.getElementById('local-voice-status').innerText = 'Listen only';
        }

        // Bind mic toggle action
        const btnMic = document.getElementById('btn-mic-toggle');
        btnMic.onclick = () => {
            if (!localStream) return;
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                updateMicUI(audioTrack.enabled);
                document.getElementById('local-voice-status').innerText = audioTrack.enabled ? 'Voice active' : 'Muted';
            }
        };

        // Start watch party connection and load playlist
        startWatchParty();
        initChat();
    }

    function showNicknameModal() {
        // Only bypass nickname modal if we have a session name, or if we are the admin/creator of this specific party
        const isAdmin = !!localStorage.getItem('wp_admin_token_' + window.PARTY_ID);
        const storedName = sessionStorage.getItem('wp_client_name') || (isAdmin ? localStorage.getItem('wp_nickname') : null);
        
        if (storedName && storedName.trim() !== '' && storedName !== 'Viewer') {
            clientName = storedName.trim();
            sessionStorage.setItem('wp_client_name', clientName);
            
            // Setup local nickname display
            const nameDisplay = document.getElementById('local-display-name');
            if (nameDisplay) {
                nameDisplay.innerText = `${clientName} (You)`;
            }
            
            setupVoiceAndStart();
            return;
        }

        const overlay = document.getElementById('wp-nickname-overlay');
        overlay.classList.add('active');

        const submitBtn = document.getElementById('btn-wp-nickname-submit');
        const nicknameInput = document.getElementById('wp-join-nickname');

        // Restore nickname if any
        if (sessionStorage.getItem('wp_client_name')) {
            nicknameInput.value = sessionStorage.getItem('wp_client_name');
        }

        const handleNicknameSubmit = async () => {
            const name = nicknameInput.value.trim() || 'Viewer';
            clientName = name;
            sessionStorage.setItem('wp_client_name', name);
            overlay.classList.remove('active');

            // Setup local nickname display
            const nameDisplay = document.getElementById('local-display-name');
            if (nameDisplay) {
                nameDisplay.innerText = `${clientName} (You)`;
            }

            setupVoiceAndStart();
        };

        submitBtn.onclick = handleNicknameSubmit;
        nicknameInput.onkeydown = (e) => {
            if (e.key === 'Enter') handleNicknameSubmit();
        };
        nicknameInput.focus();
    }

    function updateMicUI(isActive) {
        const btnMic = document.getElementById('btn-mic-toggle');
        if (isActive) {
            btnMic.classList.add('active');
            btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        } else {
            btnMic.classList.remove('active');
            btnMic.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        }
    }

    /**
     * 2. Playlist & Media Loading
     */
    async function startWatchParty() {
        addLogEntry('System', 'Connecting to watch party stream...');

        // Verify admin privileges
        checkAdminStatus();

        // Format active folder name initially if it's a custom uploaded media room
        const badgeEl = document.getElementById('wp-active-folder-name');
        if (badgeEl && window.FOLDER_NAME && window.FOLDER_NAME.startsWith('single_')) {
            badgeEl.innerText = 'Custom Media';
        }

        // Fetch folder media files
        try {
            const res = await fetch(`/api/profile/${window.FOLDER_NAME}/media`);
            const data = await res.json();
            if (data.status === 'success') {
                mediaFilesList = data.files || [];
                renderPlaylist(mediaFilesList);
            } else {
                addLogEntry('System', 'Error loading playlist.');
            }
        } catch (err) {
            console.error('Error fetching playlist:', err);
            addLogEntry('System', 'Failed to retrieve media playlist.');
        }

        // Establish Socket.IO connection
        const storedToken = localStorage.getItem('wp_admin_token_' + window.PARTY_ID);
        const socket = io({
            transports: ['websocket', 'polling']
        });
        window.socket = socket;

        socket.on('connect', () => {
            addLogEntry('System', 'Connected! Waiting for synchronizations...');
            socket.emit('join', {
                party_id: window.PARTY_ID,
                client_id: clientId,
                client_name: clientName,
                admin_token: storedToken
            });
        });

        socket.on('disconnect', () => {
            addLogEntry('System', 'Connection lost. Reconnecting...');
        });

        socket.on('error', (errData) => {
            console.error('Socket.IO Error:', errData);
            showToast(errData.message || 'Connection error', 'danger');
        });

        socket.on('init_payload', (data) => {
            if (data.turn_server) {
                const rawUrl = data.turn_server.trim();
                const urls = [rawUrl];
                
                // Automatically generate TCP, TLS, and standard port variants of the TURN server for high reliability
                const match = rawUrl.match(/^(turns?:)?([^?]+)/i);
                if (match) {
                    const hostAndPort = match[2];
                    urls.push(`turn:${hostAndPort}?transport=tcp`);
                    urls.push(`turns:${hostAndPort}`);
                    urls.push(`turns:${hostAndPort}?transport=tcp`);
                    
                    const hostOnly = hostAndPort.split(':')[0];
                    urls.push(`turn:${hostOnly}:80`);
                    urls.push(`turn:${hostOnly}:80?transport=tcp`);
                    urls.push(`turns:${hostOnly}:443`);
                    urls.push(`turns:${hostOnly}:443?transport=tcp`);
                }
                
                const uniqueUrls = [...new Set(urls)];
                console.log("Configuring WebRTC with expanded TURN servers:", uniqueUrls);
                
                rtcConfig.iceServers = [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { 
                        urls: uniqueUrls,
                        username: data.turn_username,
                        credential: data.turn_credential
                    }
                ];
            }
            handleSSEMessage({ type: 'init', ...data });
        });

        socket.on('peer_joined', (data) => {
            handleSSEMessage({ type: 'peer_joined', ...data });
        });

        socket.on('peer_left', (data) => {
            handleSSEMessage({ type: 'peer_left', ...data });
        });

        socket.on('sync_event', (data) => {
            handleSSEMessage({ type: 'sync', ...data });
        });

        socket.on('chat_event', (data) => {
            handleSSEMessage({ type: 'chat', ...data });
        });

        socket.on('signal_event', (data) => {
            handleSSEMessage({ type: 'signal', ...data });
        });

        socket.on('folder_changed', (data) => {
            handleSSEMessage({ type: 'folder_changed', ...data });
        });

        socket.on('playback_locked', (data) => {
            handleSSEMessage({ type: 'playback_locked', ...data });
        });

        socket.on('settings_changed', (data) => {
            handleSSEMessage({ type: 'settings_changed', ...data });
        });

        socket.on('kicked', (data) => {
            handleSSEMessage({ type: 'kicked', ...data });
        });

        socket.on('kicked_direct', () => {
            handleSSEMessage({ type: 'kicked' });
        });

        socket.on('force_mute', (data) => {
            handleSSEMessage({ type: 'force_mute', ...data });
        });

        socket.on('party_ended', (data) => {
            handleSSEMessage({ type: 'party_ended', ...data });
        });

        socket.on('chat_delete', (data) => {
            handleSSEMessage({ type: 'chat_delete', ...data });
        });

        socket.on('chat_clear', (data) => {
            handleSSEMessage({ type: 'chat_clear', ...data });
        });

        // Bind local player events to broadcast modifications
        player.on('play', () => {
            if (ignorePlayerEvents) return;
            if (isPlaybackLocked && !adminToken) {
                showToast('Playback is locked by the host.', 'warning');
                ignorePlayerEvents = true;
                player.pause();
                setTimeout(() => { ignorePlayerEvents = false; }, 100);
                return;
            }
            broadcastSync('play', player.currentTime);
        });

        player.on('pause', () => {
            if (ignorePlayerEvents) return;
            if (isPlaybackLocked && !adminToken) {
                showToast('Playback is locked by the host.', 'warning');
                return;
            }
            broadcastSync('pause', player.currentTime);
        });

        player.on('seeked', () => {
            if (ignorePlayerEvents) return;
            if (isPlaybackLocked && !adminToken) {
                showToast('Playback is locked by the host.', 'warning');
                return;
            }
            broadcastSync('seek', player.currentTime);
        });
    }

    function renderPlaylist(files) {
        const playlistGrid = document.getElementById('wp-playlist-grid');
        playlistGrid.innerHTML = '';

        if (files.length === 0) {
            playlistGrid.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted); padding: 1rem;">No media files in this folder.</div>';
            return;
        }

        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.setAttribute('data-filename', file.filename);
            if (file.filename === currentFilename) {
                item.classList.add('active');
            }

            let thumbUrl;
            if (file.is_video) {
                thumbUrl = `/api/video-thumbnail/${file.folder_name}/${file.filename}`;
            } else {
                thumbUrl = `/media/${file.folder_name}/${file.filename}`;
            }

            let displayName = file.filename;
            if (file.folder_name && file.folder_name.startsWith('single_') && file.filename.length > 9) {
                displayName = file.filename.substring(9);
            }

            item.innerHTML = `
                <img src="${thumbUrl}" alt="${displayName}" onerror="this.src='https://placehold.co/160x90/101013/ffffff?text=${encodeURIComponent(displayName)}'">
                <div class="playlist-item-title">${displayName}</div>
            `;

            item.onclick = () => {
                if (isPlaybackLocked && !adminToken) {
                    showToast('Playlist is locked by the host.', 'warning');
                    return;
                }
                if (file.filename === currentFilename) return;
                selectAndBroadcastMedia(file.filename);
            };

            playlistGrid.appendChild(item);
        });
    }

    function selectAndBroadcastMedia(filename) {
        loadMediaFile(filename).then(() => {
            // New selection starts paused at 0.0
            broadcastSync('pause', 0.0);
        });
    }

    function loadMediaFile(filename) {
        return new Promise(async (resolve) => {
            console.log('Loading file:', filename);
            currentFilename = filename;

            // Highlight in playlist grid
            const items = document.querySelectorAll('.playlist-item');
            items.forEach(item => {
                if (item.getAttribute('data-filename') === filename) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(filename);
            const mediaUrl = `/media/${window.FOLDER_NAME}/${filename}`;

            const plyrContainer = document.querySelector('.plyr');
            let imagePlayer = document.getElementById('lightbox-image');

            if (!imagePlayer) {
                imagePlayer = document.createElement('img');
                imagePlayer.id = 'lightbox-image';
                imagePlayer.style.width = '100%';
                imagePlayer.style.height = '100%';
                imagePlayer.style.objectFit = 'contain';
                imagePlayer.style.display = 'none';
                const wrapper = document.querySelector('.video-wrapper');
                if (wrapper) wrapper.appendChild(imagePlayer);
            }

            if (isImage) {
                if (plyrContainer) plyrContainer.style.display = 'none';
                imagePlayer.src = mediaUrl;
                imagePlayer.style.display = 'block';
                resolve();
            } else {
                imagePlayer.style.display = 'none';
                if (plyrContainer) plyrContainer.style.display = 'block';

                // Check for HLS optimization on the server
                let activeUrl = mediaUrl;
                let isHlsPlaying = false;
                try {
                    const trRes = await fetch(`/api/watch-party/${window.PARTY_ID}/transcode`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder_name: window.FOLDER_NAME, filename: filename })
                    });
                    const trData = await trRes.json();
                    if (trData.status === 'ready' || trData.status === 'converting') {
                        activeUrl = trData.hls_url;
                        isHlsPlaying = true;
                        if (trData.status === 'converting') {
                            showToast('Optimizing video stream (HLS)...', 'info');
                        }
                    }
                } catch (err) {
                    console.warn('HLS request failed, playing raw file instead.', err);
                }

                // Clean up previous HLS instance
                if (window.hlsInstance) {
                    window.hlsInstance.destroy();
                    window.hlsInstance = null;
                }

                const videoEl = document.getElementById('lightbox-video');

                if (isHlsPlaying && Hls.isSupported() && videoEl) {
                    const hls = new Hls({
                        maxMaxBufferLength: 8,
                        liveSyncPosition: 1.5
                    });
                    hls.loadSource(activeUrl);
                    hls.attachMedia(videoEl);
                    window.hlsInstance = hls;

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        resolve();
                    });

                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            console.warn('HLS stream fatal error, falling back to raw MP4:', data);
                            hls.destroy();
                            window.hlsInstance = null;
                            player.source = {
                                type: 'video',
                                sources: [{ src: mediaUrl, type: 'video/mp4' }]
                            };
                            resolve();
                        }
                    });
                } else {
                    player.source = {
                        type: 'video',
                        sources: [
                            {
                                src: mediaUrl,
                                type: 'video/mp4'
                            }
                        ]
                    };
                    player.once('ready', () => {
                        resolve();
                    });
                }
            }
        });
    }

    /**
     * 3. Sync and SSE Signal Handling
     */
    function handleSSEMessage(data) {
        switch (data.type) {
            case 'init':
                // Initial playback state
                isPlaybackLocked = data.playback_locked || false;
                isSlowMode = data.slow_mode || false;
                
                const lockOverlay = document.getElementById('wp-player-lock-overlay');
                if (lockOverlay) {
                    if (isPlaybackLocked && !adminToken) {
                        lockOverlay.classList.add('active');
                    } else {
                        lockOverlay.classList.remove('active');
                    }
                }
                
                if (isSlowMode && !adminToken) {
                    startSlowModeCooldown();
                }

                if (data.playback_state && data.playback_state.filename) {
                    const ps = data.playback_state;
                    loadMediaFile(ps.filename).then(() => {
                        ignorePlayerEvents = true;
                        player.currentTime = ps.position;
                        if (ps.playing) {
                            player.play().then(() => {
                                setTimeout(() => { ignorePlayerEvents = false; }, 500);
                            });
                        } else {
                            player.pause();
                            setTimeout(() => { ignorePlayerEvents = false; }, 500);
                        }
                    });
                } else if (mediaFilesList.length > 0) {
                    // Default to first file
                    loadMediaFile(mediaFilesList[0].filename);
                }

                // Register existing peers
                if (data.peers) {
                    data.peers.forEach(peer => {
                        activePeers[peer.client_id] = { name: peer.name, is_admin: peer.is_admin || false };
                    });
                    updatePeersUI();
                }
                break;

            case 'peer_joined':
                addLogEntry('System', `${data.name} joined the watch party.`);
                addSystemChatMessage(`${data.name} joined the room.`);
                activePeers[data.client_id] = { name: data.name, is_admin: data.is_admin || false };
                updatePeersUI();

                // Existing client initiates connection to the newly joined peer
                createPeerConnection(data.client_id, true);
                break;

            case 'peer_left':
                addLogEntry('System', `${data.name} left the watch party.`);
                addSystemChatMessage(`${data.name} left the room.`);
                
                // Cleanup peer connection
                if (peerConnections[data.client_id]) {
                    try { peerConnections[data.client_id].close(); } catch (e) {}
                    delete peerConnections[data.client_id];
                }
                // Cleanup remote audio node
                if (remoteAudioElements[data.client_id]) {
                    try { 
                        remoteAudioElements[data.client_id].pause();
                        remoteAudioElements[data.client_id].remove(); 
                    } catch (e) {}
                    delete remoteAudioElements[data.client_id];
                }
                delete activePeers[data.client_id];
                delete iceCandidateQueues[data.client_id];
                updatePeersUI();
                break;

            case 'sync':
                if (data.sender_id === clientId) return;
                const senderName = activePeers[data.sender_id]?.name || 'Someone';
                
                if (data.action === 'play') {
                    addLogEntry(senderName, `Played the video at ${formatTime(data.position)}`);
                } else if (data.action === 'pause') {
                    addLogEntry(senderName, `Paused the video`);
                } else if (data.action === 'seek') {
                    addLogEntry(senderName, `Seeked to ${formatTime(data.position)}`);
                }
                
                handleIncomingSync(data.action, data.position, data.filename);
                break;

            case 'folder_changed':
                const displayFolderName = data.folder_name.startsWith('single_') ? 'Custom Media' : data.folder_name;
                addSystemChatMessage(`Admin switched folder to: ${displayFolderName}`);
                addLogEntry('System', `Admin switched folder to: ${displayFolderName}`);
                window.FOLDER_NAME = data.folder_name;
                const badgeEl = document.getElementById('wp-active-folder-name');
                if (badgeEl) {
                    badgeEl.innerText = displayFolderName;
                }
                mediaFilesList = data.files || [];
                renderPlaylist(mediaFilesList);
                if (mediaFilesList.length > 0) {
                    loadMediaFile(mediaFilesList[0].filename).then(() => {
                        // Reset player to paused at 0.0
                        ignorePlayerEvents = true;
                        player.currentTime = 0;
                        player.pause();
                        setTimeout(() => { ignorePlayerEvents = false; }, 500);
                    });
                } else {
                    currentFilename = null;
                    const plyrContainer = document.querySelector('.plyr');
                    if (plyrContainer) plyrContainer.style.display = 'none';
                    const imagePlayer = document.getElementById('lightbox-image');
                    if (imagePlayer) imagePlayer.style.display = 'none';
                }
                break;

            case 'chat':
                const isSelf = data.client_id === clientId;
                const timeStr = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                addChatMessage(data.name, data.message, timeStr, isSelf, data.id, data.is_admin || false);
                break;

            case 'kicked':
                if (window.socket) window.socket.disconnect();
                Object.keys(peerConnections).forEach(id => {
                    try { peerConnections[id].close(); } catch(e) {}
                });
                document.getElementById('wp-kicked-overlay').classList.add('active');
                break;
                
            case 'force_mute':
                if (localStream) {
                    const audioTrack = localStream.getAudioTracks()[0];
                    if (audioTrack && audioTrack.enabled) {
                        audioTrack.enabled = false;
                        updateMicUI(false);
                        document.getElementById('local-voice-status').innerText = 'Muted';
                        showToast('You have been muted by the host.', 'warning');
                    }
                }
                break;
                
            case 'playback_locked':
                isPlaybackLocked = data.locked;
                const overlay = document.getElementById('wp-player-lock-overlay');
                if (overlay) {
                    if (isPlaybackLocked && !adminToken) {
                        overlay.classList.add('active');
                    } else {
                        overlay.classList.remove('active');
                    }
                }
                showToast(isPlaybackLocked ? 'Playback has been locked by the host.' : 'Playback has been unlocked.', 'info');
                break;
                
            case 'chat_delete':
                const msgEl = document.getElementById(`chat-msg-${data.message_id}`);
                if (msgEl) msgEl.remove();
                break;
                
            case 'chat_clear':
                const chatContainer = document.getElementById('wp-chat-messages');
                if (chatContainer) {
                    chatContainer.innerHTML = '';
                    addSystemChatMessage('Chat history was cleared by the host.');
                }
                break;
                
            case 'party_ended':
                if (window.socket) window.socket.disconnect();
                Object.keys(peerConnections).forEach(id => {
                    try { peerConnections[id].close(); } catch(e) {}
                });
                document.getElementById('wp-ended-overlay').classList.add('active');
                break;
                
            case 'settings_changed':
                if (data.slow_mode !== undefined) {
                    isSlowMode = data.slow_mode;
                    showToast(isSlowMode ? 'Slow mode enabled by host.' : 'Slow mode disabled.', 'info');
                    if (isSlowMode && !adminToken) {
                        startSlowModeCooldown();
                    } else {
                        if (slowModeTimer) clearInterval(slowModeTimer);
                        const chatInput = document.getElementById('wp-chat-input');
                        const sendBtn = document.getElementById('btn-chat-send');
                        if (chatInput && sendBtn) {
                            chatInput.placeholder = 'Type a message...';
                            chatInput.disabled = false;
                            sendBtn.disabled = false;
                        }
                    }
                }
                if (data.expires_at !== undefined) {
                    showToast(`Party duration extended until ${data.expires_at}.`, 'success');
                    const label = document.getElementById('admin-expiry-label');
                    if (label) label.innerText = data.expires_at;
                }
                break;

            case 'signal':
                if (data.sender_id === clientId) return;
                handleIncomingSignal(data.sender_id, data.signal);
                break;
        }
    }

    function handleIncomingSync(action, position, filename) {
        ignorePlayerEvents = true;

        if (filename && currentFilename !== filename) {
            loadMediaFile(filename).then(() => {
                player.currentTime = position;
                if (action === 'play') {
                    player.play().then(() => {
                        setTimeout(() => { ignorePlayerEvents = false; }, 500);
                    });
                } else {
                    player.pause();
                    setTimeout(() => { ignorePlayerEvents = false; }, 500);
                }
            });
            return;
        }

        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(currentFilename);
        if (isImage) {
            ignorePlayerEvents = false;
            return;
        }

        if (Math.abs(player.currentTime - position) > 2.0) {
            player.currentTime = position;
        }

        if (action === 'play') {
            player.play().then(() => {
                setTimeout(() => { ignorePlayerEvents = false; }, 500);
            }).catch(e => {
                console.warn('Playback blocked by browser:', e);
                setTimeout(() => { ignorePlayerEvents = false; }, 500);
            });
        } else {
            player.pause();
            setTimeout(() => { ignorePlayerEvents = false; }, 500);
        }
    }

    function broadcastSync(action, position) {
        if (!currentFilename) return;
        if (window.socket && window.socket.connected) {
            window.socket.emit('sync', {
                party_id: window.PARTY_ID,
                client_id: clientId,
                action: action,
                position: position,
                filename: currentFilename
            });
        }
    }

    /**
     * 4. WebRTC Mesh Audio Core
     */
    function createPeerConnection(peerId, isInitiator) {
        if (peerConnections[peerId]) {
            try { peerConnections[peerId].close(); } catch(e) {}
            delete peerConnections[peerId];
        }

        console.log(`Setting up RTCPeerConnection for peer ${peerId}, initiator: ${isInitiator}`);
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[peerId] = pc;

        // Add local microphone tracks if available
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        // ICE candidate callback
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal(peerId, {
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        // State changes
        pc.onconnectionstatechange = () => {
            console.log(`WebRTC connection state with ${peerId}: ${pc.connectionState}`);
            const indicator = document.getElementById(`voice-${peerId}`);
            if (pc.connectionState === 'connected') {
                if (indicator) indicator.classList.remove('muted');
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                if (indicator) indicator.classList.add('muted');
            }
        };

        // Receive remote track
        pc.ontrack = (event) => {
            console.log(`Received remote audio track from peer ${peerId}`);
            const stream = event.streams[0];
            playRemoteStream(peerId, stream);
        };

        // If initiator, send offer
        if (isInitiator) {
            pc.createOffer({ offerToReceiveAudio: true })
                .then(offer => {
                    return pc.setLocalDescription(offer).then(() => offer);
                })
                .then(offer => {
                    sendSignal(peerId, offer);
                })
                .catch(err => {
                    console.error(`Error generating offer for peer ${peerId}:`, err);
                });
        }

        return pc;
    }

    function handleIncomingSignal(senderId, signal) {
        let pc = peerConnections[senderId];

        if (signal.type === 'offer') {
            if (!pc) {
                pc = createPeerConnection(senderId, false);
            }
            pc.setRemoteDescription(new RTCSessionDescription(signal))
                .then(() => {
                    processIceQueue(senderId);
                    return pc.createAnswer();
                })
                .then(answer => {
                    return pc.setLocalDescription(answer).then(() => answer);
                })
                .then(answer => {
                    sendSignal(senderId, answer);
                })
                .catch(err => console.error(`Error processing offer from ${senderId}:`, err));

        } else if (signal.type === 'answer') {
            if (pc) {
                pc.setRemoteDescription(new RTCSessionDescription(signal))
                    .then(() => {
                        processIceQueue(senderId);
                    })
                    .catch(err => console.error(`Error setting remote description from answer of ${senderId}:`, err));
            }
        } else if (signal.type === 'candidate') {
            handleCandidate(senderId, signal.candidate);
        }
    }

    function sendSignal(targetId, signalData) {
        if (window.socket && window.socket.connected) {
            window.socket.emit('signal', {
                party_id: window.PARTY_ID,
                sender_id: clientId,
                target_id: targetId,
                signal: signalData
            });
        }
    }

    function handleCandidate(peerId, candidate) {
        const pc = peerConnections[peerId];
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(e => console.error('Error adding ice candidate:', e));
        } else {
            if (!iceCandidateQueues[peerId]) iceCandidateQueues[peerId] = [];
            iceCandidateQueues[peerId].push(candidate);
        }
    }

    function processIceQueue(peerId) {
        const pc = peerConnections[peerId];
        const queue = iceCandidateQueues[peerId];
        if (!pc || !queue) return;

        while (queue.length > 0) {
            const candidate = queue.shift();
            pc.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(e => console.error('Error adding queued ICE candidate:', e));
        }
    }

    function playRemoteStream(peerId, stream) {
        // Stop and remove existing audio tag if any
        if (remoteAudioElements[peerId]) {
            try { 
                remoteAudioElements[peerId].pause();
                remoteAudioElements[peerId].remove(); 
            } catch(e) {}
            delete remoteAudioElements[peerId];
        }

        const audio = document.createElement('audio');
        audio.id = `audio-remote-${peerId}`;
        audio.autoplay = true;
        audio.controls = false;
        
        // Use layout-aware styles instead of display: none to prevent Chromium from muting/suspending the audio track
        audio.style.position = 'fixed';
        audio.style.width = '1px';
        audio.style.height = '1px';
        audio.style.opacity = '0';
        audio.style.pointerEvents = 'none';
        
        audio.srcObject = stream;

        document.body.appendChild(audio);
        remoteAudioElements[peerId] = audio;

        // Force playback to resolve autoplay policy blockages
        audio.play().catch(err => {
            console.warn(`Autoplay blocked remote audio for peer ${peerId}:`, err);
            const unmuteOnInteract = () => {
                audio.play().then(() => {
                    document.removeEventListener('click', unmuteOnInteract);
                });
            };
            document.addEventListener('click', unmuteOnInteract);
        });

        // Start Speech Detection for local speaking indicator
        monitorStreamSpeech(stream, peerId);
    }

    /**
     * 5. Speech Level Detection (Analyser)
     */
    function monitorStreamSpeech(stream, peerId) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            const audioCtx = new AudioContextClass();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            source.connect(analyser);

            const checkInterval = setInterval(() => {
                const indicator = document.getElementById(`voice-${peerId}`);
                if (!indicator) {
                    clearInterval(checkInterval);
                    audioCtx.close();
                    return;
                }

                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                // Threshold level for active speech
                if (average > 12) {
                    indicator.classList.add('speaking');
                    indicator.classList.remove('muted');
                } else {
                    indicator.classList.remove('speaking');
                }
            }, 120);

        } catch (err) {
            console.error('Error initializing remote speech analyser for peer', peerId, err);
        }
    }

    /**
     * 6. Helpers
     */
    function updatePeersUI() {
        const peersList = document.getElementById('wp-peers-list');
        if (!peersList) return;

        peersList.innerHTML = '';

        const countSpan = document.getElementById('wp-participant-count');
        if (countSpan) {
            countSpan.innerText = Object.keys(activePeers).length + 1;
        }

        Object.keys(activePeers).forEach(peerId => {
            const peer = activePeers[peerId];
            const peerItem = document.createElement('div');
            peerItem.className = 'peer-item';
            peerItem.id = `peer-${peerId}`;

            const pc = peerConnections[peerId];
            const isMuted = !pc || pc.connectionState !== 'connected';
            const crownHtml = peer.is_admin ? '<i class="fa-solid fa-crown crown-badge" title="Host"></i>' : '';
            
            let actionsHtml = '';
            if (adminToken && !peer.is_admin) {
                actionsHtml = `
                    <div class="peer-actions">
                        <button class="btn-peer-action mute" onclick="adminForceMute('${peerId}', '${peer.name}')" title="Force Mute"><i class="fa-solid fa-microphone-slash"></i></button>
                        <button class="btn-peer-action kick" onclick="adminKickPeer('${peerId}', '${peer.name}')" title="Kick"><i class="fa-solid fa-user-slash"></i></button>
                    </div>
                `;
            }

            peerItem.innerHTML = `
                <div class="peer-name">
                    ${crownHtml}
                    <i class="fa-solid fa-user"></i>
                    <span>${peer.name}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${actionsHtml}
                    <div class="voice-indicator ${isMuted ? 'muted' : ''}" id="voice-${peerId}"></div>
                </div>
            `;
            peersList.appendChild(peerItem);
        });
    }

    window.adminForceMute = (peerId, peerName) => {
        if (!adminToken) return;
        if (!confirm(`Are you sure you want to force mute ${peerName}?`)) return;
        
        fetch(`/api/watch-party/${window.PARTY_ID}/force-mute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_token: adminToken,
                client_id: peerId
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                showToast(`Force mute request sent for ${peerName}.`, 'success');
            } else {
                showToast('Failed to force mute user.', 'error');
            }
        });
    };

    window.adminKickPeer = (peerId, peerName) => {
        if (!adminToken) return;
        if (!confirm(`Are you sure you want to kick ${peerName}?`)) return;
        
        fetch(`/api/watch-party/${window.PARTY_ID}/kick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_token: adminToken,
                client_id: peerId
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                showToast(`${peerName} has been kicked.`, 'success');
            } else {
                showToast('Failed to kick user.', 'error');
            }
        });
    };

    function startSlowModeCooldown() {
        const chatInput = document.getElementById('wp-chat-input');
        const sendBtn = document.getElementById('btn-chat-send');
        if (!chatInput || !sendBtn) return;
        
        let remaining = 10;
        chatInput.disabled = true;
        sendBtn.disabled = true;
        
        if (slowModeTimer) clearInterval(slowModeTimer);
        
        slowModeTimer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(slowModeTimer);
                chatInput.placeholder = 'Type a message...';
                chatInput.disabled = false;
                sendBtn.disabled = false;
                chatInput.focus();
            } else {
                chatInput.placeholder = `Slow mode active (${remaining}s)...`;
            }
        }, 1000);
    }

    function initChat() {
        const chatInput = document.getElementById('wp-chat-input');
        const sendBtn = document.getElementById('btn-chat-send');

        if (!chatInput || !sendBtn) return;

        const sendMessage = () => {
            const msgText = chatInput.value.trim();
            if (!msgText) return;

            if (isSlowMode && !adminToken) {
                const now = Date.now();
                const elapsed = now - lastChatSentTime;
                if (elapsed < 10000) {
                    const remaining = Math.ceil((10000 - elapsed) / 1000);
                    showToast(`Slow mode active. Please wait ${remaining}s.`, 'warning');
                    return;
                }
            }

            chatInput.value = '';
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

            if (window.socket && window.socket.connected) {
                window.socket.emit('chat', {
                    party_id: window.PARTY_ID,
                    client_id: clientId,
                    message: msgText
                });
                lastChatSentTime = Date.now();
                if (isSlowMode && !adminToken) {
                    startSlowModeCooldown();
                }
            } else {
                showToast('Disconnected from server.', 'error');
            }
        };

        sendBtn.onclick = sendMessage;
        chatInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        };
    }

    window.deleteChatMessage = (messageId) => {
        if (!adminToken) return;
        fetch(`/api/watch-party/${window.PARTY_ID}/delete-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_token: adminToken,
                message_id: messageId
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'error') {
                showToast(data.message, 'error');
            }
        })
        .catch(err => console.error('Error deleting message:', err));
    };

    function addChatMessage(sender, text, timeStr, isSelf, msgId = null, isSenderAdmin = false) {
        const messagesContainer = document.getElementById('wp-chat-messages');
        if (!messagesContainer) return;

        const entry = document.createElement('div');
        entry.className = `chat-entry ${isSelf ? 'outgoing' : 'incoming'}`;
        if (msgId) {
            entry.id = `chat-msg-${msgId}`;
        }
        
        const crownHtml = isSenderAdmin ? '<i class="fa-solid fa-crown crown-badge" title="Host"></i>' : '';
        const deleteBtnHtml = (adminToken && msgId) 
            ? `<button class="btn-msg-delete" onclick="deleteChatMessage('${msgId}')" title="Delete Message"><i class="fa-solid fa-xmark"></i></button>` 
            : '';

        entry.innerHTML = `
            <span class="chat-sender">${crownHtml}${sender}</span>
            <span>${escapeHTML(text)}</span>
            <span class="chat-time">${timeStr}</span>
            ${deleteBtnHtml}
        `;
        
        messagesContainer.appendChild(entry);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function addSystemChatMessage(text) {
        const messagesContainer = document.getElementById('wp-chat-messages');
        if (!messagesContainer) return;

        const entry = document.createElement('div');
        entry.className = 'chat-entry system';
        entry.innerText = text;
        
        messagesContainer.appendChild(entry);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    function addLogEntry(sender, message) {
        const container = document.getElementById('wp-logs-container');
        if (!container) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        entry.innerHTML = `<span class="log-time">${sender}</span> ${message}`;
        container.appendChild(entry);

        container.scrollTop = container.scrollHeight;
    }

    function formatTime(secs) {
        if (isNaN(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function checkAdminStatus() {
        const storedToken = localStorage.getItem('wp_admin_token_' + window.PARTY_ID);
        if (!storedToken) return;

        fetch(`/api/watch-party/${window.PARTY_ID}/is-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: storedToken })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.is_admin) {
                adminToken = storedToken;
                setupAdminUI();
            }
        })
        .catch(err => console.error('Error verifying admin token:', err));
    }

    function setupAdminUI() {
        const btnChangeFolder = document.getElementById('btn-wp-change-folder');
        if (btnChangeFolder) {
            btnChangeFolder.style.display = 'inline-block';
            btnChangeFolder.onclick = () => {
                openFolderSwitcherModal();
            };
        }

        const btnAdminPanel = document.getElementById('btn-wp-admin-panel');
        if (btnAdminPanel) {
            btnAdminPanel.style.display = 'inline-flex';
            btnAdminPanel.onclick = () => {
                document.getElementById('wp-admin-overlay').classList.add('active');
                const expiryLabel = document.getElementById('admin-expiry-label');
                if (expiryLabel && expiryLabel.innerText === 'Loading...') {
                    expiryLabel.innerText = 'Active (24h default)';
                }
            };
        }

        const btnAdminClose = document.getElementById('btn-wp-admin-close');
        if (btnAdminClose) {
            btnAdminClose.onclick = () => {
                document.getElementById('wp-admin-overlay').classList.remove('active');
            };
        }

        const togglePlaybackLock = document.getElementById('admin-toggle-playback-lock');
        if (togglePlaybackLock) {
            togglePlaybackLock.checked = isPlaybackLocked;
            togglePlaybackLock.onchange = () => {
                fetch(`/api/watch-party/${window.PARTY_ID}/playback-lock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        locked: togglePlaybackLock.checked
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        showToast(data.locked ? 'Playback locked.' : 'Playback unlocked.', 'success');
                    } else {
                        showToast('Error setting playback lock.', 'error');
                        togglePlaybackLock.checked = !togglePlaybackLock.checked;
                    }
                });
            };
        }

        const toggleSlowMode = document.getElementById('admin-toggle-slow-mode');
        if (toggleSlowMode) {
            toggleSlowMode.checked = isSlowMode;
            toggleSlowMode.onchange = () => {
                fetch(`/api/watch-party/${window.PARTY_ID}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        slow_mode: toggleSlowMode.checked
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        showToast(data.slow_mode ? 'Slow mode enabled.' : 'Slow mode disabled.', 'success');
                    } else {
                        showToast('Error setting slow mode.', 'error');
                        toggleSlowMode.checked = !toggleSlowMode.checked;
                    }
                });
            };
        }

        const btnClearChat = document.getElementById('btn-admin-clear-chat');
        if (btnClearChat) {
            btnClearChat.onclick = () => {
                if (!confirm('Clear chat history for all participants?')) return;
                fetch(`/api/watch-party/${window.PARTY_ID}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        clear_chat: true
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        showToast('Chat cleared.', 'success');
                    }
                });
            };
        }

        const btnSavePassword = document.getElementById('btn-admin-save-password');
        const adminPasswordInput = document.getElementById('admin-room-password');
        if (btnSavePassword && adminPasswordInput) {
            btnSavePassword.onclick = () => {
                const pwd = adminPasswordInput.value.trim();
                if (!pwd) return;
                fetch(`/api/watch-party/${window.PARTY_ID}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        password: pwd
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        showToast('Access password set successfully.', 'success');
                        adminPasswordInput.value = '';
                    } else {
                        showToast('Error setting password.', 'error');
                    }
                });
            };
        }

        const btnRemovePassword = document.getElementById('btn-admin-remove-password');
        if (btnRemovePassword) {
            btnRemovePassword.onclick = () => {
                fetch(`/api/watch-party/${window.PARTY_ID}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        password: ''
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        showToast('Password protection removed.', 'success');
                    }
                });
            };
        }

        const extendButtons = document.querySelectorAll('.btn-wp-extend-hours');
        extendButtons.forEach(btn => {
            btn.onclick = () => {
                const hours = parseInt(btn.getAttribute('data-hours'));
                fetch(`/api/watch-party/${window.PARTY_ID}/extend`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        hours: hours
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        showToast(`Extended party duration by ${hours} hours.`, 'success');
                        document.getElementById('admin-expiry-label').innerText = data.expires_at;
                    } else {
                        showToast('Failed to extend room.', 'error');
                    }
                });
            };
        });

        const btnEndParty = document.getElementById('btn-admin-end-party');
        if (btnEndParty) {
            btnEndParty.onclick = () => {
                if (!confirm('Are you sure you want to end this watch party session now? All connected participants will be disconnected.')) return;
                fetch(`/api/watch-party/${window.PARTY_ID}/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        document.getElementById('wp-admin-overlay').classList.remove('active');
                    }
                });
            };
        }
    }

    function openFolderSwitcherModal() {
        const overlay = document.getElementById('wp-change-folder-overlay');
        const container = document.getElementById('wp-folders-list-container');
        const confirmBtn = document.getElementById('btn-wp-confirm-change');
        const cancelBtn = document.getElementById('btn-wp-cancel-change');

        overlay.classList.add('active');
        confirmBtn.disabled = true;
        selectedFolder = null;

        container.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading folders...</div>';

        // Load folders/profiles
        fetch(`/api/profiles?admin_token=${encodeURIComponent(adminToken)}`)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    renderFolderList(data.profiles);
                } else {
                    container.innerHTML = '<div style="padding:1rem; text-align:center; color:#f87171; font-size:0.85rem;">Error loading folders.</div>';
                }
            })
            .catch(err => {
                console.error('Error fetching profiles:', err);
                container.innerHTML = '<div style="padding:1rem; text-align:center; color:#f87171; font-size:0.85rem;">Failed to fetch folders.</div>';
            });

        const closeModal = () => {
            overlay.classList.remove('active');
        };

        cancelBtn.onclick = closeModal;
        
        // Close on clicking overlay background
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        };

        confirmBtn.onclick = () => {
            if (!selectedFolder) return;

            confirmBtn.disabled = true;
            confirmBtn.innerText = 'Switching...';

            fetch(`/api/watch-party/${window.PARTY_ID}/change-folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin_token: adminToken,
                    folder_name: selectedFolder
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    closeModal();
                } else {
                    alert('Error changing folder: ' + data.message);
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = 'Switch Folder';
                }
            })
            .catch(err => {
                console.error('Error switching folder:', err);
                alert('An error occurred while switching the folder.');
                confirmBtn.disabled = false;
                confirmBtn.innerText = 'Switch Folder';
            });
        };
    }

    function renderFolderList(profiles) {
        const container = document.getElementById('wp-folders-list-container');
        const confirmBtn = document.getElementById('btn-wp-confirm-change');
        container.innerHTML = '';

        if (!profiles || profiles.length === 0) {
            container.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">No folders available.</div>';
            return;
        }

        profiles.forEach(profile => {
            const item = document.createElement('div');
            item.className = 'folder-select-item';
            if (profile.folder_name === window.FOLDER_NAME) {
                item.classList.add('selected');
                selectedFolder = profile.folder_name;
                confirmBtn.disabled = false;
            }

            const avatarHtml = profile.avatar_url 
                ? `<img src="${profile.avatar_url}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" alt="">` 
                : `<i class="fa-solid fa-folder"></i>`;

            item.innerHTML = `
                <div class="folder-select-name">
                    ${avatarHtml}
                    <span>${escapeHTML(profile.display_name)}</span>
                </div>
                <div class="folder-select-count">${profile.media_count} files</div>
            `;

            item.onclick = () => {
                // Remove selected from all
                const items = container.querySelectorAll('.folder-select-item');
                items.forEach(i => i.classList.remove('selected'));

                // Add to clicked
                item.classList.add('selected');
                selectedFolder = profile.folder_name;
                confirmBtn.disabled = false;
            };

            container.appendChild(item);
        });
    }
})();
