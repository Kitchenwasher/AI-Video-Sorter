import os
import time
import threading
import json
import cv2
import numpy as np
import logging

logger = logging.getLogger('DuplicateDetector')

class DuplicateDetector:
    _lock = threading.Lock()
    _thread = None
    
    state = {
        'running': False,
        'total_files': 0,
        'processed_files': 0,
        'current_file': 'Idle',
        'percent': 0.0,
        'groups_found': 0
    }
    
    @classmethod
    def start_scan(cls, app, config):
        with cls._lock:
            if cls._thread and cls._thread.is_alive():
                return False
                
            cls.state['running'] = True
            cls.state['total_files'] = 0
            cls.state['processed_files'] = 0
            cls.state['current_file'] = 'Starting duplicate scan...'
            cls.state['percent'] = 0.0
            cls.state['groups_found'] = 0
            
            cls._thread = threading.Thread(
                target=cls._run_scan,
                args=(app, config),
                daemon=True
            )
            cls._thread.start()
            return True
            
    @classmethod
    def _run_scan(cls, app, config):
        with app.app_context():
            try:
                output_dir = config.output_dir
                if not os.path.exists(output_dir):
                    cls.state['running'] = False
                    cls.state['current_file'] = 'Output directory does not exist.'
                    return
                    
                # 1. Collect all images and videos in the output directory
                image_files = []
                video_files = []
                
                image_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff'}
                video_exts = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
                
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
                                ext = os.path.splitext(f)[1].lower()
                                rel_path = f"{folder}/{f}"
                                if ext in image_exts:
                                    image_files.append((folder, f, file_path, rel_path))
                                elif ext in video_exts:
                                    video_files.append((folder, f, file_path, rel_path))
                                    
                total_files = len(image_files) + len(video_files)
                cls.state['total_files'] = total_files
                
                if total_files == 0:
                    cls.state['running'] = False
                    cls.state['percent'] = 100.0
                    cls.state['current_file'] = 'No files to scan.'
                    cls.save_empty_results()
                    return
                    
                images_data = []
                videos_data = []
                processed_count = 0
                
                # 2. Extract hashes and properties
                # For images
                for folder, name, path, rel_path in image_files:
                    cls.state['current_file'] = rel_path
                    cls.state['processed_files'] = processed_count
                    cls.state['percent'] = round((processed_count / total_files) * 100, 1)
                    
                    phash = cls.compute_image_phash(path)
                    if phash:
                        try:
                            size = os.path.getsize(path)
                            # Get resolution using opencv (fast, without loading full image if possible, but imread is simple)
                            img = cv2.imread(path)
                            h, w = (0, 0)
                            if img is not None:
                                h, w = img.shape[:2]
                            
                            images_data.append({
                                'path': path,
                                'rel_path': rel_path,
                                'folder': folder,
                                'name': name,
                                'file_type': 'image',
                                'hash': phash,
                                'size': size,
                                'width': w,
                                'height': h
                            })
                        except Exception as e:
                            logger.error(f"Error reading image properties {path}: {e}")
                    
                    processed_count += 1
                    time.sleep(0.005) # Yield GPU/CPU
                    
                # For videos
                for folder, name, path, rel_path in video_files:
                    cls.state['current_file'] = rel_path
                    cls.state['processed_files'] = processed_count
                    cls.state['percent'] = round((processed_count / total_files) * 100, 1)
                    
                    v_props = cls.get_video_props_and_hash(path)
                    if v_props:
                        videos_data.append({
                            'path': path,
                            'rel_path': rel_path,
                            'folder': folder,
                            'name': name,
                            'file_type': 'video',
                            'hash': v_props['first_frame_hash'],
                            'size': v_props['filesize'],
                            'duration': v_props['duration'],
                            'width': v_props['width'],
                            'height': v_props['height'],
                            'fps': v_props['fps']
                        })
                        
                    processed_count += 1
                    time.sleep(0.01) # Yield GPU/CPU
                    
                # 3. Perform pairwise comparison to group duplicates
                duplicate_groups = []
                
                # Compare images using Disjoint-Set Union (DSU)
                parent = {}
                def find(p):
                    if parent[p] == p:
                        return p
                    parent[p] = find(parent[p])
                    return parent[p]
                    
                def union(p, q):
                    root_p = find(p)
                    root_q = find(q)
                    if root_p != root_q:
                        parent[root_p] = root_q
                        
                for i in range(len(images_data)):
                    parent[i] = i
                    
                for i in range(len(images_data)):
                    for j in range(i + 1, len(images_data)):
                        dist = cls.hamming_distance(images_data[i]['hash'], images_data[j]['hash'])
                        if dist <= 10:
                            union(i, j)
                            
                # Gather groups
                groups_dict = {}
                for i in range(len(images_data)):
                    root = find(i)
                    if root not in groups_dict:
                        groups_dict[root] = []
                    groups_dict[root].append(images_data[i])
                    
                for root, group in groups_dict.items():
                    if len(group) >= 2:
                        for item in group:
                            # Quality score: resolution area first, then file size
                            item['quality_score'] = item['width'] * item['height'] * 10 + item['size']
                        
                        group.sort(key=lambda x: x['quality_score'], reverse=True)
                        for k, item in enumerate(group):
                            item['is_best'] = (k == 0)
                            
                        duplicate_groups.append({
                            'file_type': 'image',
                            'files': group
                        })
                        
                # Compare videos using DSU
                parent_v = {}
                for i in range(len(videos_data)):
                    parent_v[i] = i
                    
                def find_v(p):
                    if parent_v[p] == p:
                        return p
                    parent_v[p] = find_v(parent_v[p])
                    return parent_v[p]
                    
                def union_v(p, q):
                    root_p = find_v(p)
                    root_q = find_v(q)
                    if root_p != root_q:
                        parent_v[root_p] = root_q
                        
                for i in range(len(videos_data)):
                    for j in range(i + 1, len(videos_data)):
                        v1 = videos_data[i]
                        v2 = videos_data[j]
                        
                        duration_match = abs(v1['duration'] - v2['duration']) <= 3.0
                        hash_match = False
                        if v1['hash'] and v2['hash']:
                            dist = cls.hamming_distance(v1['hash'], v2['hash'])
                            hash_match = dist <= 10
                            
                        if duration_match and hash_match:
                            union_v(i, j)
                            
                groups_dict_v = {}
                for i in range(len(videos_data)):
                    root = find_v(i)
                    if root not in groups_dict_v:
                        groups_dict_v[root] = []
                    groups_dict_v[root].append(videos_data[i])
                    
                for root, group in groups_dict_v.items():
                    if len(group) >= 2:
                        for item in group:
                            item['quality_score'] = item['width'] * item['height'] * 10 + item['size']
                            
                        group.sort(key=lambda x: x['quality_score'], reverse=True)
                        for k, item in enumerate(group):
                            item['is_best'] = (k == 0)
                            
                        duplicate_groups.append({
                            'file_type': 'video',
                            'files': group
                        })
                        
                cls.state['groups_found'] = len(duplicate_groups)
                cls.save_results(duplicate_groups)
                
                cls.state['running'] = False
                cls.state['percent'] = 100.0
                cls.state['current_file'] = f"Completed. Found {len(duplicate_groups)} duplicate groups."
                
            except Exception as err:
                logger.exception(f"Error running duplicate scan: {err}")
                cls.state['running'] = False
                cls.state['current_file'] = f"Error: {str(err)}"
                
    @classmethod
    def compute_image_phash(cls, image_path):
        try:
            img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
            if img is None:
                return None
            img = cv2.resize(img, (32, 32))
            img_float = np.float32(img)
            dct = cv2.dct(img_float)
            dct_8x8 = dct[:8, :8]
            dct_flat = dct_8x8.flatten()
            dct_ac = dct_flat[1:]
            median = np.median(dct_ac)
            binary_hash = (dct_8x8 > median).astype(int).flatten()
            hex_val = int(''.join(map(str, binary_hash)), 2)
            return f"{hex_val:016x}"
        except Exception as e:
            logger.error(f"Failed to compute image phash for {image_path}: {e}")
            return None
            
    @classmethod
    def get_video_props_and_hash(cls, video_path):
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return None
                
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            
            duration = 0.0
            if fps > 0:
                duration = frame_count / fps
                
            ret, frame = cap.read()
            cap.release()
            
            first_frame_hash = None
            if ret and frame is not None:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                gray_resized = cv2.resize(gray, (32, 32))
                img_float = np.float32(gray_resized)
                dct = cv2.dct(img_float)
                dct_8x8 = dct[:8, :8]
                dct_flat = dct_8x8.flatten()
                dct_ac = dct_flat[1:]
                median = np.median(dct_ac)
                binary_hash = (dct_8x8 > median).astype(int).flatten()
                hex_val = int(''.join(map(str, binary_hash)), 2)
                first_frame_hash = f"{hex_val:016x}"
            else:
                first_frame_hash = "0000000000000000"
                
            filesize = os.path.getsize(video_path)
            
            return {
                'duration': duration,
                'filesize': filesize,
                'first_frame_hash': first_frame_hash,
                'width': int(width) if width else 0,
                'height': int(height) if height else 0,
                'fps': fps if fps else 0.0
            }
        except Exception as e:
            logger.error(f"Failed to get video properties for {video_path}: {e}")
            return None
            
    @staticmethod
    def hamming_distance(hash1_hex, hash2_hex):
        try:
            h1 = int(hash1_hex, 16)
            h2 = int(hash2_hex, 16)
            return bin(h1 ^ h2).count('1')
        except Exception:
            return 99
            
    @staticmethod
    def get_cache_file():
        cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.cache'))
        os.makedirs(cache_dir, exist_ok=True)
        return os.path.join(cache_dir, 'duplicates.json')
        
    @classmethod
    def save_results(cls, groups):
        try:
            cache_file = cls.get_cache_file()
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(groups, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save duplicate results: {e}")
            
    @classmethod
    def save_empty_results(cls):
        cls.save_results([])
        
    @classmethod
    def get_cached_duplicates(cls):
        cache_file = cls.get_cache_file()
        if not os.path.exists(cache_file):
            return []
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                groups = json.load(f)
                
            verified_groups = []
            for group in groups:
                verified_files = []
                for f_info in group.get('files', []):
                    if os.path.exists(f_info['path']):
                        verified_files.append(f_info)
                if len(verified_files) >= 2:
                    verified_files.sort(key=lambda x: x['quality_score'], reverse=True)
                    for k, item in enumerate(verified_files):
                        item['is_best'] = (k == 0)
                    group['files'] = verified_files
                    verified_groups.append(group)
                    
            if len(verified_groups) != len(groups):
                cls.save_results(verified_groups)
                
            return verified_groups
        except Exception as e:
            logger.error(f"Failed to read cached duplicates: {e}")
            return []
