/**
 * AuraSort — Watch Party Client Controller
 * Handles synchronization, WebRTC P2P voice mesh, and playlist controls.
 */

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

    function showNicknameModal() {
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
            document.getElementById('local-display-name').innerText = `${clientName} (You)`;

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

            // Start the SSE loop and load playlist
            startWatchParty();
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

        // Establish the EventSource connection
        const streamUrl = `/api/watch-party/${window.PARTY_ID}/stream?client_id=${encodeURIComponent(clientId)}&client_name=${encodeURIComponent(clientName)}`;
        sseSource = new EventSource(streamUrl);

        sseSource.onopen = () => {
            addLogEntry('System', 'Connected! Waiting for synchronizations...');
        };

        sseSource.onerror = (err) => {
            console.error('SSE Stream Error:', err);
            addLogEntry('System', 'Connection lost. Reconnecting...');
        };

        sseSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ping') return;
                handleSSEMessage(data);
            } catch (e) {
                console.error('Failed to parse SSE payload:', e);
            }
        };

        // Bind local player events to broadcast modifications
        player.on('play', () => {
            if (ignorePlayerEvents) return;
            broadcastSync('play', player.currentTime);
        });

        player.on('pause', () => {
            if (ignorePlayerEvents) return;
            broadcastSync('pause', player.currentTime);
        });

        player.on('seeked', () => {
            if (ignorePlayerEvents) return;
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
            if (file.filename === currentFilename) {
                item.classList.add('active');
            }

            let thumbUrl;
            if (file.is_video) {
                thumbUrl = `/api/video-thumbnail/${file.folder_name}/${file.filename}`;
            } else {
                thumbUrl = `/media/${file.folder_name}/${file.filename}`;
            }

            item.innerHTML = `
                <img src="${thumbUrl}" alt="${file.filename}" onerror="this.src='https://placehold.co/160x90/101013/ffffff?text=${encodeURIComponent(file.filename)}'">
                <div class="playlist-item-title">${file.filename}</div>
            `;

            item.onclick = () => {
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
        return new Promise((resolve) => {
            console.log('Loading file:', filename);
            currentFilename = filename;

            // Highlight in playlist grid
            const items = document.querySelectorAll('.playlist-item');
            items.forEach(item => {
                const titleEl = item.querySelector('.playlist-item-title');
                if (titleEl && titleEl.innerText === filename) {
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
                imagePlayer.style.maxHeight = '75vh';
                imagePlayer.style.aspectRatio = '16/9';
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

                // Fallback in case Plyr ready is delayed
                setTimeout(resolve, 800);
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
                        activePeers[peer.client_id] = { name: peer.name };
                    });
                    updatePeersUI();
                }
                break;

            case 'peer_joined':
                addLogEntry('System', `${data.name} joined the watch party.`);
                activePeers[data.client_id] = { name: data.name };
                updatePeersUI();

                // Existing client initiates connection to the newly joined peer
                createPeerConnection(data.client_id, true);
                break;

            case 'peer_left':
                addLogEntry('System', `${data.name} left the watch party.`);
                
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

        fetch(`/api/watch-party/${window.PARTY_ID}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                action: action,
                position: position,
                filename: currentFilename
            })
        }).catch(err => console.error('Error broadcasting sync:', err));
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
        fetch(`/api/watch-party/${window.PARTY_ID}/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: clientId,
                target_id: targetId,
                signal: signalData
            })
        }).catch(err => console.error('Signaling relay error:', err));
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
        audio.style.display = 'none';
        audio.srcObject = stream;

        document.body.appendChild(audio);
        remoteAudioElements[peerId] = audio;

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

        peersList.innerHTML = '<div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 0.25rem;">PARTICIPANTS</div>';

        Object.keys(activePeers).forEach(peerId => {
            const peer = activePeers[peerId];
            const peerItem = document.createElement('div');
            peerItem.className = 'peer-item';
            peerItem.id = `peer-${peerId}`;

            // Check if connection is active for styling
            const pc = peerConnections[peerId];
            const isMuted = !pc || pc.connectionState !== 'connected';

            peerItem.innerHTML = `
                <div class="peer-name">
                    <i class="fa-solid fa-user"></i>
                    <span>${peer.name}</span>
                </div>
                <div class="voice-indicator ${isMuted ? 'muted' : ''}" id="voice-${peerId}"></div>
            `;
            peersList.appendChild(peerItem);
        });
    }

    function addLogEntry(sender, message) {
        const container = document.getElementById('wp-logs-container');
        if (!container) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        entry.innerHTML = `<span class="log-time">${sender}</span> ${message}`;
        container.appendChild(entry);

        // Keep scrolled to bottom
        container.scrollTop = container.scrollHeight;
    }

    function formatTime(secs) {
        if (isNaN(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
})();
