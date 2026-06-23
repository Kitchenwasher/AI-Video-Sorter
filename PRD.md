# AuraSort — Product Requirements Document (PRD)

> **Status:** Production-Grade v1.0
> **Document type:** Reverse-engineered technical & product specification
> **Source code revision:** Master branch, current `HEAD`

---

## 1. Executive Summary & Product Vision

### 1.1 Product Name
**AuraSort** — a premium AI face sorter and media organizer (internally the project is also referred to as `AI-Video-Sorter`).

### 1.2 Primary Purpose
AuraSort is a self-hosted, high-performance desktop-class media library organizer that:
- Recursively scans local folders of **videos and photos**,
- Extracts high-quality **keyframes** from videos (I-frame / GPU-accelerated),
- Detects and recognizes **human faces** using deep learning (`InsightFace` ONNX models with DirectML acceleration),
- Classifies **gender** for each detected face,
- Computes **face embeddings** (512-D normalized vectors) and groups them into identity clusters,
- **Sorts / moves** the source files into per-identity folders (`female_001`, `female_002`, …) and persists the assignment so subsequent runs are idempotent,
- Provides a premium **dark-mode web dashboard** to monitor the pipeline, browse the sorted library, and consume the media,
- Provides a **reverse-image search auto-namer** that uses Google Lens / Yandex to identify celebrity faces and rename folders,
- Provides a **duplicate detector** that uses perceptual hashing (DCT-based pHash) over images and videos,
- Includes a first-class **Watch Party** subsystem: real-time SSE-driven playback synchronization, **WebRTC P2P voice mesh** between participants, live chat, password protection, and a full **admin moderation panel** (kicking, muting, playback lock, slow mode, chat deletion, room extension / termination).

### 1.3 Target Audience
- Power users / media archivists with very large local libraries of adult-oriented video/photo assets who want a one-click, dark-mode dashboard for face-based organization.
- Users who want a self-hosted, private alternative to cloud face-recognition services.
- Privacy-conscious users that want GPU-accelerated AI sorting entirely on their own machine (DirectML on Windows; CPU fallback otherwise).
- Friend groups that want to watch their sorted library together in a real-time sync room with voice chat.

### 1.4 Key Value Propositions
- **Single binary, single Python process** — `python app.py` and you are operational.
- **DirectML GPU acceleration** on Windows for AMD/Intel/NVIDIA iGPUs and dGPUs (ONNX Runtime with `DmlExecutionProvider`).
- **Persistent face embedding cache** (SQLite) so re-running on an unchanged library is essentially free.
- **Persistent identity registry** (`PersistentProfile` table + `_profile_embedding.json` per folder) so identities survive between runs and across manual folder renames.
- **Standalone, shareable Watch Parties** with end-to-end P2P voice and admin moderation (no third-party video conferencing required).
- **Auto-naming** via filename parsing + Yandex / Google Lens reverse image search.
- **Duplicate detection** across all sorted folders using DCT perceptual hash.
- **Premium glassmorphic dark UI** with FontAwesome 6, Google Fonts (Outfit & Inter), Plyr video player, and ambient color glows.

### 1.5 Non-Functional Requirements
- **Local-only** by default (binds to `127.0.0.1:5000`); an *opt-in* localhost.run SSH tunnel can be launched at startup to expose only the Watch Party URLs to the public internet.
- **Cross-platform** Python 3.10+ on Windows / macOS / Linux (the code base has Windows-specific integrations such as Job Objects and `os.startfile`).
- **No external services required** unless the user opts in to `auto_name_folders` (uses Yandex / Google Lens).

---

## 2. Comprehensive Feature Breakdown

### 2.1 Pipeline: Input Scanning
- **Module:** `modules/scanner.py` (`FileScanner`).
- Recursively walks the configured `input_dir` using `os.walk`.
- Splits files by extension:
  - **Videos:** `.mp4 .mkv .avi .mov .wmv .webm .flv .m4v .mpg .mpeg`
  - **Images:** `.jpg .jpeg .png .webp .bmp .tiff`
- Returns a dict `{ 'videos': [...], 'images': [...] }` of absolute paths.

### 2.2 Pipeline: Keyframe Extraction
- **Module:** `modules/keyframe_extractor.py` (`KeyframeExtractor`).
- Output goes to `<workspace>/.temp_keyframes/<md5(path)>/frame_NNNN.jpg`.
- **Two strategies**, tried in order:
  1. **FFmpeg with I-frame skip + GPU decode** — `ffmpeg -hwaccel d3d11va -skip_frame nokey -i <video> -vsync vfr -frame_pts true -q:v 2 frame_%04d.jpg`. Uses Direct3D 11 Video Acceleration on Windows.
  2. **FFmpeg CPU fallback** — same flags without `-hwaccel d3d11va`.
  3. **OpenCV frame-sampling fallback** — samples frames at `keyframe_interval` seconds (or 1 s by default) using `cv2.VideoCapture`.
- **Limits / guards:**
  - `max_keyframes` cap; if exceeded, frames are evenly sub-sampled and the rest are deleted.
  - `extraction_percent` (5–100) lets the user analyze only the first X% of a video's duration.
  - `keep_keyframes` debug flag re-uses keyframes on disk between runs.
- Cleans up after itself: per-video directory on completion, and the global temp dir on pipeline completion.

### 2.3 Pipeline: Face Detection, Embedding & Gender
- **Module:** `modules/face_analyzer.py` (`FaceAnalyzer`).
- Uses `insightface.app.FaceAnalysis` with one of the configurable model packs:
  - `buffalo_l` (default, recommended)
  - `buffalo_s` (fast)
  - `antelopev2` (most accurate, slowest)
- **Execution providers** are tried in order: `DmlExecutionProvider` (DirectML GPU) → `CPUExecutionProvider` (fallback). If the GPU provider raises on `app.get()` (e.g. DML suspended/TDR), the analyzer self-heals by re-initializing on CPU and retrying.
- **Padded canvas fallback** — if no faces are detected at native resolution, the image is embedded into a 2× canvas and re-inferred; detected boxes are translated back.
- For each face, the analyzer returns:
  - `bbox` (x1, y1, x2, y2)
  - `embedding` (L2-normalized 512-D vector; uses `normed_embedding` if available, else normalizes `embedding`)
  - `gender` ∈ `{ "female", "male" }` (InsightFace `gender == 0` → female)
  - `gender_score` (currently `det_score` proxy)
  - `frame_index`
- **Filters applied per face:**
  - `min_face_size` (px): drops tiny faces
  - `face_det_threshold` (0.30–0.90): drops low-confidence detections
  - `min_eye_dist_ratio` (0.00–0.30): drops profile / kissing / occluded faces by ratio of inter-ocular distance to face width

### 2.4 Pipeline: Embedding Cache
- **Module:** `utils/cache.py` (`EmbeddingCache`).
- All persistence goes through SQLAlchemy models defined in `utils/models.py` (`ProcessedFile`, `Face`, `PersistentProfile`, `WatchHistory`, `WatchParty`).
- The cache key is `(file_path, mtime, size)`; on mtime/size drift the old record is purged.
- Provides:
  - `get_cached_faces`, `cache_faces`, `clear`
  - `add_persistent_profile`, `add_persistent_profile_with_id`, `update_profile_folder_name`, `delete_persistent_profile`
  - `update_file_path`, `update_folder_paths`, `copy_file_cache`
- **On disk**, the cache database lives at `<workspace>/.cache/face_embeddings_cache.db` (Postgres if `DATABASE_URL` is set).

### 2.5 Pipeline: Clustering
- **Module:** `modules/clustering.py` (`FaceClusterer`).
- Clustering is performed **only on female embeddings** (configurable gender filter).
- Three algorithms are attempted in order:
  1. **HDBSCAN** (`min_cluster_size`, `cluster_selection_epsilon`, euclidean)
  2. **DBSCAN** (eps = `cluster_epsilon`, min_samples = `min_cluster_size`)
  3. **AgglomerativeClustering** (distance_threshold = `cluster_epsilon`, average linkage)
- Label `-1` = noise / unclustered.
- **Medoid finding** uses the minimum sum of pairwise distances within each cluster to pick a representative face (used to generate the per-folder avatar).

### 2.6 Pipeline: Identity Resolution & File Sorting
- **Modules:** `pipeline.py` (`SortingPipeline._load_and_sync_profiles`), `modules/sorter.py` (`VideoSorter`), `modules/screen_time.py` (`ScreenTimeCalculator`).
- For every detected face, the pipeline matches it against existing profiles from the registry:
  - The pipeline loads existing profiles from the `PersistentProfile` table.
  - It also **syncs** with disk: manual folder renames on disk are propagated back into SQLite (`update_profile_folder_name`, `update_folder_paths`).
  - Legacy folders (without `profile_id`) are matched to existing profiles by L2 distance with a tight `epsilon = 0.05`, otherwise re-registered.
- Raw clusters are matched to existing profiles by medoid distance (L2, threshold = `cluster_epsilon`); unmatched clusters become new identities.
- New folder names default to `female_001`, `female_002`, …; if `auto_name_folders` is enabled the folder is later renamed by `NameResolver`.
- For each file, `ScreenTimeCalculator.calculate_assignments` decides which single identity owns it:
  - Counts distinct keyframe occurrences per cluster in the file.
  - If `prefer_popular_identities` is true and ≥ 2 clusters appear, the identity that appears in the most files overall wins.
  - Ties are broken by the first-seen cluster.
- `VideoSorter.sort_files` then moves (or copies) the file, writes `_profile_embedding.json` and `_reference_face.jpg` to the cluster folder, and emits a JSON sorting report.

### 2.7 Pipeline: Reverse-Image Auto-Naming
- **Module:** `modules/name_resolver.py` (`NameResolver`, `ReverseImageSearcher`, `FilenameParser`).
- Two complementary identification strategies are cross-referenced:
  - **Filename parser:** strips delimiters, splits CamelCase, drops tokens against a curated `NON_NAME_WORDS` blocklist (file formats, site names, common English prepositions, etc.), and returns the most-frequent candidate.
  - **Reverse image search:**
    1. Yandex (`https://yandex.com/images/search`) — JSON `cbirId` → HTML scrape with BeautifulSoup.
    2. Google Lens (via subprocess `curl` POST → `Location:` redirect → GET), with a fallback path.
- A tenacity retry policy retries 5 times with exponential backoff on `ConnectionError`, `Timeout`, and HTTP 429/5xx.
- Results are scored: cross-referenced matches (filename + search agree, fuzzy ratio ≥ 0.8) get **0.95 confidence**; otherwise the higher of the two confidence scores is used.
- `resolve_all_folders` iterates the output directory, optionally restricting to `female_*` folders (`only_name_unnamed`), and applies a `merge_on_name_conflict` policy:
  - If multiple folders resolve to the same name **and** the flag is on, they are merged (averaged embedding, file moves, source folders deleted).
  - Otherwise suffixes (`Name 2`, `Name 3`, …) are appended.
- Configurable knobs: `name_confidence_threshold` (0.30–1.00), `name_search_delay` (1.0–10.0 s), `merge_on_name_conflict`.

### 2.8 Pipeline: Library Re-Indexing
- **Module:** `modules/profile_manager.py` (`LibraryIndexer`).
- A background thread re-scans every file in `output_dir` and writes missing face caches to SQLite. This is what enables the "search by face" and cross-folder "Profile media" features.
- The frontend polls `/api/profiles/index/status` to show a progress bar.

### 2.9 Library: Browsing, Filtering, Sorting, Searching
- **Library view** (`/api/list-folders`): per-folder stats (file count, total size, average rating, watched count, has_thumbnail).
- **Filter pills:** `All`, `Named only`, `Unnamed only`, `Has rating`.
- **Sort:** `Most files`, `Least files`, `A–Z`, `Z–A`, `Highest rated`.
- **View modes:** grid / list (persisted in `localStorage`).
- **Per-folder actions:** open in Windows Explorer, rename, merge, create Watch Party, auto-extract avatar.
- **Global search modal:** `Ctrl+K` / `/` shortcut, full-text search across filenames, folder names, and DB-cached paths; can also **drag-and-drop an image** into the search box to do *face-based* search (`/api/search-by-image`).

### 2.10 Library: Profile Manager
- A separate Profiles view that lists all identity profiles with avatars, gender, file count.
- Supports drag-and-drop merging of profile cards.
- Library indexer button to seed cross-folder search.

### 2.11 Library: Gallery View (per-folder)
- A single-pane gallery for a chosen identity, with the reference avatar, file count, rename, open-folder, and "Create Watch Party" actions.
- Includes a **drag-and-drop clustering corrector** sidebar (the right drawer) — drag a media card from the gallery onto a folder to manually re-assign it.

### 2.12 Library: Lightbox Player (Plyr)
- Custom Plyr video player for in-app playback, with:
  - Tabbed metadata panel (Info, Queue)
  - Shuffle / Loop controls
  - 5-star rating with persistence to `WatchHistory.rating`
  - Auto-resume of `playback_position` (≥90% marks `is_completed = True`)
- "Open in system player" route (`/api/play-file`) for non-web-native formats (`.mkv`, `.avi`, etc.) and per the user's `default_video_player` preference.

### 2.13 Watch History, Ratings & "Recently Played"
- All played media is recorded in `WatchHistory` (playback position, duration, completed flag, rating, watched_at).
- `/api/recently-watched` returns the 10 most-recent items, the frontend renders them in a horizontal scroll carousel on the Library home page.
- "Clear history" button wipes all `WatchHistory` rows.

### 2.14 Duplicate Detection
- **Module:** `modules/duplicate_detector.py` (`DuplicateDetector`).
- Background-thread scan, status polled from `/api/duplicates/status`.
- For each file in the output directory it computes:
  - **Images:** a 64-bit DCT pHash over a 32×32 grayscale resize.
  - **Videos:** the same pHash over the first frame, plus duration / dimensions / FPS.
- Pairwise comparison via Disjoint-Set Union:
  - Images: hamming distance ≤ 10
  - Videos: hamming distance ≤ 10 **and** `|Δduration| ≤ 3 s`
- Groups are scored by `quality_score = width * height * 10 + filesize`; the highest-quality file in each group is marked `is_best`.
- The user can resolve duplicates by selecting files to delete; the API physically deletes the file, removes its `ProcessedFile` + `WatchHistory`, and returns the updated group list.

### 2.15 Watch Party — Standalone Sync Room
- **Template:** `templates/watch_party.html`; **JS controller:** `static/js/watch_party.js`.
- Each party is keyed by a UUID stored in the `WatchParty` table with a 24 h default expiry (extendable to 6 / 12 / 24 h).
- Optional SHA-256 password protection (never stored in plaintext).
- Per-room admin token (also a UUID) — whoever creates the room has the crown.
- **SSE** at `/api/watch-party/<id>/stream` pushes all room events: `init`, `peer_joined`, `peer_left`, `sync`, `chat`, `chat_delete`, `chat_clear`, `folder_changed`, `playback_locked`, `settings_changed`, `kicked`, `force_mute`, `party_ended`, and `signal` (WebRTC relay).
- **Playback sync**: play / pause / seek events are relayed to all peers; the receiving side uses Plyr's API to mirror the position with a 2-second tolerance before snapping.
- **WebRTC P2P voice mesh**:
  - `getUserMedia({ audio: true })`; mic muted by default.
  - Each peer creates one `RTCPeerConnection` per remote peer; STUN servers are `stun.l.google.com:19302` etc.
  - Offer/answer and ICE candidates are relayed as JSON through the SSE-controlled `signal` channel.
  - Each remote audio is attached to a hidden `<audio>` element; an `AnalyserNode`-driven VU meter shows a green "speaking" indicator and red "muted" indicator.
- **Chat**: real-time text chat, each message has a UUID and a `sender_id`. Admin can delete individual messages or clear the whole room.
- **Slow mode** (admin only): 10-second cooldown between non-admin messages.
- **Playback lock** (admin only): non-admins see a "Playback Locked by Host" overlay and any local play / pause / seek attempts are reverted and toasted.
- **Force mute** (admin only): remote `force_mute` event flips the local audio track to `enabled = false`.
- **Kick** (admin only): target's `client_id` is added to `kicked_clients`; their SSE is closed on next disconnect, and a `kicked` event is delivered immediately.
- **End party** (admin only): sets `expires_at` to past, broadcasts `party_ended`, closes all clients.
- **Change folder** (admin only): atomic broadcast of new file list to all peers; receivers reload the playlist, reset to position 0 paused.
- **Local-host sharing**: an opt-in `localhost.run` SSH tunnel (`start_localhost_run_tunnel`) runs at startup in a daemon thread. The tunnel's `https://<random>.lhr.life` URL is auto-detected by regex, stored in `public_tunnel_url`, and appended to the create-party response so the host can share a public link. The tunnel subprocess is wrapped in a Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) so that closing the Flask process kills the tunnel cleanly.

### 2.16 Access Restriction (Public Tunnel Guard)
- `app.before_request` checks the `Host` header for `*.lhr.life` / `localhost.run`. Public viewers are only allowed to:
  - `/static/*`
  - `/watch-party/<id>` and any `/api/watch-party/*` route
  - `/media/*`, `/api/video-thumbnail/*`, `/api/thumbnail/*`
  - `/api/profile/<folder>/media` *if* that folder is currently being shared
  - `/api/profiles` *if* the request carries a valid `admin_token` for a live party
- All other paths get an HTML or JSON 403 "Access Denied" response.

### 2.17 Other System Features
- **Configuration persistence** to `settings.json` (loaded at startup, written on every `POST /api/config`).
- **PostgreSQL / SQLite dual-mode** — `DATABASE_URL` env var switches the SQLAlchemy backend. Schema auto-migrates (`rating` column on `watch_history`, `admin_token` on `watch_parties`).
- **Celery / Redis optionality** — if Redis is reachable, the pipeline runs as a Celery task; otherwise it falls back to a local background thread. Status is exposed via `AsyncResult` on `/api/status`.
- **Real-time progress streaming** via SSE (`/api/stream-progress`) feeds the dashboard's progress bar and console.
- **In-process log buffer** (`UILogHandler`, capped at 500 entries) backs the on-screen console.
- **Cross-platform cleanup** — `atexit`, `SIGINT`/`SIGTERM`, and Windows `SetConsoleCtrlHandler` all call `cleanup_tunnel()` to kill the SSH tunnel and exit.

---

## 3. Tech Stack & Architecture Layout

### 3.1 Languages & Runtime
- **Python 3.10+** (uses `match`-less modern syntax; `from __future__` not required).
- **JavaScript (ES2020+, vanilla)** for the front-end, no build step.
- **HTML5** templates served by Jinja2.
- **CSS3** with custom properties (no Tailwind / Bootstrap).

### 3.2 Backend Frameworks
- **Flask** — HTTP server, JSON APIs, SSE endpoints, templating.
- **Flask-SQLAlchemy** — ORM for the SQLite/Postgres cache.
- **Flask-CORS** — permissive CORS for the watch party front-end.
- **Celery + Redis** — *optional* distributed task execution (`tasks.py`). Auto-falls-back to a local `threading.Thread` if Redis is unreachable.
- **tenacity** — retry policy for the Yandex / Google Lens reverse image search.

### 3.3 AI / Computer-Vision
- **InsightFace** — face detection, recognition, gender/age (`buffalo_l` / `buffalo_s` / `antelopev2`).
- **ONNX Runtime DirectML** (`onnxruntime-directml`) — GPU execution provider on Windows (AMD/Intel/NVIDIA).
- **OpenCV (`opencv-python`)** — image decode, video capture, DCT for pHash, drawing face crops.
- **NumPy** — embedding math (L2 distance, normalization, averaging).
- **scikit-learn** — HDBSCAN, DBSCAN, AgglomerativeClustering.

### 3.4 Media Processing
- **FFmpeg** (with `d3d11va` hwaccel) — I-frame keyframe extraction.
- **FFprobe** — video metadata (duration, resolution, codec, bitrate, FPS).
- The code includes a self-discovery routine (`_find_ffmpeg` / `find_ffprobe`) that searches `LOCALAPPDATA\Microsoft\WinGet\Packages` for the binary if it's not on `PATH`.

### 3.5 HTTP / Networking for Reverse Search
- `requests` + `beautifulsoup4` for the Yandex path.
- `subprocess.run` + `curl` for the Google Lens fallback (chosen because it bypasses TLS fingerprinting).
- `psycopg2-binary` for the optional Postgres path.

### 3.6 Frontend
- **Plyr.js 3.7.8** (polyfilled) — custom-themed video player for both the dashboard and the watch party.
- **FontAwesome 6.4.0** — icon set.
- **Google Fonts:** Outfit (display) + Inter (UI).
- **Vanilla CSS** in `static/css/style.css` (~2,500 LOC) implementing the AuraSort design system.
- **No framework** — the front-end is plain `document.addEventListener` and `fetch` / `EventSource` / `RTCPeerConnection`.

### 3.7 Real-Time Subsystems
- **SSE (Server-Sent Events)** for:
  - Pipeline progress + log streaming (`/api/stream-progress`)
  - Watch Party pub/sub (`/api/watch-party/<id>/stream`)
- **WebRTC** for the audio mesh in Watch Parties.
- **`queue.Queue`** per connected client is the in-process message bus.

### 3.8 Storage Layout on Disk
```
<workspace>/
├── app.py
├── pipeline.py
├── tasks.py
├── config.py
├── settings.json
├── input/                         # raw, unsorted videos & images
├── output/                        # sorted identity folders
│   ├── female_001/
│   │   ├── _reference_face.jpg    # cropped avatar
│   │   ├── _profile_embedding.json# { profile_id, folder_name, embedding }
│   │   └── *.mp4 / *.jpg
│   ├── female_002/
│   └── _unsorted/                 # files that could not be assigned
├── .cache/
│   ├── face_embeddings_cache.db   # SQLite (ProcessedFile, Face, PersistentProfile, WatchHistory, WatchParty)
│   ├── video_thumbnails/          # ffmpeg-thumbnail cache
│   ├── duplicates.json            # last duplicate scan results
│   └── temp_avatar_extract/       # transient
└── .temp_keyframes/<md5(path)>/   # transient, unless keep_keyframes=True
```

### 3.9 Process Architecture
- **Single Flask process** serves:
  - The dashboard (`/`), the watch party viewer (`/watch-party/<id>`), and all `/api/*` routes.
- A **daemon thread** runs `monitor_parent_process` on Windows under the Werkzeug reloader, so the SSH tunnel child process is killed if the parent dies.
- The pipeline runs either:
  - in a **Celery worker** (`tasks.run_sorting_task`) when Redis is available, or
  - in a **local `threading.Thread`** otherwise.
- The `localhost.run` SSH tunnel is launched in a daemon thread at startup, attached to a Windows **Job Object** so it is automatically killed when the parent exits.

---

## 4. Database Models & Schema Specifications

Source: `utils/models.py`. The `db` object is a `flask_sqlalchemy.SQLAlchemy()` instance. Schema is auto-created by `db.create_all()` on startup; the boot sequence also runs `ALTER TABLE` statements to add new columns introduced across releases.

### 4.1 `processed_files` — `class ProcessedFile(db.Model)`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `Integer` (PK) | No | autoincrement | |
| `file_path` | `String` (UNIQUE) | No | — | absolute path; used as the cache key |
| `file_type` | `String` | Yes | `None` | `'video'` or `'image'` |
| `mtime` | `Float` | Yes | `None` | seconds since epoch (file mtime at the time of analysis) |
| `size` | `BigInteger` | Yes | `None` | bytes |
| `processed_time` | `DateTime` | No | `utcnow()` | insertion time |
| `faces` | relationship | — | — | `backref='processed_file'`, `cascade='all, delete-orphan'` → `Face` |

### 4.2 `faces` — `class Face(db.Model)`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `Integer` (PK) | No | autoincrement | |
| `file_id` | `Integer` (FK → `processed_files.id`, `ON DELETE CASCADE`) | No | — | |
| `frame_index` | `Integer` | Yes | `None` | |
| `bbox_json` | `Text` | Yes | `None` | JSON-encoded `[x1, y1, x2, y2]` |
| `gender` | `String` | Yes | `None` | `'female'` or `'male'` |
| `gender_score` | `Float` | Yes | `None` | currently proxies `det_score` |
| `embedding_blob` | `LargeBinary` | Yes | `None` | `np.float32` raw bytes (512-D) |

### 4.3 `persistent_profiles` — `class PersistentProfile(db.Model)`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `Integer` (PK) | No | autoincrement | stable across re-runs, copied into `_profile_embedding.json` |
| `folder_name` | `String` | Yes | `None` | current on-disk folder name (kept in sync with manual renames) |
| `embedding_blob` | `LargeBinary` | Yes | `None` | representative embedding (the medoid) |
| `last_updated` | `DateTime` | No | `utcnow()` | `onupdate=utcnow` |

### 4.4 `watch_history` — `class WatchHistory(db.Model)`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `Integer` (PK) | No | autoincrement | |
| `file_path` | `String` (UNIQUE) | No | — | relative path of the form `folder_name/filename` |
| `playback_position` | `Float` | No | `0.0` | seconds |
| `duration` | `Float` | No | `0.0` | seconds |
| `watched_at` | `DateTime` | No | `utcnow()` (`onupdate=utcnow`) | |
| `is_completed` | `Boolean` | No | `False` | true if `position / duration >= 0.90` |
| `rating` | `Integer` | Yes | `None` | 1–5; added by an `ALTER TABLE` on boot |

### 4.5 `watch_parties` — `class WatchParty(db.Model)`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `String(36)` (PK) | No | — | UUID4 (the room URL slug) |
| `folder_name` | `String(255)` | No | — | currently-shared identity folder |
| `password_hash` | `String(255)` | Yes | `None` | `sha256(password)` hex; null = open room |
| `admin_token` | `String(255)` | Yes | `None` | UUID4; added by `ALTER TABLE` on boot |
| `created_at` | `DateTime` | No | `utcnow()` | |
| `expires_at` | `DateTime` | No | `utcnow() + 24h` at creation | extendable via `/api/watch-party/<id>/extend` |

### 4.6 In-Memory State (not persisted)
- `pipeline_state` (dict) — current run stage / percent / message / detail / report / task_id.
- `watch_parties_state[party_id]` (dict) — runtime registry per room:
  ```json
  {
    "admin_token": "...",
    "clients": { "<client_id>": { "name": "...", "queue": Queue, "last_seen": ts, "is_admin": bool } },
    "playback_state": { "filename": "...", "position": 0.0, "playing": false, "last_updated": ts },
    "playback_locked": false,
    "slow_mode": false,
    "kicked_clients": [ "<client_id>", ... ],
    "cooldowns": { "<client_id>": last_chat_ts }
  }
  ```

---

## 5. API Route Directory (Complete List)

All routes live in `app.py` (Flask blueprint-less). CORS is fully open via `flask_cors.CORS(app)`. Each entry below shows **Method • Path • Auth • Purpose • Request • Response**.

### 5.1 Core Pipeline

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 1 | GET | `/` | Dashboard SPA | – | `text/html` → `templates/index.html` |
| 2 | GET/POST | `/api/config` | Get or update pipeline configuration | JSON body (POST) | JSON: full config |
| 3 | POST | `/api/start` | Launch sorting pipeline (Celery if available, else local thread) | – | `{status, message, task_id?}` |
| 4 | POST | `/api/auto-name` | Run only the auto-naming pass | – | `{status, message}` |
| 5 | GET | `/api/status` | Snapshot of `pipeline_state` + Celery state + new logs | – | `pipeline_state` JSON + `logs` |
| 6 | GET | `/api/stream-progress` | **SSE** stream of pipeline progress and new logs | – | `text/event-stream` |
| 7 | POST | `/api/clear-cache` | Wipe `ProcessedFile` + `Face` tables | – | `{status, message}` |

### 5.2 Library

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 8 | GET | `/api/list-folders` | List every folder in `output_dir` with stats | – | `{folders:[{name, file_count, has_thumbnail, avg_rating, watched_count, total_size_bytes, total_size_human}]}` |
| 9 | POST | `/api/merge-folders` | Merge 2+ folders into one (averages embeddings) | `{folders: [n…], target_name?}` | `{status, target_folder, merged_folders, files_moved, …}` |
| 10 | GET | `/api/list-media/<folder_name>` | List media in a folder with watch progress | – | `{files:[…]}` |
| 11 | POST | `/api/move-media` | Move files between folders; updates cache and avatars | `{from_folder, to_folder, filenames|[filename]}` | `{status, successes[], failures[]}` |
| 12 | POST | `/api/rename-folder` | Rename a folder on disk + update SQLite | `{old_name, new_name}` | `{status, message}` |
| 13 | POST | `/api/open-folder/<folder_name>` | `os.startfile(folder)` (Explorer) | – | `{status}` |
| 14 | POST | `/api/play-file` | `os.startfile(file)` (system player) | `{folder_name, filename}` | `{status}` |

### 5.3 Media Inspection

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 15 | GET | `/media/<path:filename>` | Stream any file from `output_dir` | – | binary |
| 16 | GET | `/api/video-thumbnail/<folder>/<filename>` | Cached ffmpeg-thumbnail at t=1 s (fallback t=0) | – | JPEG |
| 17 | GET | `/api/thumbnail/<cluster_folder>` | Serve `_reference_face.jpg` | – | JPEG |
| 18 | GET | `/api/file-info/<folder>/<filename>` | ffprobe/cv2 metadata + face stats + rating | – | `{status, metadata}` |

### 5.4 Watch History & Ratings

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 19 | POST | `/api/watch-progress` | Persist current playback position | `{file_path, position, duration}` | `{status}` |
| 20 | GET | `/api/watch-progress/<file_path>` | Load saved position | – | `{status, playback_position, duration, is_completed}` |
| 21 | POST | `/api/rate-file` | Set 1–5★ rating | `{file_path, rating}` | `{status}` |
| 22 | GET | `/api/recently-watched` | Last 10 `WatchHistory` rows that still exist on disk | – | `{status, items[]}` |
| 23 | POST | `/api/recently-watched/clear` | Truncate `WatchHistory` | – | `{status}` |

### 5.5 Search & Profiles

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 24 | GET | `/api/search?q=…` | Full-text search across folders + DB | – | `{status, results[]}` (≤100) |
| 25 | POST | `/api/search-by-image` | Multipart upload → InsightFace match against profiles | `multipart: image` | `{status, matches[], results[]}` |
| 26 | GET | `/api/profiles` | List all profile rows (or `admin_token` required via tunnel) | – | `{status, profiles[]}` |
| 27 | GET | `/api/profile/<folder_name>/media` | All media files (own folder + face-distance matches) for a profile | – | `{status, files[]}` |
| 28 | POST | `/api/profile/extract-avatar` | Force re-extract `_reference_face.jpg` | `{folder_name}` | `{status, message}` |
| 29 | POST | `/api/profiles/index` | Start library indexer background thread | – | `{status, message}` |
| 30 | GET | `/api/profiles/index/status` | Indexer progress | – | `{status, state}` |
| 31 | POST | `/api/profiles/merge` | Merge two profile folders (wrapper around `merge_folders_manual`) | `{source_folder, target_folder}` | `{status, …}` |

### 5.6 Duplicates

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 32 | POST | `/api/duplicates/scan` | Start a duplicate scan in a background thread | – | `{status, message}` or 400 if already running |
| 33 | GET | `/api/duplicates/status` | Current scan state | – | `DuplicateDetector.state` |
| 34 | GET | `/api/duplicates` | Cached groups | – | `{status, groups[]}` |
| 35 | POST | `/api/duplicates/resolve` | Physically delete selected duplicates and DB rows | `{files_to_delete:[…]}` | `{status, deleted_count, errors[], groups[]}` |

### 5.7 Watch Party — REST

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 36 | POST | `/api/watch-party/create` | Create a new room (24 h default) | `{folder_name, password?}` | `{status, party_id, admin_token, url, password_protected, public_url?}` |
| 37 | GET | `/watch-party/<id>` | Render standalone viewer | – | `text/html` |
| 38 | POST | `/api/watch-party/<id>/auth` | Verify password | `{password}` | `{status, authenticated}` or 401 |
| 39 | POST | `/api/watch-party/<id>/is-admin` | Check `admin_token` | `{admin_token}` | `{status, is_admin}` |
| 40 | POST | `/api/watch-party/<id>/change-folder` | Switch active folder (admin) | `{admin_token, folder_name}` | `{status, files[]}` |
| 41 | POST | `/api/watch-party/<id>/kick` | Kick a client (admin) | `{admin_token, client_id}` | `{status}` |
| 42 | POST | `/api/watch-party/<id>/force-mute` | Force-mute a client (admin) | `{admin_token, client_id}` | `{status}` |
| 43 | POST | `/api/watch-party/<id>/playback-lock` | Toggle playback lock (admin) | `{admin_token, locked}` | `{status, locked}` |
| 44 | POST | `/api/watch-party/<id>/delete-message` | Delete a chat message (admin) | `{admin_token, message_id}` | `{status}` |
| 45 | POST | `/api/watch-party/<id>/settings` | Update slow mode / clear chat / set password (admin) | `{admin_token, slow_mode?, clear_chat?, password?}` | `{status, slow_mode, password_protected}` |
| 46 | POST | `/api/watch-party/<id>/extend` | Add hours to `expires_at` (admin) | `{admin_token, hours}` | `{status, expires_at}` |
| 47 | POST | `/api/watch-party/<id>/end` | Force-end the party (admin) | `{admin_token}` | `{status}` |
| 48 | POST | `/api/watch-party/<id>/chat` | Post a chat message; enforces slow mode for non-admins | `{client_id, client_name, message}` | `{status, message_id}` or 429 |
| 49 | POST | `/api/watch-party/<id>/sync` | Push play/pause/seek | `{client_id, action, position, filename}` | `{status}` or `{status: 'ignored'}` when locked |

### 5.8 Watch Party — SSE & Signaling

| # | Method | Path | Purpose | Request | Response |
| - | --- | --- | --- | --- | --- |
| 50 | GET | `/api/watch-party/<id>/stream` | **SSE** pub/sub per client. `?client_id=…&client_name=…&admin_token=…` | – | `text/event-stream` of `init`, `peer_joined`, `peer_left`, `sync`, `chat`, `chat_delete`, `chat_clear`, `folder_changed`, `playback_locked`, `settings_changed`, `kicked`, `force_mute`, `party_ended`, `signal`, `ping` |
| 51 | POST | `/api/watch-party/<id>/signal` | Relay WebRTC offer/answer/ICE between two specific clients | `{sender_id, target_id, signal:{type,…}}` | `{status}` or 404 |

### 5.9 Public-Tunnel Guard
- `app.before_request` runs on **every** request. It inspects the `Host` header. If it matches `*.lhr.life` or `localhost.run` it allow-lists the routes above that are explicitly part of the Watch Party surface (5.7 + 5.8 + `/static/*`, `/media/*`, `/api/video-thumbnail/*`, `/api/thumbnail/*`, `/api/profile/<folder>/media` for the active folder, and `/api/profiles` with a valid `admin_token`). Anything else returns a 403 Access Denied.

---

## 6. Frontend Design System & Static Structure

### 6.1 Design Tokens (`:root` in `static/css/style.css`)
| Token | Value | Use |
| --- | --- | --- |
| `--bg-dark` | `#09090e` | body background |
| `--bg-card` | `rgba(18,18,28,0.65)` | glassmorphic card |
| `--border-glass` | `rgba(255,255,255,0.08)` | glass borders |
| `--border-active` | `rgba(236,72,153,0.4)` | hover/active outline |
| `--color-primary` | `#ec4899` | pink accent (CTA, links) |
| `--color-secondary` | `#8b5cf6` | violet (gradient pair) |
| `--color-accent` | `#f59e0b` | amber (admin / rating) |
| `--color-info` | `#3b82f6` | blue (informational) |
| `--color-success` | `#10b981` | emerald (success / speaking) |
| `--color-danger` | `#ef4444` | red (kick / error) |
| `--text-main` | `#f3f4f6` | primary text |
| `--text-muted` | `#9ca3af` | secondary text |
| `--text-dark` | `#6b7280` | tertiary (timestamps) |
| `--sidebar-width` | `280px` | fixed sidebar |
| `--font-outfit` / `--font-inter` | Google Fonts | display + UI |

### 6.2 Layout Primitives
- **Ambient background:** 3 radial-gradient blurred `div`s (`.background-glows > .glow-1/2/3`) on a fixed `z-index:-1` layer with `mix-blend-mode:screen`. This is the "premium dark mode" feel.
- **Sidebar:** fixed at 280 px, semi-transparent, `backdrop-filter: blur(20px)`, contains logo, nav, system status card (status dot, GPU badge, "DirectML Accelerated" pill).
- **Top bar:** page heading, subheading, and a read-only global search trigger (`Ctrl+K` / `/`).
- **Cards:** `.dashboard-card.glass` = translucent background + 1 px glass border + border-radius ≈ 14–16 px.
- **Grid / List library view:** `repeat(auto-fill, minmax(220px, 1fr))` with skeleton loaders while fetching.
- **Filter pills / Sort dropdown / View toggle buttons** are always rendered in the `.library-toolbar`.

### 6.3 Component Patterns
- **Sliders:** native `<input type="range">` paired with a live-updating span (`#val-<id>`) for numeric display.
- **Switches:** pure CSS toggle (`.switch` + `.slider.round`).
- **Modal overlays:** `.modal-overlay` (full-screen backdrop + blur) with `.modal-box` (max-width 400–600 px) inside.
- **Lightbox player:** Plyr with theme override CSS variables (`--plyr-color-main = var(--color-primary)`, `--plyr-control-radius: 12px`); a right-hand metadata panel with two tabs (Info, Queue).
- **Toast alerts:** animated slide-in from the left bottom, color-coded left border (primary / success / warning / error); used by the Watch Party for ephemeral notifications.
- **Watch Party layout:** 16:9 video wrapper (no max-width breakpoints) + a fixed 60 px header + a right sidebar (`flex: 0.7`, max 380 px, min 280 px) with mic / chat / participants sections.
- **Admin Panel:** yellow "Crown" header, gold/yellow accent; groups controls in card-like inset sections (Playback Lock, Chat Moderation, Room Access Code, Room Expiry).

### 6.4 JS Controller Architecture
Two **independent** vanilla-JS controllers are loaded conditionally.

#### 6.4.1 `static/js/app.js` — Core Application Controller (~3,500 LOC)
Loaded only on `/` (the dashboard). Owns:
- Section navigation (`#sec-results`, `#sec-profiles`, `#sec-dashboard`, `#sec-duplicates`, `#sec-configuration`, `#sec-gallery`).
- Library grid rendering, filter pills, sort, view toggle (persisted in `localStorage`).
- Profile grid (drag-and-drop merge) and library indexer panel.
- Pipeline start / clear cache / manual auto-name controls.
- Global search modal: `Ctrl+K` / `/` shortcut, debounced text search, drag-and-drop image search.
- Lightbox player (Plyr): file-info, queue, rating, previous / next navigation, shuffle, loop modes.
- Hover video preview (a 350 ms hover debounce injects an autoplay muted video into the card).
- Toast notifications.
- SSE listener on `/api/stream-progress` to drive the progress bar, stage label, system status dot, and on-screen log console.
- Watch Party creation modal (sets `client_name`, optional password, calls `/api/watch-party/create`, copies the shareable URL, joins by redirecting to `/watch-party/<id>`).

#### 6.4.2 `static/js/watch_party.js` — Watch Party Controller (~1,340 LOC)
Loaded only on `/watch-party/<id>`. Owns:
- Persistent `client_id` (sessionStorage) and `client_name`.
- Two-step auth flow (password prompt → nickname prompt) before establishing the SSE.
- Microphone permission + per-track mute toggle.
- **SSE** subscriber at `/api/watch-party/<id>/stream?client_id=…&client_name=…&admin_token=…` that handles all `data.type` payloads (`init`, `peer_joined`, `peer_left`, `sync`, `chat`, `kicked`, `force_mute`, `playback_locked`, `chat_delete`, `chat_clear`, `party_ended`, `folder_changed`, `settings_changed`, `signal`).
- **Plyr player** mirroring remote playback actions (with a 2-second tolerance before snapping `currentTime`).
- **WebRTC mesh** — `RTCPeerConnection` per remote peer, offer/answer + ICE candidate relay via `/api/watch-party/<id>/signal`, hidden `<audio>` elements, AnalyserNode-based speaking indicator, polite-ICE (candidates queued before remote description).
- **Playlist UI** — 16:9 grid, click to select + broadcast pause at 0.0.
- **Chat** — input + send, optimistic render, slow-mode countdown, admin delete button per message.
- **Participants list** — crown badge for admin, mute / kick buttons rendered for admin only, voice indicator dot (green speaking / red muted / gray offline).
- **Folder switcher modal** — fetches `/api/profiles?admin_token=…`, lets admin pick a new folder, calls `/api/watch-party/<id>/change-folder`.
- **Admin Panel modal** — playback-lock toggle, slow-mode toggle, clear chat, set/remove password, +6/+12/+24 h expiry, end party.
- **Toasts** + system chat messages + a tabbed log feed (collapsed) for the activity history.

### 6.5 The Watch Party page is intentionally a self-contained SPA: no shared state with the dashboard other than `window.PARTY_ID` and `window.FOLDER_NAME` injected via Jinja2.

---

## 7. Workflow Sequences

### 7.1 Pipeline: From Input Video to Profile Database Insertion

1. **User opens `/`** → browser loads dashboard.
2. **User configures** input / output directories, thresholds, model pack on the Settings tab → `POST /api/config` → server writes `settings.json` and updates `current_config` (in-memory `Config` dataclass).
3. **User clicks "Start Sorting Process"** → `POST /api/start`.
   - If Redis is reachable, a Celery task `tasks.run_sorting_task.delay(config_dict, WORKSPACE_DIR)` is dispatched; the task `id` is stored in `pipeline_state.task_id`.
   - Otherwise, a local daemon `threading.Thread` invokes `run_pipeline_thread(current_config)`.
4. **Pipeline (`SortingPipeline.run`)**:
   1. **Scanning** — `FileScanner.scan()` recursively collects `videos` and `images`. Progress: 5–10%.
   2. **Model init** — `FaceAnalyzer.initialize()` with `DmlExecutionProvider, CPUExecutionProvider`; falls back to CPU on failure. Progress: 15%.
   3. **Image analysis** — for each image, `analyzer.analyze_image()`; the result is cached to `ProcessedFile` + `Face` via `EmbeddingCache.cache_faces` (only if `use_cache=True`). Progress: 15–75%.
   4. **Video analysis** — a `ThreadPoolExecutor(max_workers=4)` runs `process_video` in parallel; inside the worker a `gpu_lock` serializes InsightFace inference (with a 15 ms `time.sleep` to prevent TDR). Per video: `extractor.extract_keyframes` → loop over keyframes → `analyzer.analyze_image` → `cache_faces` → `clean_video_temp`. Progress: 15–75%.
   5. **Clustering** — only `gender == 'female'` embeddings are clustered; HDBSCAN → DBSCAN → Agglomerative fallback (`FaceClusterer.cluster_embeddings`); `find_cluster_medoids` picks the representative face. Progress: 80%.
   6. **Identity resolution** — `_load_and_sync_profiles()` reconciles the DB `PersistentProfile` rows with on-disk `_profile_embedding.json` files, importing orphans and propagating manual renames; clusters are matched to profiles (or assigned new `female_NNN` names). Progress: 80%.
   7. **Assignment** — `ScreenTimeCalculator.calculate_assignments` decides which single identity owns each file (optionally preferring globally popular identities). Progress: 85%.
   8. **Medoid re-extraction** — for any medoid whose `keyframe_path` was lost (e.g. cached run), `cv2.VideoCapture.set(CAP_PROP_POS_FRAMES, n)` + `cv2.imwrite` re-creates it under `.temp_keyframes/medoids/`.
   9. **Sorting** — `VideoSorter.sort_files` `move`s (or `copy`s) every file into the cluster folder, writes `_profile_embedding.json` and crops `_reference_face.jpg`, and persists the new profile via `EmbeddingCache.add_persistent_profile` (gets a fresh `profile_id`). Progress: 90%.
   10. **Auto-naming** (if enabled) — `NameResolver.resolve_all_folders` parses filenames, then Yandex/Google Lens on `_reference_face.jpg`, and either renames (with conflict resolution) or merges. Progress: 92–99%.
   11. **Cleanup** — `extractor.clean_temp_dir()` removes all transient keyframes. Progress: 100%, `stage='completed'`.
5. **Live streaming** — throughout, the progress callback updates `pipeline_state`; the SSE endpoint `/api/stream-progress` pushes a JSON snapshot every 300 ms (or every 1 s when idle) including new log lines.
6. **Result on disk** — the user's `output_dir` now contains per-identity folders with reference thumbnails, profile JSON, and the original media files. The SQLite cache contains one `PersistentProfile` per identity plus the per-file `Face` rows.

### 7.2 Watch Party: Real-Time Sync & Connection Negotiation

1. **Host opens a gallery page** (per identity), clicks "Watch Party" → `static/js/app.js` opens the create modal.
2. **Host enters nickname + optional password** → `POST /api/watch-party/create { folder_name, password }` → server:
   - Generates `party_id` and `admin_token` (both UUID4).
   - SHA-256s the password (or stores `None`).
   - Creates a `WatchParty` row with `expires_at = now + 24h`.
   - Initializes in-memory `watch_parties_state[party_id]` (clients, playback_state, locks).
   - Returns `{ party_id, admin_token, url, password_protected, public_url? }`.
3. **Host clicks "Join Party"** → browser navigates to `/watch-party/<id>`. The Jinja2 template injects `window.PARTY_ID` and `window.FOLDER_NAME`.
4. **Watch party controller boots**:
   1. `initAuthFlow()` → `POST /api/watch-party/<id>/auth`; if 200 → nickname prompt; if 401 → password prompt first.
   2. After nickname submit: `navigator.mediaDevices.getUserMedia({ audio: true })`; track is initially `enabled = false`.
   3. `startWatchParty()`:
      - `checkAdminStatus()` — if `localStorage.wp_admin_token_<id>` exists, `POST /api/watch-party/<id>/is-admin` to validate.
      - `GET /api/profile/<folder>/media` → renders the playlist.
      - Opens `new EventSource('/api/watch-party/<id>/stream?client_id=…&client_name=…&admin_token=…')`.
      - The server registers the client, pushes an `init` event (current playback state, `is_admin`, list of existing peers), and notifies the other clients via a `peer_joined` event.
   4. **WebRTC mesh bootstrap** — when a `peer_joined` event arrives, the new client calls `createPeerConnection(peer_id, isInitiator=true)`; existing peers wait for the offer. The new client sends `{ type: 'offer' }` over `POST /api/watch-party/<id>/signal`. The receiving peer `setRemoteDescription` → drains its ICE candidate queue → `createAnswer` → `setLocalDescription` → sends `{ type: 'answer' }` back. ICE candidates from both sides are relayed as `{ type: 'candidate' }`.
5. **Playback sync**:
   - When the user clicks "play" / "pause" / seeks, the controller calls `broadcastSync(action, position)` → `POST /api/watch-party/<id>/sync`.
   - The server updates `playback_state` and forwards the message to every other client's per-client `queue.Queue`. Their SSE generator flushes the JSON to the browser, where `handleSSEMessage('sync')` calls `loadMediaFile(filename)` if needed and then mirrors the play/pause + `currentTime` (with 2 s tolerance) in Plyr. The 500 ms `ignorePlayerEvents` guard prevents echoing the action back to the server.
   - When playback is locked, the server returns `{status:'ignored'}` for non-admin clients and a warning toast is shown.
6. **Chat** — `POST /api/watch-party/<id>/chat { client_id, client_name, message }`; the server checks `kicked_clients`, applies the 10 s slow-mode cooldown for non-admins, and fans out a `chat` event to every other client.
7. **Folder change** (admin) — admin picks a new folder in the folder-switcher modal → `POST /api/watch-party/<id>/change-folder`; the server updates the DB row, looks up the new media list, resets the playback state, and broadcasts a `folder_changed` event to all clients who then re-render the playlist and load the first file paused at 0.0.
8. **Cleanup** — when a client disconnects, the SSE generator catches `GeneratorExit`, removes the client from `watch_parties_state[party_id]['clients']`, and broadcasts a `peer_left` event. Closed `RTCPeerConnection`s are torn down client-side.

### 7.3 Host Moderation: Kick, Mute, Lockouts

1. **Kick** (host only) — host clicks the red `user-slash` button next to a peer → `window.adminKickPeer(peer_id, peer_name)` confirms → `POST /api/watch-party/<id>/kick { admin_token, client_id }`.
   - Server verifies `admin_token` matches the room's stored token; appends the `client_id` to `kicked_clients`; pushes `{type: 'kicked'}` directly onto that client's queue.
   - Client receives `kicked`, closes the `EventSource` and all `RTCPeerConnection`s, and shows the "Kicked" modal with a "Return to Dashboard" button. Subsequent reconnection attempts via `/api/watch-party/<id>/stream` are refused with a 403 "You have been kicked from this party".
2. **Force mute** — host clicks the mic-slash button → `POST /api/watch-party/<id>/force-mute { admin_token, client_id }`; server pushes `{type: 'force_mute'}` to the target.
   - Client receives `force_mute`, sets its `localStream.getAudioTracks()[0].enabled = false`, updates the mic UI to red-slash, updates the status text to "Muted", and shows a yellow toast: "You have been muted by the host."
3. **Playback lock** — host toggles the "Only admin can control player" switch in the Admin Panel → `POST /api/watch-party/<id>/playback-lock { admin_token, locked }`; server flips `playback_locked` and broadcasts `playback_locked` to all clients.
   - Non-admin clients show the yellow "Playback Locked by Host" overlay; any local play/pause/seek attempt is reverted (`ignorePlayerEvents` flag) and replaced with a warning toast. Sync broadcasts from non-admins are also rejected with `{status:'ignored'}`.
4. **Slow mode** — host toggles "Enforce Slow Mode (10 s limit)" → `POST /api/watch-party/<id>/settings { admin_token, slow_mode }`. Non-admins now see a 10 s `setInterval` countdown on their chat input; the server also enforces the cooldown and returns HTTP 429 with a remaining-seconds message if violated.
5. **Delete a single chat message** — hover an incoming message → click the `x` button (admin only) → `POST /api/watch-party/<id>/delete-message { admin_token, message_id }`; the server broadcasts `chat_delete` to all clients who `removeChild` the matching `<div id="chat-msg-<id>">`.
6. **Clear all chat** — Admin Panel → "Clear Chat History" button → `POST /api/watch-party/<id>/settings { admin_token, clear_chat: true }` → server broadcasts `chat_clear`; clients wipe the chat container and inject a system message "Chat history was cleared by the host."
7. **Set / remove room password** — Admin Panel → enter new password → `POST /api/watch-party/<id>/settings { admin_token, password: '<value>' }`; server SHA-256s and writes `password_hash`. `password: ''` removes protection. Existing clients are unaffected; new joiners must `auth` first.
8. **Extend / end party** — Admin Panel → `+6 / +12 / +24 h` buttons → `POST /api/watch-party/<id>/extend { admin_token, hours }`; the server updates `WatchParty.expires_at` and broadcasts a `settings_changed` toast. "End Party & Disconnect All" → `POST /api/watch-party/<id>/end { admin_token }`; the server sets `expires_at` to the past and broadcasts `party_ended`; clients close the SSE + all peer connections and show the "Session Ended" modal.
