/**
 * AuraSort — Watch Party Shared Image Gallery & Slideshow Controller (Modular)
 * Handles normalized relative aspect-ratio zoom/pan, synced 90-degree rotations,
 * manual image navigation, and synced automatic slideshow mode.
 */

(function () {
    let socket = null;
    
    // Transformation state
    let scale = 1.0;
    let relX = 0.0;
    let relY = 0.0;
    let rotation = 0;
    
    // Mouse drag state
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    // Slideshow state
    let slideshowTimer = null;
    let slideshowPlaying = false;
    let slideshowInterval = 5000;
    let currentImageFilename = null;
    
    // Throttle state for zoom/pan broadcasts (20 FPS / 50ms)
    let lastBroadcastTime = 0;
    const BROADCAST_THROTTLE = 50;

    // Initialize the module when page loads
    window.addEventListener('load', () => {
        initGalleryModule();
    });

    function initGalleryModule() {
        // Expose hooks globally so watch_party.js can notify us on load events
        window.onImageLoaded = onImageLoaded;
        window.onVideoLoaded = onVideoLoaded;
        
        // Bind UI buttons
        bindUIButtons();
        
        // Wait for Plyr and socket to initialize
        setupBindingsLoop();
    }

    /**
     * Periodically check for window.socket, then bind listeners
     */
    function setupBindingsLoop() {
        const checkInterval = setInterval(() => {
            if (window.socket) {
                socket = window.socket;
                clearInterval(checkInterval);
                
                bindSocketListeners();
                bindMouseGestureListeners();
                
                console.log("[GalleryModule] Shared image gallery and slideshow infrastructure bound.");
            }
        }, 200);
    }

    /**
     * Triggered by watch_party.js hook when an image is loaded
     */
    function onImageLoaded(filename) {
        currentImageFilename = filename;
        
        // Show gallery toolbar
        const toolbar = document.getElementById('wp-gallery-toolbar');
        if (toolbar) {
            toolbar.style.display = 'flex';
        }
        
        // Reset transformations to defaults
        scale = 1.0;
        relX = 0.0;
        relY = 0.0;
        rotation = 0;
        applyTransform();
        
        console.log("[GalleryModule] Image loaded, toolbar displayed:", filename);
    }

    /**
     * Triggered by watch_party.js hook when a video is loaded
     */
    function onVideoLoaded() {
        // Hide toolbar
        const toolbar = document.getElementById('wp-gallery-toolbar');
        if (toolbar) {
            toolbar.style.display = 'none';
        }
        
        // Stop active slideshow
        stopSlideshow();
        
        currentImageFilename = null;
        console.log("[GalleryModule] Video loaded, toolbar hidden.");
    }

    function bindSocketListeners() {
        if (!socket) return;

        // Listen for zoom/pan/rotate broadcasts
        socket.on('gallery_zoom_pan_broadcast', (data) => {
            scale = data.scale;
            relX = data.relX;
            relY = data.relY;
            rotation = data.rotation;
            applyTransform();
        });

        // Listen for slideshow state updates
        socket.on('slideshow_state_broadcast', (data) => {
            slideshowPlaying = data.playing;
            slideshowInterval = data.interval;
            
            // Sync play button icon
            const playBtn = document.getElementById('btn-gallery-play');
            if (playBtn) {
                playBtn.innerHTML = slideshowPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
                playBtn.title = slideshowPlaying ? 'Pause Slideshow' : 'Play Slideshow';
            }
            
            // Sync speed select dropdown
            const speedSelect = document.getElementById('wp-slideshow-speed');
            if (speedSelect) {
                speedSelect.value = slideshowInterval.toString();
            }

            // Sync slideshow badge indicator
            const badge = document.getElementById('wp-slideshow-badge');
            if (badge) {
                badge.style.display = slideshowPlaying ? 'inline-block' : 'none';
            }
        });
    }

    function bindUIButtons() {
        const prevBtn = document.getElementById('btn-gallery-prev');
        const nextBtn = document.getElementById('btn-gallery-next');
        const playBtn = document.getElementById('btn-gallery-play');
        const speedSelect = document.getElementById('wp-slideshow-speed');
        const zoomInBtn = document.getElementById('btn-gallery-zoom-in');
        const zoomOutBtn = document.getElementById('btn-gallery-zoom-out');
        const rotateBtn = document.getElementById('btn-gallery-rotate');
        const resetBtn = document.getElementById('btn-gallery-reset');

        // Navigation
        if (prevBtn) prevBtn.addEventListener('click', () => navigateImage(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => navigateImage(1));

        // Slideshow Toggle
        if (playBtn) playBtn.addEventListener('click', toggleSlideshow);
        if (speedSelect) {
            speedSelect.addEventListener('change', function () {
                slideshowInterval = parseInt(this.value);
                if (slideshowPlaying) {
                    // Restart slideshow timer with new interval
                    stopSlideshow();
                    startSlideshow();
                }
            });
        }

        // Transformations
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                if (checkLocked()) return;
                scale = Math.min(5.0, scale + 0.25);
                applyTransform();
                emitZoomPan();
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                if (checkLocked()) return;
                scale = Math.max(1.0, scale - 0.25);
                if (scale === 1.0) {
                    relX = 0.0;
                    relY = 0.0;
                }
                applyTransform();
                emitZoomPan();
            });
        }
        if (rotateBtn) {
            rotateBtn.addEventListener('click', () => {
                if (checkLocked()) return;
                rotation = (rotation + 90) % 360;
                applyTransform();
                emitZoomPan();
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (checkLocked()) return;
                scale = 1.0;
                relX = 0.0;
                relY = 0.0;
                rotation = 0;
                applyTransform();
                emitZoomPan();
            });
        }
    }

    /**
     * Mouse gesture handlers for zoom (wheel) and pan (drag)
     */
    function bindMouseGestureListeners() {
        const img = document.getElementById('lightbox-image');
        if (!img) return;

        const wrapper = document.querySelector('.video-wrapper');
        if (!wrapper) return;

        // 1. Mouse Wheel Zooming
        img.addEventListener('wheel', (e) => {
            if (checkLocked()) return;
            e.preventDefault();
            
            // Adjust scale factor
            scale = Math.max(1.0, Math.min(5.0, scale + e.deltaY * -0.0015));
            if (scale === 1.0) {
                relX = 0.0;
                relY = 0.0;
            }
            
            applyTransform();
            emitZoomPan();
        }, { passive: false });

        // 2. Mouse Drag Panning (mousedown on image)
        img.addEventListener('mousedown', (e) => {
            if (checkLocked()) return;
            e.preventDefault();

            isDragging = true;
            img.style.cursor = 'grabbing';
            img.style.transition = 'none'; // disable transitions during drag for fluid movement

            const rect = wrapper.getBoundingClientRect();
            // Calculate start coordinates offset by current relative positions
            startX = e.clientX - (relX * rect.width);
            startY = e.clientY - (relY * rect.height);
        });

        // 3. Mouse move (on window to survive fast dragging off-boundaries)
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const rect = wrapper.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Normalize offsets relative to parent container size
            relX = dx / rect.width;
            relY = dy / rect.height;

            applyTransform();
            emitZoomPanThrottled();
        });

        // 4. End Dragging (on window)
        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                img.style.cursor = 'grab';
                img.style.transition = 'transform 0.1s cubic-bezier(0.16, 1, 0.3, 1)'; // restore smooth transition
                emitZoomPan(); // send final position guarantee
            }
        });
    }

    /**
     * Check if controls are locked by the host
     */
    function checkLocked() {
        const isLocked = window.getIsPlaybackLocked();
        const isAdmin = !!window.getAdminToken();
        if (isLocked && !isAdmin) {
            if (window.showToast) {
                window.showToast('Gallery controls are locked by the host.', 'warning');
            }
            return true;
        }
        return false;
    }

    /**
     * Apply transform values locally to the image element
     */
    function applyTransform() {
        const img = document.getElementById('lightbox-image');
        if (img) {
            img.style.transform = `translate(${relX * 100}%, ${relY * 100}%) scale(${scale}) rotate(${rotation}deg)`;
        }
    }

    /**
     * Throttled transform broadcast to prevent network flooding (20 FPS)
     */
    function emitZoomPanThrottled() {
        const now = Date.now();
        if (now - lastBroadcastTime > BROADCAST_THROTTLE) {
            emitZoomPan();
            lastBroadcastTime = now;
        }
    }

    /**
     * Emit transform changes to all peers via Socket.IO
     */
    function emitZoomPan() {
        if (socket && socket.connected) {
            socket.emit('gallery_zoom_pan', {
                party_id: window.PARTY_ID,
                client_id: window.getClientId(),
                scale: scale,
                relX: relX,
                relY: relY,
                rotation: rotation
            });
        }
    }

    /**
     * Navigation: previous / next image in the folder
     */
    function navigateImage(direction) {
        if (checkLocked()) return;

        const files = window.getMediaFilesList() || [];
        // Filter only images
        const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.filename));
        if (imageFiles.length <= 1) return;

        // Find index of current image
        const currentIdx = imageFiles.findIndex(f => f.filename === currentImageFilename);
        if (currentIdx === -1) return;

        // Calculate next index with wrap-around
        let nextIdx = (currentIdx + direction) % imageFiles.length;
        if (nextIdx < 0) nextIdx = imageFiles.length - 1;

        const nextFile = imageFiles[nextIdx];
        
        // Load and broadcast new image selection
        if (window.selectAndBroadcastMedia) {
            window.selectAndBroadcastMedia(nextFile.filename);
        }
    }

    /**
     * Slideshow play/pause coordinator
     */
    function toggleSlideshow() {
        if (checkLocked()) return;

        if (slideshowPlaying) {
            stopSlideshow();
            emitSlideshowState(false);
        } else {
            startSlideshow();
            emitSlideshowState(true);
        }
    }

    function startSlideshow() {
        slideshowPlaying = true;
        
        const playBtn = document.getElementById('btn-gallery-play');
        if (playBtn) {
            playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            playBtn.title = 'Pause Slideshow';
        }

        const badge = document.getElementById('wp-slideshow-badge');
        if (badge) {
            badge.style.display = 'inline-block';
        }

        // Set up the advance timer loop
        slideshowTimer = setInterval(() => {
            navigateImage(1); // Advance forward
        }, slideshowInterval);
        
        console.log(`[GalleryModule] Slideshow started with interval ${slideshowInterval}ms`);
    }

    function stopSlideshow() {
        slideshowPlaying = false;
        
        const playBtn = document.getElementById('btn-gallery-play');
        if (playBtn) {
            playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            playBtn.title = 'Play Slideshow';
        }

        const badge = document.getElementById('wp-slideshow-badge');
        if (badge) {
            badge.style.display = 'none';
        }

        if (slideshowTimer) {
            clearInterval(slideshowTimer);
            slideshowTimer = null;
        }
        
        console.log("[GalleryModule] Slideshow stopped.");
    }

    function emitSlideshowState(playing) {
        if (socket && socket.connected) {
            socket.emit('slideshow_state', {
                party_id: window.PARTY_ID,
                client_id: window.getClientId(),
                playing: playing,
                interval: slideshowInterval
            });
        }
    }
})();
