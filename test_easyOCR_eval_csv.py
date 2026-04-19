from ultralytics import YOLO
import cv2
import easyocr
import numpy as np
import torch
import csv
import os
import re
import math
import warnings
from typing import List, Tuple, Optional, Dict

warnings.filterwarnings("ignore", category=RuntimeWarning)

# ============================================================
# CONFIG
# ============================================================
MODEL_PATH = r"E:\LPR_ttcs\runs\plate_only_train\weights\best.pt"
DATA_ROOT = r"E:\LPR_ttcs\train"
IMAGES_DIR = os.path.join(DATA_ROOT, "images")
DETECT_LABELS_DIR = os.path.join(DATA_ROOT, "labels")
OCR_GT_DIR = os.path.join(DATA_ROOT, "Bien_So")

OUTPUT_DIR = r"E:\LPR_ttcs\Predict\eval_train"
ANNOTATED_DIR = os.path.join(OUTPUT_DIR, "annotated")
CROPS_DIR = os.path.join(OUTPUT_DIR, "crops")
CSV_PATH = os.path.join(OUTPUT_DIR, "detect_ocr_metrics.csv")
SUMMARY_PATH = os.path.join(OUTPUT_DIR, "detect_ocr_summary.csv")

SAVE_ANNOTATED = True
SAVE_CROPS = False
IMG_SIZE = 1280
DET_CONF = 0.18
DET_IOU = 0.50
MATCH_IOU_THRESH = 0.50

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
ALLOWED_SERIES = set("ABCDEFGHKLMNPRSTUVXYZ")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ANNOTATED_DIR, exist_ok=True)
os.makedirs(CROPS_DIR, exist_ok=True)


# ============================================================
# HELPERS
# ============================================================
def clean_text(text: str) -> str:
    text = text.upper().replace(" ", "").replace("\n", "")
    return re.sub(r"[^A-Z0-9.-]", "", text)


def normalize_gt_text(text: str) -> str:
    text = text.strip().upper()
    text = text.replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_compare_text(text: str) -> str:
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


def resize_keep(img, target_h=160):
    h, w = img.shape[:2]
    if h == 0:
        return img
    scale = target_h / h
    nw = max(1, int(w * scale))
    return cv2.resize(img, (nw, target_h), interpolation=cv2.INTER_CUBIC)


def xywhn_to_xyxy(line: str, img_w: int, img_h: int) -> Optional[Tuple[int, int, int, int]]:
    parts = line.strip().split()
    if len(parts) < 5:
        return None
    try:
        _, xc, yc, w, h = map(float, parts[:5])
    except Exception:
        return None

    bw = w * img_w
    bh = h * img_h
    x1 = int(round((xc * img_w) - bw / 2))
    y1 = int(round((yc * img_h) - bh / 2))
    x2 = int(round((xc * img_w) + bw / 2))
    y2 = int(round((yc * img_h) + bh / 2))

    x1 = max(0, min(img_w - 1, x1))
    y1 = max(0, min(img_h - 1, y1))
    x2 = max(0, min(img_w - 1, x2))
    y2 = max(0, min(img_h - 1, y2))

    if x2 <= x1 or y2 <= y1:
        return None
    return (x1, y1, x2, y2)


def iou_xyxy(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih
    area1 = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area2 = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area1 + area2 - inter + 1e-6
    return inter / union


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            ins = curr[j - 1] + 1
            dele = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            curr.append(min(ins, dele, sub))
        prev = curr
    return prev[-1]


def read_first_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                return normalize_gt_text(line)
    return ""


def find_ocr_gt(base_name: str) -> str:
    if not os.path.isdir(OCR_GT_DIR):
        return ""

    candidates = []
    for name in os.listdir(OCR_GT_DIR):
        stem, ext = os.path.splitext(name)
        if stem == base_name:
            candidates.append(os.path.join(OCR_GT_DIR, name))

    # Ưu tiên file txt
    for p in candidates:
        if os.path.splitext(p)[1].lower() in {".txt", ".csv"}:
            txt = read_first_text_file(p)
            if txt:
                return txt

    # Nếu trong folder OCR là ảnh hoặc file khác, thử lấy từ tên file
    for p in candidates:
        stem = os.path.splitext(os.path.basename(p))[0]
        if stem:
            return normalize_gt_text(stem)

    return ""


def get_gt_box(label_path: str, img_shape) -> Optional[Tuple[int, int, int, int]]:
    if not os.path.exists(label_path):
        return None
    img_h, img_w = img_shape[:2]
    boxes = []
    with open(label_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            box = xywhn_to_xyxy(line, img_w, img_h)
            if box is not None:
                boxes.append(box)
    if not boxes:
        return None

    # Dataset của bạn thường chỉ có 1 biển số / ảnh.
    # Nếu có nhiều box, lấy box lớn nhất.
    boxes = sorted(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
    return boxes[0]


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


# ============================================================
# OCR PIPELINE
# ============================================================
def preprocess_plate_bgr(plate_bgr):
    gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    x1 = int(w * 0.02)
    x2 = int(w * 0.98)
    y1 = int(h * 0.02)
    y2 = int(h * 0.98)
    gray = gray[y1:y2, x1:x2] if y2 > y1 and x2 > x1 else gray
    gray = resize_keep(gray, target_h=170)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    return gray


def make_variants(gray):
    variants = [gray]
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    variants.append(blur)
    sharp = cv2.addWeighted(gray, 1.8, blur, -0.8, 0)
    variants.append(sharp)
    variants.append(cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1])
    variants.append(cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1])
    variants.append(cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 8))
    variants.append(cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 10))
    return variants


def split_plate_lines(gray):
    h, w = gray.shape[:2]
    if w / float(h + 1e-6) > 2.2:
        return gray, None
    inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    hist = np.sum(inv > 0, axis=1)
    y1 = int(h * 0.20)
    y2 = int(h * 0.80)
    if y2 <= y1:
        return gray, None
    local = hist[y1:y2]
    split = y1 + int(np.argmin(local))
    split = max(int(h * 0.30), min(split, int(h * 0.70)))
    top = gray[:split, :]
    bottom = gray[split:, :]
    if top.size == 0 or bottom.size == 0:
        return gray, None
    return top, bottom


def run_easyocr(reader, img, allowlist):
    results = reader.readtext(
        img,
        detail=1,
        paragraph=False,
        decoder="greedy",
        allowlist=allowlist,
    )
    out = []
    for item in results:
        txt = clean_text(item[1])
        conf = float(item[2])
        if txt:
            out.append((txt, conf))
    return out


def normalize_raw_plate(text):
    raw = clean_text(text)
    raw = raw.replace("--", "-").replace("..", ".")
    raw = raw.replace("_", "")
    return raw


def normalize_one_line_candidate(text):
    raw = normalize_raw_plate(text)
    raw2 = raw.replace("-", "").replace(".", "")
    if len(raw2) < 7:
        return ""
    chars = list(raw2)
    if len(chars) >= 2:
        chars[0] = l2d(chars[0])
        chars[1] = l2d(chars[1])
    if len(chars) >= 3 and chars[2].isdigit():
        chars[2] = d2l(chars[2])
    for i in range(3, len(chars)):
        chars[i] = l2d(chars[i])
    raw2 = "".join(chars)
    raw2 = re.sub(r"[^A-Z0-9]", "", raw2)

    m = re.fullmatch(r"(\d{2})([A-Z])(\d{5})", raw2)
    if m:
        return f"{m.group(1)}{m.group(2)}-{m.group(3)[:3]}.{m.group(3)[3:]}"

    m = re.fullmatch(r"(\d{2})([A-Z])(\d)(\d{4,5})", raw2)
    if m:
        tail = m.group(4)
        if len(tail) == 4:
            return f"{m.group(1)}-{m.group(2)}{m.group(3)} {tail}"
        if len(tail) == 5:
            return f"{m.group(1)}-{m.group(2)}{m.group(3)} {tail[:3]}.{tail[3:]}"
    return ""


def normalize_top_line(text):
    raw = normalize_raw_plate(text).replace("-", "").replace(".", "")
    if len(raw) < 3:
        return ""
    if len(raw) == 3:
        a = l2d(raw[0])
        b = l2d(raw[1])
        c = raw[2]
        if c.isdigit():
            c = d2l(c)
        if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES:
            return f"{a}{b}{c}"
    if len(raw) >= 4:
        a = l2d(raw[0])
        b = l2d(raw[1])
        c = raw[2]
        d = l2d(raw[3])
        if c.isdigit():
            c = d2l(c)
        if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES and d.isdigit():
            return f"{a}{b}-{c}{d}"
    return ""


def normalize_bottom_line_digits(text):
    raw = normalize_raw_plate(text)
    raw = "".join(l2d(c) for c in raw)
    digits = re.sub(r"[^0-9]", "", raw)
    if len(digits) == 4:
        return digits
    if len(digits) == 5:
        return f"{digits[:3]}.{digits[3:]}"
    return ""


def assemble_two_lines(top_text, bottom_text):
    if not top_text or not bottom_text:
        return ""
    if re.fullmatch(r"\d{2}[A-Z]", top_text) and re.fullmatch(r"\d{3}\.\d{2}", bottom_text):
        return f"{top_text}-{bottom_text}"
    if re.fullmatch(r"\d{2}-[A-Z]\d", top_text) and (
        re.fullmatch(r"\d{4}", bottom_text) or re.fullmatch(r"\d{3}\.\d{2}", bottom_text)
    ):
        return f"{top_text} {bottom_text}"
    return ""


def read_plate_one_line(reader, gray):
    candidates = []
    for var in make_variants(gray):
        res = run_easyocr(reader, var, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-")
        for txt, conf in res:
            norm = normalize_one_line_candidate(txt)
            if norm:
                candidates.append((norm, conf + 0.5))
    if not candidates:
        return "", 0.0
    score_map: Dict[str, float] = {}
    for norm, score in candidates:
        score_map[norm] = score_map.get(norm, 0.0) + score
    best = sorted(score_map.items(), key=lambda x: x[1], reverse=True)[0]
    return best[0], best[1]


def read_plate_two_lines(reader, gray):
    top, bottom = split_plate_lines(gray)
    if bottom is None:
        return "", 0.0

    top_candidates = []
    for var in make_variants(top):
        res = run_easyocr(reader, var, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        for txt, conf in res:
            norm = normalize_top_line(txt)
            if norm:
                top_candidates.append((norm, conf))

    bottom_candidates = []
    for var in make_variants(bottom):
        res = run_easyocr(reader, var, "0123456789OQDGILSZB.")
        for txt, conf in res:
            norm = normalize_bottom_line_digits(txt)
            if norm:
                bottom_candidates.append((norm, conf))

    if not top_candidates or not bottom_candidates:
        return "", 0.0

    top_score: Dict[str, float] = {}
    for t, s in top_candidates:
        top_score[t] = top_score.get(t, 0.0) + s
    bottom_score: Dict[str, float] = {}
    for t, s in bottom_candidates:
        bottom_score[t] = bottom_score.get(t, 0.0) + s

    best_top, best_top_s = sorted(top_score.items(), key=lambda x: x[1], reverse=True)[0]
    best_bottom, best_bottom_s = sorted(bottom_score.items(), key=lambda x: x[1], reverse=True)[0]
    out = assemble_two_lines(best_top, best_bottom)
    if not out:
        return "", 0.0
    return out, best_top_s + best_bottom_s


def fallback_raw_text(reader, gray):
    all_candidates = []
    for var in make_variants(gray):
        res = run_easyocr(reader, var, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-")
        for txt, conf in res:
            txt = normalize_raw_plate(txt)
            if len(txt) >= 4:
                all_candidates.append((txt, conf))
    if not all_candidates:
        return "", 0.0
    score_map: Dict[str, float] = {}
    for txt, score in all_candidates:
        score_map[txt] = score_map.get(txt, 0.0) + score
    best = sorted(score_map.items(), key=lambda x: x[1], reverse=True)[0]
    return best[0], best[1]


def read_plate(reader, plate_bgr):
    gray = preprocess_plate_bgr(plate_bgr)

    one_line, s1 = read_plate_one_line(reader, gray)
    if one_line:
        return one_line, s1

    two_lines, s2 = read_plate_two_lines(reader, gray)
    if two_lines:
        return two_lines, s2

    raw, s3 = fallback_raw_text(reader, gray)
    if raw:
        return raw, s3

    return "unknown", 0.0


# ============================================================
# DRAW
# ============================================================
def draw_box(img, box, color, text=None):
    x1, y1, x2, y2 = box
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
    if text:
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = 0.6
        thick = 2
        (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
        tx = max(5, x1)
        ty = y1 - 8
        if ty - th < 5:
            ty = y1 + th + 8
        cv2.rectangle(img, (tx - 4, ty - th - 6), (tx + tw + 4, ty + 4), color, -1)
        cv2.putText(img, text, (tx, ty), font, scale, (0, 0, 0), thick, cv2.LINE_AA)


# ============================================================
# DETECT + OCR + EVAL PER IMAGE
# ============================================================
def get_best_prediction(model, reader, image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        return None

    results = model.predict(
        source=image_path,
        conf=DET_CONF,
        iou=DET_IOU,
        imgsz=IMG_SIZE,
        verbose=False,
    )

    detections = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            if not is_reasonable_plate_box(x1, y1, x2, y2, img.shape):
                continue

            pad_x = int((x2 - x1) * 0.18)
            pad_y = int((y2 - y1) * 0.20)
            xx1 = max(0, x1 - pad_x)
            yy1 = max(0, y1 - pad_y)
            xx2 = min(img.shape[1], x2 + pad_x)
            yy2 = min(img.shape[0], y2 + pad_y)
            crop = img[yy1:yy2, xx1:xx2]
            if crop.size == 0:
                continue
            text, ocr_score = read_plate(reader, crop)
            detections.append({
                "box": (x1, y1, x2, y2),
                "det_conf": conf,
                "crop": crop,
                "ocr_text": text,
                "ocr_score": ocr_score,
            })

    if not detections:
        return img, None

    detections = sorted(detections, key=lambda z: z["det_conf"], reverse=True)
    best = detections[0]
    return img, best


def evaluate_one_image(model, reader, image_path: str) -> Dict:
    name = os.path.basename(image_path)
    base_name = os.path.splitext(name)[0]

    img = cv2.imread(image_path)
    if img is None:
        return {
            "image_name": name,
            "status": "image_not_found"
        }

    gt_box = get_gt_box(os.path.join(DETECT_LABELS_DIR, base_name + ".txt"), img.shape)
    gt_text = find_ocr_gt(base_name)

    _, pred = get_best_prediction(model, reader, image_path)

    pred_box = pred["box"] if pred else None
    det_conf = float(pred["det_conf"]) if pred else 0.0
    pred_text = pred["ocr_text"] if pred else ""
    ocr_conf = float(pred["ocr_score"]) if pred else 0.0

    best_iou = iou_xyxy(gt_box, pred_box) if (gt_box and pred_box) else 0.0
    det_tp = 1 if (gt_box and pred_box and best_iou >= MATCH_IOU_THRESH) else 0
    det_fp = 1 if (pred_box is not None and det_tp == 0) else 0
    det_fn = 1 if (gt_box is not None and det_tp == 0) else 0

    gt_cmp = normalize_compare_text(gt_text)
    pred_cmp = normalize_compare_text(pred_text)

    edit_distance = levenshtein(gt_cmp, pred_cmp) if gt_cmp or pred_cmp else 0
    cer = (edit_distance / max(1, len(gt_cmp))) if gt_cmp else 0.0
    char_acc = (1.0 - cer) if gt_cmp else 0.0
    exact_match = 1 if (gt_cmp and pred_cmp == gt_cmp) else 0

    annotated = img.copy()
    if gt_box:
        draw_box(annotated, gt_box, (255, 0, 0), "GT")
    if pred_box:
        draw_box(annotated, pred_box, (0, 255, 0), f"Pred {pred_text}")

    if SAVE_ANNOTATED:
        cv2.imwrite(os.path.join(ANNOTATED_DIR, name), annotated)
    if SAVE_CROPS and pred is not None:
        cv2.imwrite(os.path.join(CROPS_DIR, name), pred["crop"])

    return {
        "image_name": name,
        "gt_text": gt_text,
        "pred_text": pred_text,
        "gt_box": "" if gt_box is None else f"{gt_box[0]},{gt_box[1]},{gt_box[2]},{gt_box[3]}",
        "pred_box": "" if pred_box is None else f"{pred_box[0]},{pred_box[1]},{pred_box[2]},{pred_box[3]}",
        "det_conf": round(det_conf, 6),
        "ocr_conf": round(ocr_conf, 6),
        "iou": round(best_iou, 6),
        "det_tp": det_tp,
        "det_fp": det_fp,
        "det_fn": det_fn,
        "exact_match": exact_match,
        "edit_distance": edit_distance,
        "cer": round(cer, 6),
        "char_acc": round(char_acc, 6),
        "status": "ok",
    }


# ============================================================
# MAIN EVAL
# ============================================================
def list_images() -> List[str]:
    out = []
    if not os.path.isdir(IMAGES_DIR):
        return out
    for name in os.listdir(IMAGES_DIR):
        if os.path.splitext(name)[1].lower() in IMAGE_EXTS:
            out.append(os.path.join(IMAGES_DIR, name))
    return sorted(out)


def save_rows_csv(rows: List[Dict], csv_path: str):
    fieldnames = [
        "image_name", "gt_text", "pred_text", "gt_box", "pred_box",
        "det_conf", "ocr_conf", "iou", "det_tp", "det_fp", "det_fn",
        "exact_match", "edit_distance", "cer", "char_acc", "status"
    ]
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def save_summary_csv(summary: Dict, summary_path: str):
    with open(summary_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["metric", "value"])
        for k, v in summary.items():
            writer.writerow([k, v])


def build_summary(rows: List[Dict]) -> Dict:
    valid_rows = [r for r in rows if r.get("status") == "ok"]

    tp = sum(int(r["det_tp"]) for r in valid_rows)
    fp = sum(int(r["det_fp"]) for r in valid_rows)
    fn = sum(int(r["det_fn"]) for r in valid_rows)
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    f1 = 2 * precision * recall / max(1e-9, precision + recall)

    matched_rows = [r for r in valid_rows if int(r["det_tp"]) == 1]
    mean_iou = sum(float(r["iou"]) for r in matched_rows) / max(1, len(matched_rows))

    # OCR tính trên tất cả ảnh có GT text
    ocr_rows = [r for r in valid_rows if str(r.get("gt_text", "")).strip() != ""]
    plate_acc = sum(int(r["exact_match"]) for r in ocr_rows) / max(1, len(ocr_rows))
    avg_cer = sum(float(r["cer"]) for r in ocr_rows) / max(1, len(ocr_rows))
    avg_char_acc = sum(float(r["char_acc"]) for r in ocr_rows) / max(1, len(ocr_rows))

    return {
        "num_images": len(valid_rows),
        "det_tp": tp,
        "det_fp": fp,
        "det_fn": fn,
        "det_precision": round(precision, 6),
        "det_recall": round(recall, 6),
        "det_f1": round(f1, 6),
        "det_mean_iou_on_tp": round(mean_iou, 6),
        "ocr_num_images_with_gt": len(ocr_rows),
        "ocr_plate_accuracy": round(plate_acc, 6),
        "ocr_avg_cer": round(avg_cer, 6),
        "ocr_avg_char_accuracy": round(avg_char_acc, 6),
    }


def main():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Không tìm thấy model: {MODEL_PATH}")
    if not os.path.isdir(IMAGES_DIR):
        raise FileNotFoundError(f"Không tìm thấy thư mục ảnh: {IMAGES_DIR}")
    if not os.path.isdir(DETECT_LABELS_DIR):
        raise FileNotFoundError(f"Không tìm thấy thư mục label detect: {DETECT_LABELS_DIR}")

    image_paths = list_images()
    if not image_paths:
        raise RuntimeError(f"Không có ảnh trong: {IMAGES_DIR}")

    print(f"Tong so anh: {len(image_paths)}")
    model = YOLO(MODEL_PATH)
    reader = easyocr.Reader(["en"], gpu=torch.cuda.is_available())

    rows = []
    for idx, image_path in enumerate(image_paths, start=1):
        row = evaluate_one_image(model, reader, image_path)
        rows.append(row)
        print(f"[{idx}/{len(image_paths)}] {row.get('image_name')} | IoU={row.get('iou', 0)} | GT={row.get('gt_text', '')} | Pred={row.get('pred_text', '')}")

    summary = build_summary(rows)
    save_rows_csv(rows, CSV_PATH)
    save_summary_csv(summary, SUMMARY_PATH)

    print("\n===== SUMMARY =====")
    for k, v in summary.items():
        print(f"{k}: {v}")
    print(f"\nDa luu file chi tiet: {CSV_PATH}")
    print(f"Da luu file tong hop: {SUMMARY_PATH}")


if __name__ == "__main__":
    main()
