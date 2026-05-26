from ultralytics import YOLO
import cv2
import numpy as np
import re
from paddleocr import PaddleOCR

# ======================
# CONFIG
# ======================
MODEL_PATH = r"D:\THL_vehicle_monitoring_system\runs\plate_only_train\weights\plate_yolo12n_640_2025.pt"
IMAGE_PATH = r"D:\THL_vehicle_monitoring_system\test_images\vehicle4.jpg"

# ======================
# LOAD MODEL
# ======================
model = YOLO(MODEL_PATH)

# 🔥 FIX: tắt angle cls để giảm sai OCR
ocr = PaddleOCR(use_angle_cls=False, lang='en')

# ======================
# PREPROCESS
# ======================
def preprocess_plate(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    clahe = cv2.createCLAHE(clipLimit=2.0)
    gray = clahe.apply(gray)
    return gray

# ======================
# CLEAN TEXT (KHÔNG PHÁ KÝ TỰ NỮA)
# ======================
def clean_text(text):
    text = text.upper().replace(" ", "")

    mapping = {
        "O": "0",
        "I": "1",
        "L": "1",
        "B": "8",
        "S": "5",
        "Z": "2"
    }

    return "".join([mapping.get(c, c) for c in text])

# ======================
# OCR CORE
# ======================
def run_ocr(crop):
    crop = cv2.resize(crop, (200, 80))

    processed = preprocess_plate(crop)

    # thử 2 bản: gốc + processed
    variants = [crop, processed]

    best_text = ""
    best_score = 0

    for img_try in variants:
        result = ocr.ocr(img_try, cls=False)

        if not result:
            continue

        boxes_all = []

        for line in result:
            if not line:
                continue

            for box in line:
                text = box[1][0]
                score = box[1][1]

                if score < 0.7:  # 🔥 lọc OCR yếu
                    continue

                x, y = box[0][0]
                text = clean_text(text)

                boxes_all.append((y, x, text, score))

        if len(boxes_all) == 0:
            continue

        # ======================
        # SORT THEO Y (quan trọng)
        # ======================
        boxes_all.sort(key=lambda x: x[0])

        ys = [b[0] for b in boxes_all]
        mid_y = np.median(ys)

        line1 = []
        line2 = []

        for y, x, text, score in boxes_all:
            if y < mid_y:
                line1.append((x, text, score))
            else:
                line2.append((x, text, score))

        # sort X
        line1 = sorted(line1, key=lambda x: x[0])
        line2 = sorted(line2, key=lambda x: x[0])

        text1 = "".join([t[1] for t in line1])
        text2 = "".join([t[1] for t in line2])

        full_text = text1 + text2

        avg_score = np.mean([t[2] for t in line1 + line2]) if (line1 + line2) else 0

        if avg_score > best_score:
            best_score = avg_score
            best_text = full_text

    return best_text, best_score, processed

# ======================
# MAIN
# ======================
img = cv2.imread(IMAGE_PATH)

results = model.predict(img, conf=0.3, imgsz=640)

for r in results:
    print("Boxes:", len(r.boxes))

    for i, box in enumerate(r.boxes):
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])

        print(f"\nBOX {i} conf={conf:.3f}")

        pad = 8
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(img.shape[1], x2 + pad)
        y2 = min(img.shape[0], y2 + pad)

        crop = img[y1:y2, x1:x2]

        if crop.size == 0:
            continue

        text, score, processed = run_ocr(crop)

        print(f"👉 RESULT: {text} | score={score:.2f}")

        # DRAW
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(img, text, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        cv2.imshow("OCR DEBUG", processed)

cv2.imshow("FINAL RESULT", img)
cv2.waitKey(0)
cv2.destroyAllWindows()