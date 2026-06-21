# AuraSort — Premium AI Face Sorter & Media Organizer

AuraSort is a high-performance, AI-driven media sorting application designed to scan video and image libraries, extract and recognize human faces, group them by unique identity, and automatically rename sorted folders. 

The application features a premium dark-mode web dashboard with real-time progress logging, DirectML GPU hardware acceleration, a custom YouTube-like Plyr video player, and a dynamic sorted library gallery.

---

## 🌟 Key Features

* **AI Face Detection & Recognition**: Integrates **InsightFace** models (`buffalo_l`, `buffalo_s`, or `antelopev2`) to detect and generate deep face embeddings.
* **Intelligent Gender Filtering**: Filters and clusters target profiles (e.g. female classification) based on configurable gender confidence thresholds.
* **Advanced Keyframe Extraction**: Utilizes **FFmpeg** to extract high-quality video frames (either I-frames or custom time intervals) to scan long videos efficiently.
* **DBSCAN Cosine Similarity Clustering**: Groups face embeddings into distinct identities. It automatically manages directory syncing between the SQLite caching database and your disk organization.
* **Reverse Image Search & Auto-Naming**: Automatically rename identity folders. Uses filename heuristics, Google Lens API, and Yandex reverse search to identify famous faces.
* **Universal Player Preference**: Configure whether playable native formats (`.mp4`, `.webm`) launch in our custom in-app browser player or open in your local desktop video player (VLC, MPC-HC, etc.). Non-native web formats (like `.mkv`, `.avi`) automatically launch in the OS default player.
* **Bespoke Lightbox Player (Plyr)**: Features a beautiful, customized video player accented with AuraSort's theme colors, support for double-tap seek, settings menus, and playback speed controls.
* **SSE Logging & Progress Monitoring**: Real-time pipeline status, charts, and terminal stdout logs streamed live to the dashboard.

---

## 🛠️ Technology Stack

* **Backend**: Flask (Python 3.x), SQLite (for embedding caching and profile registry).
* **AI Engine**: OpenCV, NumPy, ONNX Runtime (DirectML Accelerated), Scikit-Learn.
* **Frontend**: HTML5, Vanilla JavaScript, Vanilla CSS, FontAwesome 6, Google Fonts (Outfit & Inter).
* **Media Player**: Plyr.js (customized).
* **Media Processing**: FFmpeg.

---

## 🚀 Getting Started

### 📋 Prerequisites

1. **Python 3.10+**: Ensure Python is installed on your system.
2. **FFmpeg**: Must be installed and configured on your system's `PATH`.
   - Verify installation by running:
     ```bash
     ffmpeg -version
     ```

### 📥 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Kitchenwasher/AI-Video-Sorter.git
   cd AI-Video-Sorter
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
   *(Note: The `onnxruntime-directml` dependency enables native DirectML hardware acceleration on Windows, utilizing AMD, Intel, and NVIDIA GPUs).*

### 💻 Running the Application

1. **Launch the Flask server**:
   ```bash
   python app.py
   ```
2. **Access the Dashboard**:
   Open your browser and navigate to:
   [http://127.0.0.1:5000/](http://127.0.0.1:5000/)

---

## ⚙️ Configuration Settings

Customize pipeline behaviors directly from the **Settings** tab in the web interface. Important options include:

| Setting | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| **Input Directory** | Path | The directory containing your unsorted raw videos and images. | `./input` |
| **Output Directory** | Path | The destination folder where sorted identity folders will be created. | `./output` |
| **Default Video Player** | Selection | `"browser"` (Plyr lightbox) or `"vlc"` (launches system player). | `"browser"` |
| **Face Det Threshold** | Float | Confidence threshold for face detection bounding boxes. | `0.50` |
| **Gender Threshold** | Float | Minimum threshold to classify and cluster target profile genders. | `0.65` |
| **Cluster Epsilon** | Float | DBSCAN clustering threshold (lower is stricter, higher merges more). | `0.85` |
| **Auto-Name Folders** | Boolean | Automatically rename output folders using reverse image search. | `False` |

---

## 📂 Repository Structure

```
├── app.py                  # Flask Web App Server and API Endpoints
├── config.py               # Config Class & Default Configurations
├── pipeline.py             # Main AI Face-Sorting Execution Pipeline
├── requirements.txt        # Python Packages and Libraries
├── modules/                # Core AI Pipeline Components
│   ├── scanner.py          # Scans files and filters unsupported extensions
│   ├── keyframe_extractor.py# FFmpeg frame extraction routines
│   ├── face_analyzer.py    # InsightFace embedding generator & gender filter
│   ├── clustering.py      # DBSCAN clustering and profile DB syncer
│   └── name_resolver.py    # Google Lens / Yandex reverse naming resolver
├── static/                 # Web Assets
│   ├── css/style.css       # Custom Glassmorphic Dark UI Theme Styles
│   └── js/app.js           # AJAX Request Handlers, SSE & Modal Bindings
└── templates/              # HTML Templates
    └── index.html          # Main Dashboard & Gallery Layout
```

---

## 🛡️ License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
