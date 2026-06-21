import os
import threading
import json
import time
from flask import Flask, render_template, jsonify, request, Response, send_from_directory
from flask_cors import CORS
from config import Config
from pipeline import SortingPipeline
from modules.name_resolver import merge_folders_manual
from utils.logger import logger, ui_log_handler

app = Flask(__name__)
CORS(app)
WORKSPACE_DIR = os.path.abspath(os.path.dirname(__file__))

# Configure SQLAlchemy (Postgres in production, SQLite fallback for local development)
database_url = os.environ.get('DATABASE_URL')
if not database_url:
    db_path = os.path.join(WORKSPACE_DIR, ".cache", "face_embeddings_cache.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    abs_db_path = os.path.abspath(db_path).replace("\\", "/")
    database_url = f"sqlite:///{abs_db_path}"
    logger.info(f"DATABASE_URL not set. Falling back to local SQLite cache: {database_url}")

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

from utils.models import db
db.init_app(app)

with app.app_context():
    try:
        db.create_all()
        logger.info("PostgreSQL database tables verified/created successfully.")
        
        # Check if rating column exists in watch_history, if not add it
        engine = db.engine
        from sqlalchemy import inspect
        inspector = inspect(engine)
        columns = [c['name'] for c in inspector.get_columns('watch_history')]
        if 'rating' not in columns:
            with engine.connect() as conn:
                conn.execute(db.text("ALTER TABLE watch_history ADD COLUMN rating INTEGER"))
                conn.commit()
            logger.info("Added 'rating' column to 'watch_history' table.")
    except Exception as e:
        logger.error(f"Failed to initialize database tables: {e}")

# Global state
pipeline_state = {
    'running': False,
    'stage': 'idle',
    'percent': 0.0,
    'message': 'Ready to start.',
    'detail': None,
    'report': None
}

state_lock = threading.Lock()
pipeline_thread = None

# Default directories
DEFAULT_INPUT = os.path.join(WORKSPACE_DIR, "input")
DEFAULT_OUTPUT = os.path.join(WORKSPACE_DIR, "output")

# Setup default directories
os.makedirs(DEFAULT_INPUT, exist_ok=True)
os.makedirs(DEFAULT_OUTPUT, exist_ok=True)

SETTINGS_FILE = os.path.join(WORKSPACE_DIR, "settings.json")

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                data = json.load(f)
                return Config(
                    input_dir=data.get('input_dir', DEFAULT_INPUT),
                    output_dir=data.get('output_dir', DEFAULT_OUTPUT),
                    mode=data.get('mode', 'move'),
                    keyframe_interval=data.get('keyframe_interval', 0),
                    max_keyframes=data.get('max_keyframes', 100),
                    model_pack=data.get('model_pack', 'buffalo_l'),
                    face_det_threshold=data.get('face_det_threshold', 0.5),
                    gender_threshold=data.get('gender_threshold', 0.65),
                    min_face_size=data.get('min_face_size', 60),
                    min_eye_dist_ratio=data.get('min_eye_dist_ratio', 0.20),
                    min_cluster_size=data.get('min_cluster_size', 2),
                    cluster_epsilon=data.get('cluster_epsilon', 0.85),
                    use_cache=data.get('use_cache', True),
                    keep_keyframes=data.get('keep_keyframes', False),
                    prefer_popular_identities=data.get('prefer_popular_identities', False),
                    extraction_percent=data.get('extraction_percent', 100),
                    auto_name_folders=data.get('auto_name_folders', False),
                    only_name_unnamed=data.get('only_name_unnamed', True),
                    name_confidence_threshold=data.get('name_confidence_threshold', 0.5),
                    name_search_delay=data.get('name_search_delay', 4.0),
                    merge_on_name_conflict=data.get('merge_on_name_conflict', False),
                    default_video_player=data.get('default_video_player', 'browser')
                )
        except Exception as e:
            logger.error(f"Failed to load settings.json: {e}")
    return Config(input_dir=DEFAULT_INPUT, output_dir=DEFAULT_OUTPUT)

def save_settings(config_obj):
    try:
        data = {
            'input_dir': config_obj.input_dir,
            'output_dir': config_obj.output_dir,
            'mode': config_obj.mode,
            'keyframe_interval': config_obj.keyframe_interval,
            'max_keyframes': config_obj.max_keyframes,
            'model_pack': config_obj.model_pack,
            'face_det_threshold': config_obj.face_det_threshold,
            'gender_threshold': config_obj.gender_threshold,
            'min_face_size': config_obj.min_face_size,
            'min_eye_dist_ratio': config_obj.min_eye_dist_ratio,
            'min_cluster_size': config_obj.min_cluster_size,
            'cluster_epsilon': config_obj.cluster_epsilon,
            'use_cache': config_obj.use_cache,
            'keep_keyframes': config_obj.keep_keyframes,
            'prefer_popular_identities': config_obj.prefer_popular_identities,
            'extraction_percent': config_obj.extraction_percent,
            'auto_name_folders': config_obj.auto_name_folders,
            'only_name_unnamed': config_obj.only_name_unnamed,
            'name_confidence_threshold': config_obj.name_confidence_threshold,
            'name_search_delay': config_obj.name_search_delay,
            'merge_on_name_conflict': config_obj.merge_on_name_conflict,
            'default_video_player': config_obj.default_video_player
        }
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        logger.info("Settings saved to settings.json.")
    except Exception as e:
        logger.error(f"Failed to save settings.json: {e}")

# Load config
current_config = load_settings()

def run_pipeline_thread(config_obj):
    global pipeline_state
    
    def progress_callback(stage, percent, message, detail=None):
        with state_lock:
            pipeline_state['stage'] = stage
            pipeline_state['percent'] = percent
            pipeline_state['message'] = message
            pipeline_state['detail'] = detail

    with app.app_context():
        try:
            pipeline = SortingPipeline(config_obj, WORKSPACE_DIR, progress_callback)
            report = pipeline.run()
            
            with state_lock:
                pipeline_state['report'] = report
                if pipeline_state['stage'] != 'error':
                    pipeline_state['stage'] = 'completed'
                    pipeline_state['percent'] = 100.0
                    pipeline_state['message'] = 'Sorting completed successfully!'
        except Exception as e:
            logger.error(f"Error running pipeline: {e}")
            with state_lock:
                pipeline_state['stage'] = 'error'
                pipeline_state['percent'] = 100.0
                pipeline_state['message'] = f"Fatal pipeline error: {str(e)}"
        finally:
            with state_lock:
                pipeline_state['running'] = False

def run_auto_naming_thread(config_obj):
    global pipeline_state
    
    def progress_callback(stage, percent, message, detail=None):
        with state_lock:
            pipeline_state['stage'] = stage
            pipeline_state['percent'] = percent
            pipeline_state['message'] = message
            pipeline_state['detail'] = detail

    with app.app_context():
        try:
            pipeline = SortingPipeline(config_obj, WORKSPACE_DIR, progress_callback)
            results = pipeline.run_auto_naming()
            
            with state_lock:
                pipeline_state['report'] = {'auto_naming': results}
                if pipeline_state['stage'] != 'error':
                    pipeline_state['stage'] = 'completed'
                    pipeline_state['percent'] = 100.0
                    pipeline_state['message'] = 'Auto-naming completed successfully!'
        except Exception as e:
            logger.error(f"Error running auto-naming: {e}")
            with state_lock:
                pipeline_state['stage'] = 'error'
                pipeline_state['percent'] = 100.0
                pipeline_state['message'] = f"Fatal auto-naming error: {str(e)}"
        finally:
            with state_lock:
                pipeline_state['running'] = False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/config', methods=['GET', 'POST'])
def handle_config():
    global current_config
    if request.method == 'POST':
        data = request.json
        current_config.input_dir = os.path.abspath(data.get('input_dir', current_config.input_dir))
        current_config.output_dir = os.path.abspath(data.get('output_dir', current_config.output_dir))
        current_config.mode = data.get('mode', current_config.mode)
        current_config.keyframe_interval = int(data.get('keyframe_interval', current_config.keyframe_interval))
        current_config.max_keyframes = int(data.get('max_keyframes', current_config.max_keyframes))
        current_config.model_pack = data.get('model_pack', current_config.model_pack)
        current_config.face_det_threshold = float(data.get('face_det_threshold', current_config.face_det_threshold))
        current_config.gender_threshold = float(data.get('gender_threshold', current_config.gender_threshold))
        current_config.min_face_size = int(data.get('min_face_size', current_config.min_face_size))
        current_config.min_eye_dist_ratio = float(data.get('min_eye_dist_ratio', current_config.min_eye_dist_ratio))
        current_config.min_cluster_size = int(data.get('min_cluster_size', current_config.min_cluster_size))
        current_config.cluster_epsilon = float(data.get('cluster_epsilon', current_config.cluster_epsilon))
        current_config.use_cache = bool(data.get('use_cache', current_config.use_cache))
        current_config.keep_keyframes = bool(data.get('keep_keyframes', current_config.keep_keyframes))
        current_config.prefer_popular_identities = bool(data.get('prefer_popular_identities', current_config.prefer_popular_identities))
        current_config.extraction_percent = int(data.get('extraction_percent', current_config.extraction_percent))
        current_config.auto_name_folders = bool(data.get('auto_name_folders', current_config.auto_name_folders))
        current_config.only_name_unnamed = bool(data.get('only_name_unnamed', current_config.only_name_unnamed))
        current_config.name_confidence_threshold = float(data.get('name_confidence_threshold', current_config.name_confidence_threshold))
        current_config.name_search_delay = float(data.get('name_search_delay', current_config.name_search_delay))
        current_config.merge_on_name_conflict = bool(data.get('merge_on_name_conflict', current_config.merge_on_name_conflict))
        current_config.default_video_player = data.get('default_video_player', current_config.default_video_player)
        
        logger.info("Configuration updated.")
        save_settings(current_config)
        return jsonify({'status': 'success', 'message': 'Configuration updated successfully.'})
    else:
        return jsonify({
            'input_dir': current_config.input_dir,
            'output_dir': current_config.output_dir,
            'mode': current_config.mode,
            'keyframe_interval': current_config.keyframe_interval,
            'max_keyframes': current_config.max_keyframes,
            'model_pack': current_config.model_pack,
            'face_det_threshold': current_config.face_det_threshold,
            'gender_threshold': current_config.gender_threshold,
            'min_face_size': current_config.min_face_size,
            'min_eye_dist_ratio': current_config.min_eye_dist_ratio,
            'min_cluster_size': current_config.min_cluster_size,
            'cluster_epsilon': current_config.cluster_epsilon,
            'use_cache': current_config.use_cache,
            'keep_keyframes': current_config.keep_keyframes,
            'prefer_popular_identities': current_config.prefer_popular_identities,
            'extraction_percent': current_config.extraction_percent,
            'auto_name_folders': current_config.auto_name_folders,
            'only_name_unnamed': current_config.only_name_unnamed,
            'name_confidence_threshold': current_config.name_confidence_threshold,
            'name_search_delay': current_config.name_search_delay,
            'merge_on_name_conflict': current_config.merge_on_name_conflict,
            'default_video_player': current_config.default_video_player
        })

@app.route('/api/start', methods=['POST'])
def start_pipeline():
    global pipeline_state
    
    with state_lock:
        if pipeline_state['running']:
            return jsonify({'status': 'error', 'message': 'Pipeline is already running.'}), 400
            
        config_dict = {
            'input_dir': current_config.input_dir,
            'output_dir': current_config.output_dir,
            'mode': current_config.mode,
            'keyframe_interval': current_config.keyframe_interval,
            'max_keyframes': current_config.max_keyframes,
            'model_pack': current_config.model_pack,
            'face_det_threshold': current_config.face_det_threshold,
            'gender_threshold': current_config.gender_threshold,
            'min_face_size': current_config.min_face_size,
            'min_eye_dist_ratio': current_config.min_eye_dist_ratio,
            'min_cluster_size': current_config.min_cluster_size,
            'cluster_epsilon': current_config.cluster_epsilon,
            'use_cache': current_config.use_cache,
            'keep_keyframes': current_config.keep_keyframes,
            'prefer_popular_identities': current_config.prefer_popular_identities,
            'extraction_percent': current_config.extraction_percent,
            'auto_name_folders': current_config.auto_name_folders,
            'only_name_unnamed': current_config.only_name_unnamed,
            'name_confidence_threshold': current_config.name_confidence_threshold,
            'name_search_delay': current_config.name_search_delay,
            'merge_on_name_conflict': current_config.merge_on_name_conflict,
            'default_video_player': current_config.default_video_player
        }
        
        # Trigger Celery task asynchronously
        from tasks import run_sorting_task
        task = run_sorting_task.delay(config_dict, WORKSPACE_DIR)
        
        # Reset state with task ID
        pipeline_state['running'] = True
        pipeline_state['stage'] = 'starting'
        pipeline_state['percent'] = 0.0
        pipeline_state['message'] = 'Sorting pipeline task triggered...'
        pipeline_state['task_id'] = task.id
        pipeline_state['detail'] = None
        pipeline_state['report'] = None
        
        # Clear log history so UI starts fresh
        ui_log_handler.logs.clear()
        
    return jsonify({
        'status': 'accepted',
        'message': 'Pipeline started asynchronously.',
        'task_id': task.id
    }), 202

@app.route('/api/auto-name', methods=['POST'])
def start_auto_name():
    global pipeline_thread, pipeline_state
    
    with state_lock:
        if pipeline_state['running']:
            return jsonify({'status': 'error', 'message': 'Pipeline is already running.'}), 400
            
        # Reset state
        pipeline_state['running'] = True
        pipeline_state['stage'] = 'starting'
        pipeline_state['percent'] = 0.0
        pipeline_state['message'] = 'Starting folder auto-naming...'
        pipeline_state['detail'] = None
        pipeline_state['report'] = None
        
        # Clear log history so UI starts fresh
        ui_log_handler.logs.clear()
        
        # Start thread
        pipeline_thread = threading.Thread(
            target=run_auto_naming_thread,
            args=(current_config,),
            daemon=True
        )
        pipeline_thread.start()
        
    return jsonify({'status': 'success', 'message': 'Auto-naming process started.'})

@app.route('/api/status')
def get_status():
    with state_lock:
        status_copy = pipeline_state.copy()
    
    task_id = status_copy.get('task_id')
    if task_id:
        try:
            from celery.result import AsyncResult
            res = AsyncResult(task_id)
            if res.state == 'PENDING':
                status_copy['stage'] = 'starting'
                status_copy['percent'] = 0.0
                status_copy['message'] = 'Task is pending...'
            elif res.state == 'PROGRESS':
                info = res.info or {}
                status_copy['stage'] = info.get('stage', 'running')
                status_copy['percent'] = info.get('percent', 50.0)
                status_copy['message'] = info.get('message', 'Processing...')
                status_copy['detail'] = info.get('detail')
            elif res.state == 'SUCCESS':
                status_copy['running'] = False
                status_copy['stage'] = 'completed'
                status_copy['percent'] = 100.0
                status_copy['message'] = 'Sorting completed successfully!'
                status_copy['report'] = res.result
            elif res.state == 'FAILURE':
                status_copy['running'] = False
                status_copy['stage'] = 'error'
                status_copy['percent'] = 100.0
                status_copy['message'] = f"Fatal pipeline error: {str(res.result)}"
                
            # Keep global state synced
            with state_lock:
                pipeline_state['running'] = status_copy['running']
                pipeline_state['stage'] = status_copy['stage']
                pipeline_state['percent'] = status_copy['percent']
                pipeline_state['message'] = status_copy['message']
                pipeline_state['detail'] = status_copy.get('detail')
                pipeline_state['report'] = status_copy.get('report')
        except Exception as e:
            logger.error(f"Error querying Celery task state: {e}")
            
    # Grab latest logs from buffer
    logs = list(ui_log_handler.logs)
    status_copy['logs'] = logs
    return jsonify(status_copy)

@app.route('/api/clear-cache', methods=['POST'])
def clear_cache():
    try:
        from utils.cache import EmbeddingCache
        cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
        cache = EmbeddingCache(cache_dir)
        cache.clear()
        return jsonify({'status': 'success', 'message': 'Embedding cache cleared successfully.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f"Failed to clear cache: {str(e)}"}), 500

@app.route('/api/list-folders', methods=['GET'])
def list_folders():
    """Lists all sorted folders in the output directory with their file counts."""
    output_dir = current_config.output_dir
    if not os.path.exists(output_dir):
        return jsonify({'folders': []})
    
    folders = []
    for name in sorted(os.listdir(output_dir), key=lambda s: s.lower()):
        folder_path = os.path.join(output_dir, name)
        if os.path.isdir(folder_path) and not name.startswith('.'):
            file_count = len([f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f)) and not f.startswith('_')])
            has_thumbnail = os.path.exists(os.path.join(folder_path, '_reference_face.jpg'))
            folders.append({
                'name': name,
                'file_count': file_count,
                'has_thumbnail': has_thumbnail
            })
    
    return jsonify({'folders': folders})

@app.route('/api/merge-folders', methods=['POST'])
def merge_folders():
    """Manually merge selected folders into one."""
    data = request.json
    if not data:
        return jsonify({'status': 'error', 'message': 'No data provided.'}), 400
    
    folder_names = data.get('folders', [])
    target_name = data.get('target_name', None)
    
    if not folder_names or len(folder_names) < 2:
        return jsonify({'status': 'error', 'message': 'Please select at least 2 folders to merge.'}), 400
    
    try:
        result = merge_folders_manual(current_config.output_dir, folder_names, target_name)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Merge error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/video-thumbnail/<folder_name>/<filename>')
def get_video_thumbnail(folder_name, filename):
    """Generates or retrieves a cached video thumbnail frame using FFmpeg."""
    if '..' in folder_name or '/' in folder_name or '\\' in folder_name or '..' in filename or '/' in filename or '\\' in filename:
        return "Invalid path", 400
        
    video_path = os.path.abspath(os.path.join(current_config.output_dir, folder_name, filename))
    if not os.path.exists(video_path):
        return "Video not found", 404
        
    cache_dir = os.path.join(WORKSPACE_DIR, ".cache", "video_thumbnails")
    os.makedirs(cache_dir, exist_ok=True)
    
    cache_filename = f"{folder_name}_{filename}.jpg".replace(" ", "_").replace(":", "_")
    cache_path = os.path.join(cache_dir, cache_filename)
    
    if os.path.exists(cache_path):
        return send_from_directory(cache_dir, cache_filename)
        
    try:
        import subprocess
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
        cmd = [
            'ffmpeg',
            '-ss', '00:00:01',
            '-i', video_path,
            '-vframes', '1',
            '-q:v', '4',
            '-update', '1',
            cache_path,
            '-y'
        ]
        
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo, timeout=8)
        if res.returncode == 0 and os.path.exists(cache_path):
            return send_from_directory(cache_dir, cache_filename)
        else:
            # Fallback: try seeking to 00:00:00 if 1 second seek fails
            cmd[2] = '00:00:00'
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo, timeout=8)
            if res.returncode == 0 and os.path.exists(cache_path):
                return send_from_directory(cache_dir, cache_filename)
            else:
                logger.warning(f"FFmpeg failed to generate thumbnail for {video_path}: {res.stderr.decode('utf-8', errors='ignore')}")
    except Exception as e:
        logger.error(f"Error generating video thumbnail: {e}")
        
    return "Could not generate thumbnail", 404

@app.route('/media/<path:filename>')
def serve_media(filename):
    """Serves media files (images and videos) from output directory."""
    return send_from_directory(current_config.output_dir, filename)

def find_ffprobe():
    startupinfo = None
    if os.name == 'nt':
        import subprocess
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    try:
        import subprocess
        res = subprocess.run(['ffprobe', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo, timeout=2)
        if res.returncode == 0:
            return 'ffprobe'
    except FileNotFoundError:
        pass

    # Check local winget directory
    local_app_data = os.environ.get('LOCALAPPDATA', '')
    if local_app_data:
        winget_dir = os.path.join(local_app_data, "Microsoft", "WinGet", "Packages")
        if os.path.exists(winget_dir):
            for root, dirs, files in os.walk(winget_dir):
                if 'ffprobe.exe' in files:
                    bin_path = os.path.abspath(root)
                    os.environ['PATH'] = bin_path + os.pathsep + os.environ.get('PATH', '')
                    return os.path.join(bin_path, 'ffprobe.exe')
    return 'ffprobe'

def format_size(size_bytes):
    if size_bytes == 0:
        return "0 B"
    size_name = ("B", "KB", "MB", "GB", "TB")
    import math
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_name[i]}"

def format_date(timestamp):
    from datetime import datetime
    dt = datetime.fromtimestamp(timestamp)
    return dt.strftime('%Y-%m-%d %H:%M:%S')

def format_duration(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes:02d}:{secs:02d}"

def get_media_metadata(file_path, is_video):
    metadata = {
        'filename': os.path.basename(file_path),
        'file_size': format_size(os.path.getsize(file_path)),
        'date_modified': format_date(os.path.getmtime(file_path)),
        'is_video': is_video,
        'resolution': 'Unknown',
        'duration': 'Unknown',
        'codec': 'Unknown',
        'bitrate': 'Unknown',
        'fps': 'Unknown'
    }
    
    if is_video:
        try:
            import subprocess
            ffprobe_exe = find_ffprobe()
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                
            cmd = [
                ffprobe_exe,
                '-v', 'error',
                '-show_entries', 'format=duration,bit_rate:stream=width,height,codec_name,r_frame_rate',
                '-of', 'json',
                file_path
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo, timeout=5)
            if res.returncode == 0:
                data = json.loads(res.stdout.decode('utf-8', errors='ignore'))
                
                # Parse format info
                fmt = data.get('format', {})
                duration_val = fmt.get('duration')
                if duration_val:
                    try:
                        metadata['duration'] = format_duration(float(duration_val))
                    except:
                        pass
                
                bitrate_val = fmt.get('bit_rate')
                if bitrate_val:
                    try:
                        metadata['bitrate'] = f"{round(float(bitrate_val) / 1000)} kbps"
                    except:
                        pass
                        
                # Parse stream info
                streams = data.get('streams', [])
                if streams:
                    vstream = streams[0]  # default to first
                    for s in streams:
                        if 'width' in s and 'height' in s:
                            vstream = s
                            break
                    
                    w = vstream.get('width')
                    h = vstream.get('height')
                    if w and h:
                        metadata['resolution'] = f"{w}x{h}"
                        
                    codec = vstream.get('codec_name')
                    if codec:
                        metadata['codec'] = codec.upper()
                        
                    fps_val = vstream.get('r_frame_rate')
                    if fps_val and '/' in fps_val:
                        try:
                            num, den = map(int, fps_val.split('/'))
                            if den > 0:
                                metadata['fps'] = f"{round(num / den, 2)} FPS"
                        except:
                            pass
        except Exception as e:
            logger.error(f"Error extracting metadata with ffprobe for {file_path}: {e}")
    else:
        # It's an image, try to get resolution using OpenCV
        try:
            import cv2
            img = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)
            if img is not None:
                h, w = img.shape[:2]
                metadata['resolution'] = f"{w}x{h}"
                metadata['codec'] = os.path.splitext(file_path)[1][1:].upper()
        except Exception as e:
            logger.error(f"Error extracting image resolution using cv2 for {file_path}: {e}")
            
    return metadata

@app.route('/api/file-info/<folder_name>/<filename>')
def get_file_info(folder_name, filename):
    """Fetches video or image file metadata using ffprobe / cv2 and database records."""
    if '..' in folder_name or '/' in folder_name or '\\' in folder_name or \
       '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({'status': 'error', 'message': 'Invalid paths'}), 400
        
    file_path = os.path.join(current_config.output_dir, folder_name, filename)
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'File not found'}), 404
        
    ext = os.path.splitext(filename)[1].lower()
    is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
    
    try:
        metadata = get_media_metadata(file_path, is_video)
        metadata['folder_name'] = folder_name
        
        # Query rating from WatchHistory
        from utils.models import WatchHistory
        rel_path = f"{folder_name}/{filename}"
        history = WatchHistory.query.filter_by(file_path=rel_path).first()
        metadata['rating'] = history.rating if history else None

        # Pull face detection statistics from database
        from utils.models import ProcessedFile
        abs_path = os.path.abspath(file_path)
        processed_file = ProcessedFile.query.filter_by(file_path=abs_path).first()
        if processed_file:
            metadata['face_count'] = len(processed_file.faces)
            genders = [f.gender for f in processed_file.faces if f.gender]
            if genders:
                from collections import Counter
                gender_counts = Counter(genders)
                metadata['gender_breakdown'] = ", ".join([f"{g.capitalize()} ({count})" for g, count in gender_counts.items()])
            else:
                metadata['gender_breakdown'] = "None"
        else:
            metadata['face_count'] = 0
            metadata['gender_breakdown'] = "Not processed"
            
        return jsonify({'status': 'success', 'metadata': metadata})
    except Exception as e:
        logger.error(f"Error getting file info for {filename}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/list-media/<folder_name>')
def list_media(folder_name):
    """Lists all media files inside a specific identity folder with their watch history status."""
    if '..' in folder_name or '/' in folder_name or '\\' in folder_name:
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
    folder_path = os.path.join(current_config.output_dir, folder_name)
    if not os.path.exists(folder_path):
        return jsonify({'status': 'error', 'message': 'Folder not found'}), 404
    
    try:
        from utils.models import WatchHistory
        prefix = folder_name + '/'
        history_records = {
            h.file_path: h for h in WatchHistory.query.filter(WatchHistory.file_path.like(prefix + '%')).all()
        }
    except Exception as e:
        logger.error(f"Error loading watch history in list_media: {e}")
        history_records = {}
        
    files = []
    for name in sorted(os.listdir(folder_path)):
        if name.startswith('_'):
            continue
        file_path = os.path.join(folder_path, name)
        if os.path.isfile(file_path):
            ext = os.path.splitext(name)[1].lower()
            is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
            
            rel_path = f"{folder_name}/{name}"
            history = history_records.get(rel_path)
            
            watch_info = {
                'playback_position': 0.0,
                'duration': 0.0,
                'is_completed': False,
                'progress_percent': 0,
                'rating': None
            }
            if history:
                watch_info['playback_position'] = history.playback_position
                watch_info['duration'] = history.duration
                watch_info['is_completed'] = history.is_completed
                watch_info['rating'] = history.rating
                if history.duration > 0:
                    watch_info['progress_percent'] = int((history.playback_position / history.duration) * 100)
            
            files.append({
                'name': name,
                'is_video': is_video,
                'ext': ext,
                'watch_progress': watch_info
            })
    return jsonify({'files': files})

@app.route('/api/watch-progress', methods=['POST'])
def save_watch_progress():
    """Saves or updates watch history playback position for a media file."""
    data = request.json
    file_path = data.get('file_path')
    position = data.get('position', 0.0)
    duration = data.get('duration', 0.0)
    
    if not file_path:
        return jsonify({'status': 'error', 'message': 'Missing file_path'}), 400
        
    try:
        from utils.models import WatchHistory
        
        # Mark completed if 90%+ watched
        is_completed = False
        if duration > 0:
            is_completed = (position / duration) >= 0.90
            
        record = WatchHistory.query.filter_by(file_path=file_path).first()
        if record:
            record.playback_position = position
            record.duration = duration
            record.is_completed = record.is_completed or is_completed
        else:
            record = WatchHistory(
                file_path=file_path,
                playback_position=position,
                duration=duration,
                is_completed=is_completed
            )
            db.session.add(record)
            
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error saving watch progress: {e}")
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/watch-progress/<path:file_path>', methods=['GET'])
def get_watch_progress(file_path):
    """Retrieves watch history playback details for a specific media file."""
    try:
        from utils.models import WatchHistory
        record = WatchHistory.query.filter_by(file_path=file_path).first()
        if record:
            return jsonify({
                'status': 'success',
                'playback_position': record.playback_position,
                'duration': record.duration,
                'is_completed': record.is_completed
            })
        return jsonify({
            'status': 'success',
            'playback_position': 0.0,
            'duration': 0.0,
            'is_completed': False
        })
    except Exception as e:
        logger.error(f"Error getting watch progress: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/rate-file', methods=['POST'])
def rate_file():
    """Saves or updates rating for a media file."""
    data = request.json
    file_path = data.get('file_path')
    rating = data.get('rating')
    
    if not file_path:
        return jsonify({'status': 'error', 'message': 'Missing file_path'}), 400
    if rating is not None and (rating < 1 or rating > 5):
        return jsonify({'status': 'error', 'message': 'Rating must be between 1 and 5'}), 400
        
    try:
        from utils.models import WatchHistory
        
        record = WatchHistory.query.filter_by(file_path=file_path).first()
        if record:
            record.rating = rating
        else:
            record = WatchHistory(
                file_path=file_path,
                playback_position=0.0,
                duration=0.0,
                is_completed=False,
                rating=rating
            )
            db.session.add(record)
            
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error saving file rating: {e}")
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/recently-watched', methods=['GET'])
def get_recently_watched():
    """Retrieves a list of up to 10 recently watched media files."""
    try:
        from utils.models import WatchHistory
        # Get recently watched items sorted by watched_at desc
        records = WatchHistory.query.order_by(WatchHistory.watched_at.desc()).limit(10).all()
        
        items = []
        for r in records:
            parts = r.file_path.split('/', 1)
            if len(parts) == 2:
                folder_name, filename = parts
            else:
                folder_name = "_unsorted"
                filename = r.file_path
                
            full_path = os.path.join(current_config.output_dir, folder_name, filename)
            if not os.path.exists(full_path):
                continue
                
            ext = os.path.splitext(filename)[1].lower()
            is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
            
            progress_percent = 0
            if r.duration > 0:
                progress_percent = int((r.playback_position / r.duration) * 100)
            
            items.append({
                'file_path': r.file_path,
                'folder_name': folder_name,
                'filename': filename,
                'playback_position': r.playback_position,
                'duration': r.duration,
                'is_completed': r.is_completed,
                'progress_percent': progress_percent,
                'watched_at': r.watched_at.strftime('%Y-%m-%d %H:%M:%S'),
                'is_video': is_video
            })
            
        return jsonify({'status': 'success', 'items': items})
    except Exception as e:
        logger.error(f"Error getting recently watched: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/recently-watched/clear', methods=['POST'])
def clear_recently_watched():
    """Clears all watch history progress logs."""
    try:
        from utils.models import WatchHistory
        WatchHistory.query.delete()
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error clearing watch history: {e}")
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/open-folder/<folder_name>', methods=['POST'])
def open_folder(folder_name):
    """Launches Windows Explorer pointing directly to the selected folder."""
    if '..' in folder_name or '/' in folder_name or '\\' in folder_name:
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
    path = os.path.abspath(os.path.join(current_config.output_dir, folder_name))
    if os.path.exists(path):
        try:
            os.startfile(path)
            return jsonify({'status': 'success'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    return jsonify({'status': 'error', 'message': 'Folder not found'}), 404

@app.route('/api/play-file', methods=['POST'])
def play_file():
    """Launches the default player on the OS (e.g. VLC) for non-native web formats (like MKV)."""
    data = request.json
    folder_name = data.get('folder_name')
    filename = data.get('filename')
    if not folder_name or not filename:
        return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400
    if '..' in folder_name or '/' in folder_name or '\\' in folder_name or '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({'status': 'error', 'message': 'Invalid file path'}), 400
    path = os.path.abspath(os.path.join(current_config.output_dir, folder_name, filename))
    if os.path.exists(path):
        try:
            os.startfile(path)
            return jsonify({'status': 'success'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    return jsonify({'status': 'error', 'message': 'File not found'}), 404

@app.route('/api/thumbnail/<cluster_folder>')
def get_thumbnail(cluster_folder):
    """
    Serves the reference thumbnail (_reference_face.jpg) from the cluster folder.
    """
    # Safe validation of folder name
    if '..' in cluster_folder or '/' in cluster_folder or '\\' in cluster_folder:
        return "Invalid path", 400
        
    cluster_path = os.path.join(current_config.output_dir, cluster_folder)
    if not os.path.exists(cluster_path):
        return "Folder not found", 404
        
    thumbnail_file = "_reference_face.jpg"
    thumbnail_path = os.path.join(cluster_path, thumbnail_file)
    
    if not os.path.exists(thumbnail_path):
        # Return default placeholder
        # Since we don't have a default, we could generate/return 404 or an empty response
        return "No thumbnail", 404
        
    return send_from_directory(cluster_path, thumbnail_file)

@app.route('/api/stream-progress')
def stream_progress():
    """
    SSE endpoint for streaming progress and logs in real-time.
    """
    def event_stream():
        last_log_idx = 0
        while True:
            with state_lock:
                status_copy = {
                    'running': pipeline_state['running'],
                    'stage': pipeline_state['stage'],
                    'percent': pipeline_state['percent'],
                    'message': pipeline_state['message'],
                    'detail': pipeline_state['detail'],
                    'report': pipeline_state['report']
                }
            
            # Get only new logs
            all_logs = list(ui_log_handler.logs)
            new_logs = all_logs[last_log_idx:]
            last_log_idx = len(all_logs)
            
            status_copy['new_logs'] = new_logs
            
            yield f"data: {json.dumps(status_copy)}\n\n"
            
            # If pipeline is not running, and we've caught up with logs, slow down or break
            if not status_copy['running'] and len(new_logs) == 0:
                time.sleep(1.0)
            else:
                time.sleep(0.3)
                
    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/api/move-media', methods=['POST'])
def move_media():
    """Moves one or more media files physically and updates sqlite caching registry."""
    data = request.json
    from_folder = data.get('from_folder')
    to_folder = data.get('to_folder')
    filenames = data.get('filenames')
    
    # Backwards compatibility for single filename
    if not filenames:
        single_filename = data.get('filename')
        if single_filename:
            filenames = [single_filename]
            
    if not from_folder or not to_folder or not filenames:
        return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400
        
    # Prevent path traversal
    if '..' in from_folder or '/' in from_folder or '\\' in from_folder or \
       '..' in to_folder or '/' in to_folder or '\\' in to_folder:
        return jsonify({'status': 'error', 'message': 'Invalid paths'}), 400
        
    for filename in filenames:
        if '..' in filename or '/' in filename or '\\' in filename:
            return jsonify({'status': 'error', 'message': 'Invalid paths in filenames'}), 400
            
    src_dir = os.path.join(current_config.output_dir, from_folder)
    dest_dir = os.path.join(current_config.output_dir, to_folder)
    
    if not os.path.exists(dest_dir):
        return jsonify({'status': 'error', 'message': f'Target folder not found: {to_folder}'}), 404
        
    cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
    from utils.cache import EmbeddingCache
    cache_db = EmbeddingCache(cache_dir)
    
    successes = []
    failures = []
    
    try:
        for filename in filenames:
            src_file = os.path.join(src_dir, filename)
            if not os.path.exists(src_file):
                logger.warning(f"Source file not found during batch move: {filename}")
                failures.append({'filename': filename, 'reason': 'Source file not found'})
                continue
                
            # Handle name collisions in the target directory
            dest_filename = filename
            dest_file = os.path.join(dest_dir, dest_filename)
            if os.path.exists(dest_file):
                base, ext = os.path.splitext(filename)
                counter = 1
                while os.path.exists(os.path.join(dest_dir, f"{base}_{counter}{ext}")):
                    counter += 1
                dest_filename = f"{base}_{counter}{ext}"
                dest_file = os.path.join(dest_dir, dest_filename)
                
            try:
                # Move the physical file
                os.rename(src_file, dest_file)
                logger.info(f"Moved physical file: {src_file} -> {dest_file}")
                
                # file_path in DB is absolute path
                abs_src_path = os.path.abspath(src_file)
                abs_dest_path = os.path.abspath(dest_file)
                
                cache_db.update_file_path(abs_src_path, abs_dest_path)
                logger.info(f"Updated SQLite cache for path: {abs_src_path} -> {abs_dest_path}")
                successes.append({'original': filename, 'new': dest_filename})
            except Exception as item_err:
                logger.error(f"Failed to move file {filename}: {item_err}")
                failures.append({'filename': filename, 'reason': str(item_err)})
                
        # Check if source folder is now empty (ignoring hidden/metadata files)
        if os.path.exists(src_dir):
            remaining_files = [f for f in os.listdir(src_dir) if not f.startswith('_')]
            if len(remaining_files) == 0:
                # Delete reference files and the folder itself
                profile_json_path = os.path.join(src_dir, '_profile_embedding.json')
                if os.path.exists(profile_json_path):
                    try:
                        with open(profile_json_path, 'r') as f:
                            profile_data = json.load(f)
                            profile_id = profile_data.get('profile_id')
                            if profile_id is not None:
                                cache_db.delete_persistent_profile(profile_id)
                                logger.info(f"Deleted empty profile ID {profile_id} from SQLite DB.")
                    except Exception as e:
                        logger.error(f"Error deleting persistent profile: {e}")
                
                # Remove all files in the directory (like _reference_face.jpg, etc.)
                for f in os.listdir(src_dir):
                    try:
                        os.remove(os.path.join(src_dir, f))
                    except Exception as e:
                        logger.error(f"Error removing reference file: {e}")
                try:
                    os.rmdir(src_dir)
                    logger.info(f"Removed empty folder: {from_folder}")
                except Exception as e:
                    logger.error(f"Error removing directory: {e}")
                    
        if failures and not successes:
            return jsonify({'status': 'error', 'message': 'All moves failed', 'failures': failures}), 500
            
        return jsonify({
            'status': 'success',
            'message': f'Successfully moved {len(successes)} file(s).',
            'successes': successes,
            'failures': failures
        })
    except Exception as e:
        logger.error(f"Error during batch move processing: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/rename-folder', methods=['POST'])
def rename_folder():
    """Renames a face cluster directory physically and updates cache database mappings."""
    data = request.json
    old_name = data.get('old_name')
    new_name = data.get('new_name')
    
    if not old_name or not new_name:
        return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400
        
    # Prevent path traversal and invalid characters
    if '..' in old_name or '/' in old_name or '\\' in old_name or \
       '..' in new_name or '/' in new_name or '\\' in new_name:
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
        
    # Trim and strip to be clean
    old_name = old_name.strip()
    new_name = new_name.strip()
    
    if old_name == new_name:
        return jsonify({'status': 'success', 'message': 'No changes needed.'})
        
    src_dir = os.path.join(current_config.output_dir, old_name)
    dest_dir = os.path.join(current_config.output_dir, new_name)
    
    if not os.path.exists(src_dir):
        return jsonify({'status': 'error', 'message': f'Folder not found: {old_name}'}), 404
    if os.path.exists(dest_dir):
        return jsonify({'status': 'error', 'message': f'Target folder already exists: {new_name}'}), 409
        
    try:
        import sqlite3
        # Rename the folder on disk
        os.rename(src_dir, dest_dir)
        logger.info(f"Renamed folder on disk: {src_dir} -> {dest_dir}")
        
        # Connect to DB and update paths and folder name references
        cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
        from utils.cache import EmbeddingCache
        cache_db = EmbeddingCache(cache_dir)
        
        cache_db.update_folder_paths(src_dir, dest_dir)
        cache_db.update_profile_folder_name_by_old_name(old_name, new_name)
        logger.info(f"Updated SQLite references for folder rename: {old_name} -> {new_name}")
        
        return jsonify({'status': 'success', 'message': 'Folder renamed successfully.'})
    except Exception as e:
        logger.error(f"Error renaming folder: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/search')
def global_search():
    """Performs a full-text search on filenames, folders, and person names across the entire library."""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'status': 'success', 'results': []})
        
    try:
        from utils.models import ProcessedFile, WatchHistory
        
        output_dir = os.path.abspath(current_config.output_dir)
        query_lower = query.lower()
        results_map = {}
        
        # 1. Search physical filesystem on disk
        if os.path.exists(output_dir):
            for folder_name in os.listdir(output_dir):
                if folder_name.startswith('.') or (folder_name.startswith('_') and folder_name != '_unsorted'):
                    continue
                folder_path = os.path.join(output_dir, folder_name)
                if not os.path.isdir(folder_path):
                    continue
                    
                # Check if the folder itself matches
                folder_matches = query_lower in folder_name.lower()
                
                try:
                    for filename in os.listdir(folder_path):
                        if filename.startswith('.') or filename.startswith('_'):
                            continue
                        file_path = os.path.join(folder_path, filename)
                        if not os.path.isfile(file_path):
                            continue
                            
                        # If folder name matched or filename matches
                        if folder_matches or (query_lower in filename.lower()):
                            key = f"{folder_name}/{filename}"
                            ext = os.path.splitext(filename)[1].lower()
                            is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                            
                            results_map[key] = {
                                'filename': filename,
                                'folder_name': folder_name,
                                'display_folder_name': folder_name.replace('_', ' ').strip(),
                                'file_type': 'video' if is_video else 'image',
                                'is_video': is_video,
                                'ext': ext,
                                'watch_progress': {
                                    'playback_position': 0.0,
                                    'duration': 0.0,
                                    'is_completed': False,
                                    'progress_percent': 0
                                },
                                'has_thumbnail': is_video or ext in {'.jpg', '.jpeg', '.png', '.webp'}
                            }
                except Exception as ex:
                    logger.error(f"Error scanning folder {folder_name} in search: {ex}")
                    
        # 2. Search database cache for matching paths
        # SQLite's LIKE is case-insensitive for ASCII by default
        matched_files = ProcessedFile.query.filter(
            ProcessedFile.file_path.like(f'%{query}%')
        ).all()
        
        for pf in matched_files:
            abs_path = os.path.abspath(pf.file_path)
            if not abs_path.startswith(output_dir) or not os.path.exists(abs_path):
                continue
                
            rel_to_out = os.path.relpath(abs_path, output_dir)
            parts = rel_to_out.replace('\\', '/').split('/')
            if len(parts) < 2:
                continue
                
            folder_name = parts[0]
            filename = parts[1] if len(parts) == 2 else '/'.join(parts[1:])
            
            key = f"{folder_name}/{filename}"
            if key not in results_map:
                ext = os.path.splitext(filename)[1].lower()
                is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                
                results_map[key] = {
                    'filename': filename,
                    'folder_name': folder_name,
                    'display_folder_name': folder_name.replace('_', ' ').strip(),
                    'file_type': pf.file_type or ('video' if is_video else 'image'),
                    'is_video': is_video,
                    'ext': ext,
                    'watch_progress': {
                        'playback_position': 0.0,
                        'duration': 0.0,
                        'is_completed': False,
                        'progress_percent': 0
                    },
                    'has_thumbnail': is_video or ext in {'.jpg', '.jpeg', '.png', '.webp'}
                }
                
        # 3. Inject watch progress metadata
        for key, item in results_map.items():
            watch_record = WatchHistory.query.filter_by(file_path=key).first()
            if watch_record:
                watch_info = item['watch_progress']
                watch_info['playback_position'] = watch_record.playback_position
                watch_info['duration'] = watch_record.duration
                watch_info['is_completed'] = watch_record.is_completed
                if watch_record.duration > 0:
                    watch_info['progress_percent'] = int((watch_record.playback_position / watch_record.duration) * 100)
                    
        # Sort results alphabetically by filename
        sorted_results = sorted(results_map.values(), key=lambda x: x['filename'])
        
        return jsonify({'status': 'success', 'results': sorted_results[:100]})
    except Exception as e:
        logger.error(f"Error in global search endpoint: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


if __name__ == '__main__':
    logger.info("Starting Face Sorter Web Interface...")
    app.run(host='127.0.0.1', port=5000, debug=True)
