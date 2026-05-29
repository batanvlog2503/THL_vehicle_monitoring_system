import os

# ============================================================
# CONFIG
# ============================================================
MODEL_PATH        = r"E:\LPR_ttcs\runs\plate_only_train\weights\best.pt"
VIDEO_PATH        = r"E:\LPR_ttcs\test_images\7733209278881.mp4"
OUTPUT_DIR        = r"E:\LPR_ttcs\Predict\video_pipeline"
RAW_CSV_PATH      = os.path.join(OUTPUT_DIR, "raw_ocr_results.csv")
FILLED_CSV_PATH   = os.path.join(OUTPUT_DIR, "filled_ocr_results.csv")
OUTPUT_VIDEO_PATH = os.path.join(OUTPUT_DIR, "result_video7733209278881_2.mp4")

SHOW_WINDOW       = True
SAVE_OUTPUT_VIDEO = True

# --- Detection ---
FRAME_SKIP        = 1       # Bỏ qua N-1 frame (1 = xử lý tất cả)
OCR_EVERY_N       = 2       # Chỉ OCR mỗi N frame để tiết kiệm CPU
IMG_SIZE          = 1280    # Input size YOLO (lớn hơn → phát hiện biển nhỏ hơn)
DET_CONF          = 0.15    # Ngưỡng confidence detect thấp → bắt nhiều hơn
DET_IOU           = 0.45    # NMS IoU threshold

# --- Tracking ---
TRACK_IOU_THR     = 0.25    # IoU tối thiểu để ghép track
TRACK_MAX_MISS    = 20      # Số frame liên tiếp không thấy thì xóa track
TRACK_BOX_ALPHA   = 0.6     # Hệ số EMA smooth box (0=không smooth, 1=không update)

# --- OCR ---
MIN_SCORE_ACCEPT  = 3.5     # Score tối thiểu để nhận kết quả OCR
CROP_PAD_RATIO_X  = 0.15    # Padding ngang khi crop biển
CROP_PAD_RATIO_Y  = 0.20    # Padding dọc khi crop biển
MIN_PLATE_H       = 40      # Biển nhỏ hơn threshold này sẽ được upscale mạnh hơn
UPSCALE_TARGET_H  = 200     # Chiều cao đích sau upscale

ALLOWED_SERIES    = set("ABCDEFGHKLMNPRSTUVXYZ")

os.makedirs(OUTPUT_DIR, exist_ok=True)
