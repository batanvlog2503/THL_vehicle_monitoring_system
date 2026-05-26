import torch

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

MODEL_PATH = r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt"
TRACKER_PATH = r"D:\cv-core\botsort.yaml"
UPLOAD_DIR = "uploads"