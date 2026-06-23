import os
import shutil
import cv2
import json
from utils.logger import logger

class VideoSorter:
    def __init__(self, config):
        self.config = config

    def sort_files(self, assignments: dict, medoids_info: dict, all_faces_metadata: list, cluster_folders: dict = None, cluster_to_profile_id: dict = None, cache_ref = None, assignment_details: dict = None) -> dict:
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
        if assignment_details and getattr(self.config, 'multi_profile_policy', 'primary_only') in {'copy_all', 'virtual_all'}:
            for details in assignment_details.values():
                unique_clusters.update(details.get('matched_clusters', []))
        sorted_clusters = sorted([c for c in unique_clusters if c != -1])
        
        for idx, cluster_id in enumerate(sorted_clusters):
            # If not already mapped (e.g. newly discovered identity during this run)
            if cluster_id not in cluster_folders:
                prefix = getattr(self.config, 'profile_target', 'female')
                if prefix == 'all':
                    prefix = 'person'
                folder_name = f"{prefix}_{cluster_id+1:03d}"
                # Avoid collisions
                col_idx = cluster_id
                while os.path.exists(os.path.join(out_dir, folder_name)) or folder_name in cluster_folders.values():
                    col_idx += 1
                    folder_name = f"{prefix}_{col_idx+1:03d}"
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
        policy = getattr(self.config, 'multi_profile_policy', 'primary_only')
        if policy not in {'primary_only', 'copy_all', 'virtual_all'}:
            policy = 'primary_only'
        report['multi_profile_policy'] = policy

        def unique_dest_path(dest_dir, filename):
            dest_path = os.path.join(dest_dir, filename)
            if not os.path.exists(dest_path):
                return dest_path
            base, ext = os.path.splitext(filename)
            counter = 1
            while os.path.exists(os.path.join(dest_dir, f"{base}_{counter}{ext}")):
                counter += 1
            return os.path.join(dest_dir, f"{base}_{counter}{ext}")

        for src_path, cluster_id in assignments.items():
            if not os.path.exists(src_path):
                logger.warning(f"File no longer exists: {src_path}")
                continue
                
            filename = os.path.basename(src_path)
            details = (assignment_details or {}).get(src_path, {})
            matched_clusters = [cid for cid in details.get('matched_clusters', []) if cid != -1]
            if cluster_id != -1 and cluster_id not in matched_clusters:
                matched_clusters.insert(0, cluster_id)
            
            dest_clusters = matched_clusters if policy == 'copy_all' and matched_clusters else [cluster_id]

            try:
                written_paths = []
                source_for_secondary = src_path

                for idx, dest_cluster in enumerate(dest_clusters):
                    if dest_cluster == -1:
                        dest_dir = unsorted_dir
                    else:
                        dest_dir = os.path.join(out_dir, cluster_folders[dest_cluster])
                    os.makedirs(dest_dir, exist_ok=True)
                    dest_path = unique_dest_path(dest_dir, filename)

                    should_move = self.config.mode == "move" and idx == 0
                    if should_move:
                        shutil.move(src_path, dest_path)
                        logger.info(f"Moved: {os.path.basename(src_path)} -> {os.path.relpath(dest_path, out_dir)}")
                        if cache_ref is not None:
                            cache_ref.update_file_path(src_path, dest_path)
                        source_for_secondary = dest_path
                    else:
                        shutil.copy2(source_for_secondary, dest_path)
                        logger.info(f"Copied: {os.path.basename(source_for_secondary)} -> {os.path.relpath(dest_path, out_dir)}")
                        if cache_ref is not None:
                            cache_ref.copy_file_cache(source_for_secondary, dest_path)

                    written_paths.append((dest_cluster, dest_path))

                    if policy == 'copy_all' and cache_ref is not None and dest_cluster != -1:
                        profile_id = cluster_to_profile_id.get(dest_cluster) if cluster_to_profile_id else None
                        primary_profile_id = cluster_to_profile_id.get(cluster_id) if cluster_to_profile_id and cluster_id != -1 else None
                        cache_ref.set_profile_media_memberships(
                            dest_path,
                            [profile_id],
                            primary_profile_id=primary_profile_id,
                            evidence={}
                        )

                primary_dest_cluster, primary_dest_path = written_paths[0]
                rel_dest = os.path.relpath(primary_dest_path, out_dir)

                if policy == 'virtual_all' and cache_ref is not None and primary_dest_cluster != -1:
                    profile_ids = [
                        cluster_to_profile_id.get(cid)
                        for cid in matched_clusters
                        if cluster_to_profile_id and cid in cluster_to_profile_id
                    ]
                    primary_profile_id = cluster_to_profile_id.get(primary_dest_cluster) if cluster_to_profile_id else None
                    evidence_by_profile = {}
                    for cid, ev in details.get('evidence', {}).items():
                        profile_id = cluster_to_profile_id.get(cid) if cluster_to_profile_id else None
                        if profile_id is not None:
                            evidence_by_profile[profile_id] = ev
                    cache_ref.set_profile_media_memberships(
                        primary_dest_path,
                        profile_ids,
                        primary_profile_id=primary_profile_id,
                        evidence=evidence_by_profile
                    )

                if primary_dest_cluster == -1:
                    report['unsorted_files'].append(src_path)
                else:
                    report['sorted_files'][src_path] = {
                        'dest': rel_dest,
                        'cluster': cluster_folders[primary_dest_cluster],
                        'matched_clusters': [cluster_folders[cid] for cid in matched_clusters if cid in cluster_folders]
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
