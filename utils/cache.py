import sqlite3
import os
import json
import numpy as np
from utils.logger import logger

class EmbeddingCache:
    def __init__(self, cache_dir: str):
        os.makedirs(cache_dir, exist_ok=True)
        self.db_path = os.path.join(cache_dir, "face_embeddings_cache.db")
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Table for files
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS processed_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE,
                file_type TEXT,
                mtime REAL,
                size INTEGER,
                processed_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Table for faces
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS faces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER,
                frame_index INTEGER,
                bbox_json TEXT,
                gender TEXT,
                gender_score REAL,
                embedding_blob BLOB,
                FOREIGN KEY (file_id) REFERENCES processed_files(id) ON DELETE CASCADE
            )
        ''')

        # Table for persistent profiles
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS persistent_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_name TEXT,
                embedding_blob BLOB,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()

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

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, mtime, size FROM processed_files WHERE file_path = ?
        ''', (file_path,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return None
            
        db_id, db_mtime, db_size = row
        
        # Verify if file has changed
        if abs(db_mtime - mtime) > 0.01 or db_size != size:
            # File modified, delete old records
            logger.info(f"File {file_path} changed, clearing cache.")
            cursor.execute("DELETE FROM processed_files WHERE id = ?", (db_id,))
            conn.commit()
            conn.close()
            return None
            
        # Retrieve faces
        cursor.execute('''
            SELECT frame_index, bbox_json, gender, gender_score, embedding_blob FROM faces WHERE file_id = ?
        ''', (db_id,))
        rows = cursor.fetchall()
        
        faces = []
        for frame_index, bbox_json, gender, gender_score, embedding_blob in rows:
            bbox = json.loads(bbox_json)
            embedding = np.frombuffer(embedding_blob, dtype=np.float32)
            faces.append({
                'frame_index': frame_index,
                'bbox': bbox,
                'gender': gender,
                'gender_score': gender_score,
                'embedding': embedding
            })
            
        conn.close()
        return faces

    def cache_faces(self, file_path: str, file_type: str, faces_data: list):
        mtime, size = self.get_file_signature(file_path)
        if mtime is None:
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Delete if exists
            cursor.execute("DELETE FROM processed_files WHERE file_path = ?", (file_path,))
            
            # Insert file
            cursor.execute('''
                INSERT INTO processed_files (file_path, file_type, mtime, size)
                VALUES (?, ?, ?, ?)
            ''', (file_path, file_type, mtime, size))
            
            file_id = cursor.lastrowid
            
            # Insert faces
            for face in faces_data:
                bbox_json = json.dumps(list(face['bbox']))
                embedding_blob = face['embedding'].astype(np.float32).tobytes()
                cursor.execute('''
                    INSERT INTO faces (file_id, frame_index, bbox_json, gender, gender_score, embedding_blob)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (file_id, face['frame_index'], bbox_json, face['gender'], face['gender_score'], embedding_blob))
                
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to cache faces for {file_path}: {e}")
            conn.rollback()
        finally:
            conn.close()

    def clear(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM faces")
        cursor.execute("DELETE FROM processed_files")
        conn.commit()
        conn.close()
        logger.info("Cache cleared.")

    def get_persistent_profiles(self) -> list:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                SELECT id, folder_name, embedding_blob FROM persistent_profiles
            ''')
            rows = cursor.fetchall()
            profiles = []
            for profile_id, folder_name, embedding_blob in rows:
                embedding = np.frombuffer(embedding_blob, dtype=np.float32)
                profiles.append({
                    'profile_id': profile_id,
                    'folder_name': folder_name,
                    'embedding': embedding
                })
            return profiles
        except sqlite3.OperationalError:
            return []
        finally:
            conn.close()

    def update_profile_folder_name(self, profile_id: int, new_folder_name: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                UPDATE persistent_profiles 
                SET folder_name = ?, last_updated = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (new_folder_name, profile_id))
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to update profile folder name for ID {profile_id}: {e}")
        finally:
            conn.close()

    def add_persistent_profile(self, folder_name: str, embedding: np.ndarray) -> int:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        profile_id = -1
        try:
            embedding_blob = embedding.astype(np.float32).tobytes()
            cursor.execute('''
                INSERT INTO persistent_profiles (folder_name, embedding_blob)
                VALUES (?, ?)
            ''', (folder_name, embedding_blob))
            conn.commit()
            profile_id = cursor.lastrowid
        except Exception as e:
            logger.error(f"Failed to add persistent profile for {folder_name}: {e}")
        finally:
            conn.close()
        return profile_id

    def add_persistent_profile_with_id(self, profile_id: int, folder_name: str, embedding: np.ndarray):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            embedding_blob = embedding.astype(np.float32).tobytes()
            cursor.execute('''
                INSERT OR REPLACE INTO persistent_profiles (id, folder_name, embedding_blob)
                VALUES (?, ?, ?)
            ''', (profile_id, folder_name, embedding_blob))
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to insert persistent profile with ID {profile_id}: {e}")
        finally:
            conn.close()

    def delete_persistent_profile(self, profile_id: int):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('DELETE FROM persistent_profiles WHERE id = ?', (profile_id,))
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to delete persistent profile ID {profile_id}: {e}")
        finally:
            conn.close()
