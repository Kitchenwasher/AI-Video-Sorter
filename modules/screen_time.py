import os
from collections import Counter
from utils.logger import logger

class ScreenTimeCalculator:
    def __init__(self, config):
        self.config = config

    def calculate_assignments(self, file_faces_map: dict, face_id_to_cluster: dict) -> dict:
        """
        Calculates the primary female cluster for each processed file.
        If config.prefer_popular_identities is True, and a file contains multiple female faces,
        the face belonging to the most globally popular female (in terms of video count) will be selected.
        """
        assignments = {}
        
        # 1. Map file_path -> set of female cluster IDs present in it
        file_clusters = {}
        # Also store the keyframe occurrences mapping for screen time calculation
        file_frame_occurrences = {}
        # Also store order of appearance to resolve ties
        file_first_seen = {}
        
        for file_path, faces in file_faces_map.items():
            clusters = set()
            occurrences = {} # {cluster_id: set(frame_indices)}
            first_seen_order = []
            
            for face in faces:
                if face['gender'] == 'female':
                    emb_idx = face['embedding_index']
                    cluster_id = face_id_to_cluster.get(emb_idx, -1)
                    
                    if cluster_id != -1:
                        clusters.add(cluster_id)
                        if cluster_id not in occurrences:
                            occurrences[cluster_id] = set()
                        occurrences[cluster_id].add(face['frame_index'])
                        if cluster_id not in first_seen_order:
                            first_seen_order.append(cluster_id)
                            
            file_clusters[file_path] = clusters
            file_frame_occurrences[file_path] = occurrences
            file_first_seen[file_path] = first_seen_order

        # 2. Calculate global popularity: cluster_id -> number of files it appears in
        global_popularity = Counter()
        for clusters in file_clusters.values():
            for cluster_id in clusters:
                global_popularity[cluster_id] += 1
                
        # 3. Calculate assignments
        for file_path, clusters in file_clusters.items():
            if not clusters:
                assignments[file_path] = -1
                continue
                
            occurrences = file_frame_occurrences[file_path]
            first_seen_order = file_first_seen[file_path]
            
            # Count keyframes per cluster in this file
            cluster_counts = {cid: len(frames) for cid, frames in occurrences.items()}
            
            # Determine if we should prefer globally popular identity
            # (Triggered if there are 2 or more distinct female identities and toggle is on)
            use_popularity = self.config.prefer_popular_identities and len(clusters) >= 2
            
            if use_popularity:
                # Find maximum global popularity among clusters in this file
                max_popularity = max(global_popularity[cid] for cid in clusters)
                
                # Filter candidates that have this max global popularity
                candidates = [cid for cid in clusters if global_popularity[cid] == max_popularity]
                
                if len(candidates) == 1:
                    assignments[file_path] = candidates[0]
                    logger.info(f"Preferred popular identity: selected cluster {candidates[0]} (appears in {max_popularity} files overall) for {os.path.basename(file_path)}")
                    continue
                else:
                    # Tie in global popularity, fall back to candidates with most screen time in this file
                    sub_counts = {cid: cluster_counts[cid] for cid in candidates}
                    max_sub_count = max(sub_counts.values())
                    candidates = [cid for cid, count in sub_counts.items() if count == max_sub_count]
            else:
                # Standard screen time assignment
                max_count = max(cluster_counts.values())
                candidates = [cid for cid, count in cluster_counts.items() if count == max_count]
                
            # Final tie resolver (if needed): pick first seen in video
            if len(candidates) == 1:
                assignments[file_path] = candidates[0]
            else:
                chosen_cluster = min(candidates, key=lambda c: first_seen_order.index(c))
                assignments[file_path] = chosen_cluster
                if use_popularity:
                    logger.info(f"Popularity tie for {os.path.basename(file_path)} between clusters {candidates}. Selected {chosen_cluster} based on first appearance.")
                else:
                    logger.info(f"Screen time tie for {os.path.basename(file_path)} between clusters {candidates}. Selected {chosen_cluster} based on first appearance.")
                
        return assignments

