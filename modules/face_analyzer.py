import cv2
import numpy as np
from utils.logger import logger

# We import insightface here so that if the user does not have it installed yet, the import error happens when the class is initialized.
class FaceAnalyzer:
    def __init__(self, config):
        self.config = config
        self.app = None
        self.initialized = False

    def fallback_to_cpu(self):
        try:
            from insightface.app import FaceAnalysis
            logger.warning("GPU execution provider failure detected. Re-initializing InsightFace on CPU...")
            providers = ['CPUExecutionProvider']
            self.app = FaceAnalysis(
                name=self.config.model_pack,
                allowed_modules=['detection', 'recognition', 'genderage'],
                providers=providers
            )
            self.app.prepare(ctx_id=-1, det_size=(640, 640))
            self.initialized = True
            logger.info("InsightFace successfully re-initialized on CPU.")
        except Exception as e:
            logger.error(f"Failed to fallback to CPU for InsightFace: {e}")
            raise e

    def initialize(self):
        if self.initialized:
            return
            
        try:
            from insightface.app import FaceAnalysis
            logger.info(f"Initializing InsightFace with model pack: {self.config.model_pack}...")
            
            # Try DirectML first
            providers = ['DmlExecutionProvider', 'CPUExecutionProvider']
            logger.info(f"Setting ONNX Runtime providers to: {providers}")
            
            self.app = FaceAnalysis(
                name=self.config.model_pack,
                allowed_modules=['detection', 'recognition', 'genderage'],
                providers=providers
            )
            
            # Initialize inside execution provider (ctx_id=0 represents the GPU index)
            try:
                self.app.prepare(ctx_id=0, det_size=(640, 640))
                self.initialized = True
                logger.info("InsightFace successfully initialized with DirectML.")
            except Exception as gpu_err:
                logger.warning(f"Failed to initialize InsightFace on GPU (DirectML): {gpu_err}. Falling back to CPU...")
                self.fallback_to_cpu()
        except Exception as e:
            logger.error(f"Failed to initialize InsightFace: {e}")
            logger.error("Please verify that insightface and onnxruntime-directml are installed and functional.")
            raise e

    def analyze_image(self, image_path: str, frame_index: int = 0) -> list:
        """
        Analyze an image (or keyframe) for faces.
        Returns:
            list of dicts: each containing bbox, embedding, gender, gender_score, frame_index
        """
        if not self.initialized:
            self.initialize()
            
        img = cv2.imread(image_path)
        if img is None:
            logger.error(f"Failed to read image at path: {image_path}")
            return []

        # Get faces
        try:
            try:
                faces = self.app.get(img)
            except Exception as e:
                err_msg = str(e)
                if any(x in err_msg.lower() for x in ["suspended", "device", "fail", "dml", "onnxruntime"]):
                    logger.warning(f"InsightFace GPU error during get(): {e}. Falling back to CPU...")
                    self.fallback_to_cpu()
                    # Retry once on CPU
                    faces = self.app.get(img)
                else:
                    raise e

            # Fallback for extreme close-ups if no faces were detected at default scale
            if not faces:
                logger.info("No faces detected at default scale. Retrying with padded canvas...")
                h, w, c = img.shape
                canvas_size = 2 * max(h, w)
                canvas = np.zeros((canvas_size, canvas_size, c), dtype=np.uint8)
                y_offset = (canvas_size - h) // 2
                x_offset = (canvas_size - w) // 2
                canvas[y_offset:y_offset+h, x_offset:x_offset+w] = img
                
                try:
                    faces_padded = self.app.get(canvas)
                except Exception as e:
                    err_msg = str(e)
                    if any(x in err_msg.lower() for x in ["suspended", "device", "fail", "dml", "onnxruntime"]):
                        logger.warning(f"InsightFace GPU error during padded get(): {e}. Falling back to CPU...")
                        self.fallback_to_cpu()
                        # Retry once on CPU
                        faces_padded = self.app.get(canvas)
                    else:
                        raise e

                if faces_padded:
                    logger.info(f"Detected {len(faces_padded)} face(s) in padded canvas fallback.")
                    for f in faces_padded:
                        if hasattr(f, 'bbox') and f.bbox is not None:
                            f.bbox[0] -= x_offset
                            f.bbox[1] -= y_offset
                            f.bbox[2] -= x_offset
                            f.bbox[3] -= y_offset
                        if hasattr(f, 'kps') and f.kps is not None:
                            f.kps[:, 0] -= x_offset
                            f.kps[:, 1] -= y_offset
                    faces = faces_padded
        except Exception as e:
            logger.error(f"Error during InsightFace inference: {e}")
            return []
            
        results = []
        for face in faces:
            # Check size constraint
            bbox = face.bbox.astype(int)
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            if width < self.config.min_face_size or height < self.config.min_face_size:
                continue
                
            # Check detection confidence
            det_score = face.det_score
            if det_score < self.config.face_det_threshold:
                continue

            # Filter out extreme profiles / kissing scenes (where eye-to-eye distance is too small relative to face width)
            if hasattr(face, 'kps') and face.kps is not None:
                try:
                    left_eye = face.kps[0]
                    right_eye = face.kps[1]
                    eye_dist = np.linalg.norm(left_eye - right_eye)
                    eye_ratio = eye_dist / width
                    
                    min_ratio = getattr(self.config, 'min_eye_dist_ratio', 0.20)
                    if eye_ratio < min_ratio:
                        logger.info(f"Skipping profile/kissing face with eye ratio {eye_ratio:.3f} < {min_ratio}")
                        continue
                except Exception as e:
                    logger.debug(f"Failed to check eye ratio: {e}")

            # Parse gender
            # In InsightFace, face.gender is typically:
            # 1 for male, 0 for female
            # Or it might be a class index/label.
            # Let's map it safely:
            gender_raw = getattr(face, 'gender', None)
            
            # If gender_raw is an int: 0 is Female, 1 is Male
            # If it's a string, look for 'f'
            is_female = False
            gender_score = 1.0  # default
            
            if gender_raw is not None:
                if isinstance(gender_raw, (int, np.integer)):
                    is_female = (gender_raw == 0)
                else:
                    is_female = 'f' in str(gender_raw).lower()
                    
            gender_label = 'female' if is_female else 'male'
            
            # Embedding check
            embedding = getattr(face, 'normed_embedding', None)
            if embedding is None:
                embedding = getattr(face, 'embedding', None)
                if embedding is not None:
                    # L2 normalize embedding if it's not pre-normalized
                    norm = np.linalg.norm(embedding)
                    if norm > 0:
                        embedding = embedding / norm

            if embedding is None:
                continue
                
            results.append({
                'frame_index': frame_index,
                'bbox': bbox.tolist(),
                'gender': gender_label,
                'gender_score': float(det_score), # Using detection score as proxy if gender confidence is not separate
                'embedding': embedding
            })
            
        return results
