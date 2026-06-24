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
    let sseSource = null;
    let currentFilename = null;
    let mediaLoadSequence = 0;
    let mediaStateReleaseTimer = null;
    let mediaFilesList = [];
    let ignorePlayerEvents = false;
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

    // Feature 6: Expose audio maps/peers to window for modular audio controller
    window.getRemoteAudioElements = () => remoteAudioElements;
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
                if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
                if (themeText) themeText.textContent = 'Light';
                themeBtn.style.setProperty('background', 'var(--accent-yellow)', 'important');
            } else {
                if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
                if (themeText) themeText.textContent = 'Dark';
                themeBtn.style.setProperty('background', 'var(--accent-lime)', 'important');
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
     */    async function startWatchParty() {
        if (window.__watchPartyStarted) {
            console.log("[WatchParty] Already started, skipping re-init.");
            return;
        }
        window.__watchPartyStarted = true;

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
                updateLocalProfileUI();
            } else {
                if (activePeers[client_id]) {
                    activePeers[client_id].name = name;
                    activePeers[client_id].avatar = avatar;
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
            
            // Map keys 1-6 to emojis
            const emojiMap = {
                '1': '😂',
                '2': '🔥',
                '3': '💀',
                '4': '👁️',
                '5': '💖',
                '6': '👀'
            };
            if (emojiMap[e.key]) {
                e.preventDefault();
                sendEmojiReaction(emojiMap[e.key]);
            }
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

    function sendEmojiReaction(emoji) {
        if (!window.socket) return;
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
        const playlistGrid = document.getElementById('wp-playlist-grid');
        playlistGrid.innerHTML = '';

        // Filter out subtitle files (.srt, .vtt) from the media grid
        const mediaFiles = files.filter(file => {
            const ext = file.filename.split('.').pop().toLowerCase();
            return ext !== 'srt' && ext !== 'vtt';
        });

        if (mediaFiles.length === 0) {
            playlistGrid.innerHTML = `
                <div class="playlist-empty-state">
                    <i class="fa-solid fa-clapperboard"></i>
                    <span>No playable media is queued for this room yet.</span>
                </div>
            `;
            
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
                <img src="${thumbUrl}" alt="${displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="playlist-placeholder" style="display: none;"><i class="fa-solid ${mediaIcon}"></i><span>${mediaLabel}</span></div>
                <div class="playlist-media-pill"><i class="fa-solid ${mediaIcon}"></i>${mediaLabel}</div>
                <div class="card-filename-overlay">${displayName}</div>
                <button class="btn-add-to-queue" data-filename="${file.filename}" title="Add to Queue" aria-label="Add ${displayName} to queue"><i class="fa-solid fa-plus"></i></button>
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
        loadMediaAndApplyState(filename, { position: 0.0, playing: false }).then((loaded) => {
            if (!loaded) return;
            // New selection starts paused at 0.0
            broadcastSync('pause', 0.0);
        });
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

    function showAutoplayOverlay() {
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
                await player.play();
                hideAutoplayOverlay();
            } catch (err) {
                console.warn('Failed to play after click:', err);
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
        const position = Number.isFinite(Number(state.position)) ? Math.max(0, Number(state.position)) : 0;
        const shouldPlay = !!state.playing;
        const requestedSpeed = Number.parseFloat(state.speed);

        clearMediaTransitionState();
        setPlayerEventsIgnored(true);

        try {
            await loadMediaFile(filename);
            if (loadId !== mediaLoadSequence) return false;

            if (window.isImageActive) {
                try { player.pause(); } catch (e) {}
                return true;
            }

            await waitForVideoReady(5000);
            if (loadId !== mediaLoadSequence) return false;

            if (Number.isFinite(requestedSpeed) && requestedSpeed > 0) {
                player.speed = requestedSpeed;
                syncSpeedControl(requestedSpeed);
            }

            const targetTime = clampPlaybackPosition(position);
            if (Math.abs(player.currentTime - targetTime) > 0.15) {
                player.currentTime = targetTime;
            }

            if (shouldPlay) {
                try {
                    await player.play();
                } catch (err) {
                    console.warn('Autoplay blocked while applying Watch Party state:', err);
                    showAutoplayOverlay();
                }
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
            releasePlayerEventsAfter(1000);
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

    function getDefaultPlayableFile() {
        return mediaFilesList.find(file => {
            const ext = (file.filename || '').split('.').pop().toLowerCase();
            return ext && ext !== 'srt' && ext !== 'vtt';
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
                    const ps = data.playback_state;
                    loadMediaAndApplyState(ps.filename, ps);
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
                        activePeers[peer.client_id] = { name: peer.name, avatar: peer.avatar || 'cool_kid', is_admin: peer.is_admin || false };
                    });
                    updatePeersUI();
                }
                break;

            case 'peer_joined':
                addLogEntry('System', `${data.name} joined the watch party.`);
                addSystemChatMessage(`${data.name} joined the room.`);
                activePeers[data.client_id] = { name: data.name, avatar: data.avatar || 'cool_kid', is_admin: data.is_admin || false };
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
                
                handleIncomingSync(data.action, data.position, data.filename, data.playing, data);
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
                const defaultFile = getDefaultPlayableFile();
                if (defaultFile) {
                    loadMediaAndApplyState(defaultFile.filename, { position: 0.0, playing: false });
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
            if (signal.sdp) {
                signal.sdp = optimizeAudioSDP(signal.sdp);
            }
            pc.setRemoteDescription(new RTCSessionDescription(signal))
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
                if (signal.sdp) {
                    signal.sdp = optimizeAudioSDP(signal.sdp);
                }
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
})();
