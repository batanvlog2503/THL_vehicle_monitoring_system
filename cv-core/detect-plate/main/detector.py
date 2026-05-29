import numpy as np

from config import (
    DET_CONF, DET_IOU, IMG_SIZE,
    CROP_PAD_RATIO_X, CROP_PAD_RATIO_Y
)
from utils import iou_xyxy, is_valid_box


# ============================================================
# DETECTION
# ============================================================
def detect_plates(model, frame: np.ndarray) -> list[dict]:
    """
    Phát hiện biển số trong frame, lọc NMS tay để ưu tiên conf cao.
    """
    results = model.predict(
        source=frame, conf=DET_CONF, iou=DET_IOU,
        imgsz=IMG_SIZE, verbose=False
    )
    raw_dets = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            if is_valid_box(x1, y1, x2, y2, frame.shape):
                raw_dets.append({"box": (x1, y1, x2, y2), "det_conf": conf})

    raw_dets.sort(key=lambda d: d["det_conf"], reverse=True)
    final = []
    for d in raw_dets:
        if all(iou_xyxy(d["box"], f["box"]) <= 0.40 for f in final):
            final.append(d)
    return final


def crop_plate(frame: np.ndarray, box: tuple) -> np.ndarray:
    """Crop biển số với padding theo tỷ lệ để không mất ký tự."""
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    H, W = frame.shape[:2]
    px = int(w * CROP_PAD_RATIO_X)
    py = int(h * CROP_PAD_RATIO_Y)
    return frame[
        max(0, y1 - py): min(H, y2 + py),
        max(0, x1 - px): min(W, x2 + px)
    ]
