import os
import warnings
import torch

warnings.filterwarnings("ignore", category=RuntimeWarning)

from ultralytics import YOLO
from config import MODEL_PATH, VIDEO_PATH, RAW_CSV_PATH, FILLED_CSV_PATH
from ocr_engine import PlateOCR
from pipeline import pass1_detect_ocr, pass2_smooth, pass3_visualize


# ============================================================
# MAIN
# ============================================================
def main():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Không tìm thấy model: {MODEL_PATH}")
    if not os.path.exists(VIDEO_PATH):
        raise FileNotFoundError(f"Không tìm thấy video: {VIDEO_PATH}")

    print("=" * 60)
    print("  LPR Pipeline v2 - Nhận diện biển số xe Việt Nam")
    print("=" * 60)

    print("\n[Init] Đang tải YOLO model...")
    model = YOLO(MODEL_PATH)

    print("[Init] Đang khởi tạo OCR engine...")
    ocr = PlateOCR(gpu=torch.cuda.is_available())

    raw_rows             = pass1_detect_ocr(model, ocr)
    filled_rows, _       = pass2_smooth(raw_rows)
    output_video         = pass3_visualize(filled_rows)

    print("\n" + "=" * 60)
    print("  HOÀN TẤT")
    print(f"  CSV thô         : {RAW_CSV_PATH}")
    print(f"  CSV đã làm mượt : {FILLED_CSV_PATH}")
    print(f"  Video output    : {output_video}")
    print("=" * 60)


if __name__ == "__main__":
    main()
