from ultralytics import YOLO
from main.config import DEVICE, MODEL_PATH
print("Loading YOLO model...")

tracking_model = YOLO(MODEL_PATH).to(DEVICE)
tracking_model.fuse()

print("YOLO loaded on", DEVICE)