from ultralytics import YOLO
import cv2
import easyocr
import numpy as np
import os
import re
import torch
import warnings
from collections import Counter

from test_easyOCR import draw_label

warnings.filterwarnings("ignore", category=RuntimeWarning)

# =========================
# CONFIG
# =========================
MODEL_PATH = r"E:\LPR_ttcs\runs\plate_only_train\weights\best.pt"

VIDEO_PATH = r"E:\LPR_ttcs\test_images\7733209278881.mp4"
SHOW_WINDOW = True
SAVE_OUTPUT_VIDEO = False
OUTPUT_VIDEO_PATH = r"E:\LPR_ttcs\Predict\result_video.avi"

# nhanh hơn
FRAME_SKIP = 1
OCR_EVERY_N_FRAMES = 5
USE_LAST_OCR_RESULT = True

OUTPUT_DIR = r"E:\LPR_ttcs\Predict"
SAVE_DEBUG = False
DEBUG_DIR = r"E:\LPR_ttcs\Predict\debug_steps"

TRACK_IOU_THRESHOLD = 0.30
TRACK_MAX_MISS = 10
TEXT_HISTORY_SIZE = 6

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
    mp = {
        "O": "0", "Q": "0", "D": "0",
        "I": "1", "L": "1", "T": "1",
        "Z": "2", "S": "5", "B": "8", "G": "6"
    }
    return mp.get(ch, ch)


def d2l(ch: str) -> str:
    mp = {
        "0": "D",
        "2": "Z",
        "5": "S",
        "8": "B",
        "6": "G"
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

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter + 1e-6

    return inter / union


def is_reasonable_plate_box(x1, y1, x2, y2, img_shape):
    h_img, w_img = img_shape[:2]
    w = x2 - x1
    h = y2 - y1

    if w <= 0 or h <= 0:
        return False

    area = w * h
    img_area = h_img * w_img
    ratio = w / float(h + 1e-6)

    if area < img_area * 0.0005:
        return False
    if area > img_area * 0.30:
        return False
    if ratio < 0.5 or ratio > 6.5:
        return False

    return True


# =========================
# DETECT PLATE
# =========================
def detect_plate_regions(model, image_bgr):
    results = model.predict(
        source=image_bgr,
        conf=0.18,
        iou=0.5,
        imgsz=960,
        verbose=False
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

            dets.append({
                "box": (x1, y1, x2, y2),
                "conf": conf
            })

    dets = sorted(dets, key=lambda z: z["conf"], reverse=True)

    final_dets = []
    for item in dets:
        keep = True
        for old in final_dets:
            if iou_xyxy(item["box"], old["box"]) > 0.4:
                keep = False
                break
        if keep:
            final_dets.append(item)

    return final_dets


def make_plate_crops(image_bgr, box):
    x1, y1, x2, y2 = box
    w = x2 - x1
    h = y2 - y1
    H, W = image_bgr.shape[:2]

    # giam crop de nhanh hon
    pad_sets = [
        (0.10, 0.12),
        (0.06, 0.08),
    ]

    crops = []
    for pxr, pyr in pad_sets:
        px = int(w * pxr)
        py = int(h * pyr)

        xx1 = max(0, x1 - px)
        yy1 = max(0, y1 - py)
        xx2 = min(W, x2 + px)
        yy2 = min(H, y2 + py)

        crop = image_bgr[yy1:yy2, xx1:xx2]
        if crop.size > 0:
            crops.append(crop)

    return crops


# =========================
# BASIC IMAGE PROCESSING
# =========================
def step_gray(plate_bgr):
    return cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)


def step_contrast(gray):
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    return clahe.apply(gray)


def step_gaussian(gray):
    return cv2.GaussianBlur(gray, (5, 5), 0)


def step_median(gray):
    return cv2.medianBlur(gray, 3)


def step_threshold(gray):
    return cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]


def step_threshold_inv(gray):
    return cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]


def step_adaptive(gray):
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10
    )


def step_adaptive_inv(gray):
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 31, 10
    )


def build_strong_variants(gray):
    # giam so variant de nhanh hon
    variants = []

    clahe = step_contrast(gray)
    blur_g = cv2.GaussianBlur(clahe, (3, 3), 0)
    sharp = cv2.addWeighted(clahe, 1.6, blur_g, -0.6, 0)
    th = step_threshold(blur_g)

    variants.append(clahe)
    variants.append(blur_g)
    variants.append(sharp)
    variants.append(th)

    return variants


# =========================
# REFINE + DESKEW
# =========================
def refine_plate_roi(plate_bgr):
    gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    x1 = int(w * 0.02)
    x2 = int(w * 0.98)
    y1 = int(h * 0.03)
    y2 = int(h * 0.97)
    gray_crop = gray[y1:y2, x1:x2]

    if gray_crop.size == 0:
        gray_crop = gray

    blur = cv2.GaussianBlur(gray_crop, (5, 5), 0)
    th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    hh, ww = gray_crop.shape[:2]
    best = None
    best_score = -1e18

    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        if cw <= 0 or ch <= 0:
            continue

        area = cw * ch
        ratio = cw / float(ch + 1e-6)

        if area < ww * hh * 0.10:
            continue
        if ratio < 0.6 or ratio > 5.0:
            continue

        cx = x + cw / 2.0
        cy = y + ch / 2.0
        center_penalty = abs(cx - ww / 2) / ww + abs(cy - hh / 2) / hh
        score = area - 20000 * center_penalty

        if score > best_score:
            best_score = score
            best = (x, y, cw, ch)

    if best is not None:
        x, y, cw, ch = best
        pad_x = int(cw * 0.04)
        pad_y = int(ch * 0.06)

        xx1 = max(0, x - pad_x)
        yy1 = max(0, y - pad_y)
        xx2 = min(ww, x + cw + pad_x)
        yy2 = min(hh, y + ch + pad_y)

        roi = gray_crop[yy1:yy2, xx1:xx2]
        if roi.size > 0:
            return cv2.cvtColor(roi, cv2.COLOR_GRAY2BGR)

    return cv2.cvtColor(gray_crop, cv2.COLOR_GRAY2BGR)


def deskew_plate(plate_bgr):
    gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    coords = np.column_stack(np.where(th > 0))
    if len(coords) < 20:
        return plate_bgr, 0.0

    rect = cv2.minAreaRect(coords[:, ::-1].astype(np.float32))
    angle = rect[-1]

    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90

    h, w = plate_bgr.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)

    rotated = cv2.warpAffine(
        plate_bgr,
        M,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE
    )
    return rotated, angle


# =========================
# LAYOUT
# =========================
def split_plate_lines(gray):
    h, w = gray.shape[:2]

    inv = step_threshold_inv(gray)
    hist = np.sum(inv > 0, axis=1).astype(np.float32)

    k = max(3, int(h * 0.03))
    if k % 2 == 0:
        k += 1
    hist_smooth = cv2.GaussianBlur(hist.reshape(-1, 1), (1, k), 0).reshape(-1)

    y_start = int(h * 0.25)
    y_end = int(h * 0.75)

    if y_end <= y_start:
        mid = h // 2
        return gray[:mid, :], gray[mid:, :]

    local = hist_smooth[y_start:y_end]
    split = y_start + int(np.argmin(local))
    split = max(int(h * 0.35), min(split, int(h * 0.65)))

    top = gray[:split, :]
    bottom = gray[split:, :]

    if top.size == 0 or bottom.size == 0:
        mid = h // 2
        top = gray[:mid, :]
        bottom = gray[mid:, :]

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
        p_right = px + pw
        gap = x - p_right

        overlap_y = min(py + ph, y + h) - max(py, y)
        overlap_ok = overlap_y > min(ph, h) * 0.4

        if gap <= gap_thresh and overlap_ok:
            nx1 = min(px, x)
            ny1 = min(py, y)
            nx2 = max(px + pw, x + w)
            ny2 = max(py + ph, y + h)
            merged[-1] = [nx1, ny1, nx2 - nx1, ny2 - ny1]
        else:
            merged.append([x, y, w, h])

    return [tuple(b) for b in merged]


def segment_characters(line_img):
    if len(line_img.shape) == 3:
        gray = cv2.cvtColor(line_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = line_img.copy()

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

        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(W, x + w + pad_x)
        y2 = min(H, y + h + pad_y)

        ch_img = th[y1:y2, x1:x2]
        chars.append(ch_img)

    return chars, th, char_boxes


# =========================
# OCR
# =========================
def run_easyocr(reader, img, allowlist):
    results = reader.readtext(
        img,
        detail=1,
        paragraph=False,
        decoder="beamsearch",
        allowlist=allowlist
    )

    out = []
    for item in results:
        txt = clean_text(item[1])
        conf = float(item[2])
        if txt:
            out.append((txt, conf))
    return out


def read_chars_individually_with_conf(reader, char_imgs, allowlist):
    chars = []
    confs = []

    for ch_img in char_imgs:
        ch_img = cv2.copyMakeBorder(
            ch_img, 10, 10, 10, 10,
            cv2.BORDER_CONSTANT, value=0
        )
        ch_img = resize_keep(ch_img, target_h=90)

        res = reader.readtext(
            ch_img,
            detail=1,
            paragraph=False,
            decoder="beamsearch",
            allowlist=allowlist
        )

        if len(res) > 0:
            txt = clean_text(res[0][1])
            conf = float(res[0][2])
            if len(txt) >= 1:
                chars.append(txt[0])
                confs.append(conf)

    if not chars:
        return "", 0.0

    avg_conf = float(sum(confs) / len(confs)) if confs else 0.0
    return "".join(chars), avg_conf


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

    for i in range(0, max(1, len(raw) - 2)):
        sub = raw[i:i + 3]
        if len(sub) < 3:
            continue

        a = l2d(sub[0])
        b = l2d(sub[1])
        c = sub[2]
        if c.isdigit():
            c = d2l(c)

        if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES:
            return f"{a}{b}{c}"

    return ""


def normalize_motorbike_top(text):
    raw = strip_alnum(text)

    if len(raw) < 4:
        return ""

    for i in range(0, max(1, len(raw) - 3)):
        sub = raw[i:i + 4]
        if len(sub) < 4:
            continue

        a = l2d(sub[0])
        b = l2d(sub[1])
        c = sub[2]
        d = l2d(sub[3])

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
    if len(d5) == 5:
        return f"{d5[:3]}.{d5[3:]}"
    d4 = digits[-4:]
    if len(d4) == 4:
        return d4

    return ""


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
    raw2 = strip_alnum(raw)
    norm2 = strip_alnum(normalized)
    n = min(len(raw2), len(norm2))
    diff = 0
    for i in range(n):
        if raw2[i] != norm2[i]:
            diff += 1
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
    elif plate_type == "motorbike" and layout == 1:
        if re.fullmatch(r"\d{2}-[A-Z]\d \d{3}\.\d{2}", text):
            score += 5.0
        elif re.fullmatch(r"\d{2}-[A-Z]\d \d{4}", text):
            score += 4.5
    elif plate_type == "motorbike" and layout == 2:
        if re.fullmatch(r"\d{2}-[A-Z]\d \d{3}\.\d{2}", text):
            score += 5.0
        elif re.fullmatch(r"\d{2}-[A-Z]\d \d{4}", text):
            score += 4.5

    score += conf * 2.0
    if source == "char":
        score += 0.8

    conv_penalty = count_conversions(raw, text) * 0.35
    score -= conv_penalty

    return score


def choose_best_candidate(candidates):
    if not candidates:
        return None

    best = None
    best_score = -1e18

    for cand in candidates:
        s = score_candidate(cand)
        cand["score"] = s
        if s > best_score:
            best_score = s
            best = cand

    return best


# =========================
# READERS
# =========================
def try_read_car_1line(reader, gray_big, debug_prefix="plate"):
    candidates = []

    for i, var in enumerate(build_strong_variants(gray_big)):
        save_debug_image(f"{debug_prefix}_car1_var_{i}.jpg", var)
        res = run_easyocr(reader, var, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-")
        for txt, conf in res:
            norm = normalize_car_1line(txt)
            if norm:
                candidates.append({
                    "text": norm,
                    "type": "car",
                    "layout": 1,
                    "conf": conf,
                    "raw": txt,
                    "source": "line"
                })

    chars, chars_bin, _ = segment_characters(gray_big)
    save_debug_image(f"{debug_prefix}_car1_bin.jpg", chars_bin)
    raw_text, char_conf = read_chars_individually_with_conf(
        reader, chars, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )
    norm = normalize_car_1line(raw_text)
    if norm:
        candidates.append({
            "text": norm,
            "type": "car",
            "layout": 1,
            "conf": char_conf,
            "raw": raw_text,
            "source": "char"
        })

    return candidates


def try_read_motorbike_1line(reader, gray_big, debug_prefix="plate"):
    candidates = []

    for i, var in enumerate(build_strong_variants(gray_big)):
        save_debug_image(f"{debug_prefix}_bike1_var_{i}.jpg", var)
        res = run_easyocr(reader, var, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-")
        for txt, conf in res:
            norm = normalize_motorbike_1line(txt)
            if norm:
                candidates.append({
                    "text": norm,
                    "type": "motorbike",
                    "layout": 1,
                    "conf": conf,
                    "raw": txt,
                    "source": "line"
                })

    chars, chars_bin, _ = segment_characters(gray_big)
    save_debug_image(f"{debug_prefix}_bike1_bin.jpg", chars_bin)
    raw_text, char_conf = read_chars_individually_with_conf(
        reader, chars, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )
    norm = normalize_motorbike_1line(raw_text)
    if norm:
        candidates.append({
            "text": norm,
            "type": "motorbike",
            "layout": 1,
            "conf": char_conf,
            "raw": raw_text,
            "source": "char"
        })

    return candidates


def try_read_car_2line_all(reader, gray_big, debug_prefix="plate"):
    candidates = []
    top, bottom = split_plate_lines(gray_big)

    top_vars = build_strong_variants(top)
    bottom_vars = build_strong_variants(bottom)

    for tv in top_vars:
        top_res = run_easyocr(reader, tv, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        for txt, conf in top_res:
            top_norm = normalize_car_top(txt)
            if not top_norm:
                continue

            for bv in bottom_vars:
                bot_res = run_easyocr(reader, bv, "0123456789OQDGILSZB.")
                for btxt, bconf in bot_res:
                    bot_norm = normalize_bottom_line(btxt)
                    plate = assemble_car_2line(top_norm, bot_norm)
                    if plate:
                        candidates.append({
                            "text": plate,
                            "type": "car",
                            "layout": 2,
                            "conf": (conf + bconf) / 2.0,
                            "raw": txt + "|" + btxt,
                            "source": "line"
                        })

    top_chars, _, _ = segment_characters(top)
    bottom_chars, _, _ = segment_characters(bottom)

    top_raw, top_conf = read_chars_individually_with_conf(
        reader, top_chars, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )
    bot_raw, bot_conf = read_chars_individually_with_conf(
        reader, bottom_chars, "0123456789OQDGILSZB"
    )

    top_norm = normalize_car_top(top_raw)
    bot_norm = normalize_bottom_line(bot_raw)
    plate = assemble_car_2line(top_norm, bot_norm)
    if plate:
        candidates.append({
            "text": plate,
            "type": "car",
            "layout": 2,
            "conf": (top_conf + bot_conf) / 2.0,
            "raw": top_raw + "|" + bot_raw,
            "source": "char"
        })

    return candidates


def try_read_motorbike_2line(reader, gray_big, debug_prefix="plate"):
    candidates = []
    top, bottom = split_plate_lines(gray_big)

    top_vars = build_strong_variants(top)
    bottom_vars = build_strong_variants(bottom)

    for tv in top_vars:
        top_res = run_easyocr(reader, tv, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        for txt, conf in top_res:
            top_norm = normalize_motorbike_top(txt)
            if not top_norm:
                continue

            for bv in bottom_vars:
                bot_res = run_easyocr(reader, bv, "0123456789OQDGILSZB.")
                for btxt, bconf in bot_res:
                    bot_norm = normalize_bottom_line(btxt)
                    plate = assemble_motorbike_2line(top_norm, bot_norm)
                    if plate:
                        candidates.append({
                            "text": plate,
                            "type": "motorbike",
                            "layout": 2,
                            "conf": (conf + bconf) / 2.0,
                            "raw": txt + "|" + btxt,
                            "source": "line"
                        })

    top_chars, _, _ = segment_characters(top)
    bottom_chars, _, _ = segment_characters(bottom)

    top_raw, top_conf = read_chars_individually_with_conf(
        reader, top_chars, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )
    bot_raw, bot_conf = read_chars_individually_with_conf(
        reader, bottom_chars, "0123456789OQDGILSZB"
    )

    top_norm = normalize_motorbike_top(top_raw)
    bot_norm = normalize_bottom_line(bot_raw)
    plate = assemble_motorbike_2line(top_norm, bot_norm)
    if plate:
        candidates.append({
            "text": plate,
            "type": "motorbike",
            "layout": 2,
            "conf": (top_conf + bot_conf) / 2.0,
            "raw": top_raw + "|" + bot_raw,
            "source": "char"
        })

    return candidates


# =========================
# PIPELINE ON ONE CROP
# =========================
def read_plate_pipeline_one_crop(reader, plate_bgr, debug_prefix="plate"):
    refined = refine_plate_roi(plate_bgr)
    save_debug_image(f"{debug_prefix}_00_refined.jpg", refined)

    rotated, _ = deskew_plate(refined)
    save_debug_image(f"{debug_prefix}_01_rotated.jpg", rotated)

    gray = step_gray(rotated)
    contrast = step_contrast(gray)
    blur = step_median(contrast)
    gray_big = resize_keep(blur, target_h=220)

    all_candidates = []
    all_candidates += try_read_car_1line(reader, gray_big, debug_prefix)
    all_candidates += try_read_car_2line_all(reader, gray_big, debug_prefix)
    all_candidates += try_read_motorbike_1line(reader, gray_big, debug_prefix)
    all_candidates += try_read_motorbike_2line(reader, gray_big, debug_prefix)

    best = choose_best_candidate(all_candidates)
    if best is not None:
        return best

    return {
        "text": "unknown",
        "type": "unknown",
        "layout": 0,
        "conf": 0.0,
        "raw": "",
        "source": "none",
        "score": -1e18
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
            grouped[key] = {
                "count": 0,
                "score_sum": 0.0,
                "best": cand
            }
        grouped[key]["count"] += 1
        grouped[key]["score_sum"] += cand.get("score", 0.0)
        if cand.get("score", -1e18) > grouped[key]["best"].get("score", -1e18):
            grouped[key]["best"] = cand

    ranked = sorted(
        grouped.values(),
        key=lambda g: (g["count"], g["score_sum"]),
        reverse=True
    )

    return ranked[0]["best"]


# =========================
# TRACK STABLE TEXT
# =========================
def get_stable_text(history):
    valid = [x for x in history if x not in ["unknown", "reading...", ""]]
    if not valid:
        return "unknown"

    cnt = Counter(valid)
    return cnt.most_common(1)[0][0]


def update_track_history(track, new_text):
    if new_text is None:
        return
    if len(track["text_history"]) >= TEXT_HISTORY_SIZE:
        track["text_history"].pop(0)
    track["text_history"].append(new_text)
    track["stable_text"] = get_stable_text(track["text_history"])


def create_track(det, track_id, frame_idx):
    return {
        "id": track_id,
        "box": det["box"],
        "det_conf": det["conf"],
        "text_history": [],
        "stable_text": "unknown",
        "last_seen": frame_idx,
        "miss": 0
    }


# =========================
# VIDEO HELPERS
# =========================
def open_video_safely(video_path):
    if not os.path.exists(video_path):
        print(f"Khong tim thay file video: {video_path}")
        return None

    backends = [
        ("CAP_MSMF", cv2.CAP_MSMF),
        ("CAP_FFMPEG", cv2.CAP_FFMPEG),
        ("DEFAULT", None),
    ]

    for backend_name, backend in backends:
        if backend is None:
            cap = cv2.VideoCapture(video_path)
        else:
            cap = cv2.VideoCapture(video_path, backend)

        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                print(f"Mo video thanh cong bang {backend_name}")
                return cap
        cap.release()

    return None


def read_plate_from_det(frame, reader, det, frame_idx):
    crop_list = make_plate_crops(frame, det["box"])
    crop_candidates = []

    for ci, plate_crop in enumerate(crop_list):
        cand = read_plate_pipeline_one_crop(
            reader,
            plate_crop,
            debug_prefix=f"frame{frame_idx}_crop{ci}"
        )
        if cand["text"] != "unknown":
            crop_candidates.append(cand)

    final_cand = vote_final_candidates(crop_candidates)

    if final_cand is None:
        return {
            "box": det["box"],
            "det_conf": det["conf"],
            "plate_text": "unknown",
            "vehicle_type": "unknown",
            "layout": 0
        }

    return {
        "box": det["box"],
        "det_conf": det["conf"],
        "plate_text": final_cand["text"],
        "vehicle_type": final_cand["type"],
        "layout": final_cand["layout"]
    }


# =========================
# PROCESS VIDEO
# =========================
def process_video(model, reader, video_path):
    cap = open_video_safely(video_path)
    if cap is None:
        print("Khong mo duoc video.")
        return

    out = None
    if SAVE_OUTPUT_VIDEO:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        fourcc = cv2.VideoWriter_fourcc(*"XVID")
        out = cv2.VideoWriter(OUTPUT_VIDEO_PATH, fourcc, fps, (width, height))

        if not out.isOpened():
            print("Khong mo duoc VideoWriter.")
            out = None

    tracks = []
    next_track_id = 0
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        show_frame = frame.copy()

        detections = detect_plate_regions(model, frame)
        matched_track_ids = set()

        for det in detections:
            best_track = None
            best_iou = 0.0

            for tr in tracks:
                ov = iou_xyxy(det["box"], tr["box"])
                if ov > best_iou:
                    best_iou = ov
                    best_track = tr

            if best_track is not None and best_iou >= TRACK_IOU_THRESHOLD:
                best_track["box"] = det["box"]
                best_track["det_conf"] = det["conf"]
                best_track["last_seen"] = frame_idx
                best_track["miss"] = 0
                matched_track_ids.add(best_track["id"])

                do_ocr = (frame_idx % OCR_EVERY_N_FRAMES == 0)
                if do_ocr:
                    info = read_plate_from_det(frame, reader, det, frame_idx)
                    update_track_history(best_track, info["plate_text"])
            else:
                tr = create_track(det, next_track_id, frame_idx)
                next_track_id += 1

                do_ocr = (frame_idx % OCR_EVERY_N_FRAMES == 0)
                if do_ocr:
                    info = read_plate_from_det(frame, reader, det, frame_idx)
                    update_track_history(tr, info["plate_text"])
                else:
                    update_track_history(tr, "reading...")

                tracks.append(tr)
                matched_track_ids.add(tr["id"])

        for tr in tracks:
            if tr["id"] not in matched_track_ids:
                tr["miss"] += 1

        tracks = [tr for tr in tracks if tr["miss"] <= TRACK_MAX_MISS]

        for tr in tracks:
            x1, y1, x2, y2 = tr["box"]
            text_to_show = tr["stable_text"]

            if text_to_show == "unknown" and USE_LAST_OCR_RESULT:
                if len(tr["text_history"]) > 0:
                    last_valid = None
                    for t in reversed(tr["text_history"]):
                        if t not in ["unknown", "reading...", ""]:
                            last_valid = t
                            break
                    text_to_show = last_valid if last_valid is not None else "reading..."

            cv2.rectangle(show_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            draw_label(show_frame, x1, y1, text_to_show, tr["det_conf"])

        if SHOW_WINDOW:
            cv2.imshow("Real-time Plate Detection + OCR", show_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == 27 or key == ord("q"):
                break

        if out is not None:
            out.write(show_frame)

        for _ in range(FRAME_SKIP - 1):
            grabbed = cap.grab()
            if not grabbed:
                break
            frame_idx += 1

    cap.release()
    if out is not None:
        out.release()
        print("Da luu video ket qua tai:", OUTPUT_VIDEO_PATH)
    cv2.destroyAllWindows()


# =========================
# MAIN
# =========================
def main():
    print("Dang load model...")
    model = YOLO(MODEL_PATH)

    print("Dang load EasyOCR...")
    reader = easyocr.Reader(["en"], gpu=torch.cuda.is_available())

    process_video(model, reader, VIDEO_PATH)


if __name__ == "__main__":
    main()