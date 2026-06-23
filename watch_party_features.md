# Ultimate Co-Watching & Watch Party — Feature Proposal

> **Rethought Concept**: A high-fidelity, interactive **Media Co-Watching Room** designed for watching movies, sharing screens, browsing image galleries, and hanging out with voice and video. This proposal details features to elevate the room into a complete virtual living room.

---

## Existing Base Capabilities

These are already implemented in the local repository and will serve as the foundation:
* **Play/Pause/Seek Sync**: Socket.IO-based playback position mirror.
* **P2P Voice Mesh**: WebRTC-based voice channel using STUN servers.
* **File Browser**: Directory-based movie and image selector.
* **Admin Moderation**: Kick, force-mute, playback lock, and folder change.
* **Cloudflare Tunneling**: Sharing the party link over the internet with a single click.

---

## Proposed Features (Rethought & Expanded)

### 🖥️ 1. Screen Sharing & Webcam Video Grid (WebRTC)
Extend the existing WebRTC signaling to support full video and screen streaming:
* **Screen Sharing (`getDisplayMedia`)**: Allow participants to stream their desktop screen (or specific window/tab) directly into the main video container. Viewers can switch between the shared folder video and the active screenshare.
* **Webcam Grid**: Show participant webcams in a collapsible video grid above/below the chat sidebar.
* **WebRTC Video Mesh**: Relays webcam video streams through the existing signaling channel (`signal_event`).
* **Active Speaker Focus**: Automatically highlight the webcam frame of the person currently speaking.

---

### 🎨 2. Synced Laser Pointer & Drawing Tools
Make watching interactive by letting users point out details on screen:
* **Synced Laser Pointer**: A key combination (e.g., holding `Ctrl` and moving the mouse) renders a glowing laser pointer dot on everyone's screens with the user's name next to it.
* **Draw on Video/Image**: A temporary brush tool that lets viewers draw directly over a paused video or image (e.g., to point out a detail). Drawings fade away automatically after 3 seconds.

---

### ⚡ 3. Top-Notch Playback Sync Infrastructure
Ensure perfect, lag-free synchronization matching commercial streaming platforms:
* **Micro-Drift Speed Compensation**: A background sync loop checks alignment every 2 seconds. If a viewer drifts by more than 100ms, their playback speed is silently adjusted (e.g., `1.03x` or `0.97x`) until they catch up, avoiding jarring snaps/seeks.
* **Smart Buffering Sync**: When any viewer begins buffering, the video auto-pauses for everyone and displays a "Waiting for [User] to buffer..." notification. Playback automatically resumes when their buffer completes.
* **Latency (RTT) Calibration**: Measure the round-trip network latency (RTT) for each viewer. Offset play/seek actions dynamically to ensure the video frame renders on everyone's screens at the exact same physical millisecond.
* **Frame-Accurate Synced Scrubbing**: Broadcast seek coordinates dynamically on `seeking` (during dragging) rather than just `seeked` (after mouse release), allowing real-time, frame-by-frame scrubbing that updates on all viewers' screens instantly.

---

### 🎬 4. Advanced Co-Watching Playback
* **Collaborative Media Queue**:
  - Drag-and-drop queue panel in the sidebar.
  - "Add to Queue" button on files in the file browser.
  - Synced autoplay to load the next file when the current one ends.
* **Synchronized Playback Speed**: Allow the host to speed up/slow down playback (0.75x, 1x, 1.25x, 1.5x, 2x) synced for all viewers.
* **Subtitles & Audio Track Selector**: Support loading custom subtitle files (`.srt` / `.vtt`) and switching audio tracks, syncing the selection across all clients.

---

### 🖼️ 5. Shared Image Gallery & Slideshow
Go beyond video watching to co-curate photo folders:
* **Synced Slideshow Mode**: An auto-advance timer (e.g., 5 seconds per image) that advances the active image for all viewers.
* **Synced Zoom & Pan**: When viewing an image, if the presenter zooms in or drags the image, it pans and zooms identically on everyone's screens in real-time.
* **Image Rotation Controls**: Synced 90-degree rotations.

---

### 🔊 6. High-Fidelity Audio Controls
* **Individual Volume Sliders**: Let viewers adjust the voice volume of other participants individually (e.g., if one person's mic is too loud or quiet).
* **Audio Routing Mode**: Toggle between outputting voice chat through the default system audio device or routing it into the video player stream.
* **Echo Cancellation & Noise Suppression**: Configure WebRTC audio constraints (`echoCancellation: true`, `noiseSuppression: true`) for clear sound.

---

### 💬 7. Live Interaction & Fun
* **Floating Emoji Reactions (❤️🔥😂👏🎉)**: Clicking an emoji button or typing key shortcuts (`1`–`5`) broadcasts a floating emoji that floats up from the bottom of the video player on all participants' screens, fading out after a few seconds.
* **Chat Message Reactions**: Emoji reactions pinned below individual chat messages.
* **Typing Indicator**: "User is typing..." indicator beneath the chat box.
* **Notification Sounds**: Subtle sound alerts for new chat messages (toggloable).

---

### 📐 8. Layout & UX Polish
* **Theater Mode**: Collapses the right sidebar completely, letting the video scale to the full viewport width.
* **Collapsible Panels**: Users can toggle Chat, Participants, and File Browser individually.
* **Hotkey Reference Sheet**: A quick overlay (`?` or `H`) listing player controls (Space to pause, M to mute, arrow keys to seek, etc.).

---

## Implementation Priority Plan

### 🚀 Phase 1: Interactive Fun & Controls
* **Floating Emoji Reactions**: Simple canvas/CSS overlay over Plyr.js, broadcasting events via Socket.IO.
* **Laser Pointer**: Track mouse movement relative to the video dimensions and broadcast coordinates via Socket.IO.
* **Theater Mode**: CSS styling toggle to collapse/expand panels cleanly.

### 🎥 Phase 2: WebRTC Webcams & Screenshare
* **Webcam Toggle**: Expand `getUserMedia` to request video and mount the streams.
* **Screenshare Button**: Call `navigator.mediaDevices.getDisplayMedia` and replace the video player element with the screen-share video stream.

### 📁 Phase 3: Gallery & Queue Curation
* **Queue Controller**: Add in-memory playlist queue structure in `app.py` and sync state.
* **Synced Zoom/Pan**: Listen for zoom/drag events on images and broadcast coordinates.
