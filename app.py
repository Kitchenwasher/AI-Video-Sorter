import os
import threading
import json
import time
from flask import Flask, render_template, jsonify, request, Response, send_from_directory
from config import Config
from pipeline import SortingPipeline
from modules.name_resolver import merge_folders_manual
from utils.logger import logger, ui_log_handler

app = Flask(__name__)

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
WORKSPACE_DIR = os.path.abspath(os.path.dirname(__file__))
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
                    name_confidence_threshold=data.get('name_confidence_threshold', 0.5),
                    name_search_delay=data.get('name_search_delay', 4.0),
                    merge_on_name_conflict=data.get('merge_on_name_conflict', False)
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
            'name_confidence_threshold': config_obj.name_confidence_threshold,
            'name_search_delay': config_obj.name_search_delay,
            'merge_on_name_conflict': config_obj.merge_on_name_conflict
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
        current_config.name_confidence_threshold = float(data.get('name_confidence_threshold', current_config.name_confidence_threshold))
        current_config.name_search_delay = float(data.get('name_search_delay', current_config.name_search_delay))
        current_config.merge_on_name_conflict = bool(data.get('merge_on_name_conflict', current_config.merge_on_name_conflict))
        
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
            'name_confidence_threshold': current_config.name_confidence_threshold,
            'name_search_delay': current_config.name_search_delay,
            'merge_on_name_conflict': current_config.merge_on_name_conflict
        })

@app.route('/api/start', methods=['POST'])
def start_pipeline():
    global pipeline_thread, pipeline_state
    
    with state_lock:
        if pipeline_state['running']:
            return jsonify({'status': 'error', 'message': 'Pipeline is already running.'}), 400
            
        # Reset state
        pipeline_state['running'] = True
        pipeline_state['stage'] = 'starting'
        pipeline_state['percent'] = 0.0
        pipeline_state['message'] = 'Starting pipeline...'
        pipeline_state['detail'] = None
        pipeline_state['report'] = None
        
        # Clear log history so UI starts fresh
        ui_log_handler.logs.clear()
        
        # Start thread
        pipeline_thread = threading.Thread(
            target=run_pipeline_thread,
            args=(current_config,),
            daemon=True
        )
        pipeline_thread.start()
        
    return jsonify({'status': 'success', 'message': 'Pipeline started.'})

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

if __name__ == '__main__':
    logger.info("Starting Face Sorter Web Interface...")
    app.run(host='127.0.0.1', port=5000, debug=True)
