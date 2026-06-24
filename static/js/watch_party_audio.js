/**
 * AuraSort — Watch Party Audio & High-Fidelity Voice Controller
 * Handles individual participant volume adjustments, master voice volume scaling,
 * and intelligent real-time audio ducking.
 */

(function () {
    // Local state
    const peerVolumes = {};    // peerId -> volume factor (0.0 to 1.0)
    const openSliders = {};    // peerId -> boolean (is volume slider expanded)
    let masterVoiceVolume = 1.0;
    let audioDuckingEnabled = false;
    let player = null;
    let originalPlayerVolume = 1.0;

    // Retrieve state helpers
    window.getPeerVolume = function (peerId) {
        return peerVolumes[peerId] !== undefined ? peerVolumes[peerId] : 1.0;
    };

    window.isPeerVolumeSliderOpen = function (peerId) {
        return !!openSliders[peerId];
    };

    // Toggle peer volume slider visibility
    window.toggleVolumeSlider = function (peerId) {
        const slider = document.getElementById(`peer-vol-slider-${peerId}`);
        if (!slider) return;
        
        openSliders[peerId] = !openSliders[peerId];
        slider.style.display = openSliders[peerId] ? 'block' : 'none';
    };

    // Adjust peer volume locally
    window.adjustPeerVolume = function (peerId, value) {
        const valFloat = parseFloat(value);
        peerVolumes[peerId] = valFloat;

        // Apply to WebRTC remote audio element
        if (window.getRemoteAudioElements) {
            const audioElements = window.getRemoteAudioElements();
            const audio = audioElements[peerId];
            if (audio) {
                audio.volume = valFloat * masterVoiceVolume;
            }
        }

        // Update speaker icon
        const icon = document.getElementById(`peer-vol-icon-${peerId}`);
        if (icon) {
            icon.className = 'peer-volume-icon fa-solid ';
            if (valFloat === 0) {
                icon.className += 'fa-volume-xmark';
                icon.style.color = 'var(--text-muted)';
            } else if (valFloat < 0.5) {
                icon.className += 'fa-volume-low';
                icon.style.color = 'var(--text-main)';
            } else {
                icon.className += 'fa-volume-high';
                icon.style.color = 'var(--text-main)';
            }
        }
    };

    // Bind Master Voice Volume & Ducking DOM Controls
    function setupDOMControls() {
        const masterVolInput = document.getElementById('wp-master-voice-volume');
        const duckingToggle = document.getElementById('wp-toggle-audio-ducking');

        if (masterVolInput) {
            // Restore saved master voice volume if any
            const savedMasterVol = localStorage.getItem('wp_master_voice_volume');
            if (savedMasterVol !== null) {
                masterVoiceVolume = parseFloat(savedMasterVol);
                masterVolInput.value = masterVoiceVolume;
            }

            masterVolInput.addEventListener('input', function () {
                masterVoiceVolume = parseFloat(this.value);
                localStorage.setItem('wp_master_voice_volume', masterVoiceVolume);

                // Re-apply master volume to all remote audio elements
                if (window.getRemoteAudioElements) {
                    const audioElements = window.getRemoteAudioElements();
                    Object.keys(audioElements).forEach(peerId => {
                        const audio = audioElements[peerId];
                        if (audio) {
                            const pVol = peerVolumes[peerId] !== undefined ? peerVolumes[peerId] : 1.0;
                            audio.volume = pVol * masterVoiceVolume;
                        }
                    });
                }
            });
        }

        if (duckingToggle) {
            // Restore saved audio ducking state if any
            const savedDucking = localStorage.getItem('wp_audio_ducking_enabled');
            if (savedDucking !== null) {
                audioDuckingEnabled = savedDucking === 'true';
                duckingToggle.checked = audioDuckingEnabled;
            }

            duckingToggle.addEventListener('change', function () {
                audioDuckingEnabled = this.checked;
                localStorage.setItem('wp_audio_ducking_enabled', audioDuckingEnabled);
                console.log(`[AudioModule] Audio ducking toggled: ${audioDuckingEnabled}`);
            });
        }
    }

    // Initialize player binding
    function initPlayerBinding() {
        const checkInterval = setInterval(() => {
            const rawPlayer = document.getElementById('lightbox-video')?.__plyr;
            if (rawPlayer) {
                player = rawPlayer;
                originalPlayerVolume = player.volume;
                clearInterval(checkInterval);

                // Listen for manual volume changes when not speaking
                player.on('volumechange', () => {
                    const someoneSpeaking = document.querySelectorAll('.voice-indicator.speaking').length > 0;
                    if (!audioDuckingEnabled || !someoneSpeaking) {
                        originalPlayerVolume = player.volume;
                    }
                });

                console.log("[AudioModule] Plyr player bound in audio controller.");
            }
        }, 200);
    }

    // Audio Ducking Loop (100ms interval)
    function startAudioDuckingLoop() {
        setInterval(() => {
            if (!player) return;

            const someoneSpeaking = document.querySelectorAll('.voice-indicator.speaking').length > 0;

            if (audioDuckingEnabled && someoneSpeaking) {
                // Smoothly duck volume to 25% of original
                const targetVol = originalPlayerVolume * 0.25;
                const currentVol = player.volume;
                if (currentVol > targetVol) {
                    // Smooth step down
                    player.volume = Math.max(targetVol, currentVol - 0.15);
                }
            } else {
                // Smoothly restore volume to original
                const currentVol = player.volume;
                if (currentVol < originalPlayerVolume) {
                    // Smooth step up
                    player.volume = Math.min(originalPlayerVolume, currentVol + 0.15);
                }
            }
        }, 100);
    }

    // Initialize module on page load
    document.addEventListener('DOMContentLoaded', () => {
        setupDOMControls();
        initPlayerBinding();
        startAudioDuckingLoop();
        console.log("[AudioModule] High-fidelity audio controller initialized.");
    });
})();
