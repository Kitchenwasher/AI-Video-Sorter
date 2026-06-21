import os
import shutil
import cv2
import json
from utils.logger import logger

class VideoSorter:
    def __init__(self, config):
        self.config = config

    def sort_files(self, assignments: dict, medoids_info: dict, all_faces_metadata: list, cluster_folders: dict = None, cluster_to_profile_id: dict = None, cache_ref = None) -> dict:
        """
        Sorts files into folder clusters and generates reference images.
        Args:
            assignments (dict): {file_path: cluster_id}
            medoids_info (dict): {cluster_id: index_of_face_in_all_faces}
            all_faces_metadata (list): List of dicts containing face info, including source file and bbox
            cluster_folders (dict): Pre-mapped folder names for each cluster_id
            cluster_to_profile_id (dict): Mapping of cluster_id to database profile_id
            cache_ref: Reference to the cache DB for profile persistence
        Returns:
            dict: Summary report of the sorting operation
        """
        out_dir = self.config.output_dir
        if not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)

        logger.info(f"Starting sorting. Mode: {self.config.mode}")
        report = {
            'mode': self.config.mode,
            'sorted_files': {},
            'unsorted_files': [],
            'cluster_folders': {}
        }
        
        # 1. Create reference images and save profile embeddings for each cluster
        if cluster_folders is None:
            cluster_folders = {}
            
        unique_clusters = set(assignments.values())
        sorted_clusters = sorted([c for c in unique_clusters if c != -1])
        
        for idx, cluster_id in enumerate(sorted_clusters):
            # If not already mapped (e.g. newly discovered identity during this run)
            if cluster_id not in cluster_folders:
                folder_name = f"female_{cluster_id+1:03d}"
                # Avoid collisions
                col_idx = cluster_id
                while os.path.exists(os.path.join(out_dir, folder_name)) or folder_name in cluster_folders.values():
                    col_idx += 1
                    folder_name = f"female_{col_idx+1:03d}"
                cluster_folders[cluster_id] = folder_name
                
            folder_name = cluster_folders[cluster_id]
            cluster_dir = os.path.join(out_dir, folder_name)
            os.makedirs(cluster_dir, exist_ok=True)
            report['cluster_folders'][cluster_id] = folder_name
            
            # Save reference face (medoid thumbnail)
            if cluster_id in medoids_info:
                medoid_idx = medoids_info[cluster_id]
                face_data = all_faces_metadata[medoid_idx]
                
                # Save persistent profile embedding database JSON file inside this folder
                emb = face_data.get('embedding')
                if emb is not None:
                    # Resolve or create profile_id in database
                    profile_id = None
                    if cluster_to_profile_id and cluster_id in cluster_to_profile_id:
                        profile_id = cluster_to_profile_id[cluster_id]
                        
                    if profile_id is None and cache_ref is not None:
                        # Register this new cluster face as a persistent profile
                        profile_id = cache_ref.add_persistent_profile(folder_name, emb)
                        if cluster_to_profile_id:
                            cluster_to_profile_id[cluster_id] = profile_id
                        logger.info(f"Registered new face profile in DB: {folder_name} (ID: {profile_id})")
                    
                    emb_path = os.path.join(cluster_dir, "_profile_embedding.json")
                    try:
                        with open(emb_path, 'w') as f:
                            json.dump({
                                'profile_id': profile_id,
                                'folder_name': folder_name,
                                'embedding': emb.tolist()
                            }, f, indent=4)
                        logger.info(f"Saved persistent profile embedding file for {folder_name} (ID: {profile_id})")
                    except Exception as e:
                        logger.error(f"Failed to save profile embedding for {folder_name}: {e}")
                
                # face_data has 'source_file' (image/video file path) and 'bbox' (from keyframe)
                keyframe_path = face_data.get('keyframe_path')
                bbox = face_data.get('bbox')
                
                if keyframe_path and os.path.exists(keyframe_path) and bbox:
                    try:
                        img = cv2.imread(keyframe_path)
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
                            ref_path = os.path.join(cluster_dir, "_reference_face.jpg")
                            cv2.imwrite(ref_path, crop, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                            logger.info(f"Saved reference face for {folder_name} to {ref_path}")
                    except Exception as e:
                        logger.error(f"Failed to save reference thumbnail for cluster {cluster_id}: {e}")


        # 2. Create unsorted directory if needed
        unsorted_dir = os.path.join(out_dir, "_unsorted")
        if -1 in assignments.values():
            os.makedirs(unsorted_dir, exist_ok=True)

        # 3. Perform file copy/move operations
        for src_path, cluster_id in assignments.items():
            if not os.path.exists(src_path):
                logger.warning(f"File no longer exists: {src_path}")
                continue
                
            filename = os.path.basename(src_path)
            
            # Target directory
            if cluster_id == -1:
                dest_dir = unsorted_dir
            else:
                dest_dir = os.path.join(out_dir, cluster_folders[cluster_id])
                
            # Handle name collisions
            dest_path = os.path.join(dest_dir, filename)
            if os.path.exists(dest_path):
                base, ext = os.path.splitext(filename)
                counter = 1
                while os.path.exists(os.path.join(dest_dir, f"{base}_{counter}{ext}")):
                    counter += 1
                dest_path = os.path.join(dest_dir, f"{base}_{counter}{ext}")
                
            # Copy or Move
            try:
                if self.config.mode == "move":
                    shutil.move(src_path, dest_path)
                    logger.info(f"Moved: {os.path.basename(src_path)} -> {os.path.relpath(dest_path, out_dir)}")
                    if cache_ref is not None:
                        cache_ref.update_file_path(src_path, dest_path)
                else: # copy
                    shutil.copy2(src_path, dest_path)
                    logger.info(f"Copied: {os.path.basename(src_path)} -> {os.path.relpath(dest_path, out_dir)}")
                    if cache_ref is not None:
                        cache_ref.copy_file_cache(src_path, dest_path)
                    
                # Update report
                rel_dest = os.path.relpath(dest_path, out_dir)
                if cluster_id == -1:
                    report['unsorted_files'].append(src_path)
                else:
                    report['sorted_files'][src_path] = {
                        'dest': rel_dest,
                        'cluster': cluster_folders[cluster_id]
                    }
            except Exception as e:
                logger.error(f"Failed to sort {src_path}: {e}")
                
        # Save summary report file
        try:
            report_path = os.path.join(out_dir, "_sorting_report.json")
            with open(report_path, 'w') as f:
                json.dump(report, f, indent=4)
            logger.info(f"Sorting report written to {report_path}")
        except Exception as e:
            logger.warning(f"Could not write sorting report: {e}")
            
        return report
