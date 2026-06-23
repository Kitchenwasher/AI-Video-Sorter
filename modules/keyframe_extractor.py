import os
import subprocess
import shutil
import uuid
import cv2
from utils.logger import logger

class KeyframeExtractor:
    def __init__(self, workspace_dir: str, config):
        self.config = config
        # Temporary directory inside the workspace as per instructions
        self.temp_dir = os.path.join(workspace_dir, ".temp_keyframes")
        os.makedirs(self.temp_dir, exist_ok=True)

    def _effective_extraction_percent(self) -> int:
        if getattr(self.config, 'scan_depth', 'fast') == 'deep':
            return 100
        return int(getattr(self.config, 'extraction_percent', 100))

    def _effective_max_keyframes(self) -> int:
        if getattr(self.config, 'scan_depth', 'fast') == 'deep':
            return 10000
        return int(getattr(self.config, 'max_keyframes', 100))

    def extract_keyframes(self, video_path: str) -> list:
        """
        Extract keyframes from a video file.
        Returns:
            list: List of dicts with {'path': frame_image_path, 'frame_index': idx}
        """
        # Create a stable subfolder for this video's keyframes based on path hash
        import hashlib
        video_hash = hashlib.md5(video_path.encode('utf-8')).hexdigest()
        video_temp_dir = os.path.join(self.temp_dir, video_hash)
        
        # Check if keep_keyframes is enabled and keyframes already exist
        if self.config.keep_keyframes and os.path.exists(video_temp_dir):
            frames = []
            for file in sorted(os.listdir(video_temp_dir)):
                if file.startswith("frame_") and file.endswith(".jpg"):
                    file_path = os.path.abspath(os.path.join(video_temp_dir, file))
                    try:
                        parts = os.path.splitext(file)[0].split('_')
                        frame_index = int(parts[-1])
                    except ValueError:
                        frame_index = len(frames)
                    frames.append({
                        'path': file_path,
                        'frame_index': frame_index
                    })
            if frames:
                logger.info(f"Debug Mode: Skipping extraction for {os.path.basename(video_path)} and re-using {len(frames)} existing keyframes.")
                return frames
                
        os.makedirs(video_temp_dir, exist_ok=True)
        
        logger.info(f"Extracting keyframes from {os.path.basename(video_path)}...")
        
        # Try FFmpeg first
        extracted_frames = self._extract_with_ffmpeg(video_path, video_temp_dir)
        
        if not extracted_frames:
            logger.warning("FFmpeg extraction returned no frames or failed. Falling back to OpenCV frame-sampling...")
            extracted_frames = self._extract_with_opencv(video_path, video_temp_dir)
            
        # Limit the number of keyframes if it exceeds max_keyframes
        max_keyframes = self._effective_max_keyframes()
        if len(extracted_frames) > max_keyframes:
            logger.info(f"Limiting extracted keyframes from {len(extracted_frames)} to {max_keyframes} for {video_path}")
            # Evenly sample keyframes
            step = len(extracted_frames) / max_keyframes
            sampled = []
            for i in range(max_keyframes):
                idx = int(i * step)
                if idx < len(extracted_frames):
                    sampled.append(extracted_frames[idx])
            
            # Delete unsampled frame files to save space
            sampled_paths = {s['path'] for s in sampled}
            for frame in extracted_frames:
                if frame['path'] not in sampled_paths and os.path.exists(frame['path']):
                    try:
                        os.remove(frame['path'])
                    except Exception:
                        pass
            extracted_frames = sampled
            
        return extracted_frames

    def _find_ffmpeg(self) -> str:
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        try:
            res = subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, startupinfo=startupinfo, timeout=2)
            if res.returncode == 0:
                return 'ffmpeg'
        except FileNotFoundError:
            pass

        # Check local winget directory
        local_app_data = os.environ.get('LOCALAPPDATA', '')
        if local_app_data:
            winget_dir = os.path.join(local_app_data, "Microsoft", "WinGet", "Packages")
            if os.path.exists(winget_dir):
                for root, dirs, files in os.walk(winget_dir):
                    if 'ffmpeg.exe' in files:
                        bin_path = os.path.abspath(root)
                        os.environ['PATH'] = bin_path + os.pathsep + os.environ.get('PATH', '')
                        logger.info(f"Dynamically mapped FFmpeg binary from winget packages path: {bin_path}")
                        return os.path.join(bin_path, 'ffmpeg.exe')
        return 'ffmpeg'

    def _get_video_duration(self, video_path: str) -> float:
        try:
            cap = cv2.VideoCapture(video_path)
            if cap.isOpened():
                fps = cap.get(cv2.CAP_PROP_FPS)
                total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                duration = total_frames / fps if fps > 0 else 0
                cap.release()
                return duration
        except Exception as e:
            logger.error(f"Error getting video duration for {video_path}: {e}")
        return 0.0

    def _extract_with_ffmpeg(self, video_path: str, output_dir: str) -> list:
        """
        Uses ffmpeg with -skip_frame nokey for high-speed I-frame extraction.
        Attempts GPU acceleration (d3d11va) first.
        """
        ffmpeg_exe = self._find_ffmpeg()
        output_template = os.path.join(output_dir, "frame_%04d.jpg")
        
        duration = self._get_video_duration(video_path)
        limit_duration = 0.0
        extraction_percent = self._effective_extraction_percent()
        if duration > 0.0 and extraction_percent < 100:
            limit_duration = duration * (extraction_percent / 100.0)
            logger.info(f"Limiting keyframe extraction to first {extraction_percent}% of video ({limit_duration:.1f}s of {duration:.1f}s)")
        
        # Try GPU-accelerated decoding first
        cmd_gpu = [
            ffmpeg_exe, '-y',
            '-hwaccel', 'd3d11va', # Use Direct3D11 Video Acceleration (standard DX12/D3D11 GPU decoders on Windows)
            '-skip_frame', 'nokey',
            '-i', video_path,
        ]
        if limit_duration > 0:
            cmd_gpu.extend(['-t', f"{limit_duration:.3f}"])
        cmd_gpu.extend([
            '-vsync', 'vfr',
            '-frame_pts', 'true',
            '-q:v', '2',
            output_template
        ])
        
        # Software fallback
        cmd_cpu = [
            ffmpeg_exe, '-y',
            '-skip_frame', 'nokey',
            '-i', video_path,
        ]
        if limit_duration > 0:
            cmd_cpu.extend(['-t', f"{limit_duration:.3f}"])
        cmd_cpu.extend([
            '-vsync', 'vfr',
            '-frame_pts', 'true',
            '-q:v', '2',
            output_template
        ])
        
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
        # 1. Try with GPU acceleration
        try:
            logger.info(f"Attempting GPU-accelerated keyframe extraction (d3d11va) for {os.path.basename(video_path)}...")
            process = subprocess.run(cmd_gpu, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, startupinfo=startupinfo, timeout=300)
            if process.returncode == 0:
                frames = self._collect_extracted_frames(output_dir)
                if frames:
                    logger.info(f"GPU-accelerated extraction successful: found {len(frames)} keyframes.")
                    return frames
        except subprocess.TimeoutExpired:
            logger.warning("GPU FFmpeg timed out, trying CPU fallback...")
        except Exception as e:
            logger.debug(f"GPU FFmpeg failed: {e}")

        # Clean any partial output from GPU attempt
        for file in os.listdir(output_dir):
            if file.startswith("frame_") and file.endswith(".jpg"):
                try:
                    os.remove(os.path.join(output_dir, file))
                except Exception:
                    pass

        # 2. Try with CPU decoding (software fallback)
        try:
            logger.info(f"Attempting standard CPU keyframe extraction for {os.path.basename(video_path)}...")
            process = subprocess.run(cmd_cpu, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, startupinfo=startupinfo, timeout=420)
            if process.returncode == 0:
                frames = self._collect_extracted_frames(output_dir)
                if frames:
                    return frames
        except subprocess.TimeoutExpired:
            logger.warning("CPU FFmpeg timed out.")
        except Exception as e:
            logger.debug(f"CPU FFmpeg failed: {e}")
            
        return []

    def _collect_extracted_frames(self, output_dir: str) -> list:
        frames = []
        for file in sorted(os.listdir(output_dir)):
            if file.startswith("frame_") and file.endswith(".jpg"):
                file_path = os.path.abspath(os.path.join(output_dir, file))
                try:
                    parts = os.path.splitext(file)[0].split('_')
                    frame_index = int(parts[-1])
                except ValueError:
                    frame_index = len(frames)
                    
                frames.append({
                    'path': file_path,
                    'frame_index': frame_index
                })
        return frames


    def _extract_with_opencv(self, video_path: str, output_dir: str) -> list:
        """
        Fallback using OpenCV to sample frames at regular intervals.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"OpenCV could not open video: {video_path}")
            return []
            
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if fps <= 0 or total_frames <= 0:
            # Fallback sample count
            fps = 30.0
            total_frames = 1000
            
        limit_frame = total_frames
        extraction_percent = self._effective_extraction_percent()
        if extraction_percent < 100:
            limit_frame = int(total_frames * (extraction_percent / 100.0))
            logger.info(f"Limiting OpenCV keyframe sampling to first {extraction_percent}% of video frames (frame {limit_frame} of {total_frames})")
            
        # Determine step size: sample 1 frame per second by default, or use config keyframe_interval
        interval_sec = self.config.keyframe_interval if self.config.keyframe_interval > 0 else 1.0
        frame_step = max(1, int(fps * interval_sec))
        
        frames = []
        frame_idx = 0
        
        while True:
            if frame_idx > limit_frame:
                break
                
            ret, frame = cap.read()
            if not ret:
                break
                
            # Sample frame
            if frame_idx % frame_step == 0:
                output_path = os.path.join(output_dir, f"frame_{frame_idx:04d}.jpg")
                cv2.imwrite(output_path, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                frames.append({
                    'path': os.path.abspath(output_path),
                    'frame_index': frame_idx
                })
                
                # Safeguard against too many frames in loop
                if len(frames) >= self._effective_max_keyframes() * 2:
                    break
                    
            frame_idx += 1
            
        cap.release()
        return frames

    def clean_temp_dir(self):
        """
        Deletes the entire temp keyframes directory.
        """
        if self.config.keep_keyframes:
            logger.info("Debug Mode (keep_keyframes=True): Skipping global temp keyframe cleanup.")
            return
            
        if os.path.exists(self.temp_dir):
            try:
                shutil.rmtree(self.temp_dir)
                os.makedirs(self.temp_dir, exist_ok=True)
                logger.info("Cleaned up temp keyframes directory.")
            except Exception as e:
                logger.error(f"Error cleaning up temp directory {self.temp_dir}: {e}")

    def clean_video_temp(self, video_frames: list):
        """
        Cleans up files from a single video run.
        """
        if self.config.keep_keyframes:
            # Skip video temp cleanup in debug mode
            return
            
        if not video_frames:
            return
            
        # Get directory of first frame
        parent_dir = os.path.dirname(video_frames[0]['path'])
        if os.path.basename(parent_dir) != ".temp_keyframes" and os.path.exists(parent_dir):
            try:
                shutil.rmtree(parent_dir)
            except Exception as e:
                logger.warning(f"Failed to delete video temp folder {parent_dir}: {e}")
