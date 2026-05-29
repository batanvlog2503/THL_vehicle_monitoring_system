import os
import cv2
import numpy as np


# ============================================================
# COMMON HELPERS
# ============================================================
def iou_xyxy(a, b) -> float:
    """Tính IoU giữa 2 box (x1,y1,x2,y2)."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    return inter / (area_a + area_b - inter + 1e-6)


def is_valid_box(x1, y1, x2, y2, img_shape) -> bool:
    """Lọc box quá nhỏ, quá lớn, hoặc tỷ lệ bất thường."""
    H, W = img_shape[:2]
    w, h = x2 - x1, y2 - y1
    if w <= 0 or h <= 0:
        return False
    area  = w * h
    ratio = w / float(h + 1e-6)
    return (
        area >= H * W * 0.0004 and
        area <= H * W * 0.30   and
        0.4 <= ratio <= 7.0
    )


def open_video(path: str):
    """Thử mở video với nhiều backend, trả None nếu thất bại."""
    if not os.path.exists(path):
        print(f"[ERROR] Không tìm thấy video: {path}")
        return None
    for name, backend in [("FFMPEG", cv2.CAP_FFMPEG),
                           ("MSMF",   cv2.CAP_MSMF),
                           ("AUTO",   None)]:
        cap = cv2.VideoCapture(path) if backend is None \
              else cv2.VideoCapture(path, backend)
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                print(f"[Video] Mở thành công với backend {name}")
                return cap
        cap.release()
    print("[ERROR] Không mở được video!")
    return None


def draw_label(img, x1, y1, text: str, score: float = None):
    """Vẽ label đẹp lên frame."""
    if not text:
        return
    label = text if score is None else f"{text}  {score:.2f}"
    font, scale, thick = cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2
    (tw, th), _ = cv2.getTextSize(label, font, scale, thick)
    tx = max(5, x1)
    ty = y1 - 12
    if ty - th < 5:
        ty = y1 + th + 14
    tx = min(tx, max(5, img.shape[1] - tw - 8))
    cv2.rectangle(img, (tx - 4, ty - th - 6), (tx + tw + 4, ty + 4), (0, 210, 0), -1)
    cv2.putText(img, label, (tx, ty), font, scale, (0, 0, 0), thick, cv2.LINE_AA)


def parse_box(s: str):
    """Parse chuỗi 'x1,y1,x2,y2' → tuple (x1,y1,x2,y2) hoặc None."""
    try:
        return tuple(int(float(v)) for v in str(s).split(","))
    except Exception:
        return None
