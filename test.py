from ultralytics import YOLO
import cv2
import easyocr
import numpy as np
import os
import re
import torch
import warnings

warnings.filterwarnings("ignore", category=RuntimeWarning)

# =========================
# CONFIG
# =========================
MODEL_PATH = r"E:\LPR_ttcs\runs\plate_only_train\weights\best.pt"
IMAGE_PATH = r"E:\LPR_ttcs\test_images\vehicle.jpg"
OUTPUT_PATH = r"E:\LPR_ttcs\Predict\result_vehicle.jpg"

USE_FOLDER = True
IMAGE_DIR = r"E:\LPR_ttcs\test_images"
OUTPUT_DIR = r"E:\LPR_ttcs\Predict"

SAVE_DEBUG = False
DEBUG_DIR = r"E:\LPR_ttcs\Predict\debug_steps"

os.makedirs(OUTPUT_DIR, exist_ok=True)
if SAVE_DEBUG:
    os.makedirs(DEBUG_DIR, exist_ok=True)

ALLOWED_SERIES = set("ABCDEFGHKLMNPRSTUVXYZ")


# =========================
# TEXT UTILS
# =========================
def clean_text(text: str) -> str:
    text = text.upper().replace(" ", "").replace("\n", "")
    return re.sub(r"[^A-Z0-9.-]", "", text)


def strip_alnum(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def l2d(ch: str) -> str:
    """Chuyển ký tự chữ hay nhầm thành số."""
    mp = {
        "O": "0", "Q": "0", "D": "0",
        "I": "1", "L": "1", "T": "1",
        "Z": "2", "S": "5", "B": "8", "G": "6"
    }
    return mp.get(ch, ch)


def d2l(ch: str) -> str:
    """Chuyển số hay nhầm thành ký tự chữ."""
    mp = {
        "0": "D", "2": "Z", "5": "S", "8": "B", "6": "G"
    }
    return mp.get(ch, ch)


# =========================
# IMAGE UTILS
# =========================
def resize_keep(img, target_h=200):
    h, w = img.shape[:2]
    if h == 0:
        return img
    scale = target_h / h
    new_w = max(1, int(w * scale))
    return cv2.resize(img, (new_w, target_h), interpolation=cv2.INTER_CUBIC)


def save_debug_image(name, img):
    if not SAVE_DEBUG:
        return
    path = os.path.join(DEBUG_DIR, name)
    cv2.imwrite(path, img)


def iou_xyxy(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    return inter / (area_a + area_b - inter + 1e-6)


def is_reasonable_plate_box(x1, y1, x2, y2, img_shape):
    h_img, w_img = img_shape[:2]
    w, h = x2 - x1, y2 - y1
    if w <= 0 or h <= 0:
        return False
    area = w * h
    img_area = h_img * w_img
    ratio = w / float(h + 1e-6)
    if area < img_area * 0.0005 or area > img_area * 0.30:
        return False
    if ratio < 0.5 or ratio > 6.5:
        return False
    return True


# =========================
# DETECT PLATE
# =========================
def detect_plate_regions(model, image_bgr):
    results = model.predict(
        source=image_bgr, conf=0.18, iou=0.5, imgsz=1280, verbose=False
    )
    dets = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            if not is_reasonable_plate_box(x1, y1, x2, y2, image_bgr.shape):
                continue
            dets.append({"box": (x1, y1, x2, y2), "conf": conf})

    dets = sorted(dets, key=lambda z: z["conf"], reverse=True)
    final_dets = []
    for item in dets:
        if all(iou_xyxy(item["box"], old["box"]) <= 0.4 for old in final_dets):
            final_dets.append(item)
    return final_dets


def make_plate_crops(image_bgr, box):
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    H, W = image_bgr.shape[:2]
    crops = []
    for pxr, pyr in [(0.06, 0.08), (0.10, 0.12), (0.16, 0.18)]:
        px, py = int(w * pxr), int(h * pyr)
        crop = image_bgr[
            max(0, y1 - py):min(H, y2 + py),
            max(0, x1 - px):min(W, x2 + px)
        ]
        if crop.size > 0:
            crops.append(crop)
    return crops


# =========================
# PREPROCESSING
# =========================
def to_gray(img):
    """Chuyển sang grayscale an toàn."""
    if len(img.shape) == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img.copy()


def step_contrast(gray):
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    return clahe.apply(gray)


def step_threshold(gray):
    return cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]


def step_threshold_inv(gray):
    return cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]


def step_adaptive(gray):
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )


def step_adaptive_inv(gray):
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 10
    )


def correct_backlight(gray):
    """
    Phát hiện và sửa ảnh ngược sáng (backlight) bằng gamma correction.
    Logic: nếu vùng trung tâm tối hơn viền → backlight → tăng gamma mạnh.
            nếu toàn ảnh tối → tăng gamma vừa.
    """
    h, w = gray.shape[:2]
    center = gray[h // 4: 3 * h // 4, w // 4: 3 * w // 4]
    border = np.concatenate([
        gray[:h // 4, :].ravel(), gray[3 * h // 4:, :].ravel(),
        gray[:, :w // 4].ravel(), gray[:, 3 * w // 4:].ravel()
    ])
    mean_center = float(np.mean(center))
    mean_border = float(np.mean(border))
    mean_all = float(np.mean(gray))

    if mean_border > mean_center + 20:
        gamma = 2.0        # Backlight rõ ràng
    elif mean_all < 80:
        gamma = 1.5        # Ảnh tối chung
    else:
        return gray        # Ánh sáng bình thường, không cần sửa

    lut = np.array([
        min(255, int(255 * ((i / 255.0) ** (1.0 / gamma))))
        for i in range(256)
    ], dtype=np.uint8)
    return cv2.LUT(gray, lut)


def sharpen(gray):
    """Unsharp masking để làm nét cạnh ký tự."""
    blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(gray, 1.8, blur, -0.8, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def build_strong_variants(gray):
    """
    Tạo tập ảnh đa dạng để đảm bảo ít nhất 1 variant cho kết quả tốt
    trong mọi điều kiện: sáng tốt, tối, ngược sáng, mờ, nghiêng.

    Thứ tự variants: chất lượng cao trước, fallback sau.
    """
    gray = to_gray(gray)
    variants = []

    # --- Nhóm A: Pipeline chuẩn (backlight → CLAHE → denoise → sharpen) ---
    corrected = correct_backlight(gray)
    clahe_corr = step_contrast(corrected)
    denoised = cv2.fastNlMeansDenoising(
        clahe_corr, h=9, templateWindowSize=7, searchWindowSize=15
    )
    enhanced = sharpen(denoised)

    variants.append(enhanced)                   # A1: Grayscale chuẩn (EasyOCR tự threshold nội bộ)
    variants.append(step_threshold(enhanced))   # A2: Otsu từ ảnh đã enhance
    variants.append(cv2.adaptiveThreshold(      # A3: Adaptive block nhỏ — ánh sáng không đều
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 6
    ))
    variants.append(cv2.adaptiveThreshold(      # A4: Adaptive block lớn — ảnh mờ
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    ))
    variants.append(cv2.bitwise_not(enhanced))  # A5: Invert — biển nền tối chữ sáng
    variants.append(step_threshold_inv(enhanced))  # A6: Otsu inv

    # --- Nhóm B: Fallback từ CLAHE không denoise ---
    clahe_raw = step_contrast(gray)
    blur_g = cv2.GaussianBlur(clahe_raw, (3, 3), 0)
    blur_m = cv2.medianBlur(clahe_raw, 3)
    sharp_simple = cv2.addWeighted(clahe_raw, 1.6, blur_g, -0.6, 0)

    variants.append(clahe_raw)
    variants.append(blur_g)
    variants.append(blur_m)
    variants.append(sharp_simple)
    variants.append(step_threshold(blur_g))
    variants.append(step_threshold_inv(blur_g))
    variants.append(step_adaptive(clahe_raw))
    variants.append(step_adaptive_inv(clahe_raw))

    return variants


# =========================
# REFINE + DESKEW
# =========================
def refine_plate_roi(plate_bgr):
    gray = to_gray(plate_bgr)
    h, w = gray.shape[:2]

    gray_crop = gray[int(h * 0.03):int(h * 0.97), int(w * 0.02):int(w * 0.98)]
    if gray_crop.size == 0:
        gray_crop = gray

    blur = cv2.GaussianBlur(gray_crop, (5, 5), 0)
    th = step_threshold(blur)

    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hh, ww = gray_crop.shape[:2]
    best, best_score = None, -1e18

    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        if cw <= 0 or ch <= 0:
            continue
        area = cw * ch
        ratio = cw / float(ch + 1e-6)
        if area < ww * hh * 0.10 or ratio < 0.6 or ratio > 5.0:
            continue
        cx, cy = x + cw / 2.0, y + ch / 2.0
        center_penalty = abs(cx - ww / 2) / ww + abs(cy - hh / 2) / hh
        score = area - 20000 * center_penalty
        if score > best_score:
            best_score, best = score, (x, y, cw, ch)

    if best is not None:
        x, y, cw, ch = best
        px, py = int(cw * 0.04), int(ch * 0.06)
        roi = gray_crop[
            max(0, y - py):min(hh, y + ch + py),
            max(0, x - px):min(ww, x + cw + px)
        ]
        if roi.size > 0:
            return cv2.cvtColor(roi, cv2.COLOR_GRAY2BGR)

    return cv2.cvtColor(gray_crop, cv2.COLOR_GRAY2BGR)


def deskew_plate(plate_bgr):
    """
    Deskew biển số bằng cách kết hợp minAreaRect và Hough lines.
    - minAreaRect: tốt khi nghiêng nhiều (>5°)
    - Hough lines: tốt khi nghiêng ít, ảnh nhiều đường ngang
    Chọn góc nhỏ hơn và hợp lý hơn giữa hai phương pháp.
    """
    gray = to_gray(plate_bgr)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    coords = np.column_stack(np.where(th > 0))
    if len(coords) < 20:
        return plate_bgr, 0.0

    # Góc từ minAreaRect
    rect = cv2.minAreaRect(coords[:, ::-1].astype(np.float32))
    angle_rect = rect[-1]
    if angle_rect < -45:
        angle_rect = 90 + angle_rect
    elif angle_rect > 45:
        angle_rect = angle_rect - 90

    # Góc từ Hough lines (bổ sung cho nghiêng nhẹ)
    edges = cv2.Canny(th, 50, 150)
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=30,
        minLineLength=int(plate_bgr.shape[1] * 0.25), maxLineGap=10
    )
    angle_hough = 0.0
    if lines is not None:
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 != x1:
                ang = np.degrees(np.arctan2(y2 - y1, x2 - x1))
                if -30 < ang < 30:
                    angles.append(ang)
        if angles:
            angle_hough = float(np.median(angles))

    # Chọn góc hợp lý: ưu tiên Hough nếu nhỏ hơn và < 20°
    angle = angle_hough if (abs(angle_hough) < abs(angle_rect) and abs(angle_hough) < 20) else angle_rect

    # Không xoay nếu góc quá nhỏ (tránh nhiễu)
    if abs(angle) < 1.0:
        return plate_bgr, angle

    h, w = plate_bgr.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    rotated = cv2.warpAffine(
        plate_bgr, M, (w, h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return rotated, angle


# =========================
# LAYOUT
# =========================
def decide_plate_layout(gray):
    h, w = gray.shape[:2]
    return 1 if w / float(h + 1e-6) >= 2.25 else 2


def split_plate_lines(gray):
    h, w = gray.shape[:2]
    inv = step_threshold_inv(gray)
    hist = np.sum(inv > 0, axis=1).astype(np.float32)

    k = max(3, int(h * 0.03))
    if k % 2 == 0:
        k += 1
    hist_smooth = cv2.GaussianBlur(hist.reshape(-1, 1), (1, k), 0).reshape(-1)

    y_start, y_end = int(h * 0.25), int(h * 0.75)
    if y_end <= y_start:
        mid = h // 2
        return gray[:mid, :], gray[mid:, :]

    local = hist_smooth[y_start:y_end]
    split = y_start + int(np.argmin(local))
    split = max(int(h * 0.35), min(split, int(h * 0.65)))

    top, bottom = gray[:split, :], gray[split:, :]
    if top.size == 0 or bottom.size == 0:
        mid = h // 2
        top, bottom = gray[:mid, :], gray[mid:, :]

    return top, bottom


# =========================
# CHARACTER SEGMENTATION
# =========================
def merge_close_boxes(boxes, gap_thresh=4):
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: b[0])
    merged = [list(boxes[0])]
    for x, y, w, h in boxes[1:]:
        px, py, pw, ph = merged[-1]
        gap = x - (px + pw)
        overlap_y = min(py + ph, y + h) - max(py, y)
        if gap <= gap_thresh and overlap_y > min(ph, h) * 0.4:
            merged[-1] = [
                min(px, x), min(py, y),
                max(px + pw, x + w) - min(px, x),
                max(py + ph, y + h) - min(py, y)
            ]
        else:
            merged.append([x, y, w, h])
    return [tuple(b) for b in merged]


def segment_characters(line_img):
    gray = to_gray(line_img)
    gray = resize_keep(gray, target_h=120)
    gray = step_contrast(gray)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    th = step_threshold_inv(blur)

    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel_open, iterations=1)

    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    H, W = th.shape[:2]
    char_boxes = []

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        area = w * h
        ratio_hw = h / float(w + 1e-6)
        if h < H * 0.35 or h > H * 0.98:
            continue
        if w < W * 0.015 or w > W * 0.30:
            continue
        if area < H * W * 0.004:
            continue
        if ratio_hw < 0.9 or ratio_hw > 12.0:
            continue
        if x <= 1 or x + w >= W - 1:
            continue
        char_boxes.append((x, y, w, h))

    char_boxes = merge_close_boxes(char_boxes, gap_thresh=max(2, int(W * 0.01)))
    char_boxes = sorted(char_boxes, key=lambda b: b[0])

    chars = []
    for x, y, w, h in char_boxes:
        pad_x = max(1, int(w * 0.18))
        pad_y = max(1, int(h * 0.12))
        ch_img = th[
            max(0, y - pad_y):min(H, y + h + pad_y),
            max(0, x - pad_x):min(W, x + w + pad_x)
        ]
        chars.append(ch_img)

    return chars, th, char_boxes


# =========================
# OCR CORE
# =========================
def _readtext_safe(reader, img, allowlist, beam_width=10):
    """
    Wrapper an toàn cho reader.readtext với tham số được tuning cho biển số VN.
    Đảm bảo ảnh đúng dtype và shape trước khi truyền vào EasyOCR.
    """
    if img is None or img.size == 0:
        return []
    if img.dtype != np.uint8:
        img = np.clip(img, 0, 255).astype(np.uint8)
    if len(img.shape) not in [2, 3]:
        return []
    try:
        return reader.readtext(
            img,
            detail=1,
            paragraph=False,
            decoder="beamsearch",
            beamWidth=beam_width,
            allowlist=allowlist,
            width_ths=0.4,       # Tách rõ text box ngang
            height_ths=0.5,
            contrast_ths=0.05,   # Rất thấp: nhận cả ảnh backlight, mờ
            adjust_contrast=0.7,
            text_threshold=0.5,
            low_text=0.3,
            link_threshold=0.3,
            slope_ths=0.25,      # Chấp nhận chữ nghiêng ±~14°
            min_size=6,
        )
    except Exception:
        return []


def run_easyocr(reader, img, allowlist):
    """
    Chạy EasyOCR với chiến lược dual-read:
    - Lần 1: ảnh đầu vào gốc
    - Lần 2: ảnh sau backlight correction + CLAHE + sharpen
    Kết quả được gộp lại (nếu cùng text → giữ confidence cao hơn).
    """
    gray = to_gray(img)

    # Pipeline enhance chuẩn
    corrected = correct_backlight(gray)
    enhanced = sharpen(step_contrast(corrected))

    def _parse(results):
        out = {}
        for item in results:
            txt = clean_text(item[1])
            conf = float(item[2])
            if txt and (txt not in out or conf > out[txt]):
                out[txt] = conf
        return out

    merged = {}
    for source_img in [gray, enhanced]:
        parsed = _parse(_readtext_safe(reader, source_img, allowlist))
        for txt, conf in parsed.items():
            if txt not in merged or conf > merged[txt]:
                merged[txt] = conf

    return list(merged.items())


def read_chars_individually_with_conf(reader, char_imgs, allowlist):
    """
    Đọc từng ký tự riêng lẻ. Thử 4 biến thể ảnh mỗi ký tự:
    gốc, enhanced, invert, invert enhanced.
    Chọn kết quả confidence cao nhất.
    """
    chars = []
    confs = []

    for ch_img in char_imgs:
        if ch_img is None or ch_img.size == 0:
            continue

        ch_gray = to_gray(ch_img)
        # Padding trắng (nền sáng — phổ biến nhất trên biển số)
        ch_pad = cv2.copyMakeBorder(ch_gray, 14, 14, 14, 14,
                                    cv2.BORDER_CONSTANT, value=255)
        ch_resized = resize_keep(ch_pad, target_h=96)
        ch_enh = sharpen(step_contrast(ch_resized))
        ch_inv = cv2.bitwise_not(ch_resized)
        ch_inv_enh = sharpen(step_contrast(ch_inv))

        best_txt, best_conf = "", 0.0
        for candidate in [ch_resized, ch_enh, ch_inv, ch_inv_enh]:
            res = _readtext_safe(reader, candidate, allowlist, beam_width=5)
            if res:
                txt = clean_text(res[0][1])
                conf = float(res[0][2])
                if len(txt) >= 1 and conf > best_conf:
                    best_txt, best_conf = txt[0], conf

        if best_txt:
            chars.append(best_txt)
            confs.append(best_conf)

    if not chars:
        return "", 0.0
    return "".join(chars), float(sum(confs) / len(confs))


def vote_best_with_conf(cands):
    if not cands:
        return "", 0.0
    score_map, count_map = {}, {}
    for txt, score in cands:
        score_map[txt] = score_map.get(txt, 0.0) + float(score)
        count_map[txt] = count_map.get(txt, 0) + 1
    ranked = sorted(score_map.items(), key=lambda x: x[1], reverse=True)
    best_text, total_score = ranked[0]
    return best_text, float(total_score / max(1, count_map[best_text]))


# =========================
# NORMALIZE RULES
# =========================
def normalize_car_1line(text):
    raw = strip_alnum(text)
    if len(raw) < 7:
        return ""
    chars = list(raw)
    if len(chars) >= 2:
        chars[0] = l2d(chars[0])
        chars[1] = l2d(chars[1])
    if len(chars) >= 3 and chars[2].isdigit():
        chars[2] = d2l(chars[2])
    for i in range(3, len(chars)):
        chars[i] = l2d(chars[i])
    raw = "".join(chars)
    m = re.fullmatch(r"(\d{2})([A-Z])(\d{5})", raw)
    if m:
        return f"{m.group(1)}{m.group(2)}-{m.group(3)[:3]}.{m.group(3)[3:]}"
    return ""


def normalize_car_top(text):
    raw = strip_alnum(text)
    if len(raw) < 3:
        return ""
    for i in range(max(1, len(raw) - 2)):
        sub = raw[i:i + 3]
        if len(sub) < 3:
            continue
        a, b, c = l2d(sub[0]), l2d(sub[1]), sub[2]
        if c.isdigit():
            c = d2l(c)
        if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES:
            return f"{a}{b}{c}"
    return ""


def normalize_motorbike_top(text):
    raw = strip_alnum(text)
    if len(raw) < 4:
        return ""
    for i in range(max(1, len(raw) - 3)):
        sub = raw[i:i + 4]
        if len(sub) < 4:
            continue
        a, b, c, d = l2d(sub[0]), l2d(sub[1]), sub[2], l2d(sub[3])
        if c.isdigit():
            c = d2l(c)
        if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES and d.isdigit():
            return f"{a}{b}-{c}{d}"
    return ""


def normalize_bottom_line(text):
    raw = clean_text(text)
    raw = "".join(l2d(c) for c in raw)
    digits = re.sub(r"[^0-9]", "", raw)
    if len(digits) < 4:
        return ""
    if len(digits) == 4:
        return digits
    if len(digits) == 5:
        return f"{digits[:3]}.{digits[3:]}"
    d5 = digits[-5:]
    return f"{d5[:3]}.{d5[3:]}" if len(d5) == 5 else digits[-4:]


def normalize_motorbike_1line(text):
    raw = strip_alnum(text)
    if len(raw) < 8:
        return ""
    chars = list(raw)
    if len(chars) >= 2:
        chars[0] = l2d(chars[0])
        chars[1] = l2d(chars[1])
    if len(chars) >= 3 and chars[2].isdigit():
        chars[2] = d2l(chars[2])
    if len(chars) >= 4:
        chars[3] = l2d(chars[3])
    for i in range(4, len(chars)):
        chars[i] = l2d(chars[i])
    raw = "".join(chars)
    m = re.fullmatch(r"(\d{2})([A-Z])(\d)(\d{5})", raw)
    if m:
        return f"{m.group(1)}-{m.group(2)}{m.group(3)} {m.group(4)[:3]}.{m.group(4)[3:]}"
    m = re.fullmatch(r"(\d{2})([A-Z])(\d)(\d{4})", raw)
    if m:
        return f"{m.group(1)}-{m.group(2)}{m.group(3)} {m.group(4)}"
    return ""


def assemble_car_2line(top_text, bottom_text):
    if re.fullmatch(r"\d{2}[A-Z]", top_text):
        if re.fullmatch(r"\d{3}\.\d{2}", bottom_text):
            return f"{top_text}-{bottom_text}"
        if re.fullmatch(r"\d{4}", bottom_text):
            return f"{top_text}-{bottom_text}"
    return ""


def assemble_motorbike_2line(top_text, bottom_text):
    if re.fullmatch(r"\d{2}-[A-Z]\d", top_text):
        if re.fullmatch(r"\d{4}", bottom_text) or re.fullmatch(r"\d{3}\.\d{2}", bottom_text):
            return f"{top_text} {bottom_text}"
    return ""


# =========================
# SCORING
# =========================
def count_conversions(raw, normalized):
    raw2, norm2 = strip_alnum(raw), strip_alnum(normalized)
    n = min(len(raw2), len(norm2))
    diff = sum(1 for i in range(n) if raw2[i] != norm2[i])
    diff += abs(len(raw2) - len(norm2))
    return diff


def score_candidate(cand):
    text = cand["text"]
    plate_type = cand["type"]
    layout = cand["layout"]
    raw = cand.get("raw", "")
    conf = cand.get("conf", 0.0)
    source = cand.get("source", "line")
    score = 0.0

    if plate_type == "car" and layout == 1:
        if re.fullmatch(r"\d{2}[A-Z]-\d{3}\.\d{2}", text):
            score += 5.0
    elif plate_type == "car" and layout == 2:
        if re.fullmatch(r"\d{2}[A-Z]-\d{3}\.\d{2}", text):
            score += 5.0
        elif re.fullmatch(r"\d{2}[A-Z]-\d{4}", text):
            score += 4.0
    elif plate_type == "motorbike" and layout in [1, 2]:
        if re.fullmatch(r"\d{2}-[A-Z]\d \d{3}\.\d{2}", text):
            score += 5.0
        elif re.fullmatch(r"\d{2}-[A-Z]\d \d{4}", text):
            score += 4.5

    score += conf * 2.0
    if source == "char":
        score += 0.8
    score -= count_conversions(raw, text) * 0.35
    return score


def choose_best_candidate(candidates):
    if not candidates:
        return None
    best, best_score = None, -1e18
    for cand in candidates:
        s = score_candidate(cand)
        cand["score"] = s
        if s > best_score:
            best_score, best = s, cand
    return best


# =========================
# READERS → TRẢ VỀ CANDIDATES
# =========================
def _ocr_variants_line(reader, variants, allowlist, normalize_fn, plate_type, layout):
    """Helper: chạy OCR toàn dòng trên tất cả variants."""
    candidates = []
    for var in variants:
        for txt, conf in run_easyocr(reader, var, allowlist):
            norm = normalize_fn(txt)
            if norm:
                candidates.append({
                    "text": norm, "type": plate_type, "layout": layout,
                    "conf": conf, "raw": txt, "source": "line"
                })
    return candidates


def _ocr_char_segment(reader, line_img, allowlist, normalize_fn,
                       plate_type, layout, debug_prefix="", suffix=""):
    """Helper: segment ký tự → đọc từng ký tự → normalize → candidate."""
    chars, chars_bin, _ = segment_characters(line_img)
    if debug_prefix:
        save_debug_image(f"{debug_prefix}_{suffix}_bin.jpg", chars_bin)
    raw_text, char_conf = read_chars_individually_with_conf(reader, chars, allowlist)
    norm = normalize_fn(raw_text)
    if norm:
        return [{
            "text": norm, "type": plate_type, "layout": layout,
            "conf": char_conf, "raw": raw_text, "source": "char"
        }]
    return []


def try_read_car_1line(reader, gray_big, debug_prefix="plate"):
    variants = build_strong_variants(gray_big)
    for i, v in enumerate(variants):
        save_debug_image(f"{debug_prefix}_car1_var_{i}.jpg", v)
    allowlist = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"
    cands = _ocr_variants_line(reader, variants, allowlist,
                               normalize_car_1line, "car", 1)
    cands += _ocr_char_segment(reader, gray_big, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                               normalize_car_1line, "car", 1, debug_prefix, "car1")
    return cands


def try_read_motorbike_1line(reader, gray_big, debug_prefix="plate"):
    variants = build_strong_variants(gray_big)
    for i, v in enumerate(variants):
        save_debug_image(f"{debug_prefix}_bike1_var_{i}.jpg", v)
    allowlist = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"
    cands = _ocr_variants_line(reader, variants, allowlist,
                               normalize_motorbike_1line, "motorbike", 1)
    cands += _ocr_char_segment(reader, gray_big, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                               normalize_motorbike_1line, "motorbike", 1, debug_prefix, "bike1")
    return cands


def try_read_car_2line_all(reader, gray_big, debug_prefix="plate"):
    candidates = []
    top, bottom = split_plate_lines(gray_big)
    save_debug_image(f"{debug_prefix}_car2_top.jpg", top)
    save_debug_image(f"{debug_prefix}_car2_bottom.jpg", bottom)

    top_vars = build_strong_variants(top)
    bottom_vars = build_strong_variants(bottom)
    for i, v in enumerate(top_vars):
        save_debug_image(f"{debug_prefix}_car2_top_var_{i}.jpg", v)
    for i, v in enumerate(bottom_vars):
        save_debug_image(f"{debug_prefix}_car2_bottom_var_{i}.jpg", v)

    # Line-based
    for tv in top_vars:
        for txt, conf in run_easyocr(reader, tv, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"):
            top_norm = normalize_car_top(txt)
            if not top_norm:
                continue
            for bv in bottom_vars:
                for btxt, bconf in run_easyocr(reader, bv, "0123456789OQDGILSZB."):
                    plate = assemble_car_2line(top_norm, normalize_bottom_line(btxt))
                    if plate:
                        candidates.append({
                            "text": plate, "type": "car", "layout": 2,
                            "conf": (conf + bconf) / 2.0,
                            "raw": txt + "|" + btxt, "source": "line"
                        })

    # Char-based
    top_chars, top_bin, _ = segment_characters(top)
    bot_chars, bot_bin, _ = segment_characters(bottom)
    save_debug_image(f"{debug_prefix}_car2_top_bin.jpg", top_bin)
    save_debug_image(f"{debug_prefix}_car2_bot_bin.jpg", bot_bin)

    top_raw, top_conf = read_chars_individually_with_conf(
        reader, top_chars, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    bot_raw, bot_conf = read_chars_individually_with_conf(
        reader, bot_chars, "0123456789OQDGILSZB")

    plate = assemble_car_2line(normalize_car_top(top_raw), normalize_bottom_line(bot_raw))
    if plate:
        candidates.append({
            "text": plate, "type": "car", "layout": 2,
            "conf": (top_conf + bot_conf) / 2.0,
            "raw": top_raw + "|" + bot_raw, "source": "char"
        })

    return candidates


def try_read_motorbike_2line(reader, gray_big, debug_prefix="plate"):
    candidates = []
    top, bottom = split_plate_lines(gray_big)
    save_debug_image(f"{debug_prefix}_bike2_top.jpg", top)
    save_debug_image(f"{debug_prefix}_bike2_bottom.jpg", bottom)

    top_vars = build_strong_variants(top)
    bottom_vars = build_strong_variants(bottom)
    for i, v in enumerate(top_vars):
        save_debug_image(f"{debug_prefix}_bike2_top_var_{i}.jpg", v)
    for i, v in enumerate(bottom_vars):
        save_debug_image(f"{debug_prefix}_bike2_bottom_var_{i}.jpg", v)

    # Line-based
    for tv in top_vars:
        for txt, conf in run_easyocr(reader, tv, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"):
            top_norm = normalize_motorbike_top(txt)
            if not top_norm:
                continue
            for bv in bottom_vars:
                for btxt, bconf in run_easyocr(reader, bv, "0123456789OQDGILSZB."):
                    plate = assemble_motorbike_2line(top_norm, normalize_bottom_line(btxt))
                    if plate:
                        candidates.append({
                            "text": plate, "type": "motorbike", "layout": 2,
                            "conf": (conf + bconf) / 2.0,
                            "raw": txt + "|" + btxt, "source": "line"
                        })

    # Char-based
    top_chars, top_bin, _ = segment_characters(top)
    bot_chars, bot_bin, _ = segment_characters(bottom)
    save_debug_image(f"{debug_prefix}_bike2_top_bin.jpg", top_bin)
    save_debug_image(f"{debug_prefix}_bike2_bot_bin.jpg", bot_bin)

    top_raw, top_conf = read_chars_individually_with_conf(
        reader, top_chars, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    bot_raw, bot_conf = read_chars_individually_with_conf(
        reader, bot_chars, "0123456789OQDGILSZB")

    plate = assemble_motorbike_2line(normalize_motorbike_top(top_raw), normalize_bottom_line(bot_raw))
    if plate:
        candidates.append({
            "text": plate, "type": "motorbike", "layout": 2,
            "conf": (top_conf + bot_conf) / 2.0,
            "raw": top_raw + "|" + bot_raw, "source": "char"
        })

    return candidates


# =========================
# PIPELINE ON ONE CROP
# =========================
def read_plate_pipeline_one_crop(reader, plate_bgr, debug_prefix="plate"):
    refined = refine_plate_roi(plate_bgr)
    save_debug_image(f"{debug_prefix}_00_refined.jpg", refined)

    rotated, angle = deskew_plate(refined)
    save_debug_image(f"{debug_prefix}_01_rotated.jpg", rotated)

    gray = to_gray(rotated)
    save_debug_image(f"{debug_prefix}_02_gray.jpg", gray)

    # Sửa backlight ngay ở đây — trước khi CLAHE và resize
    corrected = correct_backlight(gray)
    save_debug_image(f"{debug_prefix}_02b_backlight_corrected.jpg", corrected)

    contrast = step_contrast(corrected)
    save_debug_image(f"{debug_prefix}_03_contrast.jpg", contrast)

    blur = cv2.medianBlur(contrast, 3)
    save_debug_image(f"{debug_prefix}_04_blur.jpg", blur)

    gray_big = resize_keep(blur, target_h=220)
    save_debug_image(f"{debug_prefix}_05_gray_big.jpg", gray_big)

    all_candidates = []
    all_candidates += try_read_car_1line(reader, gray_big, debug_prefix)
    all_candidates += try_read_car_2line_all(reader, gray_big, debug_prefix)
    all_candidates += try_read_motorbike_1line(reader, gray_big, debug_prefix)
    all_candidates += try_read_motorbike_2line(reader, gray_big, debug_prefix)

    best = choose_best_candidate(all_candidates)
    if best is not None:
        return best

    return {
        "text": "unknown", "type": "unknown", "layout": 0,
        "conf": 0.0, "raw": "", "source": "none", "score": -1e18
    }


# =========================
# MULTI-CROP VOTING
# =========================
def vote_final_candidates(candidates):
    if not candidates:
        return None
    grouped = {}
    for cand in candidates:
        key = (cand["text"], cand["type"], cand["layout"])
        if key not in grouped:
            grouped[key] = {"count": 0, "score_sum": 0.0, "best": cand}
        grouped[key]["count"] += 1
        grouped[key]["score_sum"] += cand.get("score", 0.0)
        if cand.get("score", -1e18) > grouped[key]["best"].get("score", -1e18):
            grouped[key]["best"] = cand

    ranked = sorted(grouped.values(),
                    key=lambda g: (g["count"], g["score_sum"]), reverse=True)
    return ranked[0]["best"]


# =========================
# DRAW
# =========================
def draw_label(img, x1, y1, plate_text, det_conf):
    text1 = f"plate: {plate_text}"
    text2 = f"det={det_conf:.2f}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale1, scale2, thick = 0.72, 0.58, 2

    (tw1, th1), _ = cv2.getTextSize(text1, font, scale1, thick)
    (tw2, th2), _ = cv2.getTextSize(text2, font, scale2, thick)
    tw = max(tw1, tw2)
    total_h = th1 + th2 + 18

    tx, ty = x1, y1 - 12
    if tx + tw > img.shape[1] - 5:
        tx = max(5, img.shape[1] - tw - 5)
    if ty - total_h < 5:
        ty = y1 + total_h + 12

    cv2.rectangle(img, (tx - 4, ty - total_h - 6), (tx + tw + 4, ty + 4), (0, 255, 0), -1)
    cv2.putText(img, text1, (tx, ty - th2 - 6), font, scale1, (0, 0, 0), thick, cv2.LINE_AA)
    cv2.putText(img, text2, (tx, ty), font, scale2, (0, 0, 0), thick, cv2.LINE_AA)


# =========================
# PROCESS IMAGE
# =========================
def process_image(model, reader, image_path, output_path):
    img = cv2.imread(image_path)
    if img is None:
        print(f"Khong tim thay anh: {image_path}")
        return

    detections = detect_plate_regions(model, img)
    if not detections:
        print(f"{os.path.basename(image_path)} -> Khong detect duoc bien so")
        cv2.imwrite(output_path, img)
        return

    for idx, det in enumerate(detections):
        box, det_conf = det["box"], det["conf"]
        crop_list = make_plate_crops(img, box)
        debug_base = f"{os.path.splitext(os.path.basename(image_path))[0]}_{idx}"

        crop_candidates = []
        for ci, plate_crop in enumerate(crop_list):
            save_debug_image(f"{debug_base}_crop_{ci}.jpg", plate_crop)
            cand = read_plate_pipeline_one_crop(
                reader, plate_crop,
                debug_prefix=f"{debug_base}_crop{ci}"
            )
            if cand["text"] != "unknown":
                crop_candidates.append(cand)

        final_cand = vote_final_candidates(crop_candidates)

        if final_cand is None:
            plate_text, vehicle_type, layout = "unknown", "unknown", 0
        else:
            plate_text = final_cand["text"]
            vehicle_type = final_cand["type"]
            layout = final_cand["layout"]

        x1, y1, x2, y2 = box
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        draw_label(img, x1, y1, plate_text, det_conf)

        type_vi = {"car": "oto", "motorbike": "xe_may"}.get(vehicle_type, "unknown")
        layout_vi = f"{layout}_dong" if layout in [1, 2] else "unknown"

        print(
            f"{os.path.basename(image_path)} -> "
            f"type={type_vi} | layout={layout_vi} | plate={plate_text} | det_conf={det_conf:.3f}"
        )

    cv2.imwrite(output_path, img)
    print("Saved:", output_path)


# =========================
# MAIN
# =========================
def main():
    model = YOLO(MODEL_PATH)
    reader = easyocr.Reader(["en"], gpu=torch.cuda.is_available())

    if USE_FOLDER:
        exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        for name in os.listdir(IMAGE_DIR):
            if os.path.splitext(name)[1].lower() not in exts:
                continue
            process_image(model, reader,
                          os.path.join(IMAGE_DIR, name),
                          os.path.join(OUTPUT_DIR, f"pred_{name}"))
    else:
        process_image(model, reader, IMAGE_PATH, OUTPUT_PATH)


if __name__ == "__main__":
    main()