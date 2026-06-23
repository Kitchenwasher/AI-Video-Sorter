import os
from celery import Celery
from config import Config
from pipeline import SortingPipeline
from app import app, db

# Initialize Celery
redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
celery_app = Celery(
    'tasks',
    broker=redis_url,
    backend=redis_url
)

@celery_app.task(bind=True)
def run_sorting_task(self, config_dict, workspace_dir):
    config_obj = Config(**config_dict)
    
    # Progress callback that updates Celery task state
    def progress_callback(stage, percent, message, detail=None):
        self.update_state(state='PROGRESS', meta={
            'stage': stage,
            'percent': percent,
            'message': message,
            'detail': detail
        })
        
    with app.app_context():
        pipeline = SortingPipeline(config_obj, workspace_dir, progress_callback, flask_app=app)
        report = pipeline.run()
        return report
