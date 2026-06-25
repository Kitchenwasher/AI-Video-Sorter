/**
 * Watch Party Call Dock and Collapsible Panels Controller
 * Integrates the floating bottom dock buttons, emoji reactions, 
 * floating soundboard popover, and side panels.
 */

(function () {
    let leftCollapsed = localStorage.getItem('wp_left_panel_collapsed') === 'true';
    let rightCollapsed = localStorage.getItem('wp_right_panel_collapsed') === 'true';

    // Left Panel Toggle
    window.toggleLeftPanel = function (forceState) {
        const layout = document.querySelector('.watch-main-layout');
        const leftPanel = document.querySelector('.cowatch-left-panel');
        const backdrop = document.getElementById('wp-drawer-backdrop');
        if (!layout || !leftPanel) return;

        if (forceState !== undefined) {
            leftCollapsed = forceState;
        } else {
            leftCollapsed = !leftCollapsed;
        }

        localStorage.setItem('wp_left_panel_collapsed', leftCollapsed);

        const isMobile = window.innerWidth <= 900;

        if (isMobile) {
            leftPanel.classList.toggle('drawer-open', !leftCollapsed);
            layout.classList.remove('left-collapsed');
            
            // Manage drawer backdrop on mobile
            if (backdrop) {
                backdrop.classList.toggle('active', !leftCollapsed || !rightCollapsed);
            }
        } else {
            layout.classList.toggle('left-collapsed', leftCollapsed);
            leftPanel.classList.remove('drawer-open');
            if (backdrop) backdrop.classList.remove('active');
        }

        // Sync dock button visual state
        const dockBtn = document.getElementById('dock-btn-toggle-left');
        if (dockBtn) {
            dockBtn.classList.toggle('active', !leftCollapsed);
        }
        
        // Sync floating handle state
        const floatHandle = document.getElementById('wp-left-float-handle');
        if (floatHandle) {
            floatHandle.style.display = leftCollapsed ? 'flex' : 'none';
        }
    };

    // Right Panel Toggle
    window.toggleRightPanel = function (forceState) {
        const container = document.querySelector('.main-container');
        const sidebar = document.querySelector('.sidebar-pane');
        const backdrop = document.getElementById('wp-drawer-backdrop');
        if (!container || !sidebar) return;

        if (forceState !== undefined) {
            rightCollapsed = forceState;
        } else {
            rightCollapsed = !rightCollapsed;
        }

        localStorage.setItem('wp_right_panel_collapsed', rightCollapsed);

        const isMobile = window.innerWidth <= 900;

        if (isMobile) {
            sidebar.classList.toggle('drawer-open', !rightCollapsed);
            container.classList.remove('sidebar-collapsed');
            
            // Manage drawer backdrop on mobile
            if (backdrop) {
                backdrop.classList.toggle('active', !leftCollapsed || !rightCollapsed);
            }
        } else {
            container.classList.toggle('sidebar-collapsed', rightCollapsed);
            sidebar.classList.remove('drawer-open');
            if (backdrop) backdrop.classList.remove('active');
        }

        // Sync dock button visual state
        const dockBtn = document.getElementById('dock-btn-toggle-right');
        if (dockBtn) {
            dockBtn.classList.toggle('active', !rightCollapsed);
        }

        // Sync floating handle state
        const floatHandle = document.getElementById('wp-right-float-handle');
        if (floatHandle) {
            floatHandle.style.display = rightCollapsed ? 'flex' : 'none';
        }
    };

    // Setup Event Listeners for Bottom Dock
    function setupDockBindings() {
        // Mic Toggle
        const dockBtnMic = document.getElementById('dock-btn-mic');
        if (dockBtnMic) {
            dockBtnMic.onclick = (e) => {
                e.stopPropagation();
                const actualBtn = document.getElementById('btn-mic-toggle');
                if (actualBtn) actualBtn.click();
            };
        }

        // Webcam/Camera Toggle
        const dockBtnCamera = document.getElementById('dock-btn-camera');
        if (dockBtnCamera) {
            dockBtnCamera.onclick = (e) => {
                e.stopPropagation();
                const actualBtn = document.getElementById('btn-webcam-toggle');
                if (actualBtn) actualBtn.click();
            };
        }

        // Screen Share Toggle
        const dockBtnScreenShare = document.getElementById('dock-btn-screen-share');
        if (dockBtnScreenShare) {
            dockBtnScreenShare.onclick = (e) => {
                e.stopPropagation();
                const actualBtn = document.getElementById('btn-wp-screen-share');
                if (actualBtn) actualBtn.click();
            };
        }

        // Left Panel Toggle Button
        const dockBtnLeft = document.getElementById('dock-btn-toggle-left');
        if (dockBtnLeft) {
            dockBtnLeft.onclick = (e) => {
                e.stopPropagation();
                window.toggleLeftPanel();
            };
        }

        // Right Panel Toggle Button
        const dockBtnRight = document.getElementById('dock-btn-toggle-right');
        if (dockBtnRight) {
            dockBtnRight.onclick = (e) => {
                e.stopPropagation();
                window.toggleRightPanel();
            };
        }

        // Floating Handles
        const leftHandle = document.getElementById('wp-left-float-handle');
        if (leftHandle) {
            leftHandle.onclick = (e) => {
                e.stopPropagation();
                window.toggleLeftPanel(false); // Expand left panel
            };
        }

        const rightHandle = document.getElementById('wp-right-float-handle');
        if (rightHandle) {
            rightHandle.onclick = (e) => {
                e.stopPropagation();
                window.toggleRightPanel(false); // Expand right panel
            };
        }

        // Drawer backdrop click -> close open drawers
        const backdrop = document.getElementById('wp-drawer-backdrop');
        if (backdrop) {
            backdrop.onclick = () => {
                window.toggleLeftPanel(true);
                window.toggleRightPanel(true);
            };
        }

        // Reactions Popover Toggle
        const dockBtnReactions = document.getElementById('dock-btn-reactions');
        const emojiPopover = document.getElementById('dock-emoji-popover');
        if (dockBtnReactions && emojiPopover) {
            dockBtnReactions.onclick = (e) => {
                e.stopPropagation();
                // Close soundboard popover first if open
                closeSoundboardPopover();
                const isOpen = emojiPopover.style.display === 'flex';
                emojiPopover.style.display = isOpen ? 'none' : 'flex';
            };
        }

        // Soundboard Popover Toggle (programmatically clicks sidebar toggle)
        const dockBtnSoundboard = document.getElementById('dock-btn-soundboard');
        if (dockBtnSoundboard) {
            dockBtnSoundboard.onclick = (e) => {
                e.stopPropagation();
                // Close emoji popover first if open
                if (emojiPopover) emojiPopover.style.display = 'none';
                const actualBtn = document.getElementById('btn-soundboard-toggle');
                if (actualBtn) actualBtn.click();
            };
        }

        // Emoji buttons click binding
        const emojiPopoverBtns = document.querySelectorAll('.dock-emoji-btn');
        emojiPopoverBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const emoji = btn.getAttribute('data-emoji');
                if (emoji && typeof window.sendEmojiReaction === 'function') {
                    window.sendEmojiReaction(emoji);
                }
                if (emojiPopover) {
                    emojiPopover.style.display = 'none';
                }
            };
        });

        // Leave / End Call button binding
        const dockBtnLeave = document.getElementById('dock-btn-leave');
        if (dockBtnLeave) {
            dockBtnLeave.onclick = (e) => {
                e.stopPropagation();
                if (typeof window.handleLeaveOrEndCall === 'function') {
                    window.handleLeaveOrEndCall();
                }
            };
        }

        // Close popovers on click outside
        document.addEventListener('click', (e) => {
            // Check if click was outside emoji popover and reactions button
            if (emojiPopover && emojiPopover.style.display === 'flex') {
                if (!emojiPopover.contains(e.target) && e.target !== dockBtnReactions) {
                    emojiPopover.style.display = 'none';
                }
            }

            // Check if click was outside soundboard panel
            const sbPanel = document.getElementById('soundboard-panel');
            if (sbPanel && sbPanel.style.display === 'flex') {
                if (!sbPanel.contains(e.target) && e.target !== dockBtnSoundboard && !e.target.closest('#wp-profile-modal') && !e.target.closest('#wp-add-sound-overlay') && !e.target.closest('#wp-rename-sound-overlay')) {
                    closeSoundboardPopover();
                }
            }
        });
    }

    function closeSoundboardPopover() {
        const sbPanel = document.getElementById('soundboard-panel');
        if (sbPanel && sbPanel.style.display === 'flex') {
            const actualBtn = document.getElementById('btn-soundboard-toggle');
            if (actualBtn) actualBtn.click();
        }
    }

    // Responsive window resize helper
    window.addEventListener('resize', () => {
        const isMobile = window.innerWidth <= 900;
        const layout = document.querySelector('.watch-main-layout');
        const leftPanel = document.querySelector('.cowatch-left-panel');
        const container = document.querySelector('.main-container');
        const sidebar = document.querySelector('.sidebar-pane');
        const backdrop = document.getElementById('wp-drawer-backdrop');

        if (isMobile) {
            // Remove desktop collapsed classes so the grid doesn't break
            if (layout) layout.classList.remove('left-collapsed');
            if (container) container.classList.remove('sidebar-collapsed');
            
            // Adjust drawer state
            if (leftPanel) leftPanel.classList.toggle('drawer-open', !leftCollapsed);
            if (sidebar) sidebar.classList.toggle('drawer-open', !rightCollapsed);
            
            if (backdrop) {
                backdrop.classList.toggle('active', !leftCollapsed || !rightCollapsed);
            }
        } else {
            // Apply desktop collapsed classes based on saved states
            if (layout) layout.classList.toggle('left-collapsed', leftCollapsed);
            if (container) container.classList.toggle('sidebar-collapsed', rightCollapsed);
            
            // Remove mobile drawers class
            if (leftPanel) leftPanel.classList.remove('drawer-open');
            if (sidebar) sidebar.classList.remove('drawer-open');
            if (backdrop) backdrop.classList.remove('active');
        }

        // Sync floating handles
        const leftHandle = document.getElementById('wp-left-float-handle');
        if (leftHandle) leftHandle.style.display = leftCollapsed ? 'flex' : 'none';

        const rightHandle = document.getElementById('wp-right-float-handle');
        if (rightHandle) rightHandle.style.display = rightCollapsed ? 'flex' : 'none';
    });

    // Initialize module
    document.addEventListener('DOMContentLoaded', () => {
        setupDockBindings();
        // Restore saved panel states
        window.toggleLeftPanel(leftCollapsed);
        window.toggleRightPanel(rightCollapsed);
    });
})();
