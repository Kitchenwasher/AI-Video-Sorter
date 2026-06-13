import logging
import sys

# Global log listener/buffer for UI updates
class UILogHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.logs = []

    def emit(self, record):
        log_entry = self.format(record)
        self.logs.append(log_entry)
        # Keep logs list size bounded
        if len(self.logs) > 500:
            self.logs.pop(0)

ui_log_handler = UILogHandler()

def setup_logger():
    logger = logging.getLogger("face_sorter")
    logger.setLevel(logging.INFO)
    
    # Clean existing handlers
    if logger.hasHandlers():
        logger.handlers.clear()
        
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # UI buffer handler
    ui_log_handler.setFormatter(formatter)
    logger.addHandler(ui_log_handler)
    
    return logger

logger = setup_logger()
