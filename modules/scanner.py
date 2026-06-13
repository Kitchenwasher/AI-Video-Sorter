import os
from utils.logger import logger

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}

class FileScanner:
    def __init__(self, input_dir: str):
        self.input_dir = input_dir

    def scan(self) -> dict:
        """
        Recursively scans input_dir and yields lists of video and image files.
        Returns:
            dict: {
                'videos': [list of absolute paths],
                'images': [list of absolute paths]
            }
        """
        results = {
            'videos': [],
            'images': []
        }
        
        if not os.path.exists(self.input_dir):
            logger.error(f"Input directory does not exist: {self.input_dir}")
            return results

        logger.info(f"Scanning directory recursively: {self.input_dir}")
        
        for root, _, files in os.walk(self.input_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                full_path = os.path.join(root, file)
                
                # Normalize path separators
                full_path = os.path.abspath(full_path)
                
                if ext in VIDEO_EXTENSIONS:
                    results['videos'].append(full_path)
                elif ext in IMAGE_EXTENSIONS:
                    results['images'].append(full_path)

        logger.info(f"Found {len(results['videos'])} videos and {len(results['images'])} images.")
        return results
