/**
 * AuraSort — Watch Party Layout & UX Polish Controller
 * Handles Theater Mode, Collapsible Panels with local persistence,
 * and the Neo-Brutalist + Claymorphic Hotkey Reference Sheet.
 */

(function () {
    let theaterModeActive = false;
    let panelsState = {
        playlist: true,     // true means expanded
        voice: true,
        participants: true
    };

    // 1. Theater Mode Toggle
    window.toggleTheaterMode = function () {
        const mainContainer = document.querySelector('.main-container');
        const btnTheater = document.getElementById('btn-wp-theater');
        if (!mainContainer) return;

        theaterModeActive = !theaterModeActive;
        localStorage.setItem('wp_theater_mode', theaterModeActive);

        if (theaterModeActive) {
            // Save state before entering theater mode
            const layout = document.querySelector('.watch-main-layout');
            const leftCollapsedCurrent = layout ? layout.classList.contains('left-collapsed') : false;
            const rightCollapsedCurrent = mainContainer.classList.contains('sidebar-collapsed');

            localStorage.setItem('wp_pre_theater_left_collapsed', leftCollapsedCurrent);
            localStorage.setItem('wp_pre_theater_right_collapsed', rightCollapsedCurrent);

            mainContainer.classList.add('theater-mode');
            
            // Collapse both panels using dock controller functions if available
            if (typeof window.toggleLeftPanel === 'function') {
                window.toggleLeftPanel(true);
            }
            if (typeof window.toggleRightPanel === 'function') {
                window.toggleRightPanel(true);
            }

            if (btnTheater) {
                btnTheater.classList.add('active');
                btnTheater.style.background = '#2ed573';
            }
        } else {
            mainContainer.classList.remove('theater-mode');
            
            // Restore previous panel states
            const restoreLeft = localStorage.getItem('wp_pre_theater_left_collapsed') === 'true';
            const restoreRight = localStorage.getItem('wp_pre_theater_right_collapsed') === 'true';

            if (typeof window.toggleLeftPanel === 'function') {
                window.toggleLeftPanel(restoreLeft);
            }
            if (typeof window.toggleRightPanel === 'function') {
                window.toggleRightPanel(restoreRight);
            }

            if (btnTheater) {
                btnTheater.classList.remove('active');
                btnTheater.style.background = '#ffa502';
            }
        }
        console.log(`[LayoutModule] Theater Mode: ${theaterModeActive}`);
    };

    // 2. Collapsible Panels Toggle
    window.togglePanel = function (panelId) {
        let contentEl = null;
        let btnEl = null;
        let storageKey = '';

        if (panelId === 'playlist') {
            contentEl = document.getElementById('wp-playlist-grid');
            btnEl = document.getElementById('btn-toggle-playlist');
            storageKey = 'wp_panel_playlist_collapsed';
        } else if (panelId === 'voice') {
            contentEl = document.getElementById('wp-voice-settings-controls');
            btnEl = document.getElementById('btn-toggle-voice-settings');
            storageKey = 'wp_panel_voice_collapsed';
        } else if (panelId === 'participants') {
            contentEl = document.getElementById('wp-peers-list');
            btnEl = document.getElementById('btn-toggle-participants');
            storageKey = 'wp_panel_participants_collapsed';
        }

        if (!contentEl || !btnEl) return;

        panelsState[panelId] = !panelsState[panelId];
        localStorage.setItem(storageKey, !panelsState[panelId]); // store true for collapsed

        if (panelsState[panelId]) {
            // Expand
            if (panelId === 'voice') {
                contentEl.style.display = 'flex';
            } else if (panelId === 'playlist') {
                contentEl.style.display = 'flex';
            } else {
                contentEl.style.display = 'block';
            }
            btnEl.classList.remove('collapsed');
        } else {
            // Collapse
            contentEl.style.display = 'none';
            btnEl.classList.add('collapsed');
        }
        console.log(`[LayoutModule] Panel [${panelId}] expanded: ${panelsState[panelId]}`);
    };

    // Restore saved layout states
    function restoreLayoutStates() {
        const mainContainer = document.querySelector('.main-container');
        
        // Restore Theater Mode
        const savedTheater = localStorage.getItem('wp_theater_mode');
        if (savedTheater === 'true') {
            // Wait a moment for rendering, then toggle
            setTimeout(() => {
                window.toggleTheaterMode();
            }, 100);
        }

        // Restore Panels collapse states
        const panels = ['playlist', 'voice', 'participants'];
        panels.forEach(panelId => {
            const storageKey = `wp_panel_${panelId}_collapsed`;
            const isCollapsed = localStorage.getItem(storageKey) === 'true';
            if (isCollapsed) {
                // Toggle to collapse
                window.togglePanel(panelId);
            }
        });
    }

    // 3. Hotkeys Overlay Manager
    function injectHotkeysOverlay() {
        if (document.getElementById('wp-hotkeys-overlay')) return;

        const overlayHtml = `
            <div class="wp-hotkeys-overlay" id="wp-hotkeys-overlay">
                <div class="wp-hotkeys-card" id="wp-hotkeys-card">
                    <div class="wp-hotkeys-header">
                        <span><i class="fa-solid fa-keyboard"></i> Keyboard Shortcuts</span>
                        <button class="wp-hotkeys-close-btn" id="wp-hotkeys-close" title="Close Overlay">&times;</button>
                    </div>
                    <div class="wp-hotkeys-content">
                        <!-- Watch Party Group -->
                        <div class="wp-hotkey-group">
                            <div class="wp-hotkey-group-title">Watch Party Controls</div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Toggle Theater Mode</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap">T</span>
                                </div>
                            </div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Toggle Hotkeys Panel</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap">?</span>
                                    <span style="font-size: 0.7rem; color: var(--text-muted);">or</span>
                                    <span class="wp-key-cap">H</span>
                                </div>
                            </div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Emoji Reactions (1-5)</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap">1</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">-</span>
                                    <span class="wp-key-cap">5</span>
                                </div>
                            </div>
                        </div>

                        <!-- Media Player Group -->
                        <div class="wp-hotkey-group" style="margin-top: 0.5rem;">
                            <div class="wp-hotkey-group-title">Media Player Controls (Plyr)</div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Play / Pause Video</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap" style="min-width: 50px;">Space</span>
                                </div>
                            </div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Toggle Video Mute</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap">M</span>
                                </div>
                            </div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Toggle Fullscreen</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap">F</span>
                                </div>
                            </div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Seek Back / Forward (10s)</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap">&larr;</span>
                                    <span class="wp-key-cap">&rarr;</span>
                                </div>
                            </div>
                            <div class="wp-hotkey-row">
                                <span class="wp-hotkey-label">Volume Up / Down</span>
                                <div class="wp-hotkey-keys">
                                    <span class="wp-key-cap">&uarr;</span>
                                    <span class="wp-key-cap">&darr;</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = overlayHtml.trim();
        document.body.appendChild(tempDiv.firstChild);

        // Bind events
        const overlay = document.getElementById('wp-hotkeys-overlay');
        const closeBtn = document.getElementById('wp-hotkeys-close');
        const card = document.getElementById('wp-hotkeys-card');

        window.toggleHotkeysHelp = function () {
            if (!overlay) return;
            overlay.classList.toggle('show');
            console.log("[LayoutModule] Toggled Hotkeys help overlay.");
        };

        if (closeBtn) {
            closeBtn.onclick = () => window.toggleHotkeysHelp();
        }

        // Close when clicking backdrop
        if (overlay) {
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    window.toggleHotkeysHelp();
                }
            };
        }
    }

    // Bind DOM Listeners
    function setupDOMBindings() {
        const btnTheater = document.getElementById('btn-wp-theater');
        const btnHotkeys = document.getElementById('btn-wp-hotkeys');

        const btnTogglePlaylist = document.getElementById('btn-toggle-playlist');
        const btnToggleVoice = document.getElementById('btn-toggle-voice-settings');
        const btnToggleParticipants = document.getElementById('btn-toggle-participants');

        if (btnTheater) {
            btnTheater.onclick = () => window.toggleTheaterMode();
        }
        if (btnHotkeys) {
            btnHotkeys.onclick = () => window.toggleHotkeysHelp();
        }

        if (btnTogglePlaylist) {
            btnTogglePlaylist.onclick = () => window.togglePanel('playlist');
        }
        if (btnToggleVoice) {
            btnToggleVoice.onclick = () => window.togglePanel('voice');
        }
        if (btnToggleParticipants) {
            btnToggleParticipants.onclick = () => window.togglePanel('participants');
        }
    }

    // Bind Keyboard Shortcuts
    function setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in input fields
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }

            const keyUpper = e.key.toUpperCase();

            // T - Toggle Theater Mode
            if (keyUpper === 'T') {
                e.preventDefault();
                window.toggleTheaterMode();
            }

            // ? or H - Toggle Hotkeys Reference Sheet
            if (e.key === '?' || keyUpper === 'H') {
                e.preventDefault();
                window.toggleHotkeysHelp();
            }
        });
    }

    // Initialize layout module
    document.addEventListener('DOMContentLoaded', () => {
        injectHotkeysOverlay();
        setupDOMBindings();
        setupKeyboardShortcuts();
        restoreLayoutStates();
        console.log("[LayoutModule] Claymorphic & Neo-Brutalist Layout controller initialized.");
    });
})();
