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
    scan_depth: str = "fast"            # "fast", "deep", or "custom"
    multi_profile_policy: str = "primary_only" # "primary_only", "copy_all", or "virtual_all"
    profile_target: str = "female"      # "female", "male", or "all"
    multi_profile_min_keyframes: int = 2 # Min video keyframes required to map secondary profiles
    
    # Auto-naming
    auto_name_folders: bool = False     # Auto-name folders after sorting
    only_name_unnamed: bool = True      # Only attempt auto-naming for unnamed folders (female_xxx)
    name_confidence_threshold: float = 0.5 # Confidence threshold for renaming
    name_search_delay: float = 4.0      # Seconds to wait between search queries
    merge_on_name_conflict: bool = False # Merge folders if they resolve to the same name
    
    # UI status communications
    socket_updates: bool = True
    
    # Video player preference
    default_video_player: str = "browser"  # "browser" or "vlc"

    # Watch Party Configuration
    wp_use_cloudflare: bool = True
    wp_cloudflare_token: str = ""
    wp_custom_domain: str = ""
    wp_turn_server: str = ""
    wp_turn_username: str = ""
    wp_turn_credential: str = ""
    wp_run_local_turn: bool = False
    wp_local_turn_port: int = 3478
    wp_turn_secret: str = ""
    wp_enable_upnp: bool = True
    wp_use_hls: bool = False
    wp_hls_bitrate: str = "2500k"
    wp_hls_resolution: str = "1280x720"
