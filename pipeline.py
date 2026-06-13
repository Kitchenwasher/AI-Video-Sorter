import os
import cv2
import numpy as np
from config import Config
from utils.logger import logger
from utils.cache import EmbeddingCache
from modules.scanner import FileScanner
from modules.keyframe_extractor import KeyframeExtractor
from modules.face_analyzer import FaceAnalyzer
from modules.clustering import FaceClusterer
from modules.screen_time import ScreenTimeCalculator
from modules.sorter import VideoSorter
from modules.name_resolver import NameResolver

class SortingPipeline:
    def __init__(self, config: Config, workspace_dir: str, progress_cb=None):
        self.config = config
        self.workspace_dir = workspace_dir
        self.progress_cb = progress_cb or (lambda stage, pct, msg, detail=None: None)
        
        self.scanner = FileScanner(config.input_dir)
        self.extractor = KeyframeExtractor(workspace_dir, config)
        self.analyzer = FaceAnalyzer(config)
        self.clusterer = FaceClusterer(config)
        self.screen_time = ScreenTimeCalculator(config)
        self.sorter = VideoSorter(config)
        
        # Cache initialization (unconditional for profile registry)
        cache_dir = os.path.join(workspace_dir, ".cache")
        self.cache = EmbeddingCache(cache_dir)

    def _update_progress(self, stage: str, percent: float, message: str, detail=None):
        logger.info(f"Progress [{stage} - {percent:.1f}%]: {message}")
        self.progress_cb(stage, percent, message, detail)

    def _load_and_sync_profiles(self) -> list:
        import json
        
        # 1. Load profiles from the SQLite database
        db_profiles = self.cache.get_persistent_profiles()
        
        # Build map of profile_id -> db_profile
        db_profile_map = {p['profile_id']: p for p in db_profiles}
        
        # 2. Scan the output directory to sync any disk changes (e.g. manual folder renames)
        out_dir = self.config.output_dir
        disk_profiles_by_id = {}
        legacy_disk_profiles = []
        
        if os.path.exists(out_dir):
            logger.info("Scanning output directory for existing female profiles to sync...")
            for item in sorted(os.listdir(out_dir)):
                item_path = os.path.join(out_dir, item)
                if os.path.isdir(item_path):
                    emb_path = os.path.join(item_path, "_profile_embedding.json")
                    if os.path.exists(emb_path):
                        try:
                            with open(emb_path, 'r') as f:
                                data = json.load(f)
                            
                            embedding = np.array(data['embedding'], dtype=np.float32)
                            profile_id = data.get('profile_id')
                            
                            if profile_id is not None:
                                disk_profiles_by_id[int(profile_id)] = {
                                    'folder_name': item,
                                    'embedding': embedding
                                }
                            else:
                                # Legacy profile without profile_id
                                legacy_disk_profiles.append({
                                    'folder_name': item,
                                    'embedding': embedding,
                                    'emb_path': emb_path
                                })
                        except Exception as e:
                            logger.error(f"Error reading profile embedding from {emb_path}: {e}")
                            
        # 3. Synchronize database and disk
        # Case A: Profile is in DB, and also on disk
        for p_id, db_p in list(db_profile_map.items()):
            if p_id in disk_profiles_by_id:
                disk_p = disk_profiles_by_id[p_id]
                # Check if folder name changed (manual rename)
                if db_p['folder_name'] != disk_p['folder_name']:
                    logger.info(f"Detected manual rename of profile {p_id}: {db_p['folder_name']} -> {disk_p['folder_name']}")
                    self.cache.update_profile_folder_name(p_id, disk_p['folder_name'])
                    # Update in-memory copy
                    db_p['folder_name'] = disk_p['folder_name']
                
        # Case B: Profile is on disk but NOT in DB (e.g. database was cleared or profile copied over)
        for p_id, disk_p in disk_profiles_by_id.items():
            if p_id not in db_profile_map:
                logger.info(f"Importing disk profile {p_id} ({disk_p['folder_name']}) into registry database...")
                self.cache.add_persistent_profile_with_id(p_id, disk_p['folder_name'], disk_p['embedding'])
                db_profile_map[p_id] = {
                    'profile_id': p_id,
                    'folder_name': disk_p['folder_name'],
                    'embedding': disk_p['embedding']
                }
                
        # Case C: Legacy profiles on disk (without profile_id)
        for legacy_p in legacy_disk_profiles:
            # Let's see if we can match it to an existing DB profile by embedding similarity
            best_dist = float('inf')
            best_p_id = -1
            epsilon = 0.05 # tight threshold for exact profile matching
            
            for p_id, db_p in db_profile_map.items():
                dist = np.linalg.norm(legacy_p['embedding'] - db_p['embedding'])
                if dist < best_dist:
                    best_dist = dist
                    best_p_id = p_id
                    
            if best_dist <= epsilon:
                logger.info(f"Legacy folder {legacy_p['folder_name']} matched database profile {best_p_id}.")
                try:
                    with open(legacy_p['emb_path'], 'w') as f:
                        json.dump({
                            'profile_id': best_p_id,
                            'folder_name': legacy_p['folder_name'],
                            'embedding': legacy_p['embedding'].tolist()
                        }, f, indent=4)
                except Exception as e:
                    logger.error(f"Failed to update legacy embedding file: {e}")
            else:
                logger.info(f"Creating new registry entry for legacy folder {legacy_p['folder_name']}...")
                new_p_id = self.cache.add_persistent_profile(legacy_p['folder_name'], legacy_p['embedding'])
                db_profile_map[new_p_id] = {
                    'profile_id': new_p_id,
                    'folder_name': legacy_p['folder_name'],
                    'embedding': legacy_p['embedding']
                }
                try:
                    with open(legacy_p['emb_path'], 'w') as f:
                        json.dump({
                            'profile_id': new_p_id,
                            'folder_name': legacy_p['folder_name'],
                            'embedding': legacy_p['embedding'].tolist()
                        }, f, indent=4)
                except Exception as e:
                    logger.error(f"Failed to update legacy embedding file: {e}")
                    
        # 4. Return list of profiles sorted by profile_id
        final_profiles = sorted(db_profile_map.values(), key=lambda x: x['profile_id'])
        return final_profiles

    def run(self):
        try:
            # 1. SCAN FILES
            self._update_progress("scanning", 5.0, "Scanning folder recursively...")
            files = self.scanner.scan()
            videos = files.get('videos', [])
            images = files.get('images', [])
            total_files = len(videos) + len(images)
            
            if total_files == 0:
                self._update_progress("error", 100.0, "No videos or images found in the input folder.")
                return None
                
            self._update_progress("scanning", 10.0, f"Found {len(videos)} videos and {len(images)} images.")

            # 2. INITIALIZE MODELS
            self._update_progress("init_models", 15.0, "Loading face models on iGPU (DirectML)...")
            self.analyzer.initialize()

            # 3. EXTRACT AND ANALYZE FACES (WITH CACHE)
            # Pool all faces found across all files
            # Structure of all_faces: list of dicts containing face metadata
            all_faces = []
            
            # Map file paths to their detected faces metadata (points to all_faces)
            file_faces_map = {}
            
            processed_count = 0
            
            # Process Images (easy, single frame)
            for idx, img_path in enumerate(images):
                pct = 15.0 + (idx / total_files) * 60.0
                filename = os.path.basename(img_path)
                self._update_progress("analysis", pct, f"Analyzing image: {filename}", filename)
                
                cached = None
                if self.cache and self.config.use_cache:
                    cached = self.cache.get_cached_faces(img_path)
                    
                faces_in_img = []
                
                if cached is not None:
                    logger.info(f"Loaded {len(cached)} faces from cache for image {filename}")
                    faces_in_img = cached
                else:
                    # Not in cache, analyze
                    try:
                        faces_in_img = self.analyzer.analyze_image(img_path, frame_index=0)
                        # Cache it
                        if self.cache and self.config.use_cache:
                            self.cache.cache_faces(img_path, 'image', faces_in_img)
                    except Exception as e:
                        logger.error(f"Error processing image {img_path}: {e}")
                
                # Register in mapping
                file_faces_map[img_path] = []
                for face in faces_in_img:
                    face_idx = len(all_faces)
                    face_meta = {
                        'source_file': img_path,
                        'keyframe_path': img_path,  # Use image itself as keyframe
                        'frame_index': face['frame_index'],
                        'bbox': face['bbox'],
                        'gender': face['gender'],
                        'gender_score': face['gender_score'],
                        'embedding_index': face_idx
                    }
                    all_faces.append({
                        'embedding': face['embedding'],
                        **face_meta
                    })
                    file_faces_map[img_path].append(face_meta)
                    
                processed_count += 1

            # Process Videos
            import threading
            from concurrent.futures import ThreadPoolExecutor, as_completed
            
            gpu_lock = threading.Lock()
            max_workers = 4  # Run 4 videos in parallel for high CPU utilization without overloading disk
            
            all_faces_lock = threading.Lock()
            file_faces_map_lock = threading.Lock()
            
            def process_video(video_path):
                filename = os.path.basename(video_path)
                cached = None
                if self.cache and self.config.use_cache:
                    cached = self.cache.get_cached_faces(video_path)
                    
                faces_in_video = []
                
                if cached is not None:
                    logger.info(f"Loaded {len(cached)} faces from cache for video {filename}")
                    faces_in_video = cached
                else:
                    # Parallel keyframe extraction
                    keyframes = self.extractor.extract_keyframes(video_path)
                    if not keyframes:
                        logger.warning(f"Could not extract keyframes from video: {filename}")
                    else:
                        # Thread-safe GPU Inference via Lock
                        with gpu_lock:
                            for kf in keyframes:
                                try:
                                    faces_in_kf = self.analyzer.analyze_image(kf['path'], frame_index=kf['frame_index'])
                                    for face in faces_in_kf:
                                        face['keyframe_path'] = kf['path']
                                        faces_in_video.append(face)
                                except Exception as e:
                                    logger.error(f"Error analyzing keyframe {kf['path']}: {e}")
                                    
                        if self.cache and self.config.use_cache:
                            self.cache.cache_faces(video_path, 'video', faces_in_video)
                            
                        # Cleanup temp frames
                        self.extractor.clean_video_temp(keyframes)
                
                # Register in mappings (Thread Safe)
                with file_faces_map_lock:
                    file_faces_map[video_path] = []
                    
                with all_faces_lock:
                    for face in faces_in_video:
                        face_idx = len(all_faces)
                        face_meta = {
                            'source_file': video_path,
                            'keyframe_path': face.get('keyframe_path'),
                            'frame_index': face['frame_index'],
                            'bbox': face['bbox'],
                            'gender': face['gender'],
                            'gender_score': face['gender_score'],
                            'embedding_index': face_idx
                        }
                        all_faces.append({
                            'embedding': face['embedding'],
                            **face_meta
                        })
                        file_faces_map[video_path].append(face_meta)
                        
            # Execute extraction and face inference tasks in thread pool
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(process_video, path): path for path in videos}
                video_completed = 0
                for future in as_completed(futures):
                    path = futures[future]
                    video_completed += 1
                    pct = 15.0 + ((len(images) + video_completed) / total_files) * 60.0
                    self._update_progress("analysis", pct, f"Processed video {video_completed}/{len(videos)}: {os.path.basename(path)}")
                    try:
                        future.result()
                    except Exception as e:
                        logger.error(f"Error processing video {path}: {e}")


            # 4. CLUSTERING
            self._update_progress("clustering", 80.0, "Clustering female faces...")
            
            # Filter female faces for clustering
            female_indices = [i for i, f in enumerate(all_faces) if f['gender'] == 'female']
            female_embeddings = [all_faces[i]['embedding'] for i in female_indices]
            
            if not female_embeddings:
                self._update_progress("sorting", 90.0, "No female faces detected. Sorting all files as unsorted...")
                # Assign everything to -1
                assignments = {file_path: -1 for file_path in file_faces_map.keys()}
                medoids_info = {}
                cluster_to_folder = {}
                cluster_to_profile_id = {}
            else:
                # 1. Cluster all female embeddings of the current run first to group pose variations
                raw_labels = self.clusterer.cluster_embeddings(female_embeddings)
                
                # Load existing profiles
                existing_profiles = self._load_and_sync_profiles()
                
                # 2. Find raw cluster medoids (only for non-noise clusters)
                raw_medoids = self.clusterer.find_cluster_medoids(female_embeddings, raw_labels)
                
                # 3. Match raw clusters (as a group) to existing profiles
                cluster_matches = {}
                epsilon = self.config.cluster_epsilon
                
                for raw_cid, med_idx in raw_medoids.items():
                    if raw_cid == -1:
                        continue
                    
                    med_emb = female_embeddings[med_idx]
                    best_dist = float('inf')
                    best_profile_idx = -1
                    
                    for p_idx, profile in enumerate(existing_profiles):
                        dist = np.linalg.norm(med_emb - profile['embedding'])
                        if dist < best_dist:
                            best_dist = dist
                            best_profile_idx = p_idx
                            
                    if best_dist <= epsilon:
                        cluster_matches[raw_cid] = best_profile_idx
                        logger.info(f"Cluster {raw_cid} matched existing profile: {existing_profiles[best_profile_idx]['folder_name']} (dist: {best_dist:.3f})")
                    else:
                        cluster_matches[raw_cid] = None
                        logger.info(f"Cluster {raw_cid} did not match any existing profile (best dist: {best_dist:.3f})")
                        
                # 4. Map raw labels to final labels, and match noise faces individually
                next_cluster_id = len(existing_profiles)
                raw_to_final_label = {-1: -1}
                cluster_to_folder = {}
                cluster_to_profile_id = {}
                
                # Populate existing profiles mapping
                for idx, p in enumerate(existing_profiles):
                    cluster_to_folder[idx] = p['folder_name']
                    cluster_to_profile_id[idx] = p['profile_id']
                    
                # Setup mapping for non-noise clusters
                for raw_cid in sorted(raw_medoids.keys()):
                    if raw_cid == -1:
                        continue
                        
                    matched_p_idx = cluster_matches[raw_cid]
                    if matched_p_idx is not None:
                        raw_to_final_label[raw_cid] = matched_p_idx
                    else:
                        final_cid = next_cluster_id
                        raw_to_final_label[raw_cid] = final_cid
                        
                        folder_name = f"female_{final_cid + 1:03d}"
                        out_dir = self.config.output_dir
                        while os.path.exists(os.path.join(out_dir, folder_name)) or folder_name in cluster_to_folder.values():
                            final_cid += 1
                            folder_name = f"female_{final_cid + 1:03d}"
                            
                        cluster_to_folder[final_cid] = folder_name
                        cluster_to_profile_id[final_cid] = None
                        next_cluster_id = final_cid + 1
                        
                # Reconstruct labels by mapping clustered faces, and resolving noise faces individually
                final_labels = []
                for idx, (raw_l, emb) in enumerate(zip(raw_labels, female_embeddings)):
                    if raw_l != -1:
                        final_labels.append(raw_to_final_label[raw_l])
                    else:
                        # Check noise face individually against existing profiles
                        best_dist = float('inf')
                        best_profile_idx = -1
                        for p_idx, profile in enumerate(existing_profiles):
                            dist = np.linalg.norm(emb - profile['embedding'])
                            if dist < best_dist:
                                best_dist = dist
                                best_profile_idx = p_idx
                                
                        if best_dist <= epsilon:
                            final_labels.append(best_profile_idx)
                            logger.info(f"Individual noise face matched existing profile folder: {existing_profiles[best_profile_idx]['folder_name']} (dist: {best_dist:.3f})")
                        else:
                            final_labels.append(-1)
                        
                # Find medoids
                medoids = self.clusterer.find_cluster_medoids(female_embeddings, final_labels)
                
                medoids_info = {
                    cluster_id: female_indices[med_idx]
                    for cluster_id, med_idx in medoids.items()
                }
                
                # Map face index to cluster label
                face_id_to_cluster = {}
                for idx, label in zip(female_indices, final_labels):
                    face_id_to_cluster[idx] = label
                    
                # 5. ASSIGNMENTS
                self._update_progress("assignment", 85.0, "Calculating primary female for each file...")
                assignments = self.screen_time.calculate_assignments(file_faces_map, face_id_to_cluster)

            # Re-generate keyframe crops for medoids if they were cached (and thus keyframe_path is missing)
            # This is important! If keyframe_path doesn't exist, we must extract that single frame from the video.
            for cluster_id, face_idx in medoids_info.items():
                face_data = all_faces[face_idx]
                kf_path = face_data.get('keyframe_path')
                if not kf_path or not os.path.exists(kf_path):
                    # It was cached, need to extract it
                    src_file = face_data['source_file']
                    frame_idx = face_data['frame_index']
                    
                    # If it's an image, the image is the frame
                    ext = os.path.splitext(src_file)[1].lower()
                    from modules.scanner import IMAGE_EXTENSIONS
                    if ext in IMAGE_EXTENSIONS:
                        face_data['keyframe_path'] = src_file
                    else:
                        # It's a video. Extract single frame to a temp file
                        try:
                            temp_medoid_dir = os.path.join(self.extractor.temp_dir, "medoids")
                            os.makedirs(temp_medoid_dir, exist_ok=True)
                            out_frame_path = os.path.abspath(os.path.join(temp_medoid_dir, f"medoid_c{cluster_id}.jpg"))
                            
                            # Use OpenCV to read specific frame
                            cap = cv2.VideoCapture(src_file)
                            if cap.isOpened():
                                # Set frame position
                                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                                ret, frame = cap.read()
                                if ret:
                                    cv2.imwrite(out_frame_path, frame)
                                    face_data['keyframe_path'] = out_frame_path
                                cap.release()
                        except Exception as e:
                            logger.error(f"Failed to extract medoid frame from video {src_file}: {e}")

            # 6. SORT FILES
            self._update_progress("sorting", 90.0, "Sorting videos and images into folders...")
            report = self.sorter.sort_files(assignments, medoids_info, all_faces, cluster_to_folder, cluster_to_profile_id, self.cache)
            
            # 7. AUTO-NAMING
            if self.config.auto_name_folders:
                try:
                    naming_report = self.run_auto_naming()
                    if report:
                        report['auto_naming'] = naming_report
                except Exception as e:
                    logger.error(f"Auto-naming failed: {e}")
            
            # Clean up all remaining temp keyframe directories
            self.extractor.clean_temp_dir()
            
            self._update_progress("completed", 100.0, "Sorting process completed successfully!", report)
            return report
            
        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self._update_progress("error", 100.0, f"Error: {str(e)}")
            # Cleanup temp on error
            try:
                self.extractor.clean_temp_dir()
            except Exception:
                pass
            return None

    def run_auto_naming(self) -> dict:
        """
        Executes folder identification and renaming without running full sorting.
        """
        self._update_progress("auto_naming", 92.0, "Identifying folder names by parsing filenames and reverse image search...")
        resolver = NameResolver(self.config)
        
        def naming_progress(current, total, msg):
            pct = 92.0 + (current / total) * 7.0
            self._update_progress("auto_naming", pct, msg)
            
        results = resolver.resolve_all_folders(self.config.output_dir, naming_progress)
        logger.info(f"Auto-naming completed. Results: {results}")
        self._update_progress("auto_naming", 99.0, f"Auto-naming finished. Processed {len(results)} folders.")
        return results
