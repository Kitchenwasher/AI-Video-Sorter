import numpy as np
from utils.logger import logger

class FaceClusterer:
    def __init__(self, config):
        self.config = config

    def cluster_embeddings(self, embeddings: list) -> list:
        """
        Clusters a list of embeddings.
        Args:
            embeddings (list of np.ndarray): list of 512-D normalized embeddings.
        Returns:
            list of int: Cluster labels. Label -1 indicates noise/unclustered.
        """
        if not embeddings:
            logger.info("No embeddings provided for clustering.")
            return []
            
        emb_matrix = np.array(embeddings)
        
        # Ensure embeddings are normalized
        norms = np.linalg.norm(emb_matrix, axis=1, keepdims=True)
        # Avoid divide by zero
        norms[norms == 0] = 1.0
        emb_matrix = emb_matrix / norms

        num_samples = len(emb_matrix)
        logger.info(f"Clustering {num_samples} face embeddings...")
        
        # Adjust parameters if we have too few samples
        min_cluster_size = self.config.min_cluster_size
        if num_samples < min_cluster_size:
            logger.warning(f"Total face count ({num_samples}) is less than min_cluster_size ({min_cluster_size}). All faces will be unclustered.")
            return [-1] * num_samples

        labels = []
        
        # Try HDBSCAN first
        try:
            from sklearn.cluster import HDBSCAN
            logger.info("Using HDBSCAN clustering...")
            clusterer = HDBSCAN(
                min_cluster_size=min_cluster_size,
                min_samples=1,  # Allow smaller groups
                cluster_selection_epsilon=self.config.cluster_epsilon,
                metric='euclidean'
            )
            labels = clusterer.fit_predict(emb_matrix).tolist()
        except Exception as e:
            logger.warning(f"HDBSCAN clustering failed or not available ({e}). Falling back to DBSCAN...")
            
            # Fallback 1: DBSCAN
            try:
                from sklearn.cluster import DBSCAN
                logger.info("Using DBSCAN clustering...")
                clusterer = DBSCAN(
                    eps=self.config.cluster_epsilon,
                    min_samples=min_cluster_size,
                    metric='euclidean'
                )
                labels = clusterer.fit_predict(emb_matrix).tolist()
            except Exception as ex:
                logger.error(f"DBSCAN clustering failed: {ex}. Falling back to simple Agglomerative clustering...")
                
                # Fallback 2: Agglomerative Clustering
                try:
                    from sklearn.cluster import AgglomerativeClustering
                    clusterer = AgglomerativeClustering(
                        n_clusters=None,
                        distance_threshold=self.config.cluster_epsilon,
                        metric='euclidean',
                        linkage='average'
                    )
                    labels = clusterer.fit_predict(emb_matrix).tolist()
                except Exception as ex2:
                    logger.error(f"All clustering algorithms failed: {ex2}")
                    labels = [-1] * num_samples

                
        # Count clusters
        unique_labels = set(labels)
        num_clusters = len([l for l in unique_labels if l != -1])
        num_noise = labels.count(-1)
        
        logger.info(f"Clustering completed: Found {num_clusters} unique clusters and {num_noise} noise faces.")
        return labels

    def find_cluster_medoids(self, embeddings: list, labels: list) -> dict:
        """
        Finds the index of the representative face (medoid) for each cluster.
        Returns:
            dict: {cluster_id: index_of_representative_face_in_original_list}
        """
        if not embeddings or not labels:
            return {}
            
        emb_matrix = np.array(embeddings)
        medoids = {}
        
        unique_labels = set(labels)
        for label in unique_labels:
            if label == -1:
                continue
                
            # Get indices of members in this cluster
            indices = [i for i, l in enumerate(labels) if l == label]
            if not indices:
                continue
                
            if len(indices) == 1:
                medoids[label] = indices[0]
                continue
                
            cluster_embs = emb_matrix[indices]
            
            # Compute pairwise distance matrix (Euclidean distance on normalized embs = Cosine proxy)
            # D = sqrt(2 - 2 * A.dot(B.T))
            # Minimize sum of distances to other points
            dot_product = np.dot(cluster_embs, cluster_embs.T)
            # Clip to avoid numeric issues
            dot_product = np.clip(dot_product, -1.0, 1.0)
            distances = np.sqrt(np.maximum(0, 2 - 2 * dot_product))
            
            sum_distances = np.sum(distances, axis=1)
            best_idx_in_cluster = np.argmin(sum_distances)
            
            medoids[label] = indices[best_idx_in_cluster]
            
        return medoids
