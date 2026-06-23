/**
 * AuraSort — Watch Party Synced Laser Pointer & Drawing Canvas (Modular)
 * Handles aspect-ratio relative coordinates mapping, real-time throttled Socket.IO sync,
 * and a smooth alpha-fading drawing render loop.
 */

(function () {
    let socket = null;
    let canvas = null;
    let ctx = null;
    let currentTool = 'none'; // 'none', 'laser', 'draw'
    let currentColor = '#ff4757'; // default red
    
    // Other users' laser pointers state
    const remoteLasers = {}; // client_id -> { x, y, name, active, lastUpdate }
    
    // Local drawing state
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    // Drawing segments list (shared across all users)
    // Each segment: { startX: 0..1, startY: 0..1, endX: 0..1, endY: 0..1, color, timestamp, duration: 3000 }
    let drawingSegments = [];
    
    // Throttling for laser moves
    let lastLaserBroadcast = 0;
    const BROADCAST_INTERVAL = 50; // 20 FPS (50ms)
    
    // Initialize the module when page loads
    window.addEventListener('load', () => {
        initLaserDrawingSystem();
    });

    function initLaserDrawingSystem() {
        canvas = document.getElementById('laser-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        
        // Wait for Plyr and socket to initialize
        setupSocketBindingLoop();
        setupToolbarListeners();
        setupCanvasListeners();
        setupResizeListeners();
        
        // Start the animation render loop
        requestAnimationFrame(renderLoop);
    }

    /**
     * Periodically check for window.socket and bind event listeners
     */
    function setupSocketBindingLoop() {
        const checkInterval = setInterval(() => {
            if (window.socket && window.socket.connected) {
                socket = window.socket;
                clearInterval(checkInterval);
                bindSocketListeners();
                console.log("[LaserModule] Connected to socket.io successfully.");
            }
        }, 200);
        
        // Stop checking after 15 seconds to avoid infinite loop if offline
        setTimeout(() => clearInterval(checkInterval), 15000);
    }

    function bindSocketListeners() {
        if (!socket) return;
        
        // Listen for peer laser movements
        socket.on('laser_update', (data) => {
            if (!data.client_id) return;
            remoteLasers[data.client_id] = {
                x: data.x,
                y: data.y,
                name: data.client_name || 'Guest',
                active: data.active,
                lastUpdate: Date.now()
            };
        });
        
        // Listen for peer drawings
        socket.on('draw_stroke_broadcast', (data) => {
            if (!data.stroke) return;
            drawingSegments.push({
                startX: data.stroke.startX,
                startY: data.stroke.startY,
                endX: data.stroke.endX,
                endY: data.stroke.endY,
                color: data.stroke.color || '#ff4757',
                timestamp: Date.now(),
                duration: 3000
            });
        });
        
        // Listen for clear board command
        socket.on('clear_drawings_broadcast', () => {
            drawingSegments = [];
        });
    }

    function setupToolbarListeners() {
        const toolbar = document.getElementById('laser-toolbar');
        if (!toolbar) return;
        
        const btnNone = document.getElementById('tool-select-none');
        const btnLaser = document.getElementById('tool-select-laser');
        const btnDraw = document.getElementById('tool-select-draw');
        const btnClear = document.getElementById('btn-clear-drawings');
        
        function deactivateAll() {
            btnNone.classList.remove('active');
            btnLaser.classList.remove('active');
            btnDraw.classList.remove('active');
            canvas.classList.remove('interactive');
        }
        
        btnNone.onclick = () => {
            deactivateAll();
            btnNone.classList.add('active');
            currentTool = 'none';
            // Hide local laser
            broadcastLaserMove(0, 0, false);
        };
        
        btnLaser.onclick = () => {
            deactivateAll();
            btnLaser.classList.add('active');
            canvas.classList.add('interactive');
            currentTool = 'laser';
        };
        
        btnDraw.onclick = () => {
            deactivateAll();
            btnDraw.classList.add('active');
            canvas.classList.add('interactive');
            currentTool = 'draw';
            // Hide local laser
            broadcastLaserMove(0, 0, false);
        };
        
        btnClear.onclick = () => {
            drawingSegments = [];
            if (socket) {
                socket.emit('clear_drawings', { party_id: window.PARTY_ID });
            }
        };
        
        // Color pickers
        const pickers = toolbar.querySelectorAll('.color-dot-picker');
        pickers.forEach(picker => {
            picker.onclick = () => {
                pickers.forEach(p => p.classList.remove('selected'));
                picker.classList.add('selected');
                currentColor = picker.getAttribute('data-color');
            };
        });
    }

    function setupCanvasListeners() {
        if (!canvas) return;
        
        canvas.addEventListener('mousedown', (e) => {
            if (currentTool !== 'draw') return;
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            lastX = (e.clientX - rect.left) / canvas.width;
            lastY = (e.clientY - rect.top) / canvas.height;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const relativeX = (e.clientX - rect.left) / canvas.width;
            const relativeY = (e.clientY - rect.top) / canvas.height;
            
            // 1. Handle Synced Laser Pointer
            if (currentTool === 'laser') {
                broadcastLaserMove(relativeX, relativeY, true);
            }
            
            // 2. Handle Drawing Brush
            if (currentTool === 'draw' && isDrawing) {
                const stroke = {
                    startX: lastX,
                    startY: lastY,
                    endX: relativeX,
                    endY: relativeY,
                    color: currentColor
                };
                
                // Draw locally immediately
                drawingSegments.push({
                    ...stroke,
                    timestamp: Date.now(),
                    duration: 3000
                });
                
                // Broadcast stroke to other peers
                if (socket) {
                    socket.emit('draw_stroke', {
                        party_id: window.PARTY_ID,
                        client_id: window.clientId || 'local',
                        stroke: stroke
                    });
                }
                
                lastX = relativeX;
                lastY = relativeY;
            }
        });
        
        // Stop drawing or laser active states when mouse leaves/releases
        const stopTracking = () => {
            isDrawing = false;
            if (currentTool === 'laser') {
                broadcastLaserMove(0, 0, false);
            }
        };
        
        canvas.addEventListener('mouseup', stopTracking);
        canvas.addEventListener('mouseleave', stopTracking);
    }

    function broadcastLaserMove(x, y, active) {
        const now = Date.now();
        if (!active || (now - lastLaserBroadcast > BROADCAST_INTERVAL)) {
            if (socket) {
                socket.emit('laser_move', {
                    party_id: window.PARTY_ID,
                    client_id: window.clientId || 'local',
                    client_name: window.clientName || 'Guest',
                    x: x,
                    y: y,
                    active: active
                });
            }
            lastLaserBroadcast = now;
        }
    }

    function setupResizeListeners() {
        window.addEventListener('resize', resizeCanvas);
        
        // Also listen to video events that might shift layout
        const video = document.getElementById('lightbox-video');
        if (video) {
            video.addEventListener('loadedmetadata', resizeCanvas);
            video.addEventListener('play', resizeCanvas);
            video.addEventListener('playing', () => setTimeout(resizeCanvas, 100));
        }
        
        // Initial defer resize
        setTimeout(resizeCanvas, 500);
    }

    function resizeCanvas() {
        const video = document.getElementById('lightbox-video');
        if (!video || !canvas) return;
        
        // Determine exact bounding box of the containing video content
        const rect = video.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        // Overlay precisely on the video position inside the parent wrapper
        canvas.style.position = 'absolute';
        canvas.style.top = `${video.offsetTop}px`;
        canvas.style.left = `${video.offsetLeft}px`;
    }

    /**
     * Main animation loop rendering lasers and fading drawings
     */
    function renderLoop() {
        if (!canvas || !ctx) {
            requestAnimationFrame(renderLoop);
            return;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const now = Date.now();
        
        // 1. Render and fade drawings
        // Filter out expired segments
        drawingSegments = drawingSegments.filter(seg => {
            const age = now - seg.timestamp;
            return age < seg.duration;
        });
        
        drawingSegments.forEach(seg => {
            const age = now - seg.timestamp;
            const remainingRatio = 1 - (age / seg.duration); // 1.0 -> 0.0
            
            // Set line style with smooth fading opacity
            ctx.beginPath();
            ctx.moveTo(seg.startX * canvas.width, seg.startY * canvas.height);
            ctx.lineTo(seg.endX * canvas.width, seg.endY * canvas.height);
            ctx.strokeStyle = hexToRgba(seg.color, remainingRatio);
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        });
        
        // 2. Render other participants' active laser pointers
        Object.keys(remoteLasers).forEach(id => {
            const laser = remoteLasers[id];
            // If active and updated within the last 4 seconds
            if (laser.active && (now - laser.lastUpdate < 4000)) {
                const pxX = laser.x * canvas.width;
                const pxY = laser.y * canvas.height;
                
                // Draw glowing laser core
                ctx.beginPath();
                ctx.arc(pxX, pxY, 6, 0, 2 * Math.PI);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ff4757';
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0; // reset shadow
                
                // Draw outer colored laser ring
                ctx.beginPath();
                ctx.arc(pxX, pxY, 9, 0, 2 * Math.PI);
                ctx.strokeStyle = '#ff4757';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Draw participant name badge
                ctx.font = 'bold 10px Outfit, Inter, sans-serif';
                const badgeText = laser.name;
                const textWidth = ctx.measureText(badgeText).width;
                
                // Badge background
                ctx.fillStyle = 'rgba(18, 18, 22, 0.85)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                roundRect(ctx, pxX + 12, pxY - 10, textWidth + 10, 16, 4, true, true);
                
                // Badge text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(badgeText, pxX + 17, pxY + 2);
            }
        });
        
        requestAnimationFrame(renderLoop);
    }

    /**
     * Helper to convert HEX to RGBA string with custom opacity
     */
    function hexToRgba(hex, alpha) {
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
        return result 
            ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`
            : `rgba(255, 71, 87, ${alpha})`;
    }

    /**
     * Helper to draw rounded rectangles on HTML5 Canvas
     */
    function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        if (typeof radius === 'undefined') {
            radius = 5;
        }
        if (typeof radius === 'number') {
            radius = {tl: radius, tr: radius, br: radius, bl: radius};
        } else {
            const defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
            for (const side in defaultRadius) {
                radius[side] = radius[side] || defaultRadius[side];
            }
        }
        ctx.beginPath();
        ctx.moveTo(x + radius.tl, y);
        ctx.lineTo(x + width - radius.tr, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        ctx.lineTo(x + width, y + height - radius.br);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        ctx.lineTo(x + radius.bl, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        ctx.lineTo(x, y + radius.tl);
        ctx.quadraticCurveTo(x, y, x + radius.tl, y);
        ctx.closePath();
        if (fill) {
            ctx.fill();
        }
        if (stroke) {
            ctx.stroke();
        }
    }
})();
