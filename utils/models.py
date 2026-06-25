import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class ProcessedFile(db.Model):
    __tablename__ = 'processed_files'
    id = db.Column(db.Integer, primary_key=True)
    file_path = db.Column(db.String, unique=True, nullable=False)
    file_type = db.Column(db.String, nullable=True)
    mtime = db.Column(db.Float, nullable=True)
    size = db.Column(db.BigInteger, nullable=True)
    analysis_fingerprint = db.Column(db.String, nullable=True)
    processed_time = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    faces = db.relationship('Face', backref='processed_file', cascade='all, delete-orphan')

class Face(db.Model):
    __tablename__ = 'faces'
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('processed_files.id', ondelete='CASCADE'), nullable=False)
    frame_index = db.Column(db.Integer, nullable=True)
    bbox_json = db.Column(db.Text, nullable=True)
    gender = db.Column(db.String, nullable=True)
    gender_score = db.Column(db.Float, nullable=True)
    embedding_blob = db.Column(db.LargeBinary, nullable=True)

class PersistentProfile(db.Model):
    __tablename__ = 'persistent_profiles'
    id = db.Column(db.Integer, primary_key=True)
    folder_name = db.Column(db.String, nullable=True)
    embedding_blob = db.Column(db.LargeBinary, nullable=True)
    last_updated = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class ProfileMediaMembership(db.Model):
    __tablename__ = 'profile_media_memberships'
    id = db.Column(db.Integer, primary_key=True)
    profile_id = db.Column(db.Integer, db.ForeignKey('persistent_profiles.id', ondelete='CASCADE'), nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey('processed_files.id', ondelete='CASCADE'), nullable=False)
    role = db.Column(db.String, default='secondary')
    evidence_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    __table_args__ = (
        db.UniqueConstraint('profile_id', 'file_id', name='uq_profile_media_membership'),
    )

class WatchHistory(db.Model):
    __tablename__ = 'watch_history'
    id = db.Column(db.Integer, primary_key=True)
    file_path = db.Column(db.String, unique=True, nullable=False) # e.g. "female_001/video.mp4"
    playback_position = db.Column(db.Float, default=0.0)          # in seconds
    duration = db.Column(db.Float, default=0.0)                   # in seconds
    watched_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    is_completed = db.Column(db.Boolean, default=False)
    rating = db.Column(db.Integer, nullable=True)


class WatchParty(db.Model):
    __tablename__ = 'watch_parties'
    id = db.Column(db.String(36), primary_key=True)  # UUID token
    folder_name = db.Column(db.String(255), nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    admin_token = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)


class CustomSound(db.Model):
    __tablename__ = 'custom_sounds'
    id = db.Column(db.Integer, primary_key=True)
    sound_id = db.Column(db.String(50), unique=True, nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    uploaded_by = db.Column(db.String(100), nullable=True)
    duration = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
