from ultralytics import YOLO
import cv2
import easyocr
import re
import numpy as np
import torch

MODEL_PATH = r"E:\LPR_ttcs\runs\License_Plate_Model-v113\weights\best.pt"
IMAGE_PATH = r"E:\LPR_ttcs\test_images\vehicle3.jpg"
OUTPUT_PATH = r"E:\LPR_ttcs\result_plate3.jpg"

ALLOWED_SERIES = set("ABCDEFGHKLMNPRSTUVXYZ")


# =========================
# Utils
# =========================
def clean_text(text: str) -> str:
    text = text.upper().replace(" ", "").replace("\n", "")
    return re.sub(r"[^A-Z0-9.-]", "", text)


def l2d(ch: str) -> str:
    mp = {
        "O": "0", "Q": "0", "D": "0",
        "I": "1", "L": "1",
        "Z": "2", "S": "5", "B": "8", "G": "6",
    }
    return mp.get(ch, ch)


def d2l(ch: str) -> str:
    mp = {
        "0": "D",
        "2": "Z",
        "5": "S",
        "8": "B",
        "6": "G",
    }
    return mp.get(ch, ch)


# =========================
# Preprocess
# =========================
def remove_border(gray):
    h, w = gray.shape[:2]
    x1 = int(w * 0.04)
    x2 = int(w * 0.96)
    y1 = int(h * 0.04)
    y2 = int(h * 0.96)
    crop = gray[y1:y2, x1:x2]
    return crop if crop.size > 0 else gray


def preprocess_plate(gray):
    gray = remove_border(gray)
    gray = cv2.resize(gray, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    gray = cv2.bilateralFilter(gray, 7, 60, 60)
    return gray


def make_variants(gray):
    variants = [gray]

    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    variants.append(blur)

    sharp = cv2.addWeighted(gray, 1.8, blur, -0.8, 0)
    variants.append(sharp)

    th1 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    variants.append(th1)

    th2 = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31, 8
    )
    variants.append(th2)

    return variants


def split_lines(gray):
    h, w = gray.shape[:2]
    inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    hist = np.sum(inv > 0, axis=1)

    y1 = int(h * 0.22)
    y2 = int(h * 0.78)
    if y2 <= y1:
        mid = h // 2
        return gray[:mid, :], gray[mid:, :]

    local = hist[y1:y2]
    split = y1 + int(np.argmin(local))
    split = max(int(h * 0.32), min(split, int(h * 0.68)))

    return gray[:split, :], gray[split:, :]


# =========================
# OCR
# =========================
def ocr(reader, img, allowlist):
    res = reader.readtext(
        img,
        detail=1,
        paragraph=False,
        decoder="beamsearch",
        allowlist=allowlist
    )
    out = []
    for item in res:
        txt = clean_text(item[1])
        conf = float(item[2])
        if txt:
            out.append((txt, conf))
    return out


# =========================
# Normalize top
# car: 61A
# bike: 63S9 -> 63-S9
# =========================
def normalize_top(text):
    raw = clean_text(text).replace("-", "").replace(".", "")
    if len(raw) < 3:
        return ""

    # ô tô: 61A
    if len(raw) >= 3:
        a = l2d(raw[0])
        b = l2d(raw[1])
        c = raw[2]
        if c.isdigit():
            c = d2l(c)
        if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES and len(raw) == 3:
            return f"{a}{b}{c}"

    # xe máy: 63S9 -> 63-S9
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


def read_top_line(reader, top_line):
    candidates = []

    for var in make_variants(top_line):
        for txt, conf in ocr(reader, var, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"):
            norm = normalize_top(txt)
            if norm:
                score = conf
                if re.fullmatch(r"\d{2}[A-Z]", norm):
                    score += 0.15
                if re.fullmatch(r"\d{2}-[A-Z]\d", norm):
                    score += 0.15
                candidates.append((norm, score))

    if not candidates:
        return ""

    score_map = {}
    for norm, score in candidates:
        score_map[norm] = score_map.get(norm, 0.0) + score

    best = sorted(score_map.items(), key=lambda x: x[1], reverse=True)[0][0]
    return best


# =========================
# Bottom line
# hỗ trợ:
# 1111
# 111.11
# 9999
# 999.99
# =========================
def segment_characters(line_img):
    if line_img is None or line_img.size == 0:
        return []

    if len(line_img.shape) == 3:
        gray = cv2.cvtColor(line_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = line_img.copy()

    big = cv2.resize(gray, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(big, (3, 3), 0)

    th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel_open, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(th, connectivity=8)

    H, W = th.shape[:2]
    comps = []

    for i in range(1, num_labels):
        x, y, w, h, area = stats[i]

        if area < 70:
            continue
        if h < H * 0.35:
            continue
        if w < 8:
            continue

        comps.append((x, y, w, h, area))

    if not comps:
        return []

    comps.sort(key=lambda z: z[0])

    merged = []
    cur = list(comps[0])

    for nxt in comps[1:]:
        x, y, w, h, area = nxt
        cur_x, cur_y, cur_w, cur_h, cur_area = cur
        gap = x - (cur_x + cur_w)

        if gap <= 10:
            nx1 = min(cur_x, x)
            ny1 = min(cur_y, y)
            nx2 = max(cur_x + cur_w, x + w)
            ny2 = max(cur_y + cur_h, y + h)
            cur = [nx1, ny1, nx2 - nx1, ny2 - ny1, cur_area + area]
        else:
            merged.append(tuple(cur))
            cur = [x, y, w, h, area]

    merged.append(tuple(cur))

    char_imgs = []
    for x, y, w, h, area in merged:
        crop = big[max(0, y - 5):min(H, y + h + 5), max(0, x - 5):min(W, x + w + 5)]
        if crop.size > 0:
            char_imgs.append(crop)

    return char_imgs


def normalize_bottom_digits(digits, expected_len=None):
    digits = re.sub(r"[^0-9]", "", digits)

    if expected_len == 4:
        if len(digits) == 4:
            return digits
        return ""

    if expected_len == 5:
        if len(digits) == 5:
            return f"{digits[:3]}.{digits[3:5]}"
        return ""

    if len(digits) == 4:
        return digits

    if len(digits) == 5:
        return f"{digits[:3]}.{digits[3:5]}"

    return ""


def read_bottom_line(reader, bottom_line):
    candidates = []

    # =========================
    # Cách 1: tách từng ký tự
    # =========================
    chars = segment_characters(bottom_line)

    if 4 <= len(chars) <= 5:
        digits = ""
        conf_sum = 0.0
        valid_count = 0

        for ch_img in chars:
            votes = []

            for var in make_variants(ch_img):
                res = reader.readtext(
                    var,
                    detail=1,
                    paragraph=False,
                    decoder="beamsearch",
                    allowlist="0123456789OQDGILSZB"
                )
                for item in res:
                    txt = clean_text(item[1])
                    conf = float(item[2])
                    if txt:
                        ch = l2d(txt[0])
                        if ch.isdigit():
                            votes.append((ch, conf))

            if votes:
                score_map = {}
                for ch, conf in votes:
                    score_map[ch] = score_map.get(ch, 0.0) + conf

                best_digit, best_score = sorted(score_map.items(), key=lambda x: x[1], reverse=True)[0]
                digits += best_digit
                conf_sum += best_score
                valid_count += 1

        if valid_count == len(chars):
            if len(chars) == 4:
                norm = normalize_bottom_digits(digits, expected_len=4)
                if norm:
                    candidates.append((norm, conf_sum + 1.2))

            elif len(chars) == 5:
                norm = normalize_bottom_digits(digits, expected_len=5)
                if norm:
                    candidates.append((norm, conf_sum + 1.2))

    # =========================
    # Cách 2: OCR cả dòng
    # =========================
    for var in make_variants(bottom_line):
        for txt, conf in ocr(reader, var, "0123456789OQDGILSZB."):
            raw = "".join(l2d(c) for c in clean_text(txt))
            raw_digits = re.sub(r"[^0-9]", "", raw)

            if len(raw_digits) == 4:
                norm = normalize_bottom_digits(raw_digits, expected_len=4)
                if norm:
                    score = conf + 0.8
                    candidates.append((norm, score))

            elif len(raw_digits) == 5:
                norm = normalize_bottom_digits(raw_digits, expected_len=5)
                if norm:
                    score = conf + 0.8
                    candidates.append((norm, score))

    if not candidates:
        return ""

    score_map = {}
    for norm, score in candidates:
        score_map[norm] = score_map.get(norm, 0.0) + score

    best = sorted(score_map.items(), key=lambda x: x[1], reverse=True)[0][0]
    return best


# =========================
# Assemble
# =========================
def assemble_plate(top_text, bottom_text):
    if not top_text or not bottom_text:
        return ""

    # ô tô
    if re.fullmatch(r"\d{2}[A-Z]", top_text) and re.fullmatch(r"\d{3}\.\d{2}", bottom_text):
        return f"{top_text}-{bottom_text}"

    # xe máy: dòng dưới 4 số
    if re.fullmatch(r"\d{2}-[A-Z]\d", top_text) and re.fullmatch(r"\d{4}", bottom_text):
        return f"{top_text} {bottom_text}"

    # xe máy: dòng dưới 5 số
    if re.fullmatch(r"\d{2}-[A-Z]\d", top_text) and re.fullmatch(r"\d{3}\.\d{2}", bottom_text):
        return f"{top_text} {bottom_text}"

    return ""


# =========================
# Plate reading
# =========================
def read_plate(reader, plate_bgr):
    gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
    gray = preprocess_plate(gray)

    top_line, bottom_line = split_lines(gray)

    top_text = read_top_line(reader, top_line)
    bottom_text = read_bottom_line(reader, bottom_line)

    return assemble_plate(top_text, bottom_text)


# =========================
# Box filtering
# =========================
def is_reasonable_plate_box(x1, y1, x2, y2, img_shape):
    h_img, w_img = img_shape[:2]
    w = x2 - x1
    h = y2 - y1

    if w <= 0 or h <= 0:
        return False

    area = w * h
    img_area = h_img * w_img
    ratio = w / float(h)

    if area < img_area * 0.001:
        return False
    if area > img_area * 0.20:
        return False

    if ratio < 0.55 or ratio > 1.8:
        return False

    return True


# =========================
# Draw
# =========================
def draw_label(img, x1, y1, text):
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.9
    thick = 2

    (tw, th), _ = cv2.getTextSize(text, font, scale, thick)

    tx = x1
    ty = y1 - 10

    if tx + tw > img.shape[1] - 5:
        tx = max(5, img.shape[1] - tw - 5)

    if ty - th < 5:
        ty = y1 + th + 10

    cv2.putText(img, text, (tx, ty), font, scale, (0, 255, 0), thick, cv2.LINE_AA)


# =========================
# Main
# =========================
def main():
    model = YOLO(MODEL_PATH)
    reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available())

    img = cv2.imread(IMAGE_PATH)
    if img is None:
        raise FileNotFoundError(f"Khong tim thay anh: {IMAGE_PATH}")

    results = model.predict(
        source=IMAGE_PATH,
        conf=0.35,
        imgsz=960
    )

    valid_results = []

    for r in results:
        if r.boxes is None:
            continue

        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])

            if not is_reasonable_plate_box(x1, y1, x2, y2, img.shape):
                continue

            pad_x = int((x2 - x1) * 0.08)
            pad_y = int((y2 - y1) * 0.08)

            xx1 = max(0, x1 - pad_x)
            yy1 = max(0, y1 - pad_y)
            xx2 = min(img.shape[1], x2 + pad_x)
            yy2 = min(img.shape[0], y2 + pad_y)

            plate = img[yy1:yy2, xx1:xx2]
            if plate.size == 0:
                continue

            plate_text = read_plate(reader, plate)
            if not plate_text:
                continue

            valid_results.append((x1, y1, x2, y2, plate_text, conf))

    # NMS đơn giản để bỏ box trùng
    final_results = []
    for item in sorted(valid_results, key=lambda z: z[5], reverse=True):
        x1, y1, x2, y2, plate_text, conf = item
        keep = True

        for old in final_results:
            ox1, oy1, ox2, oy2, _, _ = old

            ix1 = max(x1, ox1)
            iy1 = max(y1, oy1)
            ix2 = min(x2, ox2)
            iy2 = min(y2, oy2)

            iw = max(0, ix2 - ix1)
            ih = max(0, iy2 - iy1)
            inter = iw * ih

            area1 = (x2 - x1) * (y2 - y1)
            area2 = (ox2 - ox1) * (oy2 - oy1)
            union = area1 + area2 - inter + 1e-6
            iou = inter / union

            if iou > 0.4:
                keep = False
                break

        if keep:
            final_results.append(item)

    for x1, y1, x2, y2, plate_text, conf in final_results:
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        draw_label(img, x1, y1, plate_text)
        print("Plate:", plate_text)

    cv2.imwrite(OUTPUT_PATH, img)
    print("Saved:", OUTPUT_PATH)


if __name__ == "__main__":
    main()