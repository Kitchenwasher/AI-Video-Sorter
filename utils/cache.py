import os
import json
import numpy as np
from utils.logger import logger
from utils.models import db, ProcessedFile, Face, PersistentProfile

class EmbeddingCache:
    def __init__(self, cache_dir: str = None):
        # cache_dir is kept for signature compatibility with existing calls
        pass

    def get_file_signature(self, file_path: str):
        try:
            stat = os.stat(file_path)
            return stat.st_mtime, stat.st_size
        except Exception as e:
            logger.error(f"Error getting file signature for {file_path}: {e}")
            return None, None

    def get_cached_faces(self, file_path: str):
        mtime, size = self.get_file_signature(file_path)
        if mtime is None:
            return None

        try:
            processed_file = ProcessedFile.query.filter_by(file_path=file_path).first()
            if not processed_file:
                return None
                
            # Verify if file has changed
            if abs(processed_file.mtime - mtime) > 0.01 or processed_file.size != size:
                # File modified, delete old records
                logger.info(f"File {file_path} changed, clearing cache.")
                db.session.delete(processed_file)
                db.session.commit()
                return None
                
            # Retrieve faces
            faces = []
            for face in processed_file.faces:
                bbox = json.loads(face.bbox_json)
                embedding = np.frombuffer(face.embedding_blob, dtype=np.float32)
                faces.append({
                    'frame_index': face.frame_index,
                    'bbox': bbox,
                    'gender': face.gender,
                    'gender_score': face.gender_score,
                    'embedding': embedding
                })
                
            return faces
        except Exception as e:
            logger.error(f"Failed to get cached faces for {file_path}: {e}")
            return None

    def cache_faces(self, file_path: str, file_type: str, faces_data: list):
        mtime, size = self.get_file_signature(file_path)
        if mtime is None:
            return

        try:
            # Delete if exists
            ProcessedFile.query.filter_by(file_path=file_path).delete()
            db.session.commit()
            
            # Insert file
            processed_file = ProcessedFile(
                file_path=file_path,
                file_type=file_type,
                mtime=mtime,
                size=size
            )
            db.session.add(processed_file)
            db.session.flush()  # Populate the ID for foreign keys
            
            # Insert faces
            for face in faces_data:
                bbox_json = json.dumps(list(face['bbox']))
                embedding_blob = face['embedding'].astype(np.float32).tobytes()
                new_face = Face(
                    file_id=processed_file.id,
                    frame_index=face['frame_index'],
                    bbox_json=bbox_json,
                    gender=face['gender'],
                    gender_score=face['gender_score'],
                    embedding_blob=embedding_blob
                )
                db.session.add(new_face)
                
            db.session.commit()
        except Exception as e:
            logger.error(f"Failed to cache faces for {file_path}: {e}")
            db.session.rollback()

    def clear(self):
        try:
            Face.query.delete()
            ProcessedFile.query.delete()
            db.session.commit()
            logger.info("Cache cleared.")
        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            db.session.rollback()

    def get_persistent_profiles(self) -> list:
        try:
            rows = PersistentProfile.query.all()
            profiles = []
            for row in rows:
                embedding = np.frombuffer(row.embedding_blob, dtype=np.float32)
                profiles.append({
                    'profile_id': row.id,
                    'folder_name': row.folder_name,
                    'embedding': embedding
                })
            return profiles
        except Exception as e:
            logger.error(f"Failed to load persistent profiles: {e}")
            return []

    def update_profile_folder_name(self, profile_id: int, new_folder_name: str):
        try:
            profile = PersistentProfile.query.get(profile_id)
            if profile:
                profile.folder_name = new_folder_name
                db.session.commit()
        except Exception as e:
            logger.error(f"Failed to update profile folder name for ID {profile_id}: {e}")
            db.session.rollback()

    def add_persistent_profile(self, folder_name: str, embedding: np.ndarray) -> int:
        profile_id = -1
        try:
            embedding_blob = embedding.astype(np.float32).tobytes()
            profile = PersistentProfile(
                folder_name=folder_name,
                embedding_blob=embedding_blob
            )
            db.session.add(profile)
            db.session.commit()
            profile_id = profile.id
        except Exception as e:
            logger.error(f"Failed to add persistent profile for {folder_name}: {e}")
            db.session.rollback()
        return profile_id

    def add_persistent_profile_with_id(self, profile_id: int, folder_name: str, embedding: np.ndarray):
        try:
            embedding_blob = embedding.astype(np.float32).tobytes()
            profile = PersistentProfile.query.get(profile_id)
            if profile:
                profile.folder_name = folder_name
                profile.embedding_blob = embedding_blob
            else:
                profile = PersistentProfile(
                    id=profile_id,
                    folder_name=folder_name,
                    embedding_blob=embedding_blob
                )
                db.session.add(profile)
            db.session.commit()
        except Exception as e:
            logger.error(f"Failed to insert persistent profile with ID {profile_id}: {e}")
            db.session.rollback()

    def delete_persistent_profile(self, profile_id: int):
        try:
            profile = PersistentProfile.query.get(profile_id)
            if profile:
                db.session.delete(profile)
                db.session.commit()
        except Exception as e:
            logger.error(f"Failed to delete persistent profile ID {profile_id}: {e}")
            db.session.rollback()

    def copy_file_cache(self, src_path: str, dest_path: str):
        abs_src = os.path.abspath(src_path)
        abs_dest = os.path.abspath(dest_path)
        try:
            pf = ProcessedFile.query.filter_by(file_path=abs_src).first()
            if pf:
                # Check if dest already exists
                existing = ProcessedFile.query.filter_by(file_path=abs_dest).first()
                if existing:
                    db.session.delete(existing)
                    db.session.commit()
                
                # Clone pf
                new_pf = ProcessedFile(
                    file_path=abs_dest,
                    file_type=pf.file_type,
                    mtime=pf.mtime,
                    size=pf.size
                )
                db.session.add(new_pf)
                db.session.flush()
                
                for face in pf.faces:
                    new_face = Face(
                        file_id=new_pf.id,
                        frame_index=face.frame_index,
                        bbox_json=face.bbox_json,
                        gender=face.gender,
                        gender_score=face.gender_score,
                        embedding_blob=face.embedding_blob
                    )
                    db.session.add(new_face)
                db.session.commit()
                logger.info(f"DB copy cache: {abs_src} -> {abs_dest}")
        except Exception as e:
            logger.error(f"Failed to copy file cache in DB: {e}")
            db.session.rollback()

    def update_file_path(self, old_path: str, new_path: str):
        abs_old = os.path.abspath(old_path)
        abs_new = os.path.abspath(new_path)
        try:
            pf = ProcessedFile.query.filter_by(file_path=abs_old).first()
            if pf:
                pf.file_path = abs_new
                db.session.commit()
                logger.info(f"DB update path: {abs_old} -> {abs_new}")
        except Exception as e:
            logger.error(f"Failed to update file path in DB: {e}")
            db.session.rollback()

    def update_folder_paths(self, old_folder_path: str, new_folder_path: str):
        abs_old_prefix = os.path.abspath(old_folder_path) + os.sep
        abs_new_prefix = os.path.abspath(new_folder_path) + os.sep
        try:
            files_to_update = ProcessedFile.query.filter(
                ProcessedFile.file_path.like(abs_old_prefix + '%')
            ).all()
            for pf in files_to_update:
                pf.file_path = pf.file_path.replace(abs_old_prefix, abs_new_prefix)
            db.session.commit()
            logger.info(f"DB update folder paths: {abs_old_prefix} -> {abs_new_prefix}")
        except Exception as e:
            logger.error(f"Failed to update folder paths in DB: {e}")
            db.session.rollback()

    def update_profile_folder_name_by_old_name(self, old_folder_name: str, new_folder_name: str):
        try:
            profiles = PersistentProfile.query.filter_by(folder_name=old_folder_name).all()
            for profile in profiles:
                profile.folder_name = new_folder_name
            db.session.commit()
            logger.info(f"DB update profile folder name: {old_folder_name} -> {new_folder_name}")
        except Exception as e:
            logger.error(f"Failed to update profile folder name for {old_folder_name} -> {new_folder_name}: {e}")
            db.session.rollback()
