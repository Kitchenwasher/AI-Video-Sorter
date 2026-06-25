/**
 * Watch Party soft-sync helper.
 * The server owns room state; this module only applies local, non-blocking
 * drift correction and local buffering UI.
 */
(function () {
    let socket = null;
    let player = null;
    let driftCheckInterval = null;
    let localBufferingTimer = null;
    let isLocalBuffering = false;

    const DRIFT_IGNORE_SECONDS = 0.4;
    const DRIFT_SOFT_SECONDS = 2.0;
    const BUFFERING_TIMEOUT_MS = 9000;

    window.addEventListener('load', () => {
        const checkInterval = setInterval(() => {
            const rawPlayer = document.getElementById('lightbox-video')?.__plyr;
            if (window.socket && rawPlayer) {
                socket = window.socket;
                player = rawPlayer;
                clearInterval(checkInterval);
                bindSocketListeners();
                bindPlayerEvents();
                startDriftLoop();
            }
        }, 200);
    });

    function bindSocketListeners() {
        if (!socket || socket.__watchPartySoftSyncBound) return;
        socket.__watchPartySoftSyncBound = true;

        socket.on('disconnect', () => {
            clearLocalBuffering();
        });

        socket.on('init_payload', () => {
            clearLocalBuffering();
            hideLocalBufferingIndicator();
        });

        socket.on('sync_event', () => {
            clearLocalBuffering();
        });
    }

    function bindPlayerEvents() {
        if (!player || player.__watchPartySoftSyncEventsBound) return;
        player.__watchPartySoftSyncEventsBound = true;

        player.on('waiting', () => {
            if (window.isImageActive || !isPlaybackUnlocked()) return;
            showLocalBufferingIndicator();
        });

        const markReady = () => clearLocalBuffering();
        player.on('playing', markReady);
        player.on('canplay', markReady);
        player.on('loadeddata', markReady);
        player.on('canplaythrough', markReady);
        player.on('seeked', markReady);
    }

    function startDriftLoop() {
        if (driftCheckInterval) clearInterval(driftCheckInterval);
        driftCheckInterval = setInterval(checkDrift, 1200);
    }

    function checkDrift() {
        if (!player || window.isImageActive || window.ignorePlayerEvents) return;
        const state = window.getWatchPartyAuthoritativeState ? window.getWatchPartyAuthoritativeState() : null;
        const getExpected = window.getWatchPartyExpectedPosition;
        if (!state || !state.playing || !getExpected || player.paused || !isPlaybackUnlocked()) return;

        const normalSpeed = Number(state.speed) || 1.0;
        const expected = getExpected(state);
        const drift = player.currentTime - expected;
        const absDrift = Math.abs(drift);

        if (absDrift < DRIFT_IGNORE_SECONDS) {
            if (Math.abs(player.speed - normalSpeed) > 0.01) {
                player.speed = normalSpeed;
            }
            return;
        }

        window.ignorePlayerEvents = true;
        if (absDrift <= DRIFT_SOFT_SECONDS) {
            player.speed = drift < 0 ? normalSpeed * 1.06 : normalSpeed * 0.94;
            setTimeout(() => {
                if (player && !player.paused) player.speed = normalSpeed;
                window.ignorePlayerEvents = false;
            }, 900);
        } else {
            player.currentTime = expected;
            player.speed = normalSpeed;
            setTimeout(() => {
                window.ignorePlayerEvents = false;
            }, 150);
        }
    }

    function isPlaybackUnlocked() {
        return window.isWatchPartyPlaybackUnlocked ? window.isWatchPartyPlaybackUnlocked() : true;
    }

    function showLocalBufferingIndicator() {
        isLocalBuffering = true;
        const overlay = document.getElementById('wp-buffering-overlay');
        const textEl = document.getElementById('wp-buffering-text');
        if (overlay && textEl) {
            textEl.innerText = 'Buffering locally...';
            overlay.classList.add('active');
        }

        if (localBufferingTimer) clearTimeout(localBufferingTimer);
        localBufferingTimer = setTimeout(clearLocalBuffering, BUFFERING_TIMEOUT_MS);
    }

    function clearLocalBuffering() {
        if (!isLocalBuffering && !localBufferingTimer) return;
        isLocalBuffering = false;
        if (localBufferingTimer) {
            clearTimeout(localBufferingTimer);
            localBufferingTimer = null;
        }
        hideLocalBufferingIndicator();
    }

    function hideLocalBufferingIndicator() {
        const overlay = document.getElementById('wp-buffering-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    window.clearWatchPartyBufferingState = clearLocalBuffering;
})();
