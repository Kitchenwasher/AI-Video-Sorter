import os
import json
import shutil
import threading
import time
import numpy as np
import cv2
from utils.logger import logger
from utils.models import db, ProcessedFile, Face, PersistentProfile, WatchHistory
from utils.cache import EmbeddingCache

class LibraryIndexer:
    _lock = threading.Lock()
    _thread = None
    
    state = {
        'running': False,
        'total_files': 0,
        'processed_files': 0,
        'current_file': 'Idle',
        'percent': 0.0
    }
    
    @classmethod
    def start_indexing(cls, app, cache_db, config):
        with cls._lock:
            if cls._thread and cls._thread.is_alive():
                return False
                
            cls.state['running'] = True
            cls.state['total_files'] = 0
            cls.state['processed_files'] = 0
            cls.state['current_file'] = 'Starting indexing...'
            cls.state['percent'] = 0.0
            
            cls._thread = threading.Thread(
                target=cls._run_indexing,
                args=(app, cache_db, config),
                daemon=True
            )
            cls._thread.start()
            return True
            
    @classmethod
    def _run_indexing(cls, app, cache_db, config):
        with app.app_context():
            try:
                from modules.face_analyzer import FaceAnalyzer
                from modules.keyframe_extractor import KeyframeExtractor
                
                output_dir = config.output_dir
                if not os.path.exists(output_dir):
                    cls.state['running'] = False
                    return
                    
                # 1. Collect all files in the output directory
                all_files = []
                for folder in os.listdir(output_dir):
                    if folder.startswith('.') or (folder.startswith('_') and folder != '_unsorted'):
                        continue
                    folder_path = os.path.join(output_dir, folder)
                    if os.path.isdir(folder_path):
                        for f in os.listdir(folder_path):
                            if f.startswith('_'):
                                continue
                            file_path = os.path.join(folder_path, f)
                            if os.path.isfile(file_path):
                                all_files.append((folder, f, file_path))
                                
                cls.state['total_files'] = len(all_files)
                if not all_files:
                    cls.state['running'] = False
                    cls.state['percent'] = 100.0
                    cls.state['current_file'] = 'No files to index.'
                    return
                    
                logger.info(f"Indexing library: found {len(all_files)} files to check/index.")
                
                analyzer = FaceAnalyzer(config)
                extractor = KeyframeExtractor(os.path.dirname(output_dir), config)
                
                # Initialize analyzer
                analyzer.initialize()
                
                for idx, (folder, name, file_path) in enumerate(all_files):
                    cls.state['current_file'] = f"{folder}/{name}"
                    cls.state['processed_files'] = idx
                    cls.state['percent'] = round((idx / len(all_files)) * 100, 1)
                    
                    # Check cache
                    cached = cache_db.get_cached_faces(file_path)
                    if cached is not None:
                        # Already cached, skip analysis
                        continue
                        
                    # Not in cache, let's analyze!
                    ext = os.path.splitext(name)[1].lower()
                    is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                    
                    faces_in_file = []
                    try:
                        if not is_video:
                            faces_in_file = analyzer.analyze_image(file_path, frame_index=0)
                            cache_db.cache_faces(file_path, 'image', faces_in_file)
                        else:
                            # Extract keyframes
                            keyframes = extractor.extract_keyframes(file_path)
                            if keyframes:
                                for kf in keyframes:
                                    faces_in_kf = analyzer.analyze_image(kf['path'], frame_index=kf['frame_index'])
                                    for face in faces_in_kf:
                                        face['keyframe_path'] = kf['path']
                                        faces_in_file.append(face)
                                    time.sleep(0.015)  # yield GPU slice to prevent TDR reset
                                cache_db.cache_faces(file_path, 'video', faces_in_file)
                                extractor.clean_video_temp(keyframes)
                    except Exception as e:
                        logger.error(f"Indexer error processing {name}: {e}")
                        
                cls.state['processed_files'] = len(all_files)
                cls.state['percent'] = 100.0
                cls.state['current_file'] = 'Indexing complete.'
                logger.info("Library indexing complete.")
            except Exception as ex:
                logger.error(f"Library indexer crashed: {ex}")
                cls.state['current_file'] = f"Error: {str(ex)}"
            finally:
                cls.state['running'] = False


def auto_extract_avatar(folder_name, cache_db, config, analyzer=None, force=False):
    """
    Extracts the face with the highest detection score (confidence) from files in folder_name
    and saves it as _reference_face.jpg.
    """
    output_dir = config.output_dir
    folder_path = os.path.join(output_dir, folder_name)
    if not os.path.exists(folder_path):
        return False
        
    # Load profile embedding to match faces
    profile_emb = None
    profile_json_path = os.path.join(folder_path, '_profile_embedding.json')
    if os.path.exists(profile_json_path):
        try:
            with open(profile_json_path, 'r') as f:
                data = json.load(f)
            profile_emb = np.array(data['embedding'], dtype=np.float32)
        except Exception as e:
            logger.error(f"Failed to read profile embedding for avatar extraction: {e}")
            
    # List files in the folder (ignoring metadata/hidden)
    files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f)) and not f.startswith('_')]
    if not files:
        return False
        
    best_face = None
    best_score = -1.0
    best_file_path = None
    
    # We might need to initialize the FaceAnalyzer if not provided
    if analyzer is None:
        from modules.face_analyzer import FaceAnalyzer
        analyzer = FaceAnalyzer(config)
        analyzer.initialize()
        
    # Temporarily relax eye ratio filter and detection threshold for avatar extraction
    import copy
    orig_config = analyzer.config
    local_config = copy.copy(config)
    local_config.min_eye_dist_ratio = 0.05
    local_config.face_det_threshold = 0.45
    analyzer.config = local_config
    
    try:
        for filename in files:
            file_path = os.path.join(folder_path, filename)
            faces_data = None
            
            # Determine image/video dimensions to detect cut-off faces
            w, h = 0, 0
            ext = os.path.splitext(filename)[1].lower()
            is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
            try:
                if not is_video:
                    img_header = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)
                    if img_header is not None:
                        h, w = img_header.shape[:2]
                else:
                    cap = cv2.VideoCapture(file_path)
                    if cap.isOpened():
                        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        cap.release()
            except Exception:
                pass
                
            # Try to load from database cache first
            faces_data = cache_db.get_cached_faces(file_path)
            
            # If not cached or cached as empty (due to previous crashes/skips), analyze on the fly
            if not faces_data:
                try:
                    if not is_video:
                        faces_data = analyzer.analyze_image(file_path, frame_index=0)
                        cache_db.cache_faces(file_path, 'image', faces_data)
                    else:
                        cap = cv2.VideoCapture(file_path)
                        if cap.isOpened():
                            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                            frames_to_check = [0]
                            if total_frames > 100:
                                frames_to_check.extend([total_frames // 4, total_frames // 2, 3 * total_frames // 4])
                            
                            faces_data = []
                            temp_dir = os.path.join(os.path.dirname(output_dir), '.cache', 'temp_avatar_extract')
                            os.makedirs(temp_dir, exist_ok=True)
                            
                            for f_idx in frames_to_check:
                                cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
                                ret, frame = cap.read()
                                if ret:
                                    temp_frame_path = os.path.join(temp_dir, f"temp_{folder_name}_{f_idx}.jpg")
                                    cv2.imwrite(temp_frame_path, frame)
                                    detected = analyzer.analyze_image(temp_frame_path, frame_index=f_idx)
                                    try:
                                        os.remove(temp_frame_path)
                                    except Exception:
                                        pass
                                    faces_data.extend(detected)
                                    time.sleep(0.015)  # yield GPU slice to prevent TDR reset
                                    
                            cap.release()
                            cache_db.cache_faces(file_path, 'video', faces_data)
                except Exception as e:
                    logger.error(f"Error extracting faces on the fly for avatar: {e}")
                    faces_data = []
                    
            if faces_data:
                for face in faces_data:
                    # Calculate distance to profile embedding if available
                    is_match = True
                    if profile_emb is not None:
                        f_emb = face['embedding']
                        if not isinstance(f_emb, np.ndarray):
                            f_emb = np.array(f_emb, dtype=np.float32)
                        dist = np.linalg.norm(f_emb - profile_emb)
                        # Skip if face doesn't match this profile (lenient threshold)
                        if dist > 1.15:
                            is_match = False
                            
                    if is_match:
                        # Check if face is cut off by image boundaries
                        x1, y1, x2, y2 = face['bbox']
                        is_cutoff = False
                        if w > 0 and h > 0:
                            # Allow 5% border buffer
                            pad_w = (x2 - x1) * 0.05
                            pad_h = (y2 - y1) * 0.05
                            if x1 < -pad_w or y1 < -pad_h or x2 > w + pad_w or y2 > h + pad_h:
                                is_cutoff = True
                        else:
                            if x1 < 0 or y1 < 0:
                                is_cutoff = True
                                
                        # Check confidence
                        score = face.get('gender_score', 0.0)
                        # Penalize cut-off faces severely so fully visible faces are preferred
                        effective_score = score - 0.5 if is_cutoff else score
                        
                        if effective_score > best_score:
                            best_score = effective_score
                            best_face = face
                            best_file_path = file_path
                            
        # Fallback pass: if no face matched within 1.15, but profile_emb exists, find the absolute closest face
        if best_face is None and profile_emb is not None:
            min_dist = float('inf')
            for filename in files:
                file_path = os.path.join(folder_path, filename)
                
                # Dimensions check
                w, h = 0, 0
                ext = os.path.splitext(filename)[1].lower()
                is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                try:
                    if not is_video:
                        img_header = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)
                        if img_header is not None:
                            h, w = img_header.shape[:2]
                    else:
                        cap = cv2.VideoCapture(file_path)
                        if cap.isOpened():
                            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                            cap.release()
                except Exception:
                    pass
                    
                faces_data = cache_db.get_cached_faces(file_path)
                if faces_data:
                    for face in faces_data:
                        f_emb = face['embedding']
                        if not isinstance(f_emb, np.ndarray):
                            f_emb = np.array(f_emb, dtype=np.float32)
                        dist = np.linalg.norm(f_emb - profile_emb)
                        
                        # Cutoff check
                        x1, y1, x2, y2 = face['bbox']
                        is_cutoff = False
                        if w > 0 and h > 0:
                            pad_w = (x2 - x1) * 0.05
                            pad_h = (y2 - y1) * 0.05
                            if x1 < -pad_w or y1 < -pad_h or x2 > w + pad_w or y2 > h + pad_h:
                                is_cutoff = True
                        else:
                            if x1 < 0 or y1 < 0:
                                is_cutoff = True
                                
                        # Penalize cutoff distance by adding a penalty (increasing distance metric)
                        effective_dist = dist + 0.5 if is_cutoff else dist
                        
                        if effective_dist < min_dist:
                            min_dist = effective_dist
                            best_face = face
                            best_file_path = file_path
                            
        # If we found a best face, crop it and save as reference face
        if best_face and best_file_path:
            try:
                bbox = best_face['bbox']
                frame_idx = best_face.get('frame_index', 0)
                ext = os.path.splitext(best_file_path)[1].lower()
                is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                
                img = None
                if not is_video:
                    img = cv2.imread(best_file_path)
                else:
                    cap = cv2.VideoCapture(best_file_path)
                    if cap.isOpened():
                        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                        ret, img = cap.read()
                        cap.release()
                        
                if img is not None:
                    h, w = img.shape[:2]
                    x1, y1, x2, y2 = [int(x) for x in bbox]
                    # Pad crop slightly
                    pad_w = int((x2 - x1) * 0.2)
                    pad_h = int((y2 - y1) * 0.2)
                    x1_c = max(0, x1 - pad_w)
                    y1_c = max(0, y1 - pad_h)
                    x2_c = min(w, x2 + pad_w)
                    y2_c = min(h, y2 + pad_h)
                    
                    crop = img[y1_c:y2_c, x1_c:x2_c]
                    ref_path = os.path.join(folder_path, "_reference_face.jpg")
                    cv2.imwrite(ref_path, crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                    logger.info(f"Auto-extracted highest confidence face ({best_score:.3f}) for {folder_name} to {ref_path}")
                    return True
            except Exception as e:
                logger.error(f"Failed to crop best face for profile {folder_name}: {e}")
                
        # Fallback avatar
        try:
            ref_path = os.path.join(folder_path, "_reference_face.jpg")
            if (force or not os.path.exists(ref_path)) and files:
                # 1. Try to find the first image file
                img_file = None
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in {'.jpg', '.jpeg', '.png', '.webp'}:
                        img_file = f
                        break
                if img_file:
                    shutil.copy2(os.path.join(folder_path, img_file), ref_path)
                    logger.info(f"Fallback avatar: copied image {img_file} to {ref_path}")
                    return True
                    
                # 2. If no images, try to extract the first frame from the first valid video file
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}:
                        video_path = os.path.join(folder_path, f)
                        cap = cv2.VideoCapture(video_path)
                        if cap.isOpened():
                            ret, frame = cap.read()
                            if ret:
                                cv2.imwrite(ref_path, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
                                logger.info(f"Fallback avatar: extracted first frame from video {f} to {ref_path}")
                                cap.release()
                                return True
                            cap.release()
        except Exception as e:
            logger.error(f"Fallback avatar copy/extraction failed: {e}")
            
        return False
    finally:
        analyzer.config = orig_config


def get_profile_media(folder_name, cache_db, config):
    """
    Returns all media files containing this profile's face across all folders.
    """
    output_dir = config.output_dir
    folder_path = os.path.join(output_dir, folder_name)
    
    results = {}
    
    # 1. Add all files physically in folder_name
    if os.path.exists(folder_path):
        for filename in os.listdir(folder_path):
            if filename.startswith('.') or filename.startswith('_'):
                continue
            file_path = os.path.join(folder_path, filename)
            if os.path.isfile(file_path):
                ext = os.path.splitext(filename)[1].lower()
                is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                
                key = f"{folder_name}/{filename}"
                results[key] = {
                    'name': filename,
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
                
    # 2. Get profile embedding to scan other folders
    profile_emb = None
    profile_json_path = os.path.join(folder_path, '_profile_embedding.json')
    if os.path.exists(profile_json_path):
        try:
            with open(profile_json_path, 'r') as f:
                data = json.load(f)
            profile_emb = np.array(data['embedding'], dtype=np.float32)
        except Exception:
            pass
            
    # 3. If profile embedding is available, search Face table for matches
    if profile_emb is not None:
        try:
            all_faces = Face.query.all()
            
            matched_file_ids = set()
            for face in all_faces:
                f_emb = np.frombuffer(face.embedding_blob, dtype=np.float32)
                dist = np.linalg.norm(f_emb - profile_emb)
                if dist <= config.cluster_epsilon:
                    matched_file_ids.add(face.file_id)
                    
            if matched_file_ids:
                matched_files = ProcessedFile.query.filter(ProcessedFile.id.in_(matched_file_ids)).all()
                for pf in matched_files:
                    abs_path = os.path.abspath(pf.file_path)
                    if not abs_path.startswith(os.path.abspath(output_dir)) or not os.path.exists(abs_path):
                        continue
                        
                    rel_to_out = os.path.relpath(abs_path, output_dir)
                    parts = rel_to_out.replace('\\', '/').split('/')
                    if len(parts) < 2:
                        continue
                        
                    f_folder = parts[0]
                    f_name = parts[1] if len(parts) == 2 else '/'.join(parts[1:])
                    
                    if f_folder != folder_name:
                        key = f"{f_folder}/{f_name}"
                        if key not in results:
                            ext = os.path.splitext(f_name)[1].lower()
                            is_video = ext in {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                            
                            results[key] = {
                                'name': f_name,
                                'filename': f_name,
                                'folder_name': f_folder,
                                'display_folder_name': f_folder.replace('_', ' ').strip(),
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
        except Exception as e:
            logger.error(f"Error scanning Face table for profile matches: {e}")
            
    # 4. Inject watch progress metadata
    try:
        for key, item in results.items():
            watch_record = WatchHistory.query.filter_by(file_path=key).first()
            if watch_record:
                watch_info = item['watch_progress']
                watch_info['playback_position'] = watch_record.playback_position
                watch_info['duration'] = watch_record.duration
                watch_info['is_completed'] = watch_record.is_completed
                watch_info['rating'] = watch_record.rating
                if watch_record.duration > 0:
                    watch_info['progress_percent'] = int((watch_record.playback_position / watch_record.duration) * 100)
    except Exception as e:
        logger.error(f"Error loading watch progress in profile media: {e}")
        
    return list(results.values())
