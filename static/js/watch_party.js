/**
 * Chehro — Watch Party Client Controller
 * Handles synchronization, WebRTC P2P voice mesh, and playlist controls.
 */

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

        // Limit active toasts to prevent spam lag
        const activeToasts = container.getElementsByClassName('custom-toast');
        if (activeToasts.length >= 3) {
            const oldest = Array.from(activeToasts).find(t => !t.classList.contains('hide'));
            if (oldest) {
                oldest.classList.remove('show');
                oldest.classList.add('hide');
                setTimeout(() => oldest.remove(), 400);
            }
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

    // Dynamic CSS injection for Brutalist Confirm / Alert Modals
    if (!document.getElementById('brutal-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'brutal-modal-styles';
        style.textContent = `
            .brutal-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(4px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.15s ease-in-out;
            }
            .brutal-modal-overlay.active {
                opacity: 1;
            }
            .brutal-modal-box {
                background: #ffffff;
                border: 4px solid #000000;
                box-shadow: 8px 8px 0px #000000;
                padding: 24px;
                max-width: 450px;
                width: 90%;
                transform: scale(0.9);
                transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                color: #000000;
                font-family: inherit;
            }
            .brutal-modal-overlay.active .brutal-modal-box {
                transform: scale(1);
            }
            .brutal-modal-title {
                font-size: 1.2rem;
                font-weight: 900;
                text-transform: uppercase;
                margin-bottom: 16px;
                background: var(--accent-yellow, #ffe600);
                padding: 6px 12px;
                border: 2px solid #000;
                display: inline-block;
                transform: rotate(-1deg);
                color: #000;
            }
            .brutal-modal-message {
                font-size: 1rem;
                font-weight: 700;
                margin-bottom: 24px;
                line-height: 1.4;
                color: #000;
            }
            .brutal-modal-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
            }
            .brutal-modal-btn {
                font-weight: 800;
                text-transform: uppercase;
                padding: 8px 16px;
                border: 3px solid #000;
                cursor: pointer;
                transition: all 0.1s ease;
                font-family: inherit;
            }
            .brutal-modal-btn-confirm {
                background: var(--accent-pink, #ff007f);
                color: #fff;
                box-shadow: 3px 3px 0px #000;
            }
            .brutal-modal-btn-confirm:hover {
                transform: translate(-1px, -1px);
                box-shadow: 4px 4px 0px #000;
            }
            .brutal-modal-btn-confirm:active {
                transform: translate(1px, 1px);
                box-shadow: 1px 1px 0px #000;
            }
            .brutal-modal-btn-cancel {
                background: #eee;
                color: #000;
                box-shadow: 3px 3px 0px #000;
            }
            .brutal-modal-btn-cancel:hover {
                transform: translate(-1px, -1px);
                box-shadow: 4px 4px 0px #000;
            }
            .brutal-modal-btn-cancel:active {
                transform: translate(1px, 1px);
                box-shadow: 1px 1px 0px #000;
            }
            
            /* Dark theme support */
            [data-theme="dark"] .brutal-modal-box {
                background: #1e1e1e;
                color: #ffffff;
                border-color: #ffffff;
                box-shadow: 8px 8px 0px #ffffff;
            }
            [data-theme="dark"] .brutal-modal-title {
                border-color: #ffffff;
                color: #000;
            }
            [data-theme="dark"] .brutal-modal-message {
                color: #ffffff;
            }
            [data-theme="dark"] .brutal-modal-btn {
                border-color: #ffffff;
            }
            [data-theme="dark"] .brutal-modal-btn-confirm {
                box-shadow: 3px 3px 0px #ffffff;
            }
            [data-theme="dark"] .brutal-modal-btn-confirm:hover {
                box-shadow: 4px 4px 0px #ffffff;
            }
            [data-theme="dark"] .brutal-modal-btn-confirm:active {
                box-shadow: 1px 1px 0px #ffffff;
            }
            [data-theme="dark"] .brutal-modal-btn-cancel {
                background: #333;
                color: #fff;
                box-shadow: 3px 3px 0px #ffffff;
            }
            [data-theme="dark"] .brutal-modal-btn-cancel:hover {
                box-shadow: 4px 4px 0px #ffffff;
            }
            [data-theme="dark"] .brutal-modal-btn-cancel:active {
                box-shadow: 1px 1px 0px #ffffff;
            }
        `;
        document.head.appendChild(style);
    }

    window.showBrutalConfirm = function (message, title = 'Confirm') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'brutal-modal-overlay';
            
            const box = document.createElement('div');
            box.className = 'brutal-modal-box';
            
            const titleEl = document.createElement('div');
            titleEl.className = 'brutal-modal-title';
            titleEl.innerText = title;
            
            const messageEl = document.createElement('div');
            messageEl.className = 'brutal-modal-message';
            messageEl.innerText = message;
            
            const buttons = document.createElement('div');
            buttons.className = 'brutal-modal-buttons';
            
            const btnCancel = document.createElement('button');
            btnCancel.className = 'brutal-modal-btn brutal-modal-btn-cancel';
            btnCancel.innerText = 'Cancel';
            
            const btnConfirm = document.createElement('button');
            btnConfirm.className = 'brutal-modal-btn brutal-modal-btn-confirm';
            btnConfirm.innerText = 'Confirm';
            
            buttons.appendChild(btnCancel);
            buttons.appendChild(btnConfirm);
            box.appendChild(titleEl);
            box.appendChild(messageEl);
            box.appendChild(buttons);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            
            overlay.offsetHeight; // trigger reflow
            overlay.classList.add('active');
            
            const close = (result) => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 150);
            };
            
            btnCancel.onclick = () => close(false);
            btnConfirm.onclick = () => close(true);
            btnConfirm.focus();
        });
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
    const localStorage = window.safeLocalStorage;
    const sessionStorage = window.safeSessionStorage;

    // Unique client ID persisted per session to survive refreshes
    let clientId = sessionStorage.getItem('wp_client_id');
    if (!clientId) {
        clientId = 'client_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('wp_client_id', clientId);
    }

    const AVATAR_MAP = {
        cool_kid: { icon: 'fa-grin-cool', color: 'var(--accent-pink)', label: 'Cool Kid' },
        cat_ears: { icon: 'fa-cat', color: 'var(--accent-blue)', label: 'Cat Ears' },
        nerd: { icon: 'fa-glasses', color: 'var(--accent-lime)', label: 'Nerd' },
        robot: { icon: 'fa-robot', color: 'var(--accent-yellow)', label: 'Robot' },
        ghost: { icon: 'fa-ghost', color: '#a855f7', label: 'Ghost' },
        alien: { icon: 'fa-user-astronaut', color: '#10b981', label: 'Alien' },
        headphones: { icon: 'fa-headphones', color: '#f97316', label: 'Headphones' },
        ninja: { icon: 'fa-user-ninja', color: '#64748b', label: 'Ninja' },
        punk: { icon: 'fa-guitar', color: '#ec4899', label: 'Punk' },
        wizard: { icon: 'fa-hat-wizard', color: '#3b82f6', label: 'Wizard' },
        crown: { icon: 'fa-crown', color: '#eab308', label: 'Crown' },
        cyber: { icon: 'fa-microchip', color: '#06b6d4', label: 'Cyber' }
    };

    let clientName = localStorage.getItem('wp_nickname');
    let localAvatar = localStorage.getItem('wp_avatar');

    if (!clientName) {
        const randomNames = [
            "Cyber Ninja", "Neon Wizard", "Space Cat", "Retro Robot", "Acid Ghost",
            "Crown Punk", "Laser Alien", "Disco Cat", "Pixel Nerd", "Techno Kid",
            "Glitch Ghost", "Phantom Wizard", "Digital Crown", "Omega Cyber"
        ];
        clientName = randomNames[Math.floor(Math.random() * randomNames.length)];
        localStorage.setItem('wp_nickname', clientName);
    }
    
    if (!localAvatar) {
        const avatars = Object.keys(AVATAR_MAP);
        localAvatar = avatars[Math.floor(Math.random() * avatars.length)];
        localStorage.setItem('wp_avatar', localAvatar);
    }

    sessionStorage.setItem('wp_client_name', clientName);
    let partyPassword = sessionStorage.getItem(`wp_password_${window.PARTY_ID}`) || '';
    
    let localStream = null;
    let localScreenStream = null;
    let localWebcamStream = null;
    let webcamEnabled = false;
    let pendingWebcamStart = false;
    let lastReactionTime = 0;
    let screenSenders = {}; // maps peerId -> array of RTCRtpSender
    let webcamSenders = {}; // maps peerId -> array of RTCRtpSender
    let allowScreenShare = false;
    let allowWebcam = true;
    let activeScreenShare = null;
    let activeWebcams = {};
    let remoteWebcamStreams = {};
    let remoteTrackMetadata = {};
    let focusedWebcamUserId = null;
    let focusedMediaTileId = null;
    let cachedScreenShareTile = null;
    let sseSource = null;
    let currentFilename = null;
    let mediaLoadSequence = 0;
    let mediaStateReleaseTimer = null;
    let mediaFilesList = [];
    let ignorePlayerEvents = false;
    let isApplyingRemoteState = false;
    let isChangingMedia = false;
    let suppressLocalEvents = false;
    let lastAppliedCommandId = 0;
    let currentMediaVersion = 0;
    let authoritativeRoomState = null;
    let serverClockOffsetSeconds = 0;
    let playbackRateRestoreTimer = null;
    const playbackUnlockStorageKey = `wp_playback_unlocked_${window.PARTY_ID}`;
    let playbackUnlocked = window.safeSessionStorage.getItem(playbackUnlockStorageKey) === 'true';
    const DRIFT_IGNORE_SECONDS = 0.4;
    const DRIFT_SOFT_SECONDS = 2.0;
    Object.defineProperty(window, 'ignorePlayerEvents', {
        get: () => ignorePlayerEvents,
        set: (val) => { ignorePlayerEvents = val; },
        configurable: true
    });
    window.__watchPartyMainHandlesSync = true;
    let adminToken = null;
    let selectedFolder = null;
    let isPlaybackLocked = false;
    let isSlowMode = false;
    let slowModeTimer = null;
    let lastChatSentTime = 0;
    
    // Watch Party Soundboard State
    let isSoundboardAllowed = true;
    let soundboardVolume = parseFloat(localStorage.getItem('wp_soundboard_volume') || '0.5');
    let soundboardMuted = localStorage.getItem('wp_soundboard_muted') === 'true';
    let lastSoundboardPlayTime = 0;
    let soundboardCache = {};
    let soundboardPreloadCache = {};
    let activeAudioObjects = new Set();
    let soundboardAudioUnlocked = false;

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
    const remoteScreenAudioElements = {};
    const activePeers = {};
    const iceCandidateQueues = {};

    // Feature 6: Expose audio maps/peers to window for modular audio controller
    window.getRemoteAudioElements = () => remoteAudioElements;
    window.getRemoteScreenAudioElements = () => remoteScreenAudioElements;
    window.getActivePeers = () => activePeers;

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
    // Expose player instance to other modules
    const videoEl = document.getElementById('lightbox-video');
    if (videoEl) {
        videoEl.__plyr = player;
    }

    // Synced Autoplay hook for Feature 4
    player.on('ended', () => {
        if (window.playNextInQueue) {
            console.log("[QueueModule] Video ended. Triggering autoplay next in queue...");
            window.playNextInQueue();
        }
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
        const closeBtn = document.getElementById('btn-wp-password-close');

        if (closeBtn) {
            closeBtn.onclick = () => {
                window.location.href = '/';
            };
        }

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
                    showToast('Incorrect password. Please try again.', 'error');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            } catch (err) {
                showToast('An error occurred during authentication.', 'error');
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

    let selectedAvatarInModal = localAvatar;

    function updateLocalProfileUI() {
        const nameDisplay = document.getElementById('local-display-name');
        if (nameDisplay) {
            nameDisplay.innerText = `${clientName} (You)`;
        }
        const avatarCircle = document.getElementById('local-avatar-circle');
        if (avatarCircle && localAvatar) {
            const avatarData = AVATAR_MAP[localAvatar] || AVATAR_MAP.cool_kid;
            avatarCircle.style.background = avatarData.color;
            avatarCircle.innerHTML = `<i class="fa-solid ${avatarData.icon}"></i>`;
        }
    }

    function initProfileModal() {
        const editTriggerBtn = document.getElementById('btn-edit-profile');
        const modal = document.getElementById('wp-profile-modal');
        const cancelBtn = document.getElementById('btn-wp-profile-cancel');
        const saveBtn = document.getElementById('btn-wp-profile-save');
        const randomizeBtn = document.getElementById('btn-wp-profile-randomize');
        const nicknameInput = document.getElementById('wp-profile-nickname');
        const optionCards = document.querySelectorAll('.avatar-option-card');

        if (!modal) return;

        if (editTriggerBtn) {
            editTriggerBtn.onclick = () => {
                nicknameInput.value = clientName;
                selectedAvatarInModal = localAvatar;
                
                optionCards.forEach(card => {
                    if (card.getAttribute('data-avatar') === localAvatar) {
                        card.classList.add('selected');
                    } else {
                        card.classList.remove('selected');
                    }
                });
                
                modal.classList.add('active');
            };
        }

        optionCards.forEach(card => {
            card.onclick = () => {
                optionCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedAvatarInModal = card.getAttribute('data-avatar');
            };
        });

        cancelBtn.onclick = () => {
            modal.classList.remove('active');
        };
        const closeBtn = document.getElementById('btn-wp-profile-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.remove('active');
            };
        }

        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        };

        randomizeBtn.onclick = () => {
            const adjectives = ["Cool", "Epic", "Neon", "Super", "Acid", "Hyper", "Cyber", "Wild", "Glitch", "Retro", "Cosmic", "Pixel"];
            const nouns = ["Gamer", "Wizard", "Ninja", "Cyborg", "Alien", "Ghost", "Cat", "Panda", "Robot", "Hero", "Hacker", "Beast"];
            const randomName = adjectives[Math.floor(Math.random() * adjectives.length)] + " " + nouns[Math.floor(Math.random() * nouns.length)];
            nicknameInput.value = randomName;

            const avatars = Object.keys(AVATAR_MAP);
            const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
            selectedAvatarInModal = randomAvatar;

            optionCards.forEach(card => {
                if (card.getAttribute('data-avatar') === randomAvatar) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        };

        saveBtn.onclick = () => {
            const newName = nicknameInput.value.trim() || 'Viewer';
            clientName = newName;
            localAvatar = selectedAvatarInModal;

            localStorage.setItem('wp_nickname', clientName);
            localStorage.setItem('wp_avatar', localAvatar);
            sessionStorage.setItem('wp_client_name', clientName);

            updateLocalProfileUI();

            if (window.socket && window.socket.connected) {
                window.socket.emit('profile_update', {
                    party_id: window.PARTY_ID,
                    client_id: clientId,
                    name: clientName,
                    avatar: localAvatar
                });
            }

            modal.classList.remove('active');
        };
    }

    function initInviteButton() {
        const inviteBtn = document.getElementById('btn-wp-invite');
        if (inviteBtn) {
            inviteBtn.onclick = () => {
                fetch(`/api/watch-party/${window.PARTY_ID}/invite-link`)
                    .then(res => res.json())
                    .then(data => {
                        let urlStr;
                        if (data && data.status === 'success' && data.invite_url) {
                            urlStr = data.invite_url;
                        } else {
                            let inviteUrl;
                            if (window.PUBLIC_TUNNEL_URL && window.PUBLIC_TUNNEL_URL.trim() !== '') {
                                inviteUrl = new URL(`/watch-party/${window.PARTY_ID}`, window.PUBLIC_TUNNEL_URL);
                            } else {
                                inviteUrl = new URL(window.location.href);
                                inviteUrl.pathname = `/watch-party/${window.PARTY_ID}`;
                            }
                            inviteUrl.searchParams.delete('admin_token');
                            urlStr = inviteUrl.toString();
                        }
                        
                        navigator.clipboard.writeText(urlStr).then(() => {
                            showToast('Invite link copied to clipboard!', 'success');
                        }).catch(err => {
                            console.error('Failed to copy invite link:', err);
                            showToast('Failed to copy invite link.', 'error');
                        });
                    })
                    .catch(err => {
                        console.warn('Failed to fetch invite link from server, using fallback:', err);
                        let inviteUrl;
                        if (window.PUBLIC_TUNNEL_URL && window.PUBLIC_TUNNEL_URL.trim() !== '') {
                            inviteUrl = new URL(`/watch-party/${window.PARTY_ID}`, window.PUBLIC_TUNNEL_URL);
                        } else {
                            inviteUrl = new URL(window.location.href);
                            inviteUrl.pathname = `/watch-party/${window.PARTY_ID}`;
                        }
                        inviteUrl.searchParams.delete('admin_token');
                        
                        navigator.clipboard.writeText(inviteUrl.toString()).then(() => {
                            showToast('Invite link copied to clipboard!', 'success');
                        }).catch(err2 => {
                            console.error('Failed to copy invite link:', err2);
                            showToast('Failed to copy invite link.', 'error');
                        });
                    });
            };
        }
    }

    function initScreenShareButton() {
        const btnScreenShare = document.getElementById('btn-wp-screen-share');
        if (btnScreenShare) {
            btnScreenShare.onclick = () => {
                if (localScreenStream) {
                    stopLocalScreenShare();
                } else {
                    startLocalScreenShare();
                }
            };
        }
    }

    function initWebcamControls() {
        const btnWebcam = document.getElementById('btn-webcam-toggle');
        if (btnWebcam) {
            btnWebcam.disabled = false;
            btnWebcam.onclick = () => {
                if (webcamEnabled) {
                    stopLocalWebcam();
                } else {
                    startLocalWebcam();
                }
            };
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearMediaFocus();
            }
        });

        window.addEventListener('beforeunload', () => {
            stopLocalWebcam({ emit: false });
        });

        renderWebcamGrid();
        updateWebcamUI();
    }

    function initCustomMedia() {
        const customBtn = document.getElementById('btn-wp-custom-media');
        const overlay = document.getElementById('wp-custom-media-overlay');
        const cancelBtn = document.getElementById('btn-wp-custom-media-cancel');
        const submitBtn = document.getElementById('btn-wp-custom-media-submit');
        const urlInput = document.getElementById('wp-custom-media-url');

        if (!overlay) return;

        if (customBtn) {
            customBtn.onclick = () => {
                if (!adminToken) {
                    showToast('Only the host can load custom media URLs.', 'warning');
                    return;
                }
                urlInput.value = '';
                overlay.classList.add('active');
                urlInput.focus();
            };
        }

        const closeModal = () => {
            overlay.classList.remove('active');
        };

        if (cancelBtn) cancelBtn.onclick = closeModal;
        const closeBtn = document.getElementById('btn-wp-custom-media-close');
        if (closeBtn) closeBtn.onclick = closeModal;
        overlay.onclick = (e) => {
            if (e.target === overlay) closeModal();
        };

        const handleLoad = () => {
            const url = urlInput.value.trim();
            if (url) {
                selectAndBroadcastMedia(url);
                closeModal();
            } else {
                showToast('Please enter a valid URL.', 'warning');
            }
        };

        if (submitBtn) submitBtn.onclick = handleLoad;
        if (urlInput) {
            urlInput.onkeydown = (e) => {
                if (e.key === 'Enter') handleLoad();
            };
        }
    }

    function initThemeToggle() {
        const themeBtn = document.getElementById('btn-wp-theme-toggle');
        const themeIcon = document.getElementById('wp-theme-toggle-icon');
        const themeText = document.getElementById('wp-theme-toggle-text');
        if (!themeBtn) return;

        function updateToggleUI(theme) {
            if (theme === 'light') {
                // If page is currently Light, show "Dark" option to switch to Dark Mode
                if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
                if (themeText) themeText.textContent = 'Dark';
                themeBtn.style.setProperty('background', 'var(--accent-lime)', 'important');
            } else {
                // If page is currently Dark, show "Light" option to switch to Light Mode
                if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
                if (themeText) themeText.textContent = 'Light';
                themeBtn.style.setProperty('background', 'var(--accent-yellow)', 'important');
            }
        }

        let currentTheme = document.body.getAttribute('data-theme') || 'dark';
        updateToggleUI(currentTheme);

        themeBtn.onclick = (e) => {
            e.preventDefault();
            currentTheme = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.body.setAttribute('data-theme', currentTheme);
            localStorage.setItem('chehro-theme', currentTheme);
            updateToggleUI(currentTheme);
            showToast(`Switched to ${currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1)} Mode`, 'info');
        };
    }

    function initFolderDropdown() {
        const select = document.getElementById('wp-folder-dropdown-select');
        if (!select) return;

        fetch('/api/profiles?party_id=' + encodeURIComponent(window.PARTY_ID))
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.profiles) {
                    select.innerHTML = '<option value="" disabled>LOCAL FOLDER (ACTIVE)</option>';
                    data.profiles.forEach(profile => {
                        const opt = document.createElement('option');
                        opt.value = profile.folder_name;
                        opt.innerText = profile.display_name;
                        if (profile.folder_name === window.FOLDER_NAME) {
                            opt.selected = true;
                        }
                        select.appendChild(opt);
                    });
                }
            })
            .catch(err => console.error('Error fetching profiles for dropdown:', err));

        select.onchange = () => {
            if (!adminToken) {
                showToast('Only the host can switch the folder.', 'warning');
                select.value = window.FOLDER_NAME;
                return;
            }

            const targetFolder = select.value;
            if (!targetFolder) return;

            select.disabled = true;

            fetch(`/api/watch-party/${window.PARTY_ID}/change-folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin_token: adminToken,
                    folder_name: targetFolder
                })
            })
            .then(res => res.json())
            .then(data => {
                select.disabled = false;
                if (data.status !== 'success') {
                    showToast('Error changing folder: ' + data.message, 'error');
                    select.value = window.FOLDER_NAME;
                }
            })
            .catch(err => {
                console.error('Error switching folder:', err);
                showToast('An error occurred while switching the folder.', 'error');
                select.disabled = false;
                select.value = window.FOLDER_NAME;
            });
        };
    }

    async function setupVoiceAndStart() {
        updateLocalProfileUI();
        initProfileModal();
        initInviteButton();
        initCustomMedia();
        initFolderDropdown();
        initThemeToggle();
        initScreenShareButton();
        initWebcamControls();
        // Request microphone permission for P2P voice chat
        try {
            addLogEntry('System', 'Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 48000
                }
            });
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
        const closeBtn = document.getElementById('btn-wp-nickname-close');

        if (closeBtn) {
            closeBtn.onclick = () => {
                window.location.href = '/';
            };
        }

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
        if (btnMic) {
            if (isActive) {
                btnMic.classList.add('active');
                btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            } else {
                btnMic.classList.remove('active');
                btnMic.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
            }
        }
        
        // Sync bottom call control dock mic button
        const dockBtnMic = document.getElementById('dock-btn-mic');
        if (dockBtnMic) {
            if (isActive) {
                dockBtnMic.classList.add('active');
                dockBtnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            } else {
                dockBtnMic.classList.remove('active');
                dockBtnMic.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
            }
        }
    }



    /**
     * 2. Playlist & Media Loading
     */    async function startWatchParty() {
        if (window.__watchPartyStarted) {
            console.log("[WatchParty] Already started, skipping re-init.");
            return;
        }
        window.__watchPartyStarted = true;

        addLogEntry('System', 'Connecting to watch party stream...');

        // Verify admin privileges
        checkAdminStatus();
        
        // Initialize Soundboard Controls & UI
        initializeSoundboard();

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
        
        // Expose state & hooks to window for modular Feature 4 (watch_party_queue.js)
        window.loadMediaFile = loadMediaFile;
        window.loadMediaAndApplyState = loadMediaAndApplyState;
        window.selectAndBroadcastMedia = selectAndBroadcastMedia;
        window.broadcastSync = broadcastSync;
        window.getCurrentFilename = () => currentFilename;
        window.getMediaFilesList = () => mediaFilesList;
        window.getAdminToken = () => adminToken;
        window.getClientId = () => clientId;
        window.getClientName = () => clientName;
        window.getIsPlaybackLocked = () => isPlaybackLocked;
        window.getWatchPartyAuthoritativeState = () => authoritativeRoomState;
        window.getWatchPartyExpectedPosition = getExpectedPlaybackPosition;
        window.isWatchPartyPlaybackUnlocked = () => playbackUnlocked;

        socket.on('connect', () => {
            addLogEntry('System', 'Connected! Waiting for synchronizations...');
            socket.emit('join', {
                party_id: window.PARTY_ID,
                client_id: clientId,
                client_name: clientName,
                avatar: localAvatar,
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
            if (data.public_tunnel_url) {
                window.PUBLIC_TUNNEL_URL = data.public_tunnel_url;
            }
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

        socket.on('peer_profile_updated', (data) => {
            const { client_id, name, avatar } = data;
            if (client_id === clientId) {
                clientName = name;
                localAvatar = avatar;
                localStorage.setItem('wp_nickname', name);
                localStorage.setItem('wp_avatar', avatar);
                sessionStorage.setItem('wp_client_name', name);
                if (activeWebcams[clientId]) {
                    activeWebcams[clientId].name = name;
                    activeWebcams[clientId].avatar = avatar;
                    renderWebcamGrid();
                }
                updateLocalProfileUI();
            } else {
                if (activePeers[client_id]) {
                    activePeers[client_id].name = name;
                    activePeers[client_id].avatar = avatar;
                    if (activeWebcams[client_id]) {
                        activeWebcams[client_id].name = name;
                        activeWebcams[client_id].avatar = avatar;
                        renderWebcamGrid();
                    }
                    updatePeersUI();
                }
            }
        });

        socket.on('peer_left', (data) => {
            handleSSEMessage({ type: 'peer_left', ...data });
        });

        socket.on('sync_event', (data) => {
            handleSSEMessage({ type: 'sync', ...data });
        });

        socket.on('chat_message', (data) => {
            handleSSEMessage({ type: 'chat', ...data });
        });

        socket.on('signal_event', (data) => {
            handleSSEMessage({ type: 'signal', ...data });
        });

        socket.on('screen_share_permission_changed', (data) => {
            allowScreenShare = data.allowed;
            const toggleScreenShare = document.getElementById('admin-toggle-screen-share');
            if (toggleScreenShare) {
                toggleScreenShare.checked = allowScreenShare;
            }
            updateScreenShareUI();
        });

        socket.on('webcam_permission_changed', (data) => {
            allowWebcam = data.allowed;
            const toggleWebcam = document.getElementById('admin-toggle-webcam');
            if (toggleWebcam) {
                toggleWebcam.checked = allowWebcam;
            }
            updateWebcamUI();
            if (!allowWebcam && !adminToken && (webcamEnabled || pendingWebcamStart)) {
                stopLocalWebcam({ emit: false });
                showToast(data.message || 'Webcam is disabled by admin.', 'warning');
            }
        });

        socket.on('soundboard_play_broadcast', (data) => {
            const url = soundboardCache[data.sound_id];
            if (url) {
                playLocalSound(url);
                showSoundboardEvent(data.client_name, data.display_name);
            } else {
                fetch('/api/watch-party/soundboard/list')
                    .then(res => res.json())
                    .then(listData => {
                        if (listData.status === 'success') {
                            cacheSoundboardSounds(listData.default_sounds, listData.custom_sounds);
                            const cachedUrl = soundboardCache[data.sound_id];
                            if (cachedUrl) {
                                playLocalSound(cachedUrl);
                                showSoundboardEvent(data.client_name, data.display_name);
                            } else {
                                showToast(`Sound file unavailable: ${data.display_name}`, 'error');
                            }
                        }
                    })
                    .catch(err => console.error('Error fetching sound list on play broadcast:', err));
            }
        });

        socket.on('soundboard_updated', () => {
            loadSoundboardList();
        });

        socket.on('soundboard_permission_changed', (data) => {
            isSoundboardAllowed = data.allowed;
            const sbRoomToggle = document.getElementById('soundboard-room-toggle');
            if (sbRoomToggle) {
                sbRoomToggle.checked = isSoundboardAllowed;
            }
            updateSoundboardUI();
        });

        socket.on('screen_share_started', (data) => {
            activeScreenShare = data;
            addLogEntry('System', `${data.name} started screen sharing.`);
            addSystemChatMessage(`${data.name} started screen sharing.`);
            updateScreenShareUI();
        });

        socket.on('screen_share_stopped', (data) => {
            if (activeScreenShare && activeScreenShare.client_id === data.client_id) {
                activeScreenShare = null;
            }
            stopRemoteScreenAudio(data.client_id);
            addLogEntry('System', `Screen sharing stopped.`);
            addSystemChatMessage(`Screen sharing stopped.`);
            updateScreenShareUI();
        });

        socket.on('webcam_started', (data) => {
            if (data.client_id === clientId && localWebcamStream && !webcamEnabled) {
                activateApprovedLocalWebcam();
            }
            activeWebcams[data.client_id] = {
                client_id: data.client_id,
                name: data.name,
                avatar: data.avatar || 'cool_kid',
                is_admin: data.is_admin || false
            };
            if (activePeers[data.client_id]) {
                activePeers[data.client_id].webcam_active = true;
            }
            renderWebcamGrid();
            updateWebcamUI();
        });

        socket.on('webcam_stopped', (data) => {
            const stoppedId = data.client_id;
            delete activeWebcams[stoppedId];
            if (activePeers[stoppedId]) {
                activePeers[stoppedId].webcam_active = false;
            }
            removeRemoteWebcam(stoppedId);
            if (stoppedId === clientId && webcamEnabled) {
                stopLocalWebcam({ emit: false });
            } else if (stoppedId === clientId && pendingWebcamStart) {
                stopLocalWebcam({ emit: false });
            }
            renderWebcamGrid();
            updateWebcamUI();
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

        socket.on('emoji_reaction_broadcast', (data) => {
            handleIncomingEmojiReaction(data.emoji, data.client_name);
        });

        // Bind emoji buttons click
        const emojiBar = document.getElementById('emoji-action-bar');
        if (emojiBar) {
            emojiBar.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const emoji = btn.getAttribute('data-emoji');
                    if (emoji) {
                        sendEmojiReaction(emoji);
                    }
                });
            });
        }
        
        // Bind numeric keydown hotkeys
        window.addEventListener('keydown', (e) => {
            // Safety check: ignore if user is typing in chat, nickname, or password inputs
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }
            
            const emojiMap = {
                '1': '😂',
                '2': '🔥',
                '3': '❤️',
                '4': '😮',
                '5': '👏',
                '6': '💀'
            };
            if (emojiMap[e.key]) {
                e.preventDefault();
                sendEmojiReaction(emojiMap[e.key]);
            }
        });

        // Bind local player events to broadcast modifications
        player.on('play', () => {
            markPlaybackUnlocked();
            if (ignorePlayerEvents || suppressLocalEvents || isApplyingRemoteState || isChangingMedia) return;
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
            if (ignorePlayerEvents || suppressLocalEvents || isApplyingRemoteState || isChangingMedia) return;
            if (isPlaybackLocked && !adminToken) {
                showToast('Playback is locked by the host.', 'warning');
                return;
            }
            broadcastSync('pause', player.currentTime);
        });

        player.on('seeked', () => {
            if (ignorePlayerEvents || suppressLocalEvents || isApplyingRemoteState || isChangingMedia) return;
            if (isPlaybackLocked && !adminToken) {
                showToast('Playback is locked by the host.', 'warning');
                return;
            }
            broadcastSync('seek', player.currentTime);
        });
    }

    function sendEmojiReaction(emoji) {
        if (!window.socket) return;
        const now = Date.now();
        if (now - lastReactionTime < 500) {
            return;
        }
        lastReactionTime = now;
        window.socket.emit('emoji_reaction', {
            party_id: window.PARTY_ID,
            client_id: clientId,
            client_name: clientName,
            emoji: emoji
        });
    }

    function handleIncomingEmojiReaction(emoji, senderName) {
        const container = document.getElementById('emoji-overlay-container');
        if (!container) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'floating-emoji-wrapper';
        
        // Random horizontal position between 10% and 90%
        const leftOffset = Math.random() * 80 + 10; 
        wrapper.style.left = `${leftOffset}%`;
        
        // Random rotation angle for floatUp keyframe
        const rotation = Math.random() * 60 - 30; // -30 to +30 deg
        wrapper.style.setProperty('--rot', `${rotation}deg`);

        const emojiEl = document.createElement('span');
        emojiEl.className = 'floating-emoji';
        emojiEl.innerText = emoji;

        const senderEl = document.createElement('span');
        senderEl.className = 'floating-emoji-sender';
        senderEl.innerText = senderName || 'Guest';

        wrapper.appendChild(emojiEl);
        wrapper.appendChild(senderEl);
        container.appendChild(wrapper);

        // Remove element after animation finishes (2.5s)
        setTimeout(() => {
            wrapper.remove();
        }, 2500);
    }

    function renderPlaylist(files) {
        if (files === mediaFilesList) {
            // When loading/resetting the full folder list, clear search input
            const searchInput = document.getElementById('wp-media-search-input');
            const searchClear = document.getElementById('wp-media-search-clear');
            if (searchInput) searchInput.value = '';
            if (searchClear) searchClear.style.display = 'none';
        }

        const playlistGrid = document.getElementById('wp-playlist-grid');
        playlistGrid.innerHTML = '';

        // Filter out subtitle files (.srt, .vtt) from the media grid
        const mediaFiles = files.filter(file => {
            const ext = file.filename.split('.').pop().toLowerCase();
            return ext !== 'srt' && ext !== 'vtt';
        });

        if (mediaFiles.length === 0) {
            const searchInput = document.getElementById('wp-media-search-input');
            const isSearching = searchInput && searchInput.value.toLowerCase().trim() !== '';

            if (isSearching) {
                playlistGrid.innerHTML = `
                    <div class="playlist-empty-state">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <span>No videos found for this search.</span>
                    </div>
                `;
            } else {
                playlistGrid.innerHTML = `
                    <div class="playlist-empty-state">
                        <i class="fa-solid fa-clapperboard"></i>
                        <span>No playable media is queued for this room yet.</span>
                    </div>
                `;
            }
            
            // Notify queue module to refresh subtitle list even if no media files are present
            if (window.refreshSubtitlesList) {
                window.refreshSubtitlesList(files);
            }
            return;
        }

        // Notify queue module of the subtitle list
        if (window.refreshSubtitlesList) {
            window.refreshSubtitlesList(files);
        }

        mediaFiles.forEach(file => {
            const item = document.createElement('div');
            item.className = 'playlist-thumbnail-card playlist-item';
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
            const mediaIcon = file.is_video ? 'fa-film' : 'fa-image';
            const mediaLabel = file.is_video ? 'Video' : 'Image';

            item.innerHTML = `
                <div class="playlist-thumb-wrapper">
                    <img src="${thumbUrl}" alt="${displayName}" style="display: none;" onload="this.style.display='block'; this.nextElementSibling.style.display='none';" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="playlist-placeholder" style="display: flex;"><i class="fa-solid ${mediaIcon}"></i><span>${mediaLabel}</span></div>
                    <div class="playlist-media-pill"><i class="fa-solid ${mediaIcon}"></i>${mediaLabel}</div>
                    <button class="btn-add-to-queue" data-filename="${file.filename}" title="Add to Queue" aria-label="Add ${displayName} to queue"><i class="fa-solid fa-plus"></i></button>
                </div>
                <div class="playlist-item-details">
                    <div class="playlist-item-title" title="${displayName}">${displayName}</div>
                </div>
            `;

            item.onclick = (e) => {
                // Intercept click if clicking the Add to Queue button
                const addBtn = e.target.closest('.btn-add-to-queue');
                if (addBtn) {
                    e.stopPropagation();
                    const fname = addBtn.getAttribute('data-filename');
                    if (window.addToQueue) {
                        window.addToQueue(fname);
                    }
                    return;
                }

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
        broadcastSync('change_media', 0.0, filename);
    }

    function waitForPlayerReady() {
        if (player && player.ready) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            player.once('ready', () => {
                resolve();
            });
            // 2 second fallback
            setTimeout(resolve, 2000);
        });
    }

    function loadRawMp4Source(src, resolve) {
        const videoEl = getVideoElement();
        
        // Update Plyr source configuration
        player.source = {
            type: 'video',
            sources: [
                {
                    src: src,
                    type: 'video/mp4'
                }
            ]
        };
        
        // Set direct source on video element for instantaneous, bulletproof loading
        if (videoEl) {
            videoEl.src = src;
            try {
                videoEl.load();
            } catch (err) {
                console.warn('Direct video load() call failed:', err);
            }
        }
        
        // Wait for metadata or playability with a 5-second safety timeout
        waitForVideoReady(5000).then(resolve);
    }

    function markPlaybackUnlocked() {
        playbackUnlocked = true;
        window.safeSessionStorage.setItem(playbackUnlockStorageKey, 'true');
        hideAutoplayOverlay();
    }

    function isAutoplayBlockedError(err) {
        if (!err) return false;
        return err.name === 'NotAllowedError'
            || err.code === 0 && /play\(\)|user|gesture|interact|autoplay/i.test(err.message || '');
    }

    function showAutoplayOverlay() {
        if (playbackUnlocked) return;
        if (document.getElementById('wp-autoplay-overlay')) return;
        
        const wrapper = document.querySelector('.video-wrapper');
        if (!wrapper) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'wp-autoplay-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(10, 10, 12, 0.88)';
        overlay.style.backdropFilter = 'blur(8px)';
        overlay.style.webkitBackdropFilter = 'blur(8px)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '10';
        overlay.style.cursor = 'pointer';
        overlay.style.color = '#F3F3F3';
        overlay.style.fontFamily = "'Outfit', sans-serif";
        overlay.style.textAlign = 'center';
        overlay.style.padding = '20px';
        overlay.style.boxSizing = 'border-box';
        
        overlay.innerHTML = `
            <div style="background: #1e1e24; border: 3px solid #000; box-shadow: 6px 6px 0 #000; border-radius: 20px; padding: 24px 32px; max-width: 380px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
                <div style="font-size: 2.5rem; animation: pulse 1.5s infinite;"><i class="fa-solid fa-circle-play" style="color: #ffa502;"></i></div>
                <div style="font-weight: 800; font-size: 1.2rem; text-transform: uppercase; letter-spacing: 0.5px;">Join the Watch Party</div>
                <div style="font-size: 0.9rem; color: #888890; line-height: 1.4;">Autoplay was blocked by your browser. Click anywhere to unmute and join the synchronized playback.</div>
                <button class="wp-brutal-btn" style="margin-top: 8px; font-size: 0.85rem; padding: 8px 18px; width: 100%;">Sync & Play</button>
            </div>
        `;
        
        overlay.onclick = async () => {
            setPlayerEventsIgnored(true);
            try {
                markPlaybackUnlocked();
                const expected = getExpectedPlaybackPosition(authoritativeRoomState);
                if (Number.isFinite(expected)) {
                    player.currentTime = clampPlaybackPosition(expected);
                }
                await player.play();
                hideAutoplayOverlay();
            } catch (err) {
                console.warn('Failed to play after click:', err);
                playbackUnlocked = false;
                window.safeSessionStorage.removeItem(playbackUnlockStorageKey);
            } finally {
                releasePlayerEventsAfter(1000);
            }
        };
        
        wrapper.appendChild(overlay);
        showToast('Playback paused. Click on the video player to join the party!', 'warning');
    }
    
    function hideAutoplayOverlay() {
        const overlay = document.getElementById('wp-autoplay-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    async function loadMediaAndApplyState(filename, state = {}) {
        if (!filename) return false;

        // Ensure player is fully ready
        await waitForPlayerReady();

        const loadId = ++mediaLoadSequence;
        const stateVersion = Number(state.media_version) || currentMediaVersion || 0;
        currentMediaVersion = Math.max(currentMediaVersion, stateVersion);
        const position = getExpectedPlaybackPosition(state);
        const shouldPlay = !!state.playing;
        const requestedSpeed = Number.parseFloat(state.speed);

        isChangingMedia = true;
        clearMediaTransitionState();
        setPlayerEventsIgnored(true);
        suppressLocalEvents = true;

        try {
            await loadMediaFile(filename);
            if (loadId !== mediaLoadSequence || stateVersion < currentMediaVersion) return false;

            if (window.isImageActive) {
                try { player.pause(); } catch (e) {}
                return true;
            }

            await waitForVideoReady(5000);
            if (loadId !== mediaLoadSequence || stateVersion < currentMediaVersion) return false;

            if (Number.isFinite(requestedSpeed) && requestedSpeed > 0) {
                player.speed = requestedSpeed;
                syncSpeedControl(requestedSpeed);
            }

            const targetTime = clampPlaybackPosition(position);
            if (Math.abs(player.currentTime - targetTime) > 0.15) {
                player.currentTime = targetTime;
            }

            if (shouldPlay && playbackUnlocked) {
                try {
                    await player.play();
                } catch (err) {
                    if (isAutoplayBlockedError(err)) {
                        console.warn('Autoplay blocked while applying Watch Party state:', err);
                        showAutoplayOverlay();
                    }
                }
            } else if (shouldPlay && !playbackUnlocked) {
                showAutoplayOverlay();
            } else {
                player.pause();
                hideAutoplayOverlay();
            }
            return true;
        } catch (err) {
            console.error('Failed to load Watch Party media state:', err);
            showToast('Could not load the selected media.', 'error');
            return false;
        } finally {
            // Keep ignorePlayerEvents active for 1000ms to allow all browser events to settle
            if (loadId === mediaLoadSequence) {
                isChangingMedia = false;
                suppressLocalEvents = false;
                releasePlayerEventsAfter(1000);
            }
        }
    }

    function loadMediaFile(filename) {
        return new Promise(async (resolve) => {
            console.log('Loading file:', filename);
            currentFilename = filename;

            // Highlight in playlist grid
            const items = document.querySelectorAll('.playlist-item, .playlist-thumbnail-card');
            items.forEach(item => {
                if (item.getAttribute('data-filename') === filename) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            const isCustomUrl = /^https?:\/\//i.test(filename);
            const isImage = !isCustomUrl && /\.(jpg|jpeg|png|webp|gif)$/i.test(filename);
            const mediaUrl = isCustomUrl ? filename : `/media/${window.FOLDER_NAME}/${filename}`;

            const plyrContainer = document.querySelector('.plyr');
            let imagePlayer = document.getElementById('lightbox-image');

            if (!imagePlayer) {
                imagePlayer = document.createElement('img');
                imagePlayer.id = 'lightbox-image';
                imagePlayer.style.width = '100%';
                imagePlayer.style.height = '100%';
                imagePlayer.style.objectFit = 'contain';
                imagePlayer.style.display = 'none';
                
                // Add load event listener to resize drawing canvas on image loading
                imagePlayer.addEventListener('load', () => {
                    if (window.resizeCanvas) {
                        window.resizeCanvas();
                    }
                });
                
                const wrapper = document.querySelector('.video-wrapper');
                if (wrapper) wrapper.appendChild(imagePlayer);
            }

            if (isImage) {
                window.isImageActive = true;
                if (plyrContainer) plyrContainer.style.display = 'none';
                imagePlayer.src = mediaUrl;
                imagePlayer.style.display = 'block';
                
                // Hide buffering overlay immediately on image view
                const overlay = document.getElementById('wp-buffering-overlay');
                if (overlay) overlay.classList.remove('active');
                
                if (window.onImageLoaded) {
                    window.onImageLoaded(filename);
                }
                resolve();
            } else {
                window.isImageActive = false;
                imagePlayer.style.display = 'none';
                if (plyrContainer) plyrContainer.style.display = 'block';
                
                hideAutoplayOverlay();
                
                const baseVideoEl = getVideoElement();
                if (baseVideoEl) {
                    try { baseVideoEl.pause(); } catch (e) {}
                    baseVideoEl.removeAttribute('src');
                    forceVideoLoad();
                }
                if (window.onVideoLoaded) {
                    window.onVideoLoaded();
                }

                if (isCustomUrl) {
                    if (window.hlsInstance) {
                        window.hlsInstance.destroy();
                        window.hlsInstance = null;
                    }

                    const videoEl = document.getElementById('lightbox-video');
                    const isHls = filename.toLowerCase().includes('.m3u8');

                    if (isHls && Hls.isSupported() && videoEl) {
                        const hls = new Hls({
                            maxMaxBufferLength: 8,
                            liveSyncPosition: 1.5
                        });
                        hls.loadSource(filename);
                        hls.attachMedia(videoEl);
                        window.hlsInstance = hls;
                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            waitForVideoReady(5000).then(resolve);
                        });
                        hls.on(Hls.Events.ERROR, (event, data) => {
                            if (data.fatal) {
                                console.warn('Custom HLS fatal error, trying raw play:', data);
                                hls.destroy();
                                window.hlsInstance = null;
                                loadRawMp4Source(filename, resolve);
                            }
                        });
                    } else {
                        loadRawMp4Source(filename, resolve);
                    }
                    return;
                }

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
                    if (trData.status === 'ready') {
                        activeUrl = trData.hls_url;
                        isHlsPlaying = true;
                    } else if (trData.status === 'converting') {
                        // Background transcoding in progress, play raw MP4 for immediate start
                        console.log('HLS transcoding in progress, playing raw MP4 instead.');
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
                        waitForVideoReady(5000).then(resolve);
                    });

                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            console.warn('HLS stream fatal error, falling back to raw MP4:', data);
                            hls.destroy();
                            window.hlsInstance = null;
                            loadRawMp4Source(mediaUrl, resolve);
                        }
                    });
                } else {
                    loadRawMp4Source(mediaUrl, resolve);
                }
            }
        });
    }

    function setPlayerEventsIgnored(value) {
        if (mediaStateReleaseTimer) {
            clearTimeout(mediaStateReleaseTimer);
            mediaStateReleaseTimer = null;
        }
        ignorePlayerEvents = value;
    }

    function releasePlayerEventsAfter(delayMs) {
        if (mediaStateReleaseTimer) clearTimeout(mediaStateReleaseTimer);
        mediaStateReleaseTimer = setTimeout(() => {
            ignorePlayerEvents = false;
            mediaStateReleaseTimer = null;
        }, delayMs);
    }

    function clearMediaTransitionState() {
        if (window.clearWatchPartyBufferingState) {
            window.clearWatchPartyBufferingState();
        } else {
            const overlay = document.getElementById('wp-buffering-overlay');
            if (overlay) overlay.classList.remove('active');
        }

        if (window.clearWatchPartyDrawingOverlays) {
            window.clearWatchPartyDrawingOverlays();
        }
    }

    function getVideoElement() {
        return document.getElementById('lightbox-video');
    }

    function forceVideoLoad() {
        const videoEl = getVideoElement();
        if (!videoEl) return;
        try {
            videoEl.load();
        } catch (err) {
            console.warn('Video load() failed after source update:', err);
        }
    }

    function waitForVideoReady(timeoutMs = 6000) {
        const videoEl = getVideoElement();
        if (!videoEl || window.isImageActive || videoEl.readyState >= 1) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                videoEl.removeEventListener('loadedmetadata', done);
                videoEl.removeEventListener('loadeddata', done);
                videoEl.removeEventListener('canplay', done);
                resolve();
            };
            const timer = setTimeout(done, timeoutMs);
            videoEl.addEventListener('loadedmetadata', done, { once: true });
            videoEl.addEventListener('loadeddata', done, { once: true });
            videoEl.addEventListener('canplay', done, { once: true });
        });
    }

    function clampPlaybackPosition(position) {
        const duration = Number(player.duration);
        if (Number.isFinite(duration) && duration > 0) {
            return Math.min(position, Math.max(0, duration - 0.1));
        }
        return position;
    }

    function syncSpeedControl(speed) {
        const speedSelect = document.getElementById('wp-speed-select');
        if (speedSelect) {
            speedSelect.value = speed.toString();
        }
        window.watchPartyRoomSpeed = speed;
    }

    function normalizePlaybackState(data) {
        const source = data && data.playback_state ? data.playback_state : data;
        if (!source) return null;
        const state = { ...source };
        state.current_media = state.current_media || state.filename;
        state.filename = state.filename || state.current_media;
        state.media_version = Number(state.media_version) || 1;
        state.last_command_id = Number(state.last_command_id) || 0;
        state.speed = Number(state.speed) || 1.0;
        state.position = Number(state.position) || 0.0;
        state.updated_at = Number(state.updated_at || state.last_updated || state.server_time || 0);
        if (state.server_time) {
            serverClockOffsetSeconds = (Date.now() / 1000) - Number(state.server_time);
        }
        return state;
    }

    function getServerNowSeconds() {
        return (Date.now() / 1000) - serverClockOffsetSeconds;
    }

    function getExpectedPlaybackPosition(state = authoritativeRoomState) {
        if (!state) return 0.0;
        const base = Number(state.position) || 0.0;
        const speed = Number(state.speed) || 1.0;
        if (!state.playing) return base;
        const updatedAt = Number(state.updated_at || state.last_updated || state.server_time || getServerNowSeconds());
        const elapsed = Math.max(0, getServerNowSeconds() - updatedAt);
        return Math.max(0, base + (elapsed * speed));
    }

    function resetTemporaryPlaybackRate(delayMs = 900) {
        if (playbackRateRestoreTimer) clearTimeout(playbackRateRestoreTimer);
        playbackRateRestoreTimer = setTimeout(() => {
            if (!authoritativeRoomState || !player || player.paused) return;
            const normalSpeed = Number(authoritativeRoomState.speed) || 1.0;
            if (Math.abs(player.speed - normalSpeed) > 0.01) {
                player.speed = normalSpeed;
            }
            playbackRateRestoreTimer = null;
        }, delayMs);
    }

    function getDefaultPlayableFile() {
        return mediaFilesList.find(file => {
            const ext = (file.filename || '').split('.').pop().toLowerCase();
            return ext && ext !== 'srt' && ext !== 'vtt';
        });
    }

    async function applyAuthoritativeState(rawState, options = {}) {
        const state = normalizePlaybackState(rawState);
        if (!state || !state.filename) return;

        if (state.last_command_id && state.last_command_id <= lastAppliedCommandId && !options.forceApply) {
            return;
        }

        lastAppliedCommandId = Math.max(lastAppliedCommandId, state.last_command_id || 0);
        authoritativeRoomState = state;
        window.watchPartyRoomSpeed = state.speed;

        const needsMediaChange = state.filename !== currentFilename || state.media_version !== currentMediaVersion;
        currentMediaVersion = Math.max(currentMediaVersion, state.media_version || 1);

        isApplyingRemoteState = true;
        suppressLocalEvents = true;
        setPlayerEventsIgnored(true);
        try {
            if (needsMediaChange) {
                await loadMediaAndApplyState(state.filename, state);
                return;
            }

            if (window.isImageActive) return;
            await waitForVideoReady(5000);
            applySoftPlaybackCorrection(state, options);
        } finally {
            isApplyingRemoteState = false;
            suppressLocalEvents = false;
            releasePlayerEventsAfter(700);
        }
    }

    function applySoftPlaybackCorrection(state = authoritativeRoomState, options = {}) {
        if (!state || !player || window.isImageActive) return;

        const normalSpeed = Number(state.speed) || 1.0;
        syncSpeedControl(normalSpeed);

        const expected = clampPlaybackPosition(getExpectedPlaybackPosition(state));
        const drift = player.currentTime - expected;
        const absDrift = Math.abs(drift);

        if (absDrift > DRIFT_SOFT_SECONDS || options.forceSeek) {
            player.currentTime = expected;
            player.speed = normalSpeed;
        } else if (state.playing && absDrift >= DRIFT_IGNORE_SECONDS) {
            player.speed = drift < 0 ? normalSpeed * 1.06 : normalSpeed * 0.94;
            resetTemporaryPlaybackRate();
        } else if (Math.abs(player.speed - normalSpeed) > 0.01) {
            player.speed = normalSpeed;
        }

        if (state.playing) {
            if (playbackUnlocked) {
                const playPromise = player.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(err => {
                        if (isAutoplayBlockedError(err)) {
                            playbackUnlocked = false;
                            window.safeSessionStorage.removeItem(playbackUnlockStorageKey);
                            showAutoplayOverlay();
                        }
                    });
                }
            } else {
                showAutoplayOverlay();
            }
        } else {
            player.pause();
            hideAutoplayOverlay();
        }
    }

    /**
     * 3. Sync and SSE Signal Handling
     */
    function handleSSEMessage(data) {
        switch (data.type) {
            case 'init':
                isPlaybackLocked = data.playback_locked || false;
                isSlowMode = data.slow_mode || false;
                allowScreenShare = data.allow_screen_share || false;
                allowWebcam = (data.allow_webcam !== undefined) ? data.allow_webcam : true;
                activeScreenShare = data.active_screen_share || null;
                activeWebcams = data.active_webcams || {};
                isSoundboardAllowed = (data.allow_soundboard !== undefined) ? data.allow_soundboard : true;
                
                const toggleScreenShareInit = document.getElementById('admin-toggle-screen-share');
                if (toggleScreenShareInit) {
                    toggleScreenShareInit.checked = allowScreenShare;
                }
                updateScreenShareUI();

                const toggleWebcamInit = document.getElementById('admin-toggle-webcam');
                if (toggleWebcamInit) {
                    toggleWebcamInit.checked = allowWebcam;
                }
                renderWebcamGrid();
                updateWebcamUI();
                
                const sbRoomToggleInit = document.getElementById('soundboard-room-toggle');
                if (sbRoomToggleInit) {
                    sbRoomToggleInit.checked = isSoundboardAllowed;
                }
                updateSoundboardUI();
                window.latestWatchPartyInitPayload = data;
                window.dispatchEvent(new CustomEvent('watchPartyInitPayload', { detail: data }));
                
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
                    applyAuthoritativeState(data.playback_state, { forceSeek: true, forceApply: true });
                } else {
                    // Default to first file
                    const defaultFile = getDefaultPlayableFile();
                    if (defaultFile) {
                        loadMediaAndApplyState(defaultFile.filename, { position: 0.0, playing: false });
                    }
                }

                // Register existing peers
                if (data.peers) {
                    data.peers.forEach(peer => {
                        activePeers[peer.client_id] = {
                            name: peer.name,
                            avatar: peer.avatar || 'cool_kid',
                            is_admin: peer.is_admin || false,
                            webcam_active: !!activeWebcams[peer.client_id]
                        };
                    });
                    updatePeersUI();
                }
                break;

            case 'peer_joined':
                addLogEntry('System', `${data.name} joined the watch party.`);
                addSystemChatMessage(`${data.name} joined the room.`);
                activePeers[data.client_id] = { name: data.name, avatar: data.avatar || 'cool_kid', is_admin: data.is_admin || false, webcam_active: false };
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
                // Cleanup remote screen audio node
                stopRemoteScreenAudio(data.client_id);
                removeRemoteWebcam(data.client_id);
                delete activeWebcams[data.client_id];
                delete remoteTrackMetadata[data.client_id];
                if (focusedMediaTileId === getWebcamMediaTileId(data.client_id)) {
                    clearMediaFocus();
                }
                delete activePeers[data.client_id];
                delete iceCandidateQueues[data.client_id];
                delete screenSenders[data.client_id];
                delete webcamSenders[data.client_id];
                renderWebcamGrid();
                updatePeersUI();
                break;

            case 'sync':
                const senderName = activePeers[data.sender_id]?.name || 'Someone';
                
                if (data.action === 'play') {
                    addLogEntry(senderName, `Played the video at ${formatTime(data.position)}`);
                } else if (data.action === 'pause') {
                    addLogEntry(senderName, `Paused the video`);
                } else if (data.action === 'seek') {
                    addLogEntry(senderName, `Seeked to ${formatTime(data.position)}`);
                }
                
                applyAuthoritativeState(data, { forceSeek: data.action === 'seek' });
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
                
                const folderState = data.playback_state || null;
                const targetFilename = data.target_filename || folderState?.filename || (getDefaultPlayableFile() ? getDefaultPlayableFile().filename : null);
                if (folderState && folderState.filename) {
                    applyAuthoritativeState(folderState, { forceSeek: true });
                } else if (targetFilename) {
                    loadMediaAndApplyState(targetFilename, { position: 0.0, playing: false, media_version: currentMediaVersion + 1 });
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
                stopLocalWebcam({ emit: false });
                Object.keys(peerConnections).forEach(id => {
                    try { peerConnections[id].close(); } catch(e) {}
                });
                const kickedOverlay = document.getElementById('wp-kicked-overlay');
                if (kickedOverlay) kickedOverlay.classList.add('active');
                const kickedClose = document.getElementById('btn-wp-kicked-close');
                if (kickedClose) {
                    kickedClose.onclick = () => { window.location.href = '/'; };
                }
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

            case 'webcam_started':
                if (data.client_id === clientId && localWebcamStream && !webcamEnabled) {
                    activateApprovedLocalWebcam();
                }
                activeWebcams[data.client_id] = {
                    client_id: data.client_id,
                    name: data.name,
                    avatar: data.avatar || 'cool_kid',
                    is_admin: data.is_admin || false
                };
                if (activePeers[data.client_id]) {
                    activePeers[data.client_id].webcam_active = true;
                }
                renderWebcamGrid();
                updateWebcamUI();
                break;

            case 'webcam_stopped':
                delete activeWebcams[data.client_id];
                if (activePeers[data.client_id]) {
                    activePeers[data.client_id].webcam_active = false;
                }
                removeRemoteWebcam(data.client_id);
                if (data.client_id === clientId && webcamEnabled) {
                    stopLocalWebcam({ emit: false });
                } else if (data.client_id === clientId && pendingWebcamStart) {
                    stopLocalWebcam({ emit: false });
                }
                renderWebcamGrid();
                updateWebcamUI();
                break;
                
            case 'party_ended':
                if (window.socket) window.socket.disconnect();
                stopLocalWebcam({ emit: false });
                Object.keys(peerConnections).forEach(id => {
                    try { peerConnections[id].close(); } catch(e) {}
                });
                const endedOverlay = document.getElementById('wp-ended-overlay');
                if (endedOverlay) endedOverlay.classList.add('active');
                const endedClose = document.getElementById('btn-wp-ended-close');
                if (endedClose) {
                    endedClose.onclick = () => { window.location.href = '/'; };
                }
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

    function handleIncomingSync(action, position, filename, roomPlaying, syncState = {}) {
        const wasPlaying = !player.paused;
        const shouldPlay = action === 'play'
            ? true
            : action === 'pause'
                ? false
                : (typeof roomPlaying === 'boolean' ? roomPlaying : wasPlaying);
        const state = { position, playing: shouldPlay, speed: syncState.speed };

        if (filename && currentFilename !== filename) {
            loadMediaAndApplyState(filename, state);
            return;
        }

        const isImage = currentFilename && /\.(jpg|jpeg|png|webp|gif)$/i.test(currentFilename);
        if (isImage) {
            return;
        }

        setPlayerEventsIgnored(true);
        waitForVideoReady(5000).then(() => {
            const targetTime = clampPlaybackPosition(Number(position) || 0);
            if (Math.abs(player.currentTime - targetTime) > 0.35 || action === 'seek') {
                player.currentTime = targetTime;
            }

            if (shouldPlay) {
                try {
                    player.play().catch(e => {
                        console.warn('Playback blocked by browser:', e);
                        showAutoplayOverlay();
                    });
                } catch (err) {
                    console.warn('Programmatic play() call error:', err);
                    showAutoplayOverlay();
                }
            } else {
                player.pause();
                hideAutoplayOverlay();
            }
        }).finally(() => {
            releasePlayerEventsAfter(1000); // 1000ms safety window
        });
    }

    function broadcastSync(action, position, filename = currentFilename) {
        if (!filename) return;
        if (window.socket && window.socket.connected) {
            window.socket.emit('sync', {
                party_id: window.PARTY_ID,
                client_id: clientId,
                action: action,
                position: position,
                filename: filename
            });
        }
    }

    /**
     * 4. WebRTC Mesh Audio Core
     */
    function optimizeAudioSDP(sdp) {
        let lines = sdp.split('\r\n');
        let opusPayload = null;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('opus/48000')) {
                let match = lines[i].match(/a=rtpmap:(\d+)\s+opus/i);
                if (match) {
                    opusPayload = match[1];
                    break;
                }
            }
        }
        
        if (opusPayload) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith(`a=fmtp:${opusPayload}`)) {
                    if (!lines[i].includes('maxaveragebitrate=')) {
                        lines[i] = lines[i] + ';maxaveragebitrate=96000;useinbandfec=1';
                    } else {
                        lines[i] = lines[i].replace(/maxaveragebitrate=\d+/, 'maxaveragebitrate=96000');
                    }
                    console.log(`[AudioOptim] Optimized Opus SDP line: ${lines[i]}`);
                    break;
                }
            }
        }
        return lines.join('\r\n');
    }

    function getDisplayNameForPeer(peerId) {
        if (peerId === clientId) return clientName || 'You';
        return activePeers[peerId]?.name || activeWebcams[peerId]?.name || 'Viewer';
    }

    function getAvatarForPeer(peerId) {
        if (peerId === clientId) return localAvatar || 'cool_kid';
        return activePeers[peerId]?.avatar || activeWebcams[peerId]?.avatar || 'cool_kid';
    }

    function getLocalTrackMetadata() {
        const metadata = { streams: {}, tracks: {} };
        const addStream = (stream, kind) => {
            if (!stream) return;
            metadata.streams[stream.id] = kind;
            stream.getTracks().forEach(track => {
                metadata.tracks[track.id] = kind;
            });
        };
        addStream(localStream, 'mic');
        addStream(localScreenStream, 'screen');
        addStream(localWebcamStream, 'webcam');
        return metadata;
    }

    function getRemoteTrackKind(peerId, event) {
        const stream = event.streams && event.streams[0];
        const metadata = remoteTrackMetadata[peerId] || {};
        if (event.track && metadata.tracks && metadata.tracks[event.track.id]) {
            return metadata.tracks[event.track.id];
        }
        if (stream && metadata.streams && metadata.streams[stream.id]) {
            return metadata.streams[stream.id];
        }
        if (event.track.kind === 'audio') {
            return stream && stream.getVideoTracks().length > 0 ? 'screen' : 'mic';
        }
        if (event.track.kind === 'video') {
            if (activeWebcams[peerId] && (!activeScreenShare || activeScreenShare.client_id !== peerId)) {
                return 'webcam';
            }
            return 'screen';
        }
        return 'unknown';
    }

    function renegotiatePeer(peerId, reason = 'media change') {
        const pc = peerConnections[peerId];
        if (!pc) return Promise.resolve();
        return pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
            .then(offer => {
                offer.sdp = optimizeAudioSDP(offer.sdp);
                return pc.setLocalDescription(offer).then(() => offer);
            })
            .then(offer => sendSignal(peerId, offer))
            .catch(err => console.error(`Error negotiating ${reason} with peer ${peerId}:`, err));
    }

    async function getMediaDeviceSnapshot() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return { supported: false, devices: [] };
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return {
                supported: true,
                devices: devices.map(device => ({
                    kind: device.kind,
                    label: device.label || '(label hidden)',
                    deviceId: device.deviceId ? '(present)' : '(missing)',
                    groupId: device.groupId ? '(present)' : '(missing)'
                })),
                videoInputCount: devices.filter(device => device.kind === 'videoinput').length
            };
        } catch (error) {
            return {
                supported: true,
                errorName: error && error.name,
                errorMessage: error && error.message,
                devices: []
            };
        }
    }

    function getWebcamEnvironmentInfo(constraints) {
        return {
            mediaDevicesAvailable: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            enumerateDevicesAvailable: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
            secureContext: !!window.isSecureContext,
            protocol: window.location.protocol,
            hostname: window.location.hostname,
            constraints
        };
    }

    function getWebcamStartErrorMessage(error) {
        const name = error && error.name ? error.name : '';
        const detail = error && error.message ? ` ${error.message}` : '';
        const isEdge = /\bEdg\//.test(navigator.userAgent || '');

        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            return `Camera permission denied (${name}). Allow camera access in browser settings.${detail}`;
        }
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            if (isEdge) {
                return `Webcam works best in Chrome. Edge camera initialization failed (${name}).${detail}`;
            }
            return `No camera was found by the browser. Check Windows camera privacy settings, camera driver, or try another browser. (${name}).${detail}`;
        }
        if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
            return `Camera is busy or already in use (${name}).${detail}`;
        }
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
            return `Camera constraints are not supported by this device (${name}).${detail}`;
        }
        if (name === 'SecurityError') {
            return `Camera requires HTTPS or localhost (${name}).${detail}`;
        }
        if (name === 'NoVideoTrackError') {
            return `Camera stream started but contained no video track.${detail}`;
        }

        return name ? `Camera could not start (${name}).${detail}` : `Camera could not start.${detail}`;
    }

    function isCameraNotFoundError(error) {
        return error && (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError');
    }

    function isCameraConstraintError(error) {
        return error && (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError');
    }

    function sanitizeCameraConstraints(constraints) {
        if (!constraints || !constraints.video || typeof constraints.video === 'boolean') {
            return constraints;
        }

        const sanitized = {
            ...constraints,
            video: { ...constraints.video }
        };
        if (sanitized.video.deviceId) {
            sanitized.video.deviceId = '(present)';
        }
        return sanitized;
    }

    async function getVideoInputDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return [];
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'videoinput' && device.deviceId);
        } catch (error) {
            console.warn('Unable to enumerate camera devices for retry:', {
                name: error && error.name,
                message: error && error.message
            });
            return [];
        }
    }

    async function requestWebcamStream(primaryConstraints, fallbackConstraints) {
        const attempts = [];
        try {
            attempts.push({ label: 'safe', constraints: sanitizeCameraConstraints(primaryConstraints) });
            return await navigator.mediaDevices.getUserMedia(primaryConstraints);
        } catch (error) {
            if (isCameraConstraintError(error) || isCameraNotFoundError(error)) {
                console.warn('Camera start failed; retrying with generic video constraints.', {
                    name: error.name,
                    message: error.message,
                    constraint: error.constraint,
                    constraints: sanitizeCameraConstraints(primaryConstraints),
                    fallbackConstraints: sanitizeCameraConstraints(fallbackConstraints)
                });
                try {
                    attempts.push({ label: 'generic', constraints: sanitizeCameraConstraints(fallbackConstraints) });
                    return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                } catch (fallbackError) {
                    if (isCameraNotFoundError(fallbackError)) {
                        const videoInputDevices = await getVideoInputDevices();
                        for (const device of videoInputDevices) {
                            const deviceConstraints = {
                                video: {
                                    deviceId: { ideal: device.deviceId }
                                },
                                audio: false
                            };
                            attempts.push({
                                label: 'detected-device-ideal',
                                deviceLabel: device.label || '(label hidden)',
                                constraints: sanitizeCameraConstraints(deviceConstraints)
                            });
                            try {
                                return await navigator.mediaDevices.getUserMedia(deviceConstraints);
                            } catch (deviceError) {
                                attempts[attempts.length - 1].error = {
                                    name: deviceError && deviceError.name,
                                    message: deviceError && deviceError.message,
                                    constraint: deviceError && deviceError.constraint
                                };
                            }
                        }
                    }
                    fallbackError.primaryCameraError = {
                        name: error.name,
                        message: error.message,
                        constraint: error.constraint
                    };
                    fallbackError.detectedVideoInputCount = attempts.filter(attempt => attempt.label === 'detected-device-ideal').length;
                    fallbackError.cameraAttempts = attempts;
                    throw fallbackError;
                }
            }
            error.cameraAttempts = attempts;
            throw error;
        }
    }

    async function startLocalWebcam() {
        if (webcamEnabled || localWebcamStream || pendingWebcamStart) return;
        if (!allowWebcam && !adminToken) {
            showToast('Webcam is disabled by admin.', 'warning');
            return;
        }
        if (!window.socket || !window.socket.connected) {
            showToast('Connect to the room before starting camera.', 'warning');
            return;
        }

        const primaryConstraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 24, max: 30 }
            },
            audio: false
        };
        const fallbackConstraints = { video: true, audio: false };

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('Camera start unavailable:', getWebcamEnvironmentInfo(primaryConstraints));
            showToast(window.isSecureContext ? 'Camera is not supported by this browser.' : 'Camera requires HTTPS or localhost.', 'error');
            return;
        }
        if (!window.isSecureContext) {
            console.warn('Camera start blocked by insecure context:', getWebcamEnvironmentInfo(primaryConstraints));
            showToast('Camera requires HTTPS or localhost.', 'error');
            return;
        }

        let stream = null;
        let devicesBeforeRequest = null;
        let videoTrackCount = 0;
        let videoTrackSettings = [];
        pendingWebcamStart = true;
        updateWebcamUI();

        try {
            devicesBeforeRequest = await getMediaDeviceSnapshot();
            stream = await requestWebcamStream(primaryConstraints, fallbackConstraints);
            const videoTracks = stream.getVideoTracks();
            videoTrackCount = videoTracks.length;
            videoTrackSettings = videoTracks.map(track => {
                try {
                    return track.getSettings ? track.getSettings() : {};
                } catch(e) {
                    return {};
                }
            });
            if (!videoTracks.length) {
                const noTrackError = new Error('getUserMedia returned a stream without video tracks.');
                noTrackError.name = 'NoVideoTrackError';
                throw noTrackError;
            }

            localWebcamStream = stream;

            videoTracks.forEach(track => {
                track.addEventListener('ended', () => stopLocalWebcam());
            });

            window.socket.emit('webcam_start', {
                party_id: window.PARTY_ID,
                client_id: clientId
            });

            updateWebcamUI();
        } catch (err) {
            if (stream) {
                stream.getTracks().forEach(track => {
                    try { track.stop(); } catch(e) {}
                });
            }
            const devicesAfterRequest = await getMediaDeviceSnapshot();
            console.warn('Watch Party webcam start failed:', {
                name: err && err.name,
                message: err && err.message,
                constraint: err && err.constraint,
                primaryCameraError: err && err.primaryCameraError,
                cameraAttempts: err && err.cameraAttempts,
                environment: getWebcamEnvironmentInfo(primaryConstraints),
                fallbackConstraints,
                devicesBeforeRequest,
                devicesAfterRequest,
                videoTrackCount,
                videoTrackSettings
            });
            showToast(getWebcamStartErrorMessage(err), 'error');
            stopLocalWebcam({ emit: false });
        }
    }

    function activateApprovedLocalWebcam() {
        if (!localWebcamStream || webcamEnabled) return;
        pendingWebcamStart = false;
        webcamEnabled = true;
        activeWebcams[clientId] = {
            client_id: clientId,
            name: clientName,
            avatar: localAvatar,
            is_admin: !!adminToken
        };

        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            if (!pc) continue;
            webcamSenders[peerId] = [];
            localWebcamStream.getVideoTracks().forEach(track => {
                const sender = pc.addTrack(track, localWebcamStream);
                webcamSenders[peerId].push(sender);
            });
            renegotiatePeer(peerId, 'webcam start');
        }

        renderWebcamGrid();
        updateWebcamUI();
    }

    function stopLocalWebcam(options = {}) {
        const shouldEmit = options.emit !== false;
        if (!localWebcamStream && !webcamEnabled && !pendingWebcamStart) return;

        const streamToStop = localWebcamStream;
        localWebcamStream = null;
        webcamEnabled = false;
        pendingWebcamStart = false;

        if (streamToStop) {
            streamToStop.getTracks().forEach(track => {
                try { track.stop(); } catch(e) {}
            });
        }

        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            const senders = webcamSenders[peerId];
            if (pc && senders) {
                senders.forEach(sender => {
                    try { pc.removeTrack(sender); } catch(e) {}
                });
                delete webcamSenders[peerId];
                renegotiatePeer(peerId, 'webcam stop');
            }
        }

        delete activeWebcams[clientId];
        if (focusedMediaTileId === getWebcamMediaTileId(clientId)) {
            showFocusedCameraOff();
        }

        if (shouldEmit && window.socket && window.socket.connected) {
            window.socket.emit('webcam_stop', {
                party_id: window.PARTY_ID,
                client_id: clientId
            });
        }

        renderWebcamGrid();
        updateWebcamUI();
    }

    function updateWebcamUI() {
        const btnWebcam = document.getElementById('btn-webcam-toggle');
        const icon = document.getElementById('webcam-icon');
        const disabled = !allowWebcam && !adminToken;

        if (btnWebcam) {
            btnWebcam.disabled = disabled || pendingWebcamStart;
            btnWebcam.classList.toggle('disabled', disabled);
            btnWebcam.classList.toggle('active', webcamEnabled || pendingWebcamStart);
            btnWebcam.title = disabled ? 'Webcams disabled by host' : (webcamEnabled ? 'Turn Camera Off' : (pendingWebcamStart ? 'Starting Camera...' : 'Turn Camera On'));
            if (icon) {
                icon.className = (webcamEnabled || pendingWebcamStart) ? 'fa-solid fa-video' : 'fa-solid fa-video-slash';
            }
        }

        // Sync bottom call control dock camera button
        const dockBtnCamera = document.getElementById('dock-btn-camera');
        if (dockBtnCamera) {
            const isActive = webcamEnabled || pendingWebcamStart;
            dockBtnCamera.disabled = disabled || pendingWebcamStart;
            dockBtnCamera.classList.toggle('disabled', disabled);
            dockBtnCamera.classList.toggle('active', isActive);
            dockBtnCamera.title = disabled ? 'Webcams disabled by host' : (webcamEnabled ? 'Turn Camera Off' : (pendingWebcamStart ? 'Starting Camera...' : 'Turn Camera On'));
            const dockIcon = dockBtnCamera.querySelector('i');
            if (dockIcon) {
                dockIcon.className = isActive ? 'fa-solid fa-video' : 'fa-solid fa-video-slash';
            }
        }
    }

    function displayRemoteWebcam(peerId, stream) {
        remoteWebcamStreams[peerId] = stream;
        if (!activeWebcams[peerId]) {
            activeWebcams[peerId] = {
                client_id: peerId,
                name: getDisplayNameForPeer(peerId),
                avatar: getAvatarForPeer(peerId),
                is_admin: !!activePeers[peerId]?.is_admin
            };
        }
        if (activePeers[peerId]) {
            activePeers[peerId].webcam_active = true;
        }
        renderMediaStage();
    }

    function removeRemoteWebcam(peerId) {
        delete remoteWebcamStreams[peerId];
        const tile = document.getElementById(`webcam-tile-${peerId}`);
        if (tile) tile.remove();
        if (focusedMediaTileId === getWebcamMediaTileId(peerId)) {
            clearMediaFocus();
        }
    }

    function getWebcamMediaTileId(peerId) {
        return `webcam:${peerId}`;
    }

    function attachMediaTileFocusHandlers(tile, tileId) {
        if (!tile) return;
        tile.dataset.mediaTileId = tileId;
        tile.ondblclick = (event) => {
            event.preventDefault();
            toggleMediaFocus(tileId);
        };
        tile.onclick = () => {
            if (focusedMediaTileId && focusedMediaTileId !== tileId) {
                setFocusedMediaTile(tileId);
            }
        };

        let lastTap = 0;
        tile.ontouchend = (event) => {
            const now = Date.now();
            if (now - lastTap < 350) {
                event.preventDefault();
                toggleMediaFocus(tileId);
            }
            lastTap = now;
        };
    }

    function setFocusedMediaTile(tileId) {
        focusedMediaTileId = tileId;
        focusedWebcamUserId = tileId && tileId.startsWith('webcam:') ? tileId.slice('webcam:'.length) : null;
        renderMediaStage();
    }

    function toggleMediaFocus(tileId) {
        if (focusedMediaTileId === tileId) {
            clearMediaFocus();
        } else {
            setFocusedMediaTile(tileId);
        }
    }

    function clearMediaFocus() {
        focusedMediaTileId = null;
        focusedWebcamUserId = null;
        renderMediaStage();
    }

    function ensureMediaTileLabel(tile, html) {
        if (!tile) return;
        let label = tile.querySelector(':scope > .media-tile-label');
        if (!label) {
            label = document.createElement('div');
            label.className = 'media-tile-label';
            tile.appendChild(label);
        }
        label.innerHTML = html;
    }

    function createWebcamMediaTile(peerId) {
        const tile = document.createElement('div');
        tile.className = 'media-tile webcam-tile generated-media-tile';
        tile.id = `webcam-tile-${peerId}`;
        tile.dataset.peerId = peerId;
        tile.dataset.mediaType = 'webcam';

        const stream = peerId === clientId ? localWebcamStream : remoteWebcamStreams[peerId];
        if (stream) {
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.muted = peerId === clientId;
            video.srcObject = stream;
            tile.appendChild(video);
            video.play().catch(() => {});
        } else {
            tile.innerHTML = `<div class="webcam-placeholder"><i class="fa-solid fa-video-slash"></i><span>Camera Off</span></div>`;
        }

        const avatarData = AVATAR_MAP[getAvatarForPeer(peerId)] || AVATAR_MAP.cool_kid;
        const label = document.createElement('div');
        label.className = 'webcam-label';
        label.innerHTML = `
            <span class="webcam-avatar-mini" style="background: ${avatarData.color};"><i class="fa-solid ${avatarData.icon}"></i></span>
            <span>${escapeHTML(peerId === clientId ? `${clientName} (You)` : getDisplayNameForPeer(peerId))}</span>
        `;
        tile.appendChild(label);
        attachMediaTileFocusHandlers(tile, getWebcamMediaTileId(peerId));
        return tile;
    }

    function renderMediaStage() {
        const stage = document.getElementById('wp-media-stage');
        const mainTile = document.getElementById('wp-main-video-tile');
        if (!stage || !mainTile) return;

        if (!cachedScreenShareTile) {
            cachedScreenShareTile = document.getElementById('wp-screen-share-container');
        }
        const screenTile = cachedScreenShareTile;

        stage.querySelectorAll('.generated-media-tile').forEach(tile => tile.remove());

        const mediaTileIds = ['main-video'];
        ensureMediaTileLabel(mainTile, '<i class="fa-solid fa-film"></i><span>Watch Party</span>');
        attachMediaTileFocusHandlers(mainTile, 'main-video');

        if (screenTile) {
            const screenActive = !!activeScreenShare;
            screenTile.classList.toggle('active', screenActive);
            if (screenActive) {
                if (screenTile.parentNode !== stage) {
                    mainTile.after(screenTile);
                }
                screenTile.style.display = 'flex';
                mediaTileIds.push('screen-share');
                attachMediaTileFocusHandlers(screenTile, 'screen-share');
            } else {
                screenTile.remove();
            }
        }

        const webcamIds = Object.keys(activeWebcams).filter(id => id === clientId || remoteWebcamStreams[id]);
        webcamIds.forEach(peerId => {
            const tile = createWebcamMediaTile(peerId);
            stage.appendChild(tile);
            mediaTileIds.push(getWebcamMediaTileId(peerId));
        });

        if (focusedMediaTileId && !mediaTileIds.includes(focusedMediaTileId)) {
            focusedMediaTileId = null;
            focusedWebcamUserId = null;
        }

        stage.className = 'watch-media-stage';
        stage.classList.add(`count-${Math.min(mediaTileIds.length, 5)}`);
        stage.classList.toggle('focus-mode', !!focusedMediaTileId);
        stage.classList.toggle('grid-mode', !focusedMediaTileId);
        stage.classList.toggle('has-thumbnails', !!focusedMediaTileId && mediaTileIds.length > 1);

        stage.querySelectorAll('.media-tile').forEach(tile => {
            const tileId = tile.dataset.mediaTileId;
            tile.classList.toggle('media-tile-focused', !!focusedMediaTileId && tileId === focusedMediaTileId);
            tile.classList.toggle('media-tile-thumbnail', !!focusedMediaTileId && tileId !== focusedMediaTileId);
        });

        // Group non-focused tiles inside a horizontal scrolling thumbnail strip if focus mode is active
        let strip = document.getElementById('wp-thumbnail-strip');
        if (focusedMediaTileId && mediaTileIds.length > 1) {
            if (!strip) {
                strip = document.createElement('div');
                strip.id = 'wp-thumbnail-strip';
                strip.className = 'wp-thumbnail-strip';
                stage.appendChild(strip);
            }
            // Move thumbnail tiles into the strip container
            stage.querySelectorAll('.media-tile-thumbnail').forEach(tile => {
                strip.appendChild(tile);
            });
        } else {
            if (strip) {
                // Return static tiles back to the stage first to preserve their DOM references
                if (mainTile && mainTile.parentNode === strip) {
                    stage.insertBefore(mainTile, strip);
                }
                if (screenTile && screenTile.parentNode === strip) {
                    stage.insertBefore(screenTile, strip);
                }
                strip.remove();
            }
        }
    }

    function renderWebcamGrid() {
        renderMediaStage();
    }

    function openWebcamFocus(peerId) {
        toggleMediaFocus(getWebcamMediaTileId(peerId));
    }

    function closeWebcamFocus() {
        clearMediaFocus();
    }

    function showFocusedCameraOff() {
        if (focusedWebcamUserId) {
            clearMediaFocus();
        }
        renderMediaStage();
    }

    function updateScreenShareUI() {
        const btn = document.getElementById('btn-wp-screen-share');
        const text = document.getElementById('wp-screen-share-btn-text');
        const container = cachedScreenShareTile || document.getElementById('wp-screen-share-container');
        const bannerText = document.getElementById('wp-screen-share-text');
        
        if (!btn || !text) return;
        
        const isSelfSharing = localScreenStream !== null;
        
        if (isSelfSharing) {
            btn.disabled = false;
            btn.style.setProperty('background', 'var(--accent-pink)', 'important');
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            text.innerText = 'Stop Sharing';
        } else if (activeScreenShare) {
            btn.disabled = true;
            btn.style.setProperty('background', 'rgba(255,255,255,0.05)', 'important');
            btn.style.opacity = '0.4';
            btn.style.pointerEvents = 'none';
            text.innerText = 'Screen Share Active';
        } else {
            const isAllowed = !!adminToken || allowScreenShare;
            if (isAllowed) {
                btn.disabled = false;
                btn.style.setProperty('background', 'var(--accent-blue)', 'important');
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                text.innerText = 'Share Screen';
            } else {
                btn.disabled = true;
                btn.style.setProperty('background', 'rgba(255,255,255,0.05)', 'important');
                btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
                text.innerText = 'Share Screen (Disabled)';
            }
        }

        // Sync bottom call control dock screen share button
        const dockBtnScreenShare = document.getElementById('dock-btn-screen-share');
        if (dockBtnScreenShare) {
            if (isSelfSharing) {
                dockBtnScreenShare.disabled = false;
                dockBtnScreenShare.classList.add('active');
                dockBtnScreenShare.classList.remove('disabled');
            } else if (activeScreenShare) {
                dockBtnScreenShare.disabled = true;
                dockBtnScreenShare.classList.remove('active');
                dockBtnScreenShare.classList.add('disabled');
            } else {
                const isAllowed = !!adminToken || allowScreenShare;
                dockBtnScreenShare.disabled = !isAllowed;
                dockBtnScreenShare.classList.remove('active');
                dockBtnScreenShare.classList.toggle('disabled', !isAllowed);
            }
        }
        
        if (container) {
            if (activeScreenShare) {
                container.classList.add('active');
                container.style.display = 'flex';
                if (bannerText) {
                    const displayName = activeScreenShare.client_id === clientId ? 'You' : activeScreenShare.name;
                    bannerText.innerText = `Screen shared by ${displayName}`;
                }
            } else {
                if (focusedMediaTileId === 'screen-share') {
                    clearMediaFocus();
                }
                container.classList.remove('active');
                container.style.display = 'none';
                const video = document.getElementById('wp-screen-share-video');
                if (video && video.srcObject && !isSelfSharing) {
                    video.srcObject = null;
                }
            }
        }
        renderMediaStage();
    }

    async function startLocalScreenShare() {
        if (localScreenStream) return;
        if (!adminToken && !allowScreenShare) {
            showToast("Screen sharing is disabled by the host.", "warning");
            return;
        }
        
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { max: 1920 },
                    height: { max: 1080 },
                    frameRate: { max: 30 }
                },
                audio: true
            });
            
            localScreenStream = stream;
            
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                showToast("Screen audio was not shared by the browser.", "warning");
            }
            
            const video = document.getElementById('wp-screen-share-video');
            if (video) {
                video.srcObject = stream;
                video.muted = true;
            }
            
            if (window.socket && window.socket.connected) {
                window.socket.emit('screen_share_start', {
                    party_id: window.PARTY_ID,
                    client_id: clientId
                });
            }
            
            for (const peerId in peerConnections) {
                const pc = peerConnections[peerId];
                if (pc) {
                    if (!screenSenders[peerId]) {
                        screenSenders[peerId] = [];
                    }
                    stream.getTracks().forEach(track => {
                        const sender = pc.addTrack(track, stream);
                        screenSenders[peerId].push(sender);
                    });
                    
                    renegotiatePeer(peerId, 'screen share start');
                }
            }
            
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.addEventListener('ended', () => {
                    console.log("Local screen share track ended natively by browser.");
                    stopLocalScreenShare();
                });
            }
            
            updateScreenShareUI();
            
        } catch (err) {
            console.error("Failed to start screen share:", err);
            showToast("Screen share cancelled or not allowed.", "warning");
        }
    }

    function stopLocalScreenShare() {
        if (!localScreenStream) return;
        
        localScreenStream.getTracks().forEach(track => {
            try { track.stop(); } catch(e) {}
        });
        localScreenStream = null;
        
        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            const senders = screenSenders[peerId];
            if (pc && senders) {
                senders.forEach(sender => {
                    try { pc.removeTrack(sender); } catch(e) {}
                });
                delete screenSenders[peerId];
                
                renegotiatePeer(peerId, 'screen share stop');
            }
        }
        
        if (window.socket && window.socket.connected) {
            window.socket.emit('screen_share_stop', {
                party_id: window.PARTY_ID,
                client_id: clientId
            });
        }
        
        const video = document.getElementById('wp-screen-share-video');
        if (video) {
            video.srcObject = null;
        }
        
        updateScreenShareUI();
    }

    function displayRemoteScreenShare(peerId, stream) {
        const video = document.getElementById('wp-screen-share-video');
        if (video) {
            video.srcObject = stream;
        }
        renderMediaStage();
    }

    function createPeerConnection(peerId, isInitiator) {
        if (peerConnections[peerId]) {
            try { peerConnections[peerId].close(); } catch(e) {}
            delete peerConnections[peerId];
            delete screenSenders[peerId];
            delete webcamSenders[peerId];
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

        // Add local screen share tracks if active
        if (localScreenStream) {
            if (!screenSenders[peerId]) {
                screenSenders[peerId] = [];
            }
            localScreenStream.getTracks().forEach(track => {
                const sender = pc.addTrack(track, localScreenStream);
                screenSenders[peerId].push(sender);
            });
        }

        // Add local webcam tracks if active
        if (localWebcamStream) {
            if (!webcamSenders[peerId]) {
                webcamSenders[peerId] = [];
            }
            localWebcamStream.getVideoTracks().forEach(track => {
                const sender = pc.addTrack(track, localWebcamStream);
                webcamSenders[peerId].push(sender);
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
            const stream = event.streams[0];
            const trackKind = getRemoteTrackKind(peerId, event);
            if (event.track.kind === 'audio') {
                if (trackKind === 'screen') {
                    console.log(`Received remote screen share audio track from peer ${peerId}`);
                    playRemoteScreenAudio(peerId, stream);
                } else {
                    console.log(`Received remote mic audio track from peer ${peerId}`);
                    playRemoteStream(peerId, stream);
                }
            } else if (event.track.kind === 'video') {
                if (trackKind === 'webcam') {
                    console.log(`Received remote webcam track from peer ${peerId}`);
                    event.track.addEventListener('ended', () => {
                        removeRemoteWebcam(peerId);
                        delete activeWebcams[peerId];
                        renderWebcamGrid();
                    });
                    displayRemoteWebcam(peerId, stream);
                } else {
                    console.log(`Received remote video (screen share) track from peer ${peerId}`);
                    displayRemoteScreenShare(peerId, stream);
                }
            }
        };

        // If initiator, send offer
        if (isInitiator) {
            pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
                .then(offer => {
                    offer.sdp = optimizeAudioSDP(offer.sdp);
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
            if (signal.track_metadata) {
                remoteTrackMetadata[senderId] = signal.track_metadata;
            }
            if (signal.sdp) {
                signal.sdp = optimizeAudioSDP(signal.sdp);
            }
            pc.setRemoteDescription(new RTCSessionDescription({ type: signal.type, sdp: signal.sdp }))
                .then(() => {
                    processIceQueue(senderId);
                    return pc.createAnswer();
                })
                .then(answer => {
                    answer.sdp = optimizeAudioSDP(answer.sdp);
                    return pc.setLocalDescription(answer).then(() => answer);
                })
                .then(answer => {
                    sendSignal(senderId, answer);
                })
                .catch(err => console.error(`Error processing offer from ${senderId}:`, err));

        } else if (signal.type === 'answer') {
            if (pc) {
                if (signal.track_metadata) {
                    remoteTrackMetadata[senderId] = signal.track_metadata;
                }
                if (signal.sdp) {
                    signal.sdp = optimizeAudioSDP(signal.sdp);
                }
                pc.setRemoteDescription(new RTCSessionDescription({ type: signal.type, sdp: signal.sdp }))
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
            const payload = { type: signalData.type };
            if (signalData.sdp) {
                payload.sdp = signalData.sdp;
            }
            if (signalData.candidate) {
                payload.candidate = signalData.candidate;
            }
            if (payload.type === 'offer' || payload.type === 'answer') {
                payload.track_metadata = getLocalTrackMetadata();
            }
            window.socket.emit('signal', {
                party_id: window.PARTY_ID,
                sender_id: clientId,
                target_id: targetId,
                signal: payload
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

    function playRemoteScreenAudio(peerId, stream) {
        if (remoteScreenAudioElements[peerId]) {
            try { 
                remoteScreenAudioElements[peerId].pause();
                remoteScreenAudioElements[peerId].remove(); 
            } catch(e) {}
            delete remoteScreenAudioElements[peerId];
        }

        const audio = document.createElement('audio');
        audio.id = `audio-screen-remote-${peerId}`;
        audio.autoplay = true;
        audio.controls = false;
        
        audio.style.position = 'fixed';
        audio.style.width = '1px';
        audio.style.height = '1px';
        audio.style.opacity = '0';
        audio.style.pointerEvents = 'none';
        
        audio.srcObject = stream;

        document.body.appendChild(audio);
        remoteScreenAudioElements[peerId] = audio;

        audio.play().catch(err => {
            console.warn(`Autoplay blocked remote screen audio for peer ${peerId}:`, err);
            const unmuteOnInteract = () => {
                audio.play().then(() => {
                    document.removeEventListener('click', unmuteOnInteract);
                });
            };
            document.addEventListener('click', unmuteOnInteract);
        });
    }

    function stopRemoteScreenAudio(peerId) {
        if (remoteScreenAudioElements[peerId]) {
            try {
                remoteScreenAudioElements[peerId].pause();
                remoteScreenAudioElements[peerId].remove();
            } catch(e) {}
            delete remoteScreenAudioElements[peerId];
        }
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

            // Feature 6: Individual Volume Controls
            const volValue = (window.getPeerVolume) ? window.getPeerVolume(peerId) : 1;
            const sliderOpen = (window.isPeerVolumeSliderOpen) ? window.isPeerVolumeSliderOpen(peerId) : false;
            const sliderDisplay = sliderOpen ? 'block' : 'none';
            let volIconClass = 'fa-volume-high';
            if (volValue === 0) {
                volIconClass = 'fa-volume-xmark';
            } else if (volValue < 0.5) {
                volIconClass = 'fa-volume-low';
            }

            const volumeHtml = `
                <div class="peer-audio-control" style="display: flex; align-items: center; gap: 0.35rem; position: relative;">
                    <button class="peer-volume-btn" onclick="toggleVolumeSlider('${peerId}')" style="background: transparent; border: none; padding: 0; margin: 0; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px;" title="Adjust Volume">
                        <i class="peer-volume-icon fa-solid ${volIconClass}" id="peer-vol-icon-${peerId}"></i>
                    </button>
                    <input type="range" class="peer-volume-slider" id="peer-vol-slider-${peerId}" min="0" max="1" step="0.05" value="${volValue}" oninput="adjustPeerVolume('${peerId}', this.value)" style="width: 50px; height: 3px; cursor: pointer; outline: none; margin: 0; display: ${sliderDisplay};">
                </div>
            `;

            const pAvatar = peer.avatar || 'cool_kid';
            const avatarData = AVATAR_MAP[pAvatar] || AVATAR_MAP.cool_kid;
            const peerAvatarHtml = `
                <div class="peer-avatar-circle-mini" style="background: ${avatarData.color}; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: #000000; border: 1.5px solid #000000; box-shadow: 1px 1px 0px #000000; flex-shrink: 0;">
                    <i class="fa-solid ${avatarData.icon}"></i>
                </div>
            `;

            peerItem.innerHTML = `
                <div class="peer-name" style="display: flex; align-items: center; gap: 0.5rem;">
                    ${crownHtml}
                    ${peerAvatarHtml}
                    <span>${peer.name}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${actionsHtml}
                    ${volumeHtml}
                    <div class="voice-indicator ${isMuted ? 'muted' : ''}" id="voice-${peerId}"></div>
                </div>
            `;
            peersList.appendChild(peerItem);
        });
    }

    window.adminForceMute = (peerId, peerName) => {
        if (!adminToken) return;
        window.showBrutalConfirm(`Are you sure you want to force mute ${peerName}?`, 'Mute User').then(confirmed => {
            if (!confirmed) return;
            
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
        });
    };

    window.adminKickPeer = (peerId, peerName) => {
        if (!adminToken) return;
        window.showBrutalConfirm(`Are you sure you want to kick ${peerName}?`, 'Kick User').then(confirmed => {
            if (!confirmed) return;
            
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

            if (window.socket) {
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

    function showSoundboardEvent(clientName, displayName) {
        const messagesContainer = document.getElementById('wp-chat-messages');
        if (!messagesContainer) return;

        let stack = document.getElementById('wp-soundboard-events');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'wp-soundboard-events';
            stack.className = 'soundboard-event-stack';
            messagesContainer.appendChild(stack);
        }

        const item = document.createElement('div');
        item.className = 'soundboard-event-pill';
        item.innerHTML = `
            <i class="fa-solid fa-volume-high"></i>
            <span>${escapeHTML(clientName || 'Someone')} played ${escapeHTML(displayName || 'a sound')}</span>
        `;
        stack.appendChild(item);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        setTimeout(() => item.classList.add('fade-out'), 1800);
        setTimeout(() => {
            item.remove();
            if (!stack.children.length) {
                stack.remove();
            }
        }, 2400);
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
        const btnCustomMedia = document.getElementById('btn-wp-custom-media');
        if (btnCustomMedia) {
            btnCustomMedia.style.display = 'inline-block';
        }

        const folderSelectContainer = document.getElementById('wp-folder-select-container');
        if (folderSelectContainer) {
            folderSelectContainer.style.display = 'flex';
        }

        const toggleScreenShare = document.getElementById('admin-toggle-screen-share');
        if (toggleScreenShare) {
            toggleScreenShare.checked = allowScreenShare;
            toggleScreenShare.onchange = () => {
                if (window.socket && window.socket.connected) {
                    window.socket.emit('toggle_screen_share_permission', {
                        party_id: window.PARTY_ID,
                        client_id: clientId,
                        allowed: toggleScreenShare.checked
                    });
                }
            };
        }

        const toggleWebcam = document.getElementById('admin-toggle-webcam');
        if (toggleWebcam) {
            toggleWebcam.checked = allowWebcam;
            toggleWebcam.onchange = () => {
                if (window.socket && window.socket.connected) {
                    window.socket.emit('toggle_webcam_permission', {
                        party_id: window.PARTY_ID,
                        client_id: clientId,
                        allowed: toggleWebcam.checked
                    });
                }
            };
        }

        const globalSearchContainer = document.getElementById('wp-global-search-container');
        if (globalSearchContainer) {
            globalSearchContainer.style.display = 'flex';
        }

        // Global Library Search Bindings (Admin Only)
        const globalSearchInput = document.getElementById('wp-global-search-input');
        const globalSearchClear = document.getElementById('wp-global-search-clear');
        const globalSearchResults = document.getElementById('wp-global-search-results');
        
        let globalSearchTimeout = null;
        
        if (globalSearchInput && globalSearchResults) {
            globalSearchInput.addEventListener('input', () => {
                const query = globalSearchInput.value.trim();
                
                if (globalSearchClear) {
                    globalSearchClear.style.display = query ? 'flex' : 'none';
                }
                
                if (globalSearchTimeout) {
                    clearTimeout(globalSearchTimeout);
                }
                
                if (!query) {
                    globalSearchResults.innerHTML = '';
                    globalSearchResults.style.display = 'none';
                    return;
                }
                
                globalSearchTimeout = setTimeout(() => {
                    globalSearchResults.innerHTML = `
                        <div style="padding: 0.75rem; text-align: center; color: var(--text-muted); font-size: 0.75rem;">
                            <i class="fa-solid fa-spinner fa-spin" style="color: var(--accent-blue);"></i> Searching library...
                        </div>
                    `;
                    globalSearchResults.style.display = 'flex';
                    
                    fetch(`/api/watch-party/${window.PARTY_ID}/library-search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            admin_token: adminToken,
                            q: query
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status !== 'success') {
                            globalSearchResults.innerHTML = `
                                <div style="padding: 0.75rem; text-align: center; color: var(--accent-red); font-size: 0.75rem;">
                                    Error: ${data.message}
                                </div>
                            `;
                            return;
                        }
                        
                        const results = data.results || [];
                        if (results.length === 0) {
                            globalSearchResults.innerHTML = `
                                <div style="padding: 0.75rem; text-align: center; color: var(--text-muted); font-size: 0.75rem;">
                                    No library videos found.
                                </div>
                            `;
                            return;
                        }
                        
                        globalSearchResults.innerHTML = '';
                        results.forEach((item, idx) => {
                            const resultItem = document.createElement('div');
                            resultItem.className = 'global-search-item';
                            resultItem.style.display = 'flex';
                            resultItem.style.alignItems = 'center';
                            resultItem.style.gap = '0.5rem';
                            resultItem.style.padding = '0.4rem';
                            resultItem.style.borderRadius = '4px';
                            resultItem.style.border = '1px solid transparent';
                            resultItem.style.cursor = 'pointer';
                            resultItem.style.transition = 'background 0.2s';
                            if (idx === 0) {
                                resultItem.setAttribute('data-first-result', 'true');
                            }
                            
                            const isVideo = !!item.is_video;
                            let thumbUrl = isVideo 
                                ? `/api/video-thumbnail/${item.folder_name}/${item.filename}`
                                : `/media/${item.folder_name}/${item.filename}`;
                                
                            const cleanFolder = item.display_folder_name || item.folder_name;
                            
                            resultItem.innerHTML = `
                                <div style="width: 50px; aspect-ratio: 16/9; position: relative; border-radius: 2px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                    <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--text-muted);">
                                        ${isVideo ? '<i class="fa-solid fa-film"></i>' : '<i class="fa-solid fa-image"></i>'}
                                    </div>
                                </div>
                                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem;">
                                    <div class="result-title" style="font-size: 0.75rem; font-weight: 700; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.filename}">${item.filename}</div>
                                    <div style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.65rem; color: var(--text-muted); min-width: 0;">
                                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">Path: ${cleanFolder}</span>
                                        <span style="background: var(--accent-blue); color: #000; padding: 0 3px; border-radius: 2px; font-size: 0.55rem; font-weight: 800; text-transform: uppercase; flex-shrink: 0;">${item.file_type || 'media'}</span>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
                                    <button class="btn-play-result wp-mini-btn" title="Play Room-wide" style="background: var(--accent-pink); color: #000; border: 1px solid #000; padding: 0.25rem 0.4rem; border-radius: 2px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;"><i class="fa-solid fa-play"></i></button>
                                    <button class="btn-queue-result wp-mini-btn" title="Add to Queue" style="background: var(--accent-lime); color: #000; border: 1px solid #000; padding: 0.25rem 0.4rem; border-radius: 2px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;"><i class="fa-solid fa-plus"></i></button>
                                </div>
                            `;
                            
                            resultItem.addEventListener('mouseenter', () => {
                                resultItem.style.background = 'rgba(255, 255, 255, 0.05)';
                                resultItem.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            });
                            resultItem.addEventListener('mouseleave', () => {
                                resultItem.style.background = 'transparent';
                                resultItem.style.borderColor = 'transparent';
                            });
                            
                            const playBtn = resultItem.querySelector('.btn-play-result');
                            playBtn.onclick = (e) => {
                                e.stopPropagation();
                                playGlobalResult(item.filename, item.folder_name);
                            };
                            
                            const queueBtn = resultItem.querySelector('.btn-queue-result');
                            queueBtn.onclick = (e) => {
                                e.stopPropagation();
                                if (window.addToQueue) {
                                    window.addToQueue(item.filename, item.folder_name);
                                }
                            };
                            
                            resultItem.onclick = () => {
                                playGlobalResult(item.filename, item.folder_name);
                            };
                            
                            globalSearchResults.appendChild(resultItem);
                        });
                    })
                    .catch(err => {
                        console.error('Error fetching global search results:', err);
                        globalSearchResults.innerHTML = `
                            <div style="padding: 0.75rem; text-align: center; color: var(--accent-red); font-size: 0.75rem;">
                                Search failed.
                            </div>
                        `;
                    });
                }, 300);
            });
            
            globalSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearGlobalSearch();
                } else if (e.key === 'Enter') {
                    const firstResult = globalSearchResults.querySelector('[data-first-result="true"]');
                    if (firstResult) {
                        firstResult.click();
                    }
                }
            });
        }
        
        if (globalSearchClear) {
            globalSearchClear.onclick = () => {
                clearGlobalSearch();
            };
        }
        
        document.addEventListener('click', (e) => {
            if (globalSearchContainer && !globalSearchContainer.contains(e.target)) {
                if (globalSearchResults) {
                    globalSearchResults.style.display = 'none';
                }
            }
        });
        
        function clearGlobalSearch() {
            if (globalSearchInput) {
                globalSearchInput.value = '';
                globalSearchInput.blur();
            }
            if (globalSearchClear) {
                globalSearchClear.style.display = 'none';
            }
            if (globalSearchResults) {
                globalSearchResults.innerHTML = '';
                globalSearchResults.style.display = 'none';
            }
        }
        
        function playGlobalResult(filename, folderName) {
            clearGlobalSearch();
            if (folderName === window.FOLDER_NAME) {
                if (window.selectAndBroadcastMedia) {
                    window.selectAndBroadcastMedia(filename);
                }
            } else {
                fetch(`/api/watch-party/${window.PARTY_ID}/change-folder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        folder_name: folderName,
                        filename: filename
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status !== 'success') {
                        showToast('Error loading video: ' + data.message, 'error');
                    }
                })
                .catch(err => {
                    console.error('Error switching folder on playGlobalResult:', err);
                    showToast('Failed to change room folder.', 'error');
                });
            }
        }

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
                window.showBrutalConfirm('Clear chat history for all participants?', 'Clear Chat').then(confirmed => {
                    if (!confirmed) return;
                    
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
                window.showBrutalConfirm('Are you sure you want to end this watch party session now? All connected participants will be disconnected.', 'End Party').then(confirmed => {
                    if (!confirmed) return;
                    
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
                });
            };
        }

        // Setup Media Search Pill for Admin
        const searchContainer = document.getElementById('wp-media-search-container');
        const searchInput = document.getElementById('wp-media-search-input');
        const searchClear = document.getElementById('wp-media-search-clear');

        if (searchContainer) {
            searchContainer.style.display = 'flex';
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase().trim();
                if (query) {
                    if (searchClear) searchClear.style.display = 'flex';
                    const filtered = mediaFilesList.filter(file => {
                        const displayName = (file.filename || '').toLowerCase();
                        return displayName.includes(query);
                    });
                    renderPlaylist(filtered);
                } else {
                    if (searchClear) searchClear.style.display = 'none';
                    renderPlaylist(mediaFilesList);
                }
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.style.display = 'none';
                renderPlaylist(mediaFilesList);
                searchInput.focus();
            });
        }
        
        // Soundboard Admin UI setup
        const sbAddBtn = document.getElementById('soundboard-add-btn');
        if (sbAddBtn) sbAddBtn.style.display = 'inline-block';
        
        const sbToggleLabel = document.getElementById('soundboard-admin-toggle-label');
        if (sbToggleLabel) sbToggleLabel.style.display = 'flex';

        const sbRoomToggle = document.getElementById('soundboard-room-toggle');
        if (sbRoomToggle) {
            sbRoomToggle.checked = isSoundboardAllowed;
            sbRoomToggle.onchange = () => {
                if (window.socket && window.socket.connected) {
                    window.socket.emit('toggle_soundboard', {
                        party_id: window.PARTY_ID,
                        client_id: clientId,
                        allowed: sbRoomToggle.checked
                    });
                }
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
        const closeBtn = document.getElementById('btn-wp-change-folder-close');
        if (closeBtn) closeBtn.onclick = closeModal;
        
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
                    showToast('Error changing folder: ' + data.message, 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = 'Switch Folder';
                }
            })
            .catch(err => {
                console.error('Error switching folder:', err);
                showToast('An error occurred while switching the folder.', 'error');
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

    // --- Watch Party Soundboard Helper Functions ---
    function initializeSoundboard() {
        const toggleBtn = document.getElementById('btn-soundboard-toggle');
        const panel = document.getElementById('soundboard-panel');
        const volumeSlider = document.getElementById('soundboard-volume-slider');
        const muteBtn = document.getElementById('soundboard-mute-btn');
        const warning = document.getElementById('soundboard-autoplay-warning');

        // Toggle Soundboard Panel
        if (toggleBtn && panel) {
            toggleBtn.onclick = () => {
                const dockBtnSoundboard = document.getElementById('dock-btn-soundboard');
                if (panel.style.display === 'none') {
                    panel.style.display = 'flex';
                    toggleBtn.style.color = 'var(--accent)';
                    if (dockBtnSoundboard) dockBtnSoundboard.classList.add('active');
                    loadSoundboardList();
                } else {
                    panel.style.display = 'none';
                    toggleBtn.style.color = 'var(--text-dim)';
                    if (dockBtnSoundboard) dockBtnSoundboard.classList.remove('active');
                }
            };
        }

        // Volume slider setup
        if (volumeSlider) {
            volumeSlider.value = soundboardVolume;
            volumeSlider.oninput = (e) => {
                soundboardVolume = parseFloat(e.target.value);
                localStorage.setItem('wp_soundboard_volume', soundboardVolume);
                activeAudioObjects.forEach(audio => {
                    audio.volume = soundboardVolume;
                });
            };
        }

        // Mute button setup
        if (muteBtn) {
            const icon = muteBtn.querySelector('i');
            if (soundboardMuted) {
                if (icon) {
                    icon.className = 'fa-solid fa-volume-xmark';
                    muteBtn.style.color = '#ef4444';
                }
            }
            muteBtn.onclick = () => {
                soundboardMuted = !soundboardMuted;
                localStorage.setItem('wp_soundboard_muted', soundboardMuted);
                
                if (icon) {
                    if (soundboardMuted) {
                        icon.className = 'fa-solid fa-volume-xmark';
                        muteBtn.style.color = '#ef4444';
                        activeAudioObjects.forEach(audio => {
                            audio.pause();
                        });
                        activeAudioObjects.clear();
                    } else {
                        icon.className = 'fa-solid fa-volume-high';
                        muteBtn.style.color = 'var(--text)';
                    }
                }
            };
        }

        // Autoplay warning click handler
        if (warning) {
            warning.onclick = () => {
                unlockSoundboardAudio();
            };
        }

        // Load initially
        loadSoundboardList();

        // Modals: Add Sound Modal
        const soundboardAddBtn = document.getElementById('soundboard-add-btn');
        const addSoundOverlay = document.getElementById('wp-add-sound-overlay');
        const cancelAddBtn = document.getElementById('btn-wp-sound-cancel');
        const submitAddBtn = document.getElementById('btn-wp-sound-submit');
        const soundNameInput = document.getElementById('wp-sound-name');
        const soundFileInput = document.getElementById('wp-sound-file');
        const uploadErrorDiv = document.getElementById('wp-sound-upload-error');

        if (soundboardAddBtn && addSoundOverlay) {
            soundboardAddBtn.onclick = () => {
                soundNameInput.value = '';
                soundFileInput.value = '';
                uploadErrorDiv.style.display = 'none';
                addSoundOverlay.classList.add('active');
            };

            const closeAddModal = () => {
                addSoundOverlay.classList.remove('active');
            };

            cancelAddBtn.onclick = closeAddModal;
            const closeAddBtn = document.getElementById('btn-wp-sound-close');
            if (closeAddBtn) closeAddBtn.onclick = closeAddModal;
            addSoundOverlay.onclick = (e) => {
                if (e.target === addSoundOverlay) closeAddModal();
            };

            submitAddBtn.onclick = () => {
                const displayName = soundNameInput.value.trim();
                const file = soundFileInput.files[0];

                if (!displayName) {
                    uploadErrorDiv.innerText = 'Display name is required';
                    uploadErrorDiv.style.display = 'block';
                    return;
                }
                if (!file) {
                    uploadErrorDiv.innerText = 'Audio file is required';
                    uploadErrorDiv.style.display = 'block';
                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    uploadErrorDiv.innerText = 'File size exceeds 5MB limit';
                    uploadErrorDiv.style.display = 'block';
                    return;
                }

                submitAddBtn.disabled = true;
                submitAddBtn.innerText = 'Uploading...';

                const formData = new FormData();
                formData.append('display_name', displayName);
                formData.append('file', file);
                formData.append('admin_token', adminToken);
                formData.append('client_name', clientName);

                fetch(`/api/watch-party/${window.PARTY_ID}/soundboard/upload`, {
                    method: 'POST',
                    body: formData
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        closeAddModal();
                        showToast('Custom sound added successfully!', 'success');
                    } else {
                        uploadErrorDiv.innerText = data.message || 'Upload failed';
                        uploadErrorDiv.style.display = 'block';
                    }
                })
                .catch(err => {
                    console.error('Error uploading sound:', err);
                    uploadErrorDiv.innerText = 'An error occurred during upload.';
                    uploadErrorDiv.style.display = 'block';
                })
                .finally(() => {
                    submitAddBtn.disabled = false;
                    submitAddBtn.innerText = 'Upload';
                });
            };
        }

        // Modals: Rename Sound Modal
        const renameSoundOverlay = document.getElementById('wp-rename-sound-overlay');
        const cancelRenameBtn = document.getElementById('btn-wp-sound-rename-cancel');
        const submitRenameBtn = document.getElementById('btn-wp-sound-rename-submit');
        const renameNameInput = document.getElementById('wp-rename-sound-name');
        const renameSoundIdInput = document.getElementById('wp-rename-sound-id');
        const renameErrorDiv = document.getElementById('wp-sound-rename-error');

        if (renameSoundOverlay) {
            const closeRenameModal = () => {
                renameSoundOverlay.classList.remove('active');
            };

            cancelRenameBtn.onclick = closeRenameModal;
            const closeRenameBtn = document.getElementById('btn-wp-sound-rename-close');
            if (closeRenameBtn) closeRenameBtn.onclick = closeRenameModal;
            renameSoundOverlay.onclick = (e) => {
                if (e.target === renameSoundOverlay) closeRenameModal();
            };

            submitRenameBtn.onclick = () => {
                const displayName = renameNameInput.value.trim();
                const soundId = renameSoundIdInput.value;

                if (!displayName) {
                    renameErrorDiv.innerText = 'Display name is required';
                    renameErrorDiv.style.display = 'block';
                    return;
                }

                submitRenameBtn.disabled = true;
                submitRenameBtn.innerText = 'Saving...';

                fetch(`/api/watch-party/${window.PARTY_ID}/soundboard/rename/${soundId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        admin_token: adminToken,
                        display_name: displayName
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        closeRenameModal();
                        showToast('Sound renamed successfully!', 'success');
                    } else {
                        renameErrorDiv.innerText = data.message || 'Rename failed';
                        renameErrorDiv.style.display = 'block';
                    }
                })
                .catch(err => {
                    console.error('Error renaming sound:', err);
                    renameErrorDiv.innerText = 'An error occurred during rename.';
                    renameErrorDiv.style.display = 'block';
                })
                .finally(() => {
                    submitRenameBtn.disabled = false;
                    submitRenameBtn.innerText = 'Save';
                });
            };
        }
    }

    async function loadSoundboardList() {
        try {
            const res = await fetch('/api/watch-party/soundboard/list');
            const data = await res.json();
            if (data.status === 'success') {
                cacheSoundboardSounds(data.default_sounds, data.custom_sounds);
                
                renderSoundboardGrid(data.default_sounds, data.custom_sounds);
            }
        } catch (err) {
            console.error('Error fetching soundboard list:', err);
        }
    }

    function cacheSoundboardSounds(defaultSounds = [], customSounds = []) {
        [...defaultSounds, ...customSounds].forEach(sound => {
            if (!sound || !sound.sound_id || !sound.url) return;
            soundboardCache[sound.sound_id] = sound.url;
            preloadSoundboardAudio(sound.url);
        });
    }

    function preloadSoundboardAudio(url) {
        if (!url || soundboardPreloadCache[url]) return soundboardPreloadCache[url];

        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = url;
        audio.load();

        soundboardPreloadCache[url] = audio;
        return audio;
    }

    function renderSoundboardGrid(defaultSounds, customSounds) {
        const grid = document.getElementById('soundboard-grid');
        if (!grid) return;

        grid.innerHTML = '';
        const allSounds = [...defaultSounds, ...customSounds];
        const isUserAdmin = !!adminToken;

        allSounds.forEach(sound => {
            const chip = document.createElement('div');
            chip.className = 'sound-chip';
            chip.setAttribute('data-sound-id', sound.sound_id);

            const playDiv = document.createElement('div');
            playDiv.style.display = 'flex';
            playDiv.style.alignItems = 'center';
            playDiv.style.gap = '0.35rem';
            playDiv.style.flex = '1';
            playDiv.style.minWidth = '0';
            
            const badgeHtml = sound.is_custom 
                ? `<span style="font-size: 0.55rem; background: rgba(255, 140, 0, 0.15); color: var(--accent); padding: 1px 3px; border-radius: 3px; font-weight: 800; text-transform: uppercase; margin-left: 0.25rem; flex-shrink: 0;" title="Uploaded by ${escapeHTML(sound.uploaded_by || 'Host')}">Custom</span>`
                : '';
            
            playDiv.innerHTML = `
                <i class="fa-solid fa-play" style="font-size: 0.65rem; color: var(--accent); opacity: 0.7;"></i>
                <span style="font-size: 0.75rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${escapeHTML(sound.display_name)}</span>
                ${badgeHtml}
            `;
            chip.appendChild(playDiv);

            if (isUserAdmin && sound.is_custom) {
                const actionsDiv = document.createElement('div');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.alignItems = 'center';
                actionsDiv.style.gap = '0.25rem';

                // Rename button
                const renameBtn = document.createElement('button');
                renameBtn.className = 'sb-edit-btn';
                renameBtn.title = 'Rename';
                renameBtn.style.background = 'transparent';
                renameBtn.style.border = 'none';
                renameBtn.style.color = 'var(--text-muted)';
                renameBtn.style.cursor = 'pointer';
                renameBtn.style.padding = '0.15rem';
                renameBtn.style.fontSize = '0.65rem';
                renameBtn.style.display = 'flex';
                renameBtn.style.alignItems = 'center';
                renameBtn.style.transition = 'color 0.15s';
                renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                renameBtn.onclick = (e) => {
                    e.stopPropagation();
                    openRenameSoundModal(sound.sound_id, sound.display_name);
                };

                // Delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'sb-del-btn';
                deleteBtn.title = 'Delete';
                deleteBtn.style.background = 'transparent';
                deleteBtn.style.border = 'none';
                deleteBtn.style.color = 'rgba(239, 68, 68, 0.6)';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.padding = '0.15rem';
                deleteBtn.style.fontSize = '0.65rem';
                deleteBtn.style.display = 'flex';
                deleteBtn.style.alignItems = 'center';
                deleteBtn.style.transition = 'color 0.15s';
                deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteCustomSound(sound.sound_id);
                };

                actionsDiv.appendChild(renameBtn);
                actionsDiv.appendChild(deleteBtn);
                chip.appendChild(actionsDiv);
            }

            // Chip click play trigger
            chip.onclick = () => {
                const now = Date.now();
                if (now - lastSoundboardPlayTime < 1000 && !isUserAdmin) {
                    showToast('Soundboard is on cooldown!', 'warning');
                    return;
                }
                lastSoundboardPlayTime = now;

                if (window.socket && window.socket.connected) {
                    window.socket.emit('soundboard_play', {
                        party_id: window.PARTY_ID,
                        client_id: clientId,
                        client_name: clientName,
                        sound_id: sound.sound_id
                    });
                }
            };

            grid.appendChild(chip);
        });

        updateSoundboardUI();
    }

    function openRenameSoundModal(soundId, currentName) {
        const renameSoundOverlay = document.getElementById('wp-rename-sound-overlay');
        const renameNameInput = document.getElementById('wp-rename-sound-name');
        const renameSoundIdInput = document.getElementById('wp-rename-sound-id');
        const renameErrorDiv = document.getElementById('wp-sound-rename-error');

        if (!renameSoundOverlay) return;
        renameNameInput.value = currentName;
        renameSoundIdInput.value = soundId;
        renameErrorDiv.style.display = 'none';
        renameSoundOverlay.classList.add('active');
    }

    function deleteCustomSound(soundId) {
        if (!confirm('Are you sure you want to delete this custom sound?')) return;

        fetch(`/api/watch-party/${window.PARTY_ID}/soundboard/delete/${soundId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: adminToken })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                showToast('Sound deleted successfully!', 'success');
            } else {
                showToast('Failed to delete sound: ' + data.message, 'error');
            }
        })
        .catch(err => {
            console.error('Error deleting sound:', err);
            showToast('An error occurred while deleting the sound.', 'error');
        });
    }

    function updateSoundboardUI() {
        const grid = document.getElementById('soundboard-grid');
        if (!grid) return;

        const chips = grid.querySelectorAll('.sound-chip');
        const isUserAdmin = !!adminToken;

        chips.forEach(chip => {
            if (!isSoundboardAllowed && !isUserAdmin) {
                chip.style.opacity = '0.4';
                chip.style.cursor = 'not-allowed';
                chip.style.pointerEvents = 'none';
            } else {
                chip.style.opacity = '1';
                chip.style.cursor = 'pointer';
                chip.style.pointerEvents = 'auto';
            }
        });
    }

    function playLocalSound(url) {
        if (soundboardMuted) return;
        try {
            const preloadedAudio = preloadSoundboardAudio(url);
            const audio = preloadedAudio ? preloadedAudio.cloneNode(true) : new Audio(url);
            audio.volume = soundboardVolume;
            activeAudioObjects.add(audio);
            audio.onended = () => activeAudioObjects.delete(audio);
            audio.onerror = () => {
                activeAudioObjects.delete(audio);
                showToast('Sound file is missing or could not be loaded.', 'error');
            };
            audio.play().catch(err => {
                console.warn('Autoplay blocked soundboard audio playback:', err);
                const warning = document.getElementById('soundboard-autoplay-warning');
                if (warning) warning.style.display = 'block';
                activeAudioObjects.delete(audio);
            });
        } catch (e) {
            console.error('Error playing sound:', e);
        }
    }

    function unlockSoundboardAudio() {
        if (soundboardAudioUnlocked) return;
        const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAD');
        silentAudio.play().then(() => {
            soundboardAudioUnlocked = true;
            const warning = document.getElementById('soundboard-autoplay-warning');
            if (warning) warning.style.display = 'none';
            console.log('Soundboard audio unlocked successfully.');
        }).catch(err => {
            console.warn('Soundboard audio unlock failed or deferred:', err);
        });
    }
    document.addEventListener('click', unlockSoundboardAudio, { once: true });
    document.addEventListener('keydown', unlockSoundboardAudio, { once: true });
})();
