import os
from dataclasses import dataclass, field

@dataclass
class Config:
    input_dir: str = ""
    output_dir: str = ""
    mode: str = "move"                  # "copy" or "move"
    
    # Keyframe extraction
    keyframe_interval: int = 0          # 0 = use I-frames (nokey) only; >0 = extract every N seconds
    max_keyframes: int = 100            # Safety limit of keyframes per video
    
    # Face analysis
    model_pack: str = "buffalo_l"       # "buffalo_l" or "buffalo_s" or "antelopev2"
    face_det_threshold: float = 0.5     # Detection confidence threshold
    gender_threshold: float = 0.65      # Gender classification threshold (for female classification)
    min_face_size: int = 60             # Minimum face height/width in pixels
    min_eye_dist_ratio: float = 0.20    # Minimum ratio of eye-to-eye distance over face width to filter kissing/profile views
    
    # Clustering
    min_cluster_size: int = 2           # Min images of a female to form a cluster (since there might be fewer videos)
    cluster_epsilon: float = 0.85       # Cosine/Euclidean threshold for merging (0.85 is recommended for diverse expressions/angles in video)
    
    # Cache
    use_cache: bool = True              # Toggle caching of face embeddings
    keep_keyframes: bool = False        # Keep extracted keyframe images on disk to skip extraction on re-run (debug)
    prefer_popular_identities: bool = False # Prefer globally popular identities in multi-face videos
    extraction_percent: int = 100       # Only analyze the first X% of the video duration
    
    # UI status communications
    socket_updates: bool = True
