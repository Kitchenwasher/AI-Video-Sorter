import os
import threading
import json
import time
import atexit
import subprocess
from flask import Flask, render_template, jsonify, request, Response, send_from_directory
from flask_cors import CORS
from config import Config
from pipeline import SortingPipeline
from modules.name_resolver import merge_folders_manual
from utils.logger import logger, ui_log_handler

app = Flask(__name__)
CORS(app)
from flask_socketio import SocketIO, emit, join_room, leave_room
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
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

        pf_columns = [c['name'] for c in inspector.get_columns('processed_files')]
        if 'analysis_fingerprint' not in pf_columns:
            with engine.connect() as conn:
                conn.execute(db.text("ALTER TABLE processed_files ADD COLUMN analysis_fingerprint VARCHAR"))
                conn.commit()
            logger.info("Added 'analysis_fingerprint' column to 'processed_files' table.")
            
        # Check if admin_token exists in watch_parties, if not add it
        wp_columns = [c['name'] for c in inspector.get_columns('watch_parties')]
        if 'admin_token' not in wp_columns:
            with engine.connect() as conn:
                conn.execute(db.text("ALTER TABLE watch_parties ADD COLUMN admin_token VARCHAR(255)"))
                conn.commit()
            logger.info("Added 'admin_token' column to 'watch_parties' table.")
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
                    scan_depth=data.get('scan_depth', 'fast'),
                    multi_profile_policy=data.get('multi_profile_policy', 'primary_only'),
                    profile_target=data.get('profile_target', 'female'),
                    multi_profile_min_keyframes=data.get('multi_profile_min_keyframes', 2),
                    auto_name_folders=data.get('auto_name_folders', False),
                    only_name_unnamed=data.get('only_name_unnamed', True),
                    name_confidence_threshold=data.get('name_confidence_threshold', 0.5),
                    name_search_delay=data.get('name_search_delay', 4.0),
                    merge_on_name_conflict=data.get('merge_on_name_conflict', False),
                    default_video_player=data.get('default_video_player', 'browser'),
                    wp_use_cloudflare=data.get('wp_use_cloudflare', True),
                    wp_cloudflare_token=data.get('wp_cloudflare_token', ''),
                    wp_custom_domain=data.get('wp_custom_domain', ''),
                    wp_turn_server=data.get('wp_turn_server', ''),
                    wp_turn_username=data.get('wp_turn_username', ''),
                    wp_turn_credential=data.get('wp_turn_credential', ''),
                    wp_run_local_turn=data.get('wp_run_local_turn', False),
                    wp_local_turn_port=data.get('wp_local_turn_port', 3478),
                    wp_turn_secret=data.get('wp_turn_secret', ''),
                    wp_enable_upnp=data.get('wp_enable_upnp', True),
                    wp_use_hls=data.get('wp_use_hls', False),
                    wp_hls_bitrate=data.get('wp_hls_bitrate', '2500k'),
                    wp_hls_resolution=data.get('wp_hls_resolution', '1280x720')
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
            'scan_depth': config_obj.scan_depth,
            'multi_profile_policy': config_obj.multi_profile_policy,
            'profile_target': config_obj.profile_target,
            'multi_profile_min_keyframes': config_obj.multi_profile_min_keyframes,
            'auto_name_folders': config_obj.auto_name_folders,
            'only_name_unnamed': config_obj.only_name_unnamed,
            'name_confidence_threshold': config_obj.name_confidence_threshold,
            'name_search_delay': config_obj.name_search_delay,
            'merge_on_name_conflict': config_obj.merge_on_name_conflict,
            'default_video_player': config_obj.default_video_player,
            'wp_use_cloudflare': config_obj.wp_use_cloudflare,
            'wp_cloudflare_token': config_obj.wp_cloudflare_token,
            'wp_custom_domain': config_obj.wp_custom_domain,
            'wp_turn_server': config_obj.wp_turn_server,
            'wp_turn_username': config_obj.wp_turn_username,
            'wp_turn_credential': config_obj.wp_turn_credential,
            'wp_run_local_turn': config_obj.wp_run_local_turn,
            'wp_local_turn_port': config_obj.wp_local_turn_port,
            'wp_turn_secret': config_obj.wp_turn_secret,
            'wp_enable_upnp': config_obj.wp_enable_upnp,
            'wp_use_hls': config_obj.wp_use_hls,
            'wp_hls_bitrate': config_obj.wp_hls_bitrate,
            'wp_hls_resolution': config_obj.wp_hls_resolution
        }
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        logger.info("Settings saved to settings.json.")
    except Exception as e:
        logger.error(f"Failed to save settings.json: {e}")


# Load config
current_config = load_settings()

def is_safe_path_segment(s: str) -> bool:
    """Checks if a string is a safe path segment (prevents directory traversal)."""
    if not s:
        return False
    # Normalize slashes
    normalized = s.replace('\\', '/')
    if normalized == '..' or normalized == '.' or '../' in normalized or '/..' in normalized:
        return False
    # Slashes are not allowed in simple folder/file segments
    if '/' in normalized:
        return False
    return True

def cleanup_expired_parties():
    try:
        from utils.models import WatchParty, db
        from datetime import datetime
        import shutil
        
        # 1. First, delete expired watch parties from database
        expired_parties = WatchParty.query.filter(WatchParty.expires_at < datetime.utcnow()).all()
        if expired_parties:
            logger.info(f"Background cleanup: Found {len(expired_parties)} expired watch parties in DB.")
            for party in expired_parties:
                db.session.delete(party)
            db.session.commit()
            
        # 2. Next, scan output_dir for orphaned single_ folders not in database at all
        active_parties = WatchParty.query.filter(WatchParty.expires_at >= datetime.utcnow()).all()
        active_folders = {p.folder_name for p in active_parties if p.folder_name}
        
        # Scan output_dir
        if os.path.exists(current_config.output_dir):
            for item in os.listdir(current_config.output_dir):
                item_path = os.path.join(current_config.output_dir, item)
                if os.path.isdir(item_path) and item.startswith('single_'):
                    if item not in active_folders:
                        try:
                            shutil.rmtree(item_path)
                            logger.info(f"Cleaned up orphaned custom watch party directory: {item_path}")
                        except Exception as clean_err:
                            logger.error(f"Error cleaning up orphaned directory {item}: {clean_err}")
                            
        # Scan output_dir/.hls_cache
        hls_cache_base = os.path.join(current_config.output_dir, ".hls_cache")
        if os.path.exists(hls_cache_base):
            for item in os.listdir(hls_cache_base):
                item_path = os.path.join(hls_cache_base, item)
                if os.path.isdir(item_path) and item.startswith('single_'):
                    if item not in active_folders:
                        try:
                            shutil.rmtree(item_path)
                            logger.info(f"Cleaned up orphaned HLS cache directory: {item_path}")
                        except Exception as clean_err:
                            logger.error(f"Error cleaning up orphaned HLS cache directory {item}: {clean_err}")
                            
    except Exception as e:
        logger.error(f"Error running cleanup_expired_parties: {e}")

def start_cleanup_scheduler():
    def run_loop():
        # Sleep for a bit initially to let startup finish
        time.sleep(10)
        while True:
            try:
                with app.app_context():
                    cleanup_expired_parties()
            except Exception as e:
                logger.error(f"Error in cleanup scheduler loop: {e}")
            # Run cleanup every 1 hour (3600 seconds)
            time.sleep(3600)
            
    t = threading.Thread(target=run_loop, daemon=True)
    t.start()

with app.app_context():
    try:
        # Clean up any expired watch parties and their temporary single_ folders
        cleanup_expired_parties()
        # Start periodic cleanup scheduler
        start_cleanup_scheduler()
    except Exception as e:
        logger.error(f"Failed to run startup cleanup: {e}")


# Socket.IO Event Handlers
@socketio.on('join')
def handle_join_event(data):
    party_id = data.get('party_id')
    client_id = data.get('client_id')
    client_name = data.get('client_name', 'Viewer')
    admin_token = data.get('admin_token')
    
    if not party_id or not client_id:
        return
        
    join_room(party_id)
    
    is_admin = False
    from datetime import datetime
    from utils.models import WatchParty
    party = WatchParty.query.get(party_id)
    if not party or party.expires_at < datetime.utcnow():
        emit('error', {'message': 'Watch party expired or not found'})
        return
        
    with watch_parties_lock:
        if party_id not in watch_parties_state:
            watch_parties_state[party_id] = {
                'admin_token': party.admin_token,
                'clients': {},
                'playback_state': {
                    'filename': None,
                    'position': 0.0,
                    'playing': False,
                    'last_updated': time.time()
                },
                'playback_locked': False,
                'slow_mode': False,
                'kicked_clients': [],
                'cooldowns': {}
            }
        
        party_state = watch_parties_state[party_id]
        if client_id in party_state.get('kicked_clients', []):
            emit('kicked_direct')
            return
            
        if admin_token and party_state['admin_token'] == admin_token:
            is_admin = True
            
        party_state['clients'][client_id] = {
            'name': client_name,
            'sid': request.sid,
            'is_admin': is_admin
        }
        
        # Broadcast join message to room
        emit('peer_joined', {
            'client_id': client_id,
            'name': client_name,
            'is_admin': is_admin
        }, to=party_id, include_self=False)
        
        # Determine TURN server configuration
        turn_server = current_config.wp_turn_server
        turn_username = current_config.wp_turn_username
        turn_credential = current_config.wp_turn_credential
        
        if current_config.wp_run_local_turn:
            try:
                from utils.turn_server import get_public_ip, get_local_ip
                ip = get_public_ip() or get_local_ip()
                port = current_config.wp_local_turn_port
                turn_server = f"turn:{ip}:{port}"
                
                secret = current_config.wp_turn_secret.strip()
                if secret:
                    import time, hmac, hashlib, base64
                    timestamp = int(time.time()) + 86400  # 24 hours expiry
                    turn_username = f"{timestamp}:{client_name}"
                    dig = hmac.new(secret.encode('utf-8'), turn_username.encode('utf-8'), hashlib.sha1).digest()
                    turn_credential = base64.b64encode(dig).decode('utf-8')
            except Exception as e:
                logger.error(f"Error generating dynamic TURN credentials: {e}")
        
        # Send init payload to client
        emit('init_payload', {
            'playback_state': party_state['playback_state'],
            'playback_locked': party_state.get('playback_locked', False),
            'slow_mode': party_state.get('slow_mode', False),
            'is_admin': is_admin,
            'peers': [{'client_id': c_id, 'name': c['name'], 'is_admin': c.get('is_admin', False)} for c_id, c in party_state['clients'].items() if c_id != client_id],
            'turn_server': turn_server,
            'turn_username': turn_username,
            'turn_credential': turn_credential
        })
        
    logger.info(f"Socket.IO client {client_name} ({client_id}) joined room {party_id} (is_admin: {is_admin})")

@socketio.on('sync')
def handle_sync_event(data):
    party_id = data.get('party_id')
    client_id = data.get('client_id')
    action = data.get('action')
    position = data.get('position', 0.0)
    filename = data.get('filename')
    
    if not party_id or not client_id:
        return
        
    with watch_parties_lock:
        if party_id not in watch_parties_state:
            return
        party_state = watch_parties_state[party_id]
        
        if party_state.get('playback_locked', False):
            client_info = party_state['clients'].get(client_id)
            is_admin = client_info.get('is_admin', False) if client_info else False
            if not is_admin:
                return
                
        party_state['playback_state'] = {
            'filename': filename,
            'position': position,
            'playing': action == 'play',
            'last_updated': time.time()
        }
        
        emit('sync_event', {
            'action': action,
            'position': position,
            'filename': filename,
            'client_id': client_id
        }, to=party_id, include_self=False)

@socketio.on('chat')
def handle_chat_event(data):
    party_id = data.get('party_id')
    client_id = data.get('client_id')
    message = data.get('message', '').strip()
    
    if not party_id or not client_id or not message:
        return
        
    with watch_parties_lock:
        if party_id not in watch_parties_state:
            return
        party_state = watch_parties_state[party_id]
        client_info = party_state['clients'].get(client_id)
        if not client_info:
            return
            
        is_admin = client_info.get('is_admin', False)
        if party_state.get('slow_mode', False) and not is_admin:
            last_msg_time = party_state['cooldowns'].get(client_id, 0)
            if time.time() - last_msg_time < 10.0:
                return
            party_state['cooldowns'][client_id] = time.time()
            
        if 'message_id_counter' not in party_state:
            party_state['message_id_counter'] = 0
        party_state['message_id_counter'] += 1
        msg_id = party_state['message_id_counter']
        
        emit('chat_event', {
            'id': msg_id,
            'client_id': client_id,
            'name': client_info['name'],
            'message': message,
            'is_admin': is_admin
        }, to=party_id)

@socketio.on('signal')
def handle_signal_event(data):
    party_id = data.get('party_id')
    sender_id = data.get('sender_id')
    target_id = data.get('target_id')
    signal_payload = data.get('signal')
    
    if not party_id or not sender_id or not target_id:
        return
        
    with watch_parties_lock:
        if party_id not in watch_parties_state:
            return
        party_state = watch_parties_state[party_id]
        target_client = party_state['clients'].get(target_id)
        if target_client:
            emit('signal_event', {
                'sender_id': sender_id,
                'signal': signal_payload
            }, to=target_client['sid'])

@socketio.on('disconnect')
def handle_disconnect():
    with watch_parties_lock:
        for party_id, party_state in watch_parties_state.items():
            for client_id, client in list(party_state['clients'].items()):
                if client['sid'] == request.sid:
                    del party_state['clients'][client_id]
                    emit('peer_left', {
                        'client_id': client_id,
                        'name': client['name']
                    }, to=party_id)
                    logger.info(f"Socket.IO client {client['name']} ({client_id}) disconnected from room {party_id}")
                    return


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
            pipeline = SortingPipeline(config_obj, WORKSPACE_DIR, progress_callback, flask_app=app)
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
            pipeline = SortingPipeline(config_obj, WORKSPACE_DIR, progress_callback, flask_app=app)
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

@app.before_request
def restrict_public_access():
    """Restricts public tunnel (localhost.run / trycloudflare.com) viewers from accessing admin routes/APIs."""
    host = request.headers.get('Host', '')
    
    # Check if request is coming through a public tunnel
    is_public = (
        '.lhr.life' in host or 
        'localhost.run' in host or 
        'trycloudflare.com' in host or
        (public_tunnel_url and host in public_tunnel_url)
    )
    
    if is_public:
        path = request.path
        
        # A. Render a beautiful public landing page if they access the root url
        if path == '/':
            return render_template(
                'public_landing.html',
                title="Private Host",
                message="This is a private AuraSort server. The administrative dashboard is only accessible from the local host machine.",
                icon="fa-shield-halved",
                is_danger=False
            )
        
        # 1. Allow static files
        if path.startswith('/static/'):
            return
            
        # 2. Allow watch party visual pages
        if path.startswith('/watch-party/'):
            return
            
        # 3. Allow watch party core signaling and control APIs
        if path.startswith('/api/watch-party/'):
            return
            
        # 4. Allow specific media routes for the player
        if path.startswith('/media/') or path.startswith('/api/video-thumbnail/') or path.startswith('/api/thumbnail/'):
            return
            
        # 5. Allow list media files *only* for currently shared watch party folders
        if path.startswith('/api/profile/') and path.endswith('/media'):
            folder_name = path.split('/')[3]
            with watch_parties_lock:
                # Active in memory
                active_folders = [p['folder_name'] for p in watch_parties_state.values()]
                if folder_name in active_folders:
                    return
                # Active in DB
                try:
                    from utils.models import WatchParty
                    exists = WatchParty.query.filter_by(folder_name=folder_name).first()
                    if exists:
                        return
                except Exception:
                    pass
            return jsonify({'status': 'error', 'message': 'Access denied: Folder is not shared in any active watch party.'}), 403

        # 6. Allow profiles listing ONLY if a valid active watch party admin token is provided
        if path == '/api/profiles':
            admin_token = request.args.get('admin_token') or request.headers.get('X-Admin-Token')
            if admin_token:
                with watch_parties_lock:
                    # Valid active admin token in memory
                    active_tokens = [p.get('admin_token') for p in watch_parties_state.values() if p.get('admin_token')]
                    if admin_token in active_tokens:
                        return
                    # Valid active admin token in DB
                    try:
                        from utils.models import WatchParty
                        exists = WatchParty.query.filter_by(admin_token=admin_token).first()
                        if exists:
                            return
                    except Exception:
                        pass
            return jsonify({'status': 'error', 'message': 'Access denied: Admin authentication required.'}), 403

        # 7. Allow Socket.IO connections for real-time sync and chat
        if path.startswith('/socket.io/'):
            return

        # For all other routes, block access with a premium Access Denied page
        if 'text/html' in request.headers.get('Accept', ''):
            return render_template(
                'public_landing.html',
                title="Access Denied",
                message="Public viewers are only permitted to access Watch Party rooms via their direct links.",
                icon="fa-circle-xmark",
                is_danger=True
            ), 403
            
        return jsonify({'status': 'error', 'message': 'Access denied: Public viewers are only permitted to access watch parties.'}), 403

@app.route('/')
def index():
    cleanup_expired_parties()
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
        current_config.scan_depth = data.get('scan_depth', current_config.scan_depth)
        current_config.multi_profile_policy = data.get('multi_profile_policy', current_config.multi_profile_policy)
        current_config.profile_target = data.get('profile_target', current_config.profile_target)
        current_config.multi_profile_min_keyframes = int(data.get('multi_profile_min_keyframes', current_config.multi_profile_min_keyframes))
        current_config.auto_name_folders = bool(data.get('auto_name_folders', current_config.auto_name_folders))
        current_config.only_name_unnamed = bool(data.get('only_name_unnamed', current_config.only_name_unnamed))
        current_config.name_confidence_threshold = float(data.get('name_confidence_threshold', current_config.name_confidence_threshold))
        current_config.name_search_delay = float(data.get('name_search_delay', current_config.name_search_delay))
        current_config.merge_on_name_conflict = bool(data.get('merge_on_name_conflict', current_config.merge_on_name_conflict))
        current_config.default_video_player = data.get('default_video_player', current_config.default_video_player)
        
        # Watch Party settings
        current_config.wp_use_cloudflare = bool(data.get('wp_use_cloudflare', current_config.wp_use_cloudflare))
        current_config.wp_cloudflare_token = data.get('wp_cloudflare_token', current_config.wp_cloudflare_token)
        current_config.wp_custom_domain = data.get('wp_custom_domain', current_config.wp_custom_domain)
        current_config.wp_turn_server = data.get('wp_turn_server', current_config.wp_turn_server)
        current_config.wp_turn_username = data.get('wp_turn_username', current_config.wp_turn_username)
        current_config.wp_turn_credential = data.get('wp_turn_credential', current_config.wp_turn_credential)
        current_config.wp_run_local_turn = bool(data.get('wp_run_local_turn', current_config.wp_run_local_turn))
        current_config.wp_local_turn_port = int(data.get('wp_local_turn_port', current_config.wp_local_turn_port))
        current_config.wp_turn_secret = data.get('wp_turn_secret', current_config.wp_turn_secret)
        current_config.wp_enable_upnp = bool(data.get('wp_enable_upnp', current_config.wp_enable_upnp))
        current_config.wp_use_hls = bool(data.get('wp_use_hls', current_config.wp_use_hls))
        current_config.wp_hls_bitrate = data.get('wp_hls_bitrate', current_config.wp_hls_bitrate)
        current_config.wp_hls_resolution = data.get('wp_hls_resolution', current_config.wp_hls_resolution)
        
        logger.info("Configuration updated.")
        save_settings(current_config)
        manage_local_turn_server()
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
            'scan_depth': current_config.scan_depth,
            'multi_profile_policy': current_config.multi_profile_policy,
            'profile_target': current_config.profile_target,
            'multi_profile_min_keyframes': current_config.multi_profile_min_keyframes,
            'auto_name_folders': current_config.auto_name_folders,
            'only_name_unnamed': current_config.only_name_unnamed,
            'name_confidence_threshold': current_config.name_confidence_threshold,
            'name_search_delay': current_config.name_search_delay,
            'merge_on_name_conflict': current_config.merge_on_name_conflict,
            'default_video_player': current_config.default_video_player,
            
            # Watch Party settings
            'wp_use_cloudflare': current_config.wp_use_cloudflare,
            'wp_cloudflare_token': current_config.wp_cloudflare_token,
            'wp_custom_domain': current_config.wp_custom_domain,
            'wp_turn_server': current_config.wp_turn_server,
            'wp_turn_username': current_config.wp_turn_username,
            'wp_turn_credential': current_config.wp_turn_credential,
            'wp_run_local_turn': current_config.wp_run_local_turn,
            'wp_local_turn_port': current_config.wp_local_turn_port,
            'wp_turn_secret': current_config.wp_turn_secret,
            'wp_enable_upnp': current_config.wp_enable_upnp,
            'wp_use_hls': current_config.wp_use_hls,
            'wp_hls_bitrate': current_config.wp_hls_bitrate,
            'wp_hls_resolution': current_config.wp_hls_resolution
        })


@app.route('/api/start', methods=['POST'])
def start_pipeline():
    global pipeline_state, pipeline_thread
    
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
            'scan_depth': current_config.scan_depth,
            'multi_profile_policy': current_config.multi_profile_policy,
            'profile_target': current_config.profile_target,
            'multi_profile_min_keyframes': current_config.multi_profile_min_keyframes,
            'auto_name_folders': current_config.auto_name_folders,
            'only_name_unnamed': current_config.only_name_unnamed,
            'name_confidence_threshold': current_config.name_confidence_threshold,
            'name_search_delay': current_config.name_search_delay,
            'merge_on_name_conflict': current_config.merge_on_name_conflict,
            'default_video_player': current_config.default_video_player
        }
        
        # Check if Redis is running before attempting to use Celery
        redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
        use_celery = False
        try:
            import redis
            r = redis.Redis.from_url(redis_url, socket_timeout=1.0, socket_connect_timeout=1.0)
            r.ping()
            use_celery = True
        except Exception as e:
            logger.warning(f"Redis is not available ({e}). Falling back to local background thread.")

        if use_celery:
            try:
                # Trigger Celery task asynchronously
                from tasks import run_sorting_task
                task = run_sorting_task.delay(config_dict, WORKSPACE_DIR)
                
                # Reset state with task ID
                pipeline_state['running'] = True
                pipeline_state['stage'] = 'starting'
                pipeline_state['percent'] = 0.0
                pipeline_state['message'] = 'Sorting pipeline task triggered via Celery...'
                pipeline_state['task_id'] = task.id
                pipeline_state['detail'] = None
                pipeline_state['report'] = None
                
                # Clear log history so UI starts fresh
                ui_log_handler.logs.clear()
                
                return jsonify({
                    'status': 'success',
                    'message': 'Pipeline started via Celery.',
                    'task_id': task.id
                })
            except Exception as e:
                logger.error(f"Failed to start Celery task: {e}. Falling back to local background thread.")
                use_celery = False

        if not use_celery:
            # Fallback to local background thread
            pipeline_state['running'] = True
            pipeline_state['stage'] = 'starting'
            pipeline_state['percent'] = 0.0
            pipeline_state['message'] = 'Sorting pipeline task triggered locally...'
            pipeline_state['task_id'] = None
            pipeline_state['detail'] = None
            pipeline_state['report'] = None
            
            # Clear log history so UI starts fresh
            ui_log_handler.logs.clear()
            
            pipeline_thread = threading.Thread(
                target=run_pipeline_thread,
                args=(current_config,),
                daemon=True
            )
            pipeline_thread.start()
            
            return jsonify({
                'status': 'success',
                'message': 'Pipeline started in background thread.'
            })

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

@app.route('/api/system-info', methods=['GET'])
def get_system_info():
    """Detects system GPU name and checks if DirectML/GPU acceleration is active."""
    try:
        import subprocess
        import onnxruntime as ort
        
        # 1. Detect GPU Name on Windows via PowerShell
        gpu_name = "CPU Only"
        try:
            cmd = ["powershell", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            if proc.returncode == 0:
                lines = [line.strip() for line in proc.stdout.split('\n') if line.strip()]
                # Filter out basic display adapters
                filtered_lines = [l for l in lines if "Basic Display" not in l and l]
                if filtered_lines:
                    gpu_name = " + ".join(filtered_lines)
                elif lines:
                    gpu_name = lines[0]
        except Exception as e:
            logger.error(f"Error detecting GPU name: {e}")
            gpu_name = "Display Controller"
            
        # 2. Check if DirectML execution provider is available in onnxruntime
        available_providers = ort.get_available_providers()
        has_dml = 'DmlExecutionProvider' in available_providers
        
        acceleration = "DirectML Accelerated" if has_dml else "CPU Only"
        
        return jsonify({
            'status': 'success',
            'gpu_name': gpu_name,
            'acceleration': acceleration,
            'has_dml': has_dml
        })
    except Exception as e:
        logger.error(f"Error in get_system_info: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'gpu_name': 'Unknown GPU',
            'acceleration': 'CPU Only',
            'has_dml': False
        }), 500

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
    """Lists all sorted folders in the output directory with their file counts and enriched metadata."""
    output_dir = current_config.output_dir
    if not os.path.exists(output_dir):
        return jsonify({'folders': []})
    
    histories_by_folder = {}
    histories_by_path = {}
    membership_paths_by_folder = {}
    try:
        from utils.models import WatchHistory, PersistentProfile, ProcessedFile, ProfileMediaMembership
        all_histories = WatchHistory.query.all()
        for h in all_histories:
            histories_by_path[h.file_path] = h
            parts = h.file_path.split('/', 1)
            if len(parts) == 2:
                f_name = parts[0]
                if f_name not in histories_by_folder:
                    histories_by_folder[f_name] = []
                histories_by_folder[f_name].append(h)

        profiles_by_id = {p.id: p.folder_name for p in PersistentProfile.query.all()}
        for membership in ProfileMediaMembership.query.all():
            folder_name = profiles_by_id.get(membership.profile_id)
            if not folder_name:
                continue
            pf = ProcessedFile.query.get(membership.file_id)
            if not pf:
                continue
            abs_path = os.path.abspath(pf.file_path)
            if not abs_path.startswith(os.path.abspath(output_dir)) or not os.path.exists(abs_path):
                continue
            rel_path = os.path.relpath(abs_path, output_dir).replace('\\', '/')
            membership_paths_by_folder.setdefault(folder_name, set()).add(rel_path)
    except Exception as e:
        logger.error(f"Error loading watch history in list_folders: {e}")

    def format_size(bytes):
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes < 1024.0:
                return f"{bytes:.1f} {unit}" if unit != 'B' else f"{int(bytes)} B"
            bytes /= 1024.0
        return f"{bytes:.1f} TB"

    folders = []
    for name in sorted(os.listdir(output_dir), key=lambda s: s.lower()):
        folder_path = os.path.join(output_dir, name)
        if os.path.isdir(folder_path) and not name.startswith('.'):
            # Calculate total files and sizes
            files_in_folder = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f)) and not f.startswith('_')]
            visible_paths = {f"{name}/{f}" for f in files_in_folder}
            visible_paths.update(membership_paths_by_folder.get(name, set()))
            file_count = len(visible_paths)
            
            total_size_bytes = 0
            for f in files_in_folder:
                try:
                    total_size_bytes += os.path.getsize(os.path.join(folder_path, f))
                except Exception:
                    pass
            
            has_thumbnail = os.path.exists(os.path.join(folder_path, '_reference_face.jpg'))
            
            # Aggregate watch stats
            folder_histories = [
                histories_by_path[p]
                for p in visible_paths
                if p in histories_by_path
            ] or histories_by_folder.get(name, [])
            ratings = [h.rating for h in folder_histories if h.rating is not None]
            avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0.0
            watched_count = len(folder_histories)
            
            folders.append({
                'name': name,
                'file_count': file_count,
                'has_thumbnail': has_thumbnail,
                'avg_rating': avg_rating,
                'watched_count': watched_count,
                'total_size_bytes': total_size_bytes,
                'total_size_human': format_size(total_size_bytes)
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

@app.route('/api/duplicates/scan', methods=['POST'])
def start_duplicate_scan():
    """Triggers background duplicate finder scan."""
    from modules.duplicate_detector import DuplicateDetector
    success = DuplicateDetector.start_scan(app, current_config)
    if success:
        return jsonify({'status': 'success', 'message': 'Duplicate scan started.'})
    else:
        return jsonify({'status': 'error', 'message': 'Scan already in progress.'}), 400

@app.route('/api/duplicates/status', methods=['GET'])
def get_duplicate_status():
    """Queries duplicate finder scan status."""
    from modules.duplicate_detector import DuplicateDetector
    return jsonify(DuplicateDetector.state)

@app.route('/api/duplicates', methods=['GET'])
def get_duplicates():
    """Retrieves cached duplicate groups."""
    from modules.duplicate_detector import DuplicateDetector
    groups = DuplicateDetector.get_cached_duplicates()
    return jsonify({'status': 'success', 'groups': groups})

@app.route('/api/duplicates/resolve', methods=['POST'])
def resolve_duplicates():
    """Deletes specified duplicate files physically and metadata DB entries."""
    data = request.json
    if not data or 'files_to_delete' not in data:
        return jsonify({'status': 'error', 'message': 'No files specified.'}), 400
        
    files_to_delete = data.get('files_to_delete', [])
    deleted_count = 0
    errors = []
    
    from utils.models import ProcessedFile, WatchHistory, ProfileMediaMembership
    from modules.duplicate_detector import DuplicateDetector
    
    for file_path in files_to_delete:
        # Resolve path safely
        abs_path = os.path.abspath(file_path)
        if not abs_path.startswith(os.path.abspath(current_config.output_dir)):
            errors.append(f"Permission denied: {os.path.basename(file_path)} is outside output directory")
            continue
            
        if not os.path.exists(abs_path):
            errors.append(f"File not found: {os.path.basename(file_path)}")
            continue
            
        try:
            # 1. Delete from DB (cascade removes faces)
            db_file = ProcessedFile.query.filter_by(file_path=abs_path).first()
            if db_file:
                ProfileMediaMembership.query.filter_by(file_id=db_file.id).delete()
                db.session.delete(db_file)
                
            # Delete from WatchHistory (using relative path schema)
            rel_path = os.path.relpath(abs_path, current_config.output_dir).replace('\\', '/')
            history_item = WatchHistory.query.filter_by(file_path=rel_path).first()
            if history_item:
                db.session.delete(history_item)
                
            # 2. Delete physically from disk
            os.remove(abs_path)
            deleted_count += 1
            
        except Exception as e:
            logger.error(f"Failed to delete {abs_path}: {e}")
            errors.append(f"Failed to delete {os.path.basename(abs_path)}: {str(e)}")
            
    try:
        db.session.commit()
    except Exception as e:
        logger.error(f"Failed to commit database deletions: {e}")
        db.session.rollback()
        errors.append(f"Database commit error: {str(e)}")
        
    # Re-read cached duplicates to heal list and return updated groups
    groups = DuplicateDetector.get_cached_duplicates()
    
    return jsonify({
        'status': 'success' if not errors else ('partial' if deleted_count > 0 else 'error'),
        'deleted_count': deleted_count,
        'errors': errors,
        'groups': groups
    })

@app.route('/api/video-thumbnail/<folder_name>/<filename>')
def get_video_thumbnail(folder_name, filename):
    """Generates or retrieves a cached video thumbnail frame using FFmpeg."""
    if not is_safe_path_segment(folder_name) or not is_safe_path_segment(filename):
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
    if not is_safe_path_segment(folder_name) or not is_safe_path_segment(filename):
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
    if not is_safe_path_segment(folder_name):
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
    if not is_safe_path_segment(folder_name):
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
    if not is_safe_path_segment(folder_name) or not is_safe_path_segment(filename):
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
    if not is_safe_path_segment(cluster_folder):
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
                
    headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Content-Type': 'text/event-stream'
    }
    return Response(event_stream(), mimetype="text/event-stream", headers=headers)

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
    if not is_safe_path_segment(from_folder) or not is_safe_path_segment(to_folder):
        return jsonify({'status': 'error', 'message': 'Invalid paths'}), 400
        
    for filename in filenames:
        if not is_safe_path_segment(filename):
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
                # Move the physical file (try rename first)
                moved_successfully = False
                try:
                    os.rename(src_file, dest_file)
                    logger.info(f"Moved physical file: {src_file} -> {dest_file}")
                    moved_successfully = True
                except Exception as rename_err:
                    logger.warning(f"Rename failed for {filename}: {rename_err}. Trying copy + delete fallback...")
                    import shutil
                    try:
                        shutil.copy2(src_file, dest_file)
                        logger.info(f"Copied physical file: {src_file} -> {dest_file}")
                        moved_successfully = True
                        
                        # Try to remove original
                        try:
                            os.remove(src_file)
                            logger.info(f"Deleted source file after copy: {src_file}")
                        except Exception as del_err:
                            logger.warning(f"Could not delete source file {src_file} immediately: {del_err}. It will remain for manual cleanup.")
                    except Exception as copy_err:
                        logger.error(f"Copy + delete fallback failed for {filename}: {copy_err}")
                        raise copy_err
                
                if moved_successfully:
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
            
        if successes:
            try:
                from modules.profile_manager import auto_extract_avatar
                if os.path.exists(os.path.join(current_config.output_dir, from_folder)):
                    auto_extract_avatar(from_folder, cache_db, current_config)
                if os.path.exists(os.path.join(current_config.output_dir, to_folder)):
                    auto_extract_avatar(to_folder, cache_db, current_config)
            except Exception as avatar_err:
                logger.error(f"Failed to auto-update avatars after move: {avatar_err}")

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
    if not is_safe_path_segment(old_name) or not is_safe_path_segment(new_name):
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


@app.route('/api/delete-folder', methods=['POST'])
def delete_folder_api():
    """Deletes an entire identity directory physically and cleans up its database references."""
    data = request.json or {}
    folder_name = data.get('folder_name')
    if not folder_name:
        return jsonify({'status': 'error', 'message': 'folder_name parameter is required'}), 400
        
    if not is_safe_path_segment(folder_name):
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
        
    folder_path = os.path.abspath(os.path.join(current_config.output_dir, folder_name))
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        return jsonify({'status': 'error', 'message': f'Folder {folder_name} not found'}), 404
        
    try:
        from utils.models import ProcessedFile, WatchHistory, PersistentProfile, db
        import shutil
        
        # 1. Database Cleanup
        # Remove ProcessedFile records belonging to this directory (cascades delete on faces and media memberships)
        db_files = ProcessedFile.query.filter(ProcessedFile.file_path.like(f"{folder_path}%")).all()
        for f in db_files:
            db.session.delete(f)
            
        # Delete corresponding WatchHistory entries
        db_history = WatchHistory.query.filter(WatchHistory.file_path.like(f"{folder_name}/%")).all()
        for h in db_history:
            db.session.delete(h)
            
        # Delete profile mapping from db
        profile = PersistentProfile.query.filter_by(folder_name=folder_name).first()
        if profile:
            db.session.delete(profile)
            
        db.session.commit()
        
        # 2. Disk Cleanup
        shutil.rmtree(folder_path)
        logger.info(f"Successfully deleted folder and database profile registry for: {folder_name}")
        
        return jsonify({'status': 'success', 'message': f'Folder {folder_name} successfully deleted.'})
    except Exception as e:
        logger.error(f"Error during folder deletion: {e}")
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/delete-media', methods=['POST'])
def delete_media_api():
    """Deletes one or more files physically and cleans up database references. If directory becomes empty, it cleans up the directory."""
    data = request.json or {}
    folder_name = data.get('folder_name')
    filenames = data.get('filenames')
    
    if not folder_name or not filenames:
        return jsonify({'status': 'error', 'message': 'folder_name and filenames are required'}), 400
        
    if not is_safe_path_segment(folder_name):
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
        
    for filename in filenames:
        if not is_safe_path_segment(filename):
            return jsonify({'status': 'error', 'message': f'Invalid filename: {filename}'}), 400
            
    try:
        from utils.models import ProcessedFile, WatchHistory, PersistentProfile, db
        import shutil
        
        deleted_count = 0
        for filename in filenames:
            file_path = os.path.abspath(os.path.join(current_config.output_dir, folder_name, filename))
            if not os.path.exists(file_path):
                logger.warning(f"File not found during delete-media: {file_path}")
                continue
                
            # 1. Delete physical file
            os.remove(file_path)
            deleted_count += 1
            
            # 2. Database Cleanup
            pf = ProcessedFile.query.filter_by(file_path=file_path).first()
            if pf:
                db.session.delete(pf)
                
            wh = WatchHistory.query.filter_by(file_path=f"{folder_name}/{filename}").first()
            if wh:
                db.session.delete(wh)
                
        db.session.commit()
        
        # 3. Check if directory is now empty (excluding metadata starting with '_')
        folder_path = os.path.abspath(os.path.join(current_config.output_dir, folder_name))
        if os.path.exists(folder_path):
            remaining = [f for f in os.listdir(folder_path) if not f.startswith('_')]
            if len(remaining) == 0:
                # Remove profile mapping from db
                profile = PersistentProfile.query.filter_by(folder_name=folder_name).first()
                if profile:
                    db.session.delete(profile)
                    db.session.commit()
                # Clean up the empty folder
                shutil.rmtree(folder_path)
                logger.info(f"Cleaned up empty directory after media deletion: {folder_name}")
                
        return jsonify({
            'status': 'success',
            'message': f'Successfully deleted {deleted_count} file(s).'
        })
    except Exception as e:
        logger.error(f"Error during media deletion: {e}")
        db.session.rollback()
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


@app.route('/api/search-by-image', methods=['POST'])
def search_by_image():
    """Detects faces in the uploaded image, matches them to database profiles, and returns matched folders."""
    if 'image' not in request.files:
        return jsonify({'status': 'error', 'message': 'No image file uploaded'}), 400
        
    image_file = request.files['image']
    if image_file.filename == '':
        return jsonify({'status': 'error', 'message': 'Empty file selected'}), 400
        
    try:
        # Save temp file
        temp_dir = os.path.join(WORKSPACE_DIR, ".cache")
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, "temp_search_query.jpg")
        image_file.save(temp_path)
        
        # Analyze face
        from modules.face_analyzer import FaceAnalyzer
        analyzer = FaceAnalyzer(current_config)
        faces = analyzer.analyze_image(temp_path)
        
        # Clean up temp file
        try:
            os.remove(temp_path)
        except Exception:
            pass
            
        if not faces:
            return jsonify({'status': 'error', 'message': 'No faces detected in the uploaded image.'}), 400
            
        # Get the largest face
        faces.sort(key=lambda f: (f['bbox'][2] - f['bbox'][0]) * (f['bbox'][3] - f['bbox'][1]), reverse=True)
        query_face = faces[0]
        query_emb = query_face['embedding']
        
        # Retrieve all persistent profiles
        from utils.models import PersistentProfile, WatchHistory
        import numpy as np
        
        db_profiles = PersistentProfile.query.all()
        matches = []
        for p in db_profiles:
            p_emb = np.frombuffer(p.embedding_blob, dtype=np.float32)
            dist = np.linalg.norm(query_emb - p_emb)
            # Normalize to 0-1 similarity percentage
            similarity = max(0.0, 1.0 - (dist / 2.0))
            matches.append({
                'folder_name': p.folder_name,
                'display_folder_name': p.folder_name.replace('_', ' ').strip(),
                'distance': float(dist),
                'similarity_score': float(similarity)
            })
            
        # Sort matches by similarity score descending (distance ascending)
        matches.sort(key=lambda m: m['distance'])
        
        # Filter matches (e.g. similarity >= 0.4, or just return top 5)
        top_matches = matches[:5]
        
        # Pull files from the top match (if similarity is strong enough)
        results = []
        if top_matches and top_matches[0]['distance'] <= 1.2:
            top_folder = top_matches[0]['folder_name']
            output_dir = os.path.abspath(current_config.output_dir)
            top_folder_path = os.path.join(output_dir, top_folder)
            
            if os.path.exists(top_folder_path):
                try:
                    for filename in os.listdir(top_folder_path):
                        if filename.startswith('.') or filename.startswith('_'):
                            continue
                        file_path = os.path.join(top_folder_path, filename)
                        if os.path.isfile(file_path):
                            ext = os.path.splitext(filename)[1].lower()
                            is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                            
                            item = {
                                'filename': filename,
                                'folder_name': top_folder,
                                'display_folder_name': top_folder.replace('_', ' ').strip(),
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
                            
                            # Inject watch progress
                            key = f"{top_folder}/{filename}"
                            watch_record = WatchHistory.query.filter_by(file_path=key).first()
                            if watch_record:
                                watch_info = item['watch_progress']
                                watch_info['playback_position'] = watch_record.playback_position
                                watch_info['duration'] = watch_record.duration
                                watch_info['is_completed'] = watch_record.is_completed
                                if watch_record.duration > 0:
                                    watch_info['progress_percent'] = int((watch_record.playback_position / watch_record.duration) * 100)
                                    
                            results.append(item)
                except Exception as scan_ex:
                    logger.error(f"Error scanning matching folder {top_folder}: {scan_ex}")
                    
        return jsonify({
            'status': 'success',
            'matches': top_matches,
            'results': sorted(results, key=lambda r: r['filename'])[:100]
        })
    except Exception as e:
        logger.error(f"Error in search-by-image endpoint: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/profiles', methods=['GET'])
def list_profiles():
    """Lists all face profiles, synchronized from output folder and DB."""
    try:
        from pipeline import SortingPipeline
        from utils.cache import EmbeddingCache
        
        cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
        cache_db = EmbeddingCache(cache_dir)
        
        # Load and sync profiles using pipeline's sync mechanism
        pipeline = SortingPipeline(current_config, WORKSPACE_DIR, flask_app=app)
        db_profiles = pipeline._load_and_sync_profiles()
        
        # Optimize: Query genders in a single bulk SQL join query to avoid O(N) database queries in a loop
        gender_map = {}
        try:
            from utils.models import ProfileMediaMembership, Face
            # Retrieve one face gender per profile using fast database indexes
            results = db.session.query(
                ProfileMediaMembership.profile_id,
                Face.gender
            ).join(
                Face, Face.file_id == ProfileMediaMembership.file_id
            ).group_by(
                ProfileMediaMembership.profile_id
            ).all()
            for p_id, g in results:
                if g:
                    gender_map[p_id] = g
        except Exception as ge:
            logger.error(f"Failed to bulk query profile genders: {ge}")
            
        profiles = []
        for p in db_profiles:
            folder_name = p['folder_name']
            profile_id = p['profile_id']
            
            # Count files in output folder physically
            folder_path = os.path.join(current_config.output_dir, folder_name)
            media_count = 0
            has_thumbnail = False
            
            if os.path.exists(folder_path):
                files_in_folder = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f)) and not f.startswith('_')]
                media_count = len(files_in_folder)
                has_thumbnail = os.path.exists(os.path.join(folder_path, '_reference_face.jpg'))
            
            # Use pre-fetched gender guess (defaults to 'female')
            gender = gender_map.get(profile_id, 'female')
                
            profiles.append({
                'id': profile_id,
                'folder_name': folder_name,
                'display_name': folder_name.replace('_', ' ').strip(),
                'media_count': media_count,
                'has_thumbnail': has_thumbnail,
                'gender': gender,
                'avatar_url': f"/api/thumbnail/{folder_name}" if has_thumbnail else None
            })
            
        # Sort by profile ID
        profiles.sort(key=lambda x: x['id'])
        return jsonify({'status': 'success', 'profiles': profiles})
    except Exception as e:
        logger.error(f"Error in list_profiles: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/profile/<folder_name>/media', methods=['GET'])
def list_profile_media(folder_name):
    """Returns all media files containing this profile's face across all folders."""
    if not is_safe_path_segment(folder_name):
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
        
    try:
        from utils.cache import EmbeddingCache
        from modules.profile_manager import get_profile_media
        
        cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
        cache_db = EmbeddingCache(cache_dir)
        media_files = get_profile_media(folder_name, cache_db, current_config)
        return jsonify({'status': 'success', 'files': media_files})
    except Exception as e:
        logger.error(f"Error in list_profile_media for {folder_name}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


import queue

transcode_queue = queue.Queue()
active_transcode_task = None
transcode_lock = threading.Lock()

def hls_transcode_worker():
    """Background worker that serializes FFmpeg HLS transcoding tasks."""
    global active_transcode_task
    while True:
        try:
            task = transcode_queue.get()
            if task is None:
                break
                
            folder_name, filename, input_path, hls_dir, playlist_path = task
            with transcode_lock:
                active_transcode_task = {
                    'folder_name': folder_name,
                    'filename': filename
                }
            
            logger.info(f"Starting HLS transcoding for {folder_name}/{filename}")
            os.makedirs(hls_dir, exist_ok=True)
            
            res_val = current_config.wp_hls_resolution.split('x')[1] if 'x' in current_config.wp_hls_resolution else '720'
            cmd = [
                'ffmpeg', '-y', '-i', input_path,
                '-codec:v', 'libx264', '-profile:v', 'main', '-level', '3.1',
                '-preset', 'veryfast', '-b:v', current_config.wp_hls_bitrate,
                '-maxrate', current_config.wp_hls_bitrate, '-bufsize', '5000k',
                '-vf', f'scale=-2:{res_val}',
                '-codec:a', 'aac', '-b:a', '128k',
                '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'event',
                '-hls_segment_filename', os.path.join(hls_dir, 'seg%03d.ts'),
                playlist_path
            ]
            
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo)
            if res.returncode == 0:
                logger.info(f"Successfully transcoded {folder_name}/{filename} to HLS")
            else:
                logger.error(f"FFmpeg HLS error for {filename}: {res.stderr.decode('utf-8', errors='ignore')}")
                
        except Exception as e:
            logger.error(f"Error in HLS transcode worker: {e}")
        finally:
            with transcode_lock:
                active_transcode_task = None
            transcode_queue.task_done()

# Start background transcoding thread
transcode_t = threading.Thread(target=hls_transcode_worker, daemon=True)
transcode_t.start()


@app.route('/api/watch-party/<party_id>/transcode', methods=['POST'])
def transcode_video_api(party_id):
    """Triggers HLS transcoding for a specific video file if enabled and not already cached."""
    data = request.json or {}
    folder_name = data.get('folder_name')
    filename = data.get('filename')
    
    if not folder_name or not filename:
        return jsonify({'status': 'error', 'message': 'folder_name and filename are required'}), 400
        
    if not is_safe_path_segment(folder_name) or not is_safe_path_segment(filename):
        return jsonify({'status': 'error', 'message': 'Invalid path parameters'}), 400
        
    # Check if HLS is enabled
    if not current_config.wp_use_hls:
        return jsonify({'status': 'skipped', 'message': 'HLS transcoding is disabled.'})
        
    try:
        input_path = os.path.join(current_config.output_dir, folder_name, filename)
        if not os.path.exists(input_path):
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
            
        filename_no_ext = os.path.splitext(filename)[0]
        hls_dir = os.path.join(current_config.output_dir, ".hls_cache", folder_name, filename_no_ext)
        playlist_path = os.path.join(hls_dir, "playlist.m3u8")
        hls_url = f"/media/.hls_cache/{folder_name}/{filename_no_ext}/playlist.m3u8"
        
        # Check if already completed
        if os.path.exists(playlist_path):
            return jsonify({'status': 'ready', 'hls_url': hls_url})
            
        # Add to transcode queue if not already there
        in_queue = False
        with transcode_lock:
            if active_transcode_task and active_transcode_task['folder_name'] == folder_name and active_transcode_task['filename'] == filename:
                in_queue = True
                
        if not in_queue:
            task = (folder_name, filename, input_path, hls_dir, playlist_path)
            transcode_queue.put(task)
            
        return jsonify({'status': 'converting', 'hls_url': hls_url, 'message': 'Optimizing video for streaming...'})
    except Exception as e:
        logger.error(f"Error in transcode_video_api: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500



@app.route('/api/profile/extract-avatar', methods=['POST'])
def extract_profile_avatar_api():
    """Triggers auto-avatar extraction based on highest confidence face detection."""
    data = request.json
    folder_name = data.get('folder_name')
    if not folder_name:
        return jsonify({'status': 'error', 'message': 'Missing folder_name'}), 400
        
    if not is_safe_path_segment(folder_name):
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
        
    try:
        from utils.cache import EmbeddingCache
        from modules.profile_manager import auto_extract_avatar
        
        folder_path = os.path.join(current_config.output_dir, folder_name)
        if not os.path.exists(folder_path):
            return jsonify({'status': 'error', 'message': f'Profile folder "{folder_name}" does not exist.'}), 404
            
        files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f)) and not f.startswith('_')]
        if not files:
            return jsonify({'status': 'error', 'message': 'Profile folder is empty. Drop files into this profile first to set an avatar.'}), 400
            
        cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
        cache_db = EmbeddingCache(cache_dir)
        
        success = auto_extract_avatar(folder_name, cache_db, current_config, force=True)
        if success:
            return jsonify({'status': 'success', 'message': f'Avatar updated successfully for {folder_name}'})
        else:
            return jsonify({'status': 'error', 'message': 'Failed to extract avatar. Make sure the folder contains valid, uncorrupted video or image files.'}), 400
    except Exception as e:
        logger.error(f"Error in extract_profile_avatar_api: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/profiles/index', methods=['POST'])
def start_library_indexing():
    """Starts background library indexing of output folder for face cache."""
    try:
        from utils.cache import EmbeddingCache
        from modules.profile_manager import LibraryIndexer
        
        cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
        cache_db = EmbeddingCache(cache_dir)
        
        started = LibraryIndexer.start_indexing(app, cache_db, current_config)
        if started:
            return jsonify({'status': 'success', 'message': 'Library indexing started in background.'})
        else:
            return jsonify({'status': 'error', 'message': 'Library indexing is already running.'}), 400
    except Exception as e:
        logger.error(f"Error starting library indexing: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/profiles/index/status', methods=['GET'])
def get_library_indexing_status():
    """Returns status of library indexing background task."""
    try:
        from modules.profile_manager import LibraryIndexer
        return jsonify({'status': 'success', 'state': LibraryIndexer.state})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/profiles/merge', methods=['POST'])
def merge_profiles_api():
    """Merges two face profiles together, physically merging folders and regenerating average embedding."""
    data = request.json
    source_folder = data.get('source_folder')
    target_folder = data.get('target_folder')
    
    if not source_folder or not target_folder:
        return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400
        
    if not is_safe_path_segment(source_folder) or not is_safe_path_segment(target_folder):
        return jsonify({'status': 'error', 'message': 'Invalid paths'}), 400
        
    try:
        from modules.name_resolver import merge_folders_manual
        result = merge_folders_manual(current_config.output_dir, [source_folder, target_folder], target_folder)
        
        if result.get('status') == 'success':
            from utils.cache import EmbeddingCache
            from modules.profile_manager import auto_extract_avatar
            
            cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
            cache_db = EmbeddingCache(cache_dir)
            auto_extract_avatar(target_folder, cache_db, current_config)
            
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error merging profiles {source_folder} -> {target_folder}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


import uuid
import hashlib
from datetime import datetime, timedelta
import queue

# In-memory watch party active connections
watch_parties_state = {}
watch_parties_lock = threading.Lock()

@app.route('/api/watch-party/upload', methods=['POST'])
def upload_watch_party_media():
    """Uploads a custom video or image for a watch party session (admin only, before creation)."""
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file uploaded'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
    try:
        from werkzeug.utils import secure_filename
        import uuid
        
        orig_filename = secure_filename(file.filename)
        unique_id = str(uuid.uuid4())[:8]
        filename = f"{unique_id}_{orig_filename}"
        
        # Create a unique subfolder inside output_dir for this upload
        party_folder_id = f"single_{str(uuid.uuid4())}"
        target_dir = os.path.join(current_config.output_dir, party_folder_id)
        os.makedirs(target_dir, exist_ok=True)
        
        file_path = os.path.join(target_dir, filename)
        file.save(file_path)
        
        logger.info(f"Custom watch party media saved to {file_path}")
        return jsonify({
            'status': 'success',
            'filename': filename,
            'folder_name': party_folder_id
        })
    except Exception as e:
        logger.error(f"Error uploading custom party media: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/create', methods=['POST'])
def create_watch_party():
    """Generates a new watch party with optional password protection."""
    cleanup_expired_parties()
    data = request.json or {}
    folder_name = data.get('folder_name')
    password = data.get('password')
    filename = data.get('filename')
    
    if not folder_name:
        return jsonify({'status': 'error', 'message': 'Folder name is required'}), 400
        
    if not is_safe_path_segment(folder_name):
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
 
    try:
        from utils.models import WatchParty
        party_id = str(uuid.uuid4())
        admin_token = str(uuid.uuid4())
        
        # Optional password hashing
        password_hash = None
        if password:
            password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
            
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        party = WatchParty(
            id=party_id,
            folder_name=folder_name,
            password_hash=password_hash,
            admin_token=admin_token,
            expires_at=expires_at
        )
        
        db.session.add(party)
        db.session.commit()
        
        # Initialize in-memory state
        with watch_parties_lock:
            watch_parties_state[party_id] = {
                'admin_token': admin_token,
                'clients': {},
                'playback_state': {
                    'filename': filename,
                    'position': 0.0,
                    'playing': False,
                    'last_updated': time.time()
                },
                'playback_locked': False,
                'slow_mode': False,
                'kicked_clients': [],
                'cooldowns': {}
            }
            
        logger.info(f"Watch party {party_id} created for folder {folder_name} (expires: {expires_at})")
        # Check if public tunnel is active, return absolute public URL if so
        res_data = {
            'status': 'success',
            'party_id': party_id,
            'admin_token': admin_token,
            'url': f"/watch-party/{party_id}",
            'password_protected': password is not None and len(password) > 0
        }
        if public_tunnel_url:
            res_data['public_url'] = f"{public_tunnel_url}/watch-party/{party_id}"
            
        return jsonify(res_data)
    except Exception as e:
        logger.error(f"Error creating watch party: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/watch-party/<party_id>')
def watch_party_page(party_id):
    """Serves the standalone watch party viewer template."""
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return "Watch party not found or expired", 404
            
        return render_template('watch_party.html', party_id=party_id, folder_name=party.folder_name)
    except Exception as e:
        logger.error(f"Error loading watch party template: {e}")
        return str(e), 500


@app.route('/api/watch-party/<party_id>/auth', methods=['POST'])
def auth_watch_party(party_id):
    """Verifies the password for password-protected watch parties."""
    data = request.json or {}
    password = data.get('password', '')
    
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if not party.password_hash:
            return jsonify({'status': 'success', 'authenticated': True})
            
        input_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
        if input_hash == party.password_hash:
            return jsonify({'status': 'success', 'authenticated': True})
        else:
            return jsonify({'status': 'error', 'message': 'Incorrect password'}), 401
    except Exception as e:
        logger.error(f"Error authenticating watch party: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/stream')
def stream_watch_party(party_id):
    """SSE endpoint for streaming playback state, participants, and WebRTC signals."""
    client_id = request.args.get('client_id')
    client_name = request.args.get('client_name', 'Viewer')
    admin_token = request.args.get('admin_token')
    
    if not client_id:
        return "client_id is required", 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return "Watch party not found or expired", 404
    except Exception as e:
        logger.error(f"DB error checking watch party: {e}")
        return "Server Error", 500

    is_admin = False
    with watch_parties_lock:
        if party_id in watch_parties_state:
            party_state = watch_parties_state[party_id]
            if client_id in party_state.get('kicked_clients', []):
                return "You have been kicked from this party", 403
            if admin_token and party_state.get('admin_token') == admin_token:
                is_admin = True
        else:
            if admin_token and party.admin_token == admin_token:
                is_admin = True

    def event_stream():
        q = queue.Queue()
        
        with watch_parties_lock:
            # Reinitialize state if server was restarted
            if party_id not in watch_parties_state:
                watch_parties_state[party_id] = {
                    'admin_token': party.admin_token,
                    'clients': {},
                    'playback_state': {
                        'filename': None,
                        'position': 0.0,
                        'playing': False,
                        'last_updated': time.time()
                    },
                    'playback_locked': False,
                    'slow_mode': False,
                    'kicked_clients': [],
                    'cooldowns': {}
                }
                
            party_state = watch_parties_state[party_id]
            
            # Register new client
            party_state['clients'][client_id] = {
                'name': client_name,
                'queue': q,
                'last_seen': time.time(),
                'is_admin': is_admin
            }
            
            # Broadcast join event to all other clients
            join_msg = {
                'type': 'peer_joined',
                'client_id': client_id,
                'name': client_name,
                'is_admin': is_admin
            }
            for c_id, client in party_state['clients'].items():
                if c_id != client_id:
                    client['queue'].put(join_msg)
                    
            # Queue current playback state to new client
            q.put({
                'type': 'init',
                'playback_state': party_state['playback_state'],
                'playback_locked': party_state.get('playback_locked', False),
                'slow_mode': party_state.get('slow_mode', False),
                'is_admin': is_admin,
                'peers': [{'client_id': c_id, 'name': c['name'], 'is_admin': c.get('is_admin', False)} for c_id, c in party_state['clients'].items() if c_id != client_id]
            })
            
        logger.info(f"Client {client_name} ({client_id}) connected to watch party {party_id} (is_admin: {is_admin})")
        
        try:
            while True:
                try:
                    # Retrieve pending messages with a short timeout to handle socket check
                    msg = q.get(timeout=2.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                except queue.Empty:
                    # Send a heartbeat to keep connection alive
                    yield "data: {\"type\": \"ping\"}\n\n"
                    
                # Update last seen to keep active user registry healthy
                with watch_parties_lock:
                    if party_id in watch_parties_state and client_id in watch_parties_state[party_id]['clients']:
                        watch_parties_state[party_id]['clients'][client_id]['last_seen'] = time.time()
                        
        except GeneratorExit:
            # Handle client disconnection
            with watch_parties_lock:
                if party_id in watch_parties_state:
                    party_state = watch_parties_state[party_id]
                    if client_id in party_state['clients']:
                        del party_state['clients'][client_id]
                        
                        # Broadcast leave event
                        leave_msg = {
                            'type': 'peer_left',
                            'client_id': client_id,
                            'name': client_name
                        }
                        for c_id, client in party_state['clients'].items():
                            client['queue'].put(leave_msg)
                            
            logger.info(f"Client {client_name} ({client_id}) disconnected from watch party {party_id}")
            
    headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Content-Type': 'text/event-stream'
    }
    return Response(event_stream(), mimetype="text/event-stream", headers=headers)


@app.route('/api/watch-party/<party_id>/sync', methods=['POST'])
def sync_watch_party(party_id):
    """Receives and broadcasts playback actions (play, pause, seek) to all watch party clients."""
    data = request.json or {}
    client_id = data.get('client_id')
    action = data.get('action') # 'play' | 'pause' | 'seek'
    position = data.get('position', 0.0)
    filename = data.get('filename')
    
    if not client_id:
        return jsonify({'status': 'error', 'message': 'client_id is required'}), 400

    with watch_parties_lock:
        if party_id not in watch_parties_state:
            return jsonify({'status': 'error', 'message': 'Watch party state not initialized'}), 404
            
        party_state = watch_parties_state[party_id]
        
        # Check if playback is locked to admin only
        if party_state.get('playback_locked', False):
            client_info = party_state['clients'].get(client_id)
            is_admin = client_info.get('is_admin', False) if client_info else False
            if not is_admin:
                return jsonify({'status': 'ignored', 'message': 'Playback is locked by admin'}), 200
                
        # Update playback state
        party_state['playback_state'] = {
            'filename': filename,
            'position': position,
            'playing': action == 'play',
            'last_updated': time.time()
        }
        
        # Broadcast event to other clients
        sync_msg = {
            'type': 'sync',
            'action': action,
            'position': position,
            'filename': filename,
            'sender_id': client_id
        }
        for c_id, client in party_state['clients'].items():
            if c_id != client_id:
                client['queue'].put(sync_msg)
                
    return jsonify({'status': 'success'})


@app.route('/api/watch-party/<party_id>/chat', methods=['POST'])
def chat_watch_party(party_id):
    """Receives a chat message from a client and broadcasts it to all other clients in the party."""
    data = request.json or {}
    client_id = data.get('client_id')
    client_name = data.get('client_name')
    message = data.get('message')
    
    if not client_id or not client_name or not message:
        return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400
        
    with watch_parties_lock:
        if party_id not in watch_parties_state:
            return jsonify({'status': 'error', 'message': 'Watch party not active'}), 404
            
        party_state = watch_parties_state[party_id]
        
        # Check if client was kicked
        if client_id in party_state.get('kicked_clients', []):
            return jsonify({'status': 'error', 'message': 'You have been kicked from this party'}), 403
            
        client_info = party_state['clients'].get(client_id)
        is_admin = client_info.get('is_admin', False) if client_info else False
        
        # Enforce slow mode cooldown for non-admin
        if party_state.get('slow_mode', False) and not is_admin:
            now = time.time()
            cooldowns = party_state.setdefault('cooldowns', {})
            last_chat_time = cooldowns.get(client_id, 0)
            if now - last_chat_time < 10.0:
                remaining = int(10.0 - (now - last_chat_time))
                return jsonify({'status': 'error', 'message': f'Slow mode active. Please wait {remaining}s.'}), 429
            cooldowns[client_id] = now
            
        message_id = str(uuid.uuid4())
        chat_msg = {
            'type': 'chat',
            'message_id': message_id,
            'sender_id': client_id,
            'sender_name': client_name,
            'message': message,
            'time': time.strftime('%H:%M'),
            'is_admin': is_admin
        }
        
        for c_id, client in party_state['clients'].items():
            if c_id != client_id:
                client['queue'].put(chat_msg)
                
    return jsonify({'status': 'success', 'message_id': message_id})


@app.route('/api/watch-party/<party_id>/is-admin', methods=['POST'])
def check_watch_party_admin(party_id):
    """Checks if the provided token matches the admin token of the watch party."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    
    if not admin_token:
        return jsonify({'status': 'error', 'message': 'admin_token is required'}), 400
        
    with watch_parties_lock:
        if party_id not in watch_parties_state:
            try:
                from utils.models import WatchParty
                party = WatchParty.query.get(party_id)
                if not party or party.expires_at < datetime.utcnow():
                    return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
                
                watch_parties_state[party_id] = {
                    'admin_token': party.admin_token,
                    'clients': {},
                    'playback_state': {
                        'filename': None,
                        'position': 0.0,
                        'playing': False,
                        'last_updated': time.time()
                    },
                    'playback_locked': False,
                    'slow_mode': False,
                    'kicked_clients': [],
                    'cooldowns': {}
                }
            except Exception as e:
                return jsonify({'status': 'error', 'message': f'DB error: {e}'}), 500
                
        party_state = watch_parties_state[party_id]
        is_admin = party_state.get('admin_token') == admin_token
        
    return jsonify({'status': 'success', 'is_admin': is_admin})


@app.route('/api/watch-party/<party_id>/change-folder', methods=['POST'])
def change_watch_party_folder(party_id):
    """Changes the active folder of the watch party (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    new_folder_name = data.get('folder_name')
    
    if not admin_token or not new_folder_name:
        return jsonify({'status': 'error', 'message': 'admin_token and folder_name are required'}), 400
        
    if not is_safe_path_segment(new_folder_name):
        return jsonify({'status': 'error', 'message': 'Invalid folder name'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        party.folder_name = new_folder_name
        db.session.commit()
        
        from utils.cache import EmbeddingCache
        from modules.profile_manager import get_profile_media
        
        cache_dir = os.path.join(WORKSPACE_DIR, ".cache")
        cache_db = EmbeddingCache(cache_dir)
        new_media_files = get_profile_media(new_folder_name, cache_db, current_config)
        
        with watch_parties_lock:
            if party_id not in watch_parties_state:
                watch_parties_state[party_id] = {
                    'admin_token': party.admin_token,
                    'clients': {},
                    'playback_state': {
                        'filename': None,
                        'position': 0.0,
                        'playing': False,
                        'last_updated': time.time()
                    },
                    'playback_locked': False,
                    'slow_mode': False,
                    'kicked_clients': [],
                    'cooldowns': {}
                }
            
            party_state = watch_parties_state[party_id]
            party_state['playback_state'] = {
                'filename': new_media_files[0]['filename'] if new_media_files else None,
                'position': 0.0,
                'playing': False,
                'last_updated': time.time()
            }
            
            # Broadcast folder change over Socket.IO room
            socketio.emit('folder_changed', {
                'folder_name': new_folder_name,
                'files': new_media_files,
                'sender_id': 'system'
            }, to=party_id)
                
        logger.info(f"Watch party {party_id} active folder changed to {new_folder_name} by admin")
        return jsonify({'status': 'success', 'files': new_media_files})
        
    except Exception as e:
        logger.error(f"Error changing folder for watch party {party_id}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/kick', methods=['POST'])
def kick_watch_party_client(party_id):
    """Kicks a client from the watch party (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    target_client_id = data.get('client_id')
    
    if not admin_token or not target_client_id:
        return jsonify({'status': 'error', 'message': 'admin_token and client_id are required'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        with watch_parties_lock:
            if party_id not in watch_parties_state:
                return jsonify({'status': 'error', 'message': 'Watch party not active'}), 404
                
            party_state = watch_parties_state[party_id]
            kicked_clients = party_state.setdefault('kicked_clients', [])
            if target_client_id not in kicked_clients:
                kicked_clients.append(target_client_id)
                
            if target_client_id in party_state['clients']:
                target_client = party_state['clients'][target_client_id]
                # Queue kick event to the target client
                # Emit direct kick to target client over Socket.IO
                socketio.emit('kicked_direct', {}, to=target_client['sid'])
                
                # Immediately remove from clients list to update participant UI instantly
                kicked_name = target_client['name']
                del party_state['clients'][target_client_id]
                
                # Broadcast departure event to all remaining participants over Socket.IO room
                socketio.emit('peer_left', {
                    'client_id': target_client_id,
                    'name': kicked_name
                }, to=party_id)
                
        logger.info(f"Client {target_client_id} kicked and removed from watch party {party_id} by admin")
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error kicking client: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/force-mute', methods=['POST'])
def force_mute_watch_party_client(party_id):
    """Force-mutes a client's audio (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    target_client_id = data.get('client_id')
    
    if not admin_token or not target_client_id:
        return jsonify({'status': 'error', 'message': 'admin_token and client_id are required'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        with watch_parties_lock:
            if party_id not in watch_parties_state:
                return jsonify({'status': 'error', 'message': 'Watch party not active'}), 404
                
            party_state = watch_parties_state[party_id]
            if target_client_id in party_state['clients']:
                socketio.emit('force_mute', {}, to=party_state['clients'][target_client_id]['sid'])
                
        logger.info(f"Client {target_client_id} force muted in watch party {party_id} by admin")
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error force muting client: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/playback-lock', methods=['POST'])
def toggle_playback_lock(party_id):
    """Enables or disables playback sync locking for non-admins (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    locked = data.get('locked', False)
    
    if not admin_token:
        return jsonify({'status': 'error', 'message': 'admin_token is required'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        with watch_parties_lock:
            if party_id not in watch_parties_state:
                return jsonify({'status': 'error', 'message': 'Watch party not active'}), 404
                
            party_state = watch_parties_state[party_id]
            party_state['playback_locked'] = locked
            
            # Broadcast the change in locking status over Socket.IO room
            socketio.emit('playback_locked', {
                'locked': locked
            }, to=party_id)
                
        logger.info(f"Playback lock in watch party {party_id} set to {locked} by admin")
        return jsonify({'status': 'success', 'locked': locked})
    except Exception as e:
        logger.error(f"Error toggling playback lock: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/delete-message', methods=['POST'])
def delete_chat_message(party_id):
    """Deletes a message from the chat logs across all connected clients (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    message_id = data.get('message_id')
    
    if not admin_token or not message_id:
        return jsonify({'status': 'error', 'message': 'admin_token and message_id are required'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        with watch_parties_lock:
            if party_id not in watch_parties_state:
                return jsonify({'status': 'error', 'message': 'Watch party not active'}), 404
                
            party_state = watch_parties_state[party_id]
            # Broadcast message deletion over Socket.IO room
            socketio.emit('chat_delete', {
                'message_id': message_id
            }, to=party_id)
                
        logger.info(f"Message {message_id} deleted in watch party {party_id} by admin")
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error deleting chat message: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/settings', methods=['POST'])
def update_watch_party_settings(party_id):
    """Updates watch party chat modes (slow mode, clear chat, password settings) (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    
    if not admin_token:
        return jsonify({'status': 'error', 'message': 'admin_token is required'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        slow_mode = data.get('slow_mode')
        clear_chat = data.get('clear_chat', False)
        new_password = data.get('password')
        
        with watch_parties_lock:
            if party_id not in watch_parties_state:
                return jsonify({'status': 'error', 'message': 'Watch party not active'}), 404
                
            party_state = watch_parties_state[party_id]
            
            if slow_mode is not None:
                party_state['slow_mode'] = slow_mode
                socketio.emit('settings_changed', {
                    'slow_mode': slow_mode
                }, to=party_id)
                    
            if clear_chat:
                socketio.emit('chat_clear', {}, to=party_id)
                    
        if new_password is not None:
            if new_password == '':
                party.password_hash = None
                logger.info(f"Watch party {party_id} password removed by admin")
            else:
                party.password_hash = hashlib.sha256(new_password.encode('utf-8')).hexdigest()
                logger.info(f"Watch party {party_id} password changed by admin")
            db.session.commit()
            
        return jsonify({
            'status': 'success',
            'slow_mode': party_state.get('slow_mode', False),
            'password_protected': party.password_hash is not None
        })
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/extend', methods=['POST'])
def extend_watch_party(party_id):
    """Extends watch party expiry duration (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    hours = data.get('hours', 6)
    
    if not admin_token:
        return jsonify({'status': 'error', 'message': 'admin_token is required'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        party.expires_at = party.expires_at + timedelta(hours=hours)
        db.session.commit()
        
        expires_str = party.expires_at.strftime('%Y-%m-%d %H:%M:%S')
        with watch_parties_lock:
            if party_id in watch_parties_state:
                party_state = watch_parties_state[party_id]
                # Broadcast extension over Socket.IO room
                socketio.emit('settings_changed', {
                    'expires_at': expires_str
                }, to=party_id)
                    
        logger.info(f"Watch party {party_id} extended by {hours} hours (new expiry: {expires_str})")
        return jsonify({'status': 'success', 'expires_at': expires_str})
    except Exception as e:
        logger.error(f"Error extending watch party: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/end', methods=['POST'])
def end_watch_party(party_id):
    """Immediately ends watch party and disconnects all clients (admin only)."""
    data = request.json or {}
    admin_token = data.get('admin_token')
    
    if not admin_token:
        return jsonify({'status': 'error', 'message': 'admin_token is required'}), 400
        
    try:
        from utils.models import WatchParty
        party = WatchParty.query.get(party_id)
        if not party or party.expires_at < datetime.utcnow():
            return jsonify({'status': 'error', 'message': 'Watch party not found or expired'}), 404
            
        if party.admin_token != admin_token:
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
            
        party.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.session.commit()
        
        # Clean up files if it was a custom single-file party
        if party.folder_name.startswith('single_'):
            try:
                import shutil
                target_dir = os.path.join(current_config.output_dir, party.folder_name)
                if os.path.exists(target_dir):
                    shutil.rmtree(target_dir)
                    logger.info(f"Cleaned up custom watch party directory: {target_dir}")
                hls_dir = os.path.join(current_config.output_dir, ".hls_cache", party.folder_name)
                if os.path.exists(hls_dir):
                    shutil.rmtree(hls_dir)
                    logger.info(f"Cleaned up custom watch party HLS cache directory: {hls_dir}")
            except Exception as clean_err:
                logger.error(f"Error cleaning up custom watch party directory {party.folder_name}: {clean_err}")
        
        with watch_parties_lock:
            if party_id in watch_parties_state:
                party_state = watch_parties_state[party_id]
                # Broadcast end over Socket.IO room
                socketio.emit('party_ended', {}, to=party_id)
                    
        logger.info(f"Watch party {party_id} ended by admin")
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Error ending watch party: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/watch-party/<party_id>/signal', methods=['POST'])
def signal_watch_party(party_id):
    """Relays WebRTC connection signaling messages (offers, answers, ICE candidates) to a targeted peer."""
    data = request.json or {}
    sender_id = data.get('sender_id')
    target_id = data.get('target_id')
    signal = data.get('signal') # { type: 'offer'|'answer'|'candidate', ... }
    
    if not sender_id or not target_id or not signal:
        return jsonify({'status': 'error', 'message': 'Missing signaling parameters'}), 400

    with watch_parties_lock:
        if party_id not in watch_parties_state:
            return jsonify({'status': 'error', 'message': 'Watch party state not initialized'}), 404
            
        party_state = watch_parties_state[party_id]
        
        if target_id in party_state['clients']:
            # Relay signal to target client queue
            party_state['clients'][target_id]['queue'].put({
                'type': 'signal',
                'sender_id': sender_id,
                'signal': signal
            })
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': 'Target peer not found'}), 404


public_tunnel_url = None
active_tunnel_proc = None
tunnel_should_run = True
windows_job_handle = None

# Job Object definitions for Windows child process cleanup on exit/crash
if os.name == 'nt':
    import ctypes
    
    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", ctypes.c_uint32),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", ctypes.c_uint32),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", ctypes.c_uint32),
            ("SchedulingClass", ctypes.c_uint32),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", ctypes.c_ubyte * 48),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

def setup_windows_job_object():
    global windows_job_handle
    if os.name != 'nt':
        return
    try:
        h_job = ctypes.windll.kernel32.CreateJobObjectW(None, None)
        if not h_job:
            return
        
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
        JobObjectExtendedLimitInformation = 9
        
        limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        
        res = ctypes.windll.kernel32.SetInformationJobObject(
            h_job,
            JobObjectExtendedLimitInformation,
            ctypes.byref(limits),
            ctypes.sizeof(limits)
        )
        if res:
            windows_job_handle = h_job
            logger.info("Successfully configured Windows Job Object for tunnel auto-termination.")
        else:
            ctypes.windll.kernel32.CloseHandle(h_job)
    except Exception as e:
        logger.warning(f"Could not setup Windows Job Object: {e}")

def cleanup_tunnel():
    global tunnel_should_run, active_tunnel_proc, windows_job_handle
    tunnel_should_run = False
    if active_tunnel_proc:
        try:
            logger.info("Terminating active tunnel subprocess...")
            active_tunnel_proc.terminate()
            try:
                active_tunnel_proc.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                active_tunnel_proc.kill()
        except Exception as e:
            logger.error(f"Error terminating tunnel process: {e}")
            
    if os.name == 'nt' and windows_job_handle:
        try:
            ctypes.windll.kernel32.CloseHandle(windows_job_handle)
            windows_job_handle = None
        except Exception:
            pass

atexit.register(cleanup_tunnel)

import signal

def handle_sigint(signum, frame):
    logger.info("SIGINT/Ctrl+C or SIGTERM received. Cleaning up and exiting process immediately...")
    cleanup_tunnel()
    os._exit(0)

# Register signal handlers for clean terminal termination
try:
    signal.signal(signal.SIGINT, handle_sigint)
    signal.signal(signal.SIGTERM, handle_sigint)
except ValueError:
    # signal.signal only works in the main thread. In case this gets imported
    # elsewhere, we fail gracefully.
    pass

# Register Windows Console Control Handler to exit cleanly on Ctrl+C and Close Events
if os.name == 'nt':
    try:
        import ctypes
        import sys
        PHANDLER_ROUTINE = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_uint32)
        
        def win_ctrl_handler(dwCtrlType):
            if dwCtrlType in (0, 1, 2, 6):
                sys.stderr.write("\nCtrl+C or terminal close detected. Terminating SSH tunnel and exiting...\n")
                sys.stderr.flush()
                cleanup_tunnel()
                os._exit(0)
            return False
            
        # Store global reference to avoid GC
        win_ctrl_callback = PHANDLER_ROUTINE(win_ctrl_handler)
        ctypes.windll.kernel32.SetConsoleCtrlHandler(win_ctrl_callback, True)
    except Exception as e:
        logger.warning(f"Failed to register Windows Console Control Handler: {e}")

def monitor_parent_process():
    """Monitors the parent process (reloader) and terminates the child process if the parent dies."""
    if os.name != 'nt' or os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        return
        
    try:
        import ctypes
        import time
        SYNCHRONIZE = 0x00100000
        ppid = os.getppid()
        h_parent = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, ppid)
        if not h_parent:
            return
            
        try:
            while True:
                # Wait 1000ms. If signaled, it returns 0 (WAIT_OBJECT_0).
                res = ctypes.windll.kernel32.WaitForSingleObject(h_parent, 1000)
                if res == 0:
                    logger.info("Parent process (reloader) has exited. Shutting down child process...")
                    cleanup_tunnel()
                    os._exit(0)
                time.sleep(1)
        finally:
            ctypes.windll.kernel32.CloseHandle(h_parent)
    except Exception as e:
        logger.warning(f"Error in parent process monitor thread: {e}")

active_turn_server = None

def manage_local_turn_server():
    global active_turn_server
    try:
        if active_turn_server:
            logger.info("Stopping existing inbuilt TURN server...")
            active_turn_server.stop()
            active_turn_server = None
            
        if current_config.wp_run_local_turn:
            logger.info("Initializing inbuilt TURN server...")
            if not current_config.wp_turn_secret.strip():
                import secrets
                current_config.wp_turn_secret = secrets.token_hex(16)
                logger.info(f"Auto-generated TURN shared secret: {current_config.wp_turn_secret}")
                save_settings(current_config)
                
            from utils.turn_server import LocalTurnServer
            active_turn_server = LocalTurnServer(
                host="0.0.0.0",
                port=current_config.wp_local_turn_port,
                secret=current_config.wp_turn_secret,
                realm="local-party"
            )
            active_turn_server.start(enable_upnp=current_config.wp_enable_upnp)
            logger.info(f"Inbuilt TURN server running on port {current_config.wp_local_turn_port}")
    except Exception as e:
        logger.error(f"Error managing inbuilt TURN server: {e}")

def download_cloudflared(dest_path):
    import urllib.request
    logger.info("Downloading cloudflared.exe from Cloudflare official release...")
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        with open(dest_path, 'wb') as out_file:
            out_file.write(response.read())
    logger.info("cloudflared.exe downloaded successfully!")

def start_cloudflare_tunnel():
    global public_tunnel_url, active_tunnel_proc, tunnel_should_run, windows_job_handle
    import re
    
    cloudflared_path = os.path.join(WORKSPACE_DIR, "cloudflared.exe")
    if not os.path.exists(cloudflared_path):
        from shutil import which
        path_bin = which("cloudflared")
        if path_bin:
            cloudflared_path = path_bin
        else:
            try:
                download_cloudflared(cloudflared_path)
            except Exception as e:
                logger.error(f"Failed to auto-download cloudflared.exe: {e}")
                time.sleep(10)
                return

    # Check for custom token
    token = current_config.wp_cloudflare_token.strip()
    if token:
        logger.info("Starting Cloudflare Tunnel with custom token...")
        cmd = [cloudflared_path, 'tunnel', '--no-autoupdate', 'run', '--token', token]
        custom_domain = current_config.wp_custom_domain.strip()
        if custom_domain:
            if not custom_domain.startswith("http://") and not custom_domain.startswith("https://"):
                public_tunnel_url = f"https://{custom_domain}"
            else:
                public_tunnel_url = custom_domain
            logger.info(f"Using custom domain for Cloudflare Tunnel: {public_tunnel_url}")
    else:
        logger.info("Starting Cloudflare Quick Tunnel...")
        cmd = [cloudflared_path, 'tunnel', '--url', 'http://127.0.0.1:5000']

    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        if not windows_job_handle:
            setup_windows_job_object()
            
    try:
        active_tunnel_proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            startupinfo=startupinfo,
            bufsize=1
        )
        
        if os.name == 'nt' and windows_job_handle:
            try:
                import ctypes
                ctypes.windll.kernel32.AssignProcessToJobObject(windows_job_handle, int(active_tunnel_proc._handle))
            except Exception as e:
                logger.warning(f"Error assigning process to Job Object: {e}")
                
        for line in active_tunnel_proc.stdout:
            if not tunnel_should_run:
                break
            match = re.search(r'(https://[a-zA-Z0-9-]+\.trycloudflare\.com)', line)
            if match:
                public_tunnel_url = match.group(1)
                logger.info(f"Cloudflare Tunnel initialized: {public_tunnel_url}")
                
        active_tunnel_proc.wait()
    except Exception as e:
        logger.error(f"Error in Cloudflare Tunnel process: {e}")
    finally:
        if not token:
            public_tunnel_url = None
        active_tunnel_proc = None

def start_localhost_run_tunnel():
    """Background worker that opens a localhost.run SSH tunnel to make local Watch Parties shareable online."""
    global public_tunnel_url, active_tunnel_proc, tunnel_should_run, windows_job_handle
    import re
    
    logger.info("Starting localhost.run SSH tunnel for Watch Party sharing...")
    cmd = ['ssh', '-o', 'StrictHostKeyChecking=no', '-R', '80:127.0.0.1:5000', 'nokey@localhost.run']
    
    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        if not windows_job_handle:
            setup_windows_job_object()
        
    try:
        active_tunnel_proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            startupinfo=startupinfo,
            bufsize=1
        )
        
        if os.name == 'nt' and windows_job_handle:
            try:
                import ctypes
                ctypes.windll.kernel32.AssignProcessToJobObject(windows_job_handle, int(active_tunnel_proc._handle))
            except Exception as e:
                logger.warning(f"Error assigning process to Job Object: {e}")
        
        for line in active_tunnel_proc.stdout:
            if not tunnel_should_run:
                break
            match = re.search(r'(https://[a-zA-Z0-9-]+\.lhr\.life)', line)
            if match:
                public_tunnel_url = match.group(1)
                logger.info(f"Watch Party public sharing URL initialized: {public_tunnel_url}")
                
        active_tunnel_proc.wait()
    except Exception as e:
        logger.error(f"Failed to run localhost.run tunnel: {e}")
    finally:
        public_tunnel_url = None
        active_tunnel_proc = None

def start_tunnel_manager():
    """Manages the background tunnel process based on settings."""
    global tunnel_should_run
    time.sleep(1.0)
    while tunnel_should_run:
        try:
            if current_config.wp_use_cloudflare:
                start_cloudflare_tunnel()
            else:
                start_localhost_run_tunnel()
        except Exception as e:
            logger.error(f"Error in tunnel manager: {e}")
        time.sleep(5)


if __name__ == '__main__':
    # Explicitly set debug mode before the thread check so that app.debug evaluates to True
    # in the parent process, preventing it from spawning a second tunnel thread.
    app.debug = True
    
    # Start background tunnel to make watch parties shareable online
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        if os.name == 'nt' and os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
            monitor_t = threading.Thread(target=monitor_parent_process, daemon=True)
            monitor_t.start()
            
        t = threading.Thread(target=start_tunnel_manager, daemon=True)
        t.start()
        
        # Start inbuilt local TURN server if enabled
        manage_local_turn_server()
        
    logger.info("Starting Face Sorter Web Interface...")
    socketio.run(app, host='127.0.0.1', port=5000, debug=True, allow_unsafe_werkzeug=True)
