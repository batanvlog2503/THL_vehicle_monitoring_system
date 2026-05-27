"""
=============================================================
LPR Pipeline v2 - Vietnamese License Plate Recognition
=============================================================
Cải tiến so với v1:
 - Tiền xử lý ảnh nâng cao (bilateral, sharpening đa cấp)
 - Multi-variant OCR với 8+ biến thể ảnh
 - Deskew nâng cao bằng Hough Line
 - Super-resolution nhẹ (upscale 4x cho biển nhỏ)
 - Scoring thông minh hơn (format + conf + frequency + conv_penalty)
 - Tracking cải thiện (Kalman-like box smoothing, miss tolerance)
 - Smoothing theo track_id: majority voting + weighted score
 - Output video mượt, đúng FPS, chỉ hiển thị biển tốt nhất
=============================================================
"""

import os
import re
import csv
import warnings
import torch
import cv2
import easyocr
import numpy as np
from collections import defaultdict
from ultralytics import YOLO

warnings.filterwarnings("ignore", category=RuntimeWarning)

# ============================================================
# CONFIG - Chỉnh các đường dẫn và tham số tại đây
# ============================================================
MODEL_PATH       = r"D:\THL_vehicle_monitoring_system\runs\plate_only_train\weights\best.pt"
VIDEO_PATH       = r"D:\THL_vehicle_monitoring_system\test_images\7733209278881.mp4"
OUTPUT_DIR       = r"D:\THL_vehicle_monitoring_system\Predict\video_pipeline"
RAW_CSV_PATH     = os.path.join(OUTPUT_DIR, "raw_ocr_results.csv")
FILLED_CSV_PATH  = os.path.join(OUTPUT_DIR, "filled_ocr_results.csv")
OUTPUT_VIDEO_PATH= os.path.join(OUTPUT_DIR, "result_video7733209278881.mp4")

SHOW_WINDOW      = True
SAVE_OUTPUT_VIDEO= True

# --- Detection ---
FRAME_SKIP       = 1          # Bỏ qua N-1 frame (1 = xử lý tất cả)
OCR_EVERY_N      = 5        # Chỉ OCR mỗi N frame để tiết kiệm CPU
IMG_SIZE         = 1280       # Input size YOLO (lớn hơn → phát hiện biển nhỏ hơn)
DET_CONF         = 0.15       # Ngưỡng confidence detect thấp → bắt nhiều hơn
DET_IOU          = 0.45       # NMS IoU threshold

# --- Tracking ---
TRACK_IOU_THR    = 0.25       # IoU tối thiểu để ghép track
TRACK_MAX_MISS   = 20         # Số frame liên tiếp không thấy thì xóa track
TRACK_BOX_ALPHA  = 0.6        # Hệ số EMA smooth box (0=không smooth, 1=không update)

# --- OCR ---
MIN_SCORE_ACCEPT = 3.5        # Score tối thiểu để nhận kết quả OCR
CROP_PAD_RATIO_X = 0.15       # Padding ngang khi crop biển
CROP_PAD_RATIO_Y = 0.20       # Padding dọc khi crop biển
MIN_PLATE_H      = 40         # Biển nhỏ hơn threshold này sẽ được upscale mạnh hơn
UPSCALE_TARGET_H = 200        # Chiều cao đích sau upscale

ALLOWED_SERIES   = set("ABCDEFGHKLMNPRSTUVXYZ")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# UTIL - OCR ENGINE
# ============================================================
class PlateOCR:
    """
    Nhận dạng biển số xe Việt Nam với tiền xử lý đa tầng và multi-variant OCR.
    Hỗ trợ: ô tô 1/2 dòng, xe máy 1/2 dòng, biển nhỏ/xa/mờ/nghiêng.
    """

    def __init__(self, gpu: bool | None = None):
        if gpu is None:
            gpu = torch.cuda.is_available()
        print(f"[OCR] Đang khởi tạo EasyOCR... GPU={gpu}")
        self.reader = easyocr.Reader(["en"], gpu=gpu)
        print("[OCR] Sẵn sàng.")

    # ----------------------------------------------------------
    # TEXT UTILITIES
    # ----------------------------------------------------------
    @staticmethod
    def clean(text: str) -> str:
        """Giữ lại chỉ A-Z, 0-9, dấu chấm, gạch ngang."""
        return re.sub(r"[^A-Z0-9.\-]", "", text.upper().replace(" ", ""))

    @staticmethod
    def alnum(text: str) -> str:
        """Chỉ giữ chữ và số."""
        return re.sub(r"[^A-Z0-9]", "", text.upper())

    @staticmethod
    def l2d(ch: str) -> str:
        """Letter → Digit: sửa OCR nhầm chữ ra số."""
        return {"O":"0","Q":"0","D":"0","I":"1","L":"1","T":"1",
                "Z":"2","S":"5","B":"8","G":"6","J":"1","U":"0"}.get(ch, ch)

    @staticmethod
    def d2l(ch: str) -> str:
        """Digit → Letter: sửa OCR nhầm số ra chữ (dùng cho vị trí series)."""
        return {"0":"D","2":"Z","5":"S","8":"B","6":"G","1":"I","4":"A"}.get(ch, ch)

    # ----------------------------------------------------------
    # IMAGE PREPROCESSING
    # ----------------------------------------------------------
    @staticmethod
    def _upscale(img: np.ndarray, target_h: int = UPSCALE_TARGET_H) -> np.ndarray:
        """Upscale giữ tỷ lệ, dùng INTER_LANCZOS4 cho chất lượng cao."""
        h, w = img.shape[:2]
        if h == 0 or w == 0:
            return img
        scale = target_h / h
        new_w = max(1, int(w * scale))
        return cv2.resize(img, (new_w, target_h), interpolation=cv2.INTER_LANCZOS4)

    @staticmethod
    def _clahe(gray: np.ndarray, clip: float = 3.0) -> np.ndarray:
        c = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8))
        return c.apply(gray)

    @staticmethod
    def _bilateral(gray: np.ndarray) -> np.ndarray:
        """Bilateral filter: giữ cạnh sắc, giảm nhiễu."""
        return cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    @staticmethod
    def _sharpen(gray: np.ndarray, strength: float = 1.5) -> np.ndarray:
        """Unsharp masking để tăng độ sắc nét ký tự."""
        blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=2)
        return cv2.addWeighted(gray, 1 + strength, blur, -strength, 0)

    @staticmethod
    def _otsu(gray: np.ndarray, invert: bool = False) -> np.ndarray:
        flag = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY
        _, th = cv2.threshold(gray, 0, 255, flag | cv2.THRESH_OTSU)
        return th

    @staticmethod
    def _adaptive(gray: np.ndarray, block: int = 31, c: int = 8) -> np.ndarray:
        """Adaptive threshold cho điều kiện sáng không đều."""
        return cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, block, c
        )

    @staticmethod
    def _morph_close(img: np.ndarray, ksize: int = 2) -> np.ndarray:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (ksize, ksize))
        return cv2.morphologyEx(img, cv2.MORPH_CLOSE, k, iterations=1)

    @staticmethod
    def _morph_dilate(img: np.ndarray, ksize: int = 2) -> np.ndarray:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (ksize, ksize))
        return cv2.dilate(img, k, iterations=1)

    def deskew(self, plate_bgr: np.ndarray) -> np.ndarray:
        """
        Chỉnh nghiêng biển số bằng Hough Lines kết hợp minAreaRect.
        Ưu tiên Hough vì chính xác hơn với biển có line viền rõ ràng.
        """
        gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 50, 150, apertureSize=3)

        angle = 0.0
        lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=40)
        if lines is not None:
            angles = []
            for rho, theta in lines[:, 0]:
                a = np.degrees(theta) - 90
                if -20 < a < 20:
                    angles.append(a)
            if angles:
                angle = float(np.median(angles))

        # Fallback về minAreaRect nếu Hough không tìm được
        if abs(angle) < 0.5:
            th = self._otsu(gray, invert=True)
            coords = np.column_stack(np.where(th > 0))
            if len(coords) >= 20:
                rect = cv2.minAreaRect(coords[:, ::-1].astype(np.float32))
                a = rect[-1]
                if a < -45:
                    a = 90 + a
                elif a > 45:
                    a = a - 90
                if abs(a) < 20:
                    angle = float(a)

        if abs(angle) < 0.5:
            return plate_bgr

        h, w = plate_bgr.shape[:2]
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        return cv2.warpAffine(plate_bgr, M, (w, h),
                              flags=cv2.INTER_LANCZOS4,
                              borderMode=cv2.BORDER_REPLICATE)

    def refine_roi(self, plate_bgr: np.ndarray) -> np.ndarray:
        """
        Tự động crop chặt vùng có ký tự, loại bỏ viền thừa.
        """
        gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        # Cắt nhẹ viền ngoài
        x1, x2 = int(w * 0.01), int(w * 0.99)
        y1, y2 = int(h * 0.02), int(h * 0.98)
        gray = gray[y1:y2, x1:x2]
        if gray.size == 0:
            return plate_bgr

        clahe = self._clahe(gray)
        blur  = cv2.GaussianBlur(clahe, (3, 3), 0)
        th    = self._otsu(blur)
        k     = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        th    = cv2.morphologyEx(th, cv2.MORPH_CLOSE, k)

        cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        hh, ww  = gray.shape[:2]
        best, best_s = None, -1e18

        for cnt in cnts:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw <= 0 or bh <= 0:
                continue
            area  = bw * bh
            ratio = bw / float(bh + 1e-6)
            if area < ww * hh * 0.06:
                continue
            if ratio < 0.4 or ratio > 8.0:
                continue
            cx, cy = bx + bw / 2, by + bh / 2
            pen = abs(cx - ww / 2) / ww + abs(cy - hh / 2) / hh
            s   = area - 12000 * pen
            if s > best_s:
                best_s, best = s, (bx, by, bw, bh)

        if best is not None:
            bx, by, bw, bh = best
            px = int(bw * 0.05)
            py = int(bh * 0.08)
            xx1 = max(0, bx - px)
            yy1 = max(0, by - py)
            xx2 = min(ww, bx + bw + px)
            yy2 = min(hh, by + bh + py)
            roi = gray[yy1:yy2, xx1:xx2]
            if roi.size > 0:
                return cv2.cvtColor(roi, cv2.COLOR_GRAY2BGR)

        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    def build_variants(self, gray: np.ndarray) -> list[np.ndarray]:
        """
        Tạo 8 biến thể ảnh để OCR đa variant.
        Mỗi variant nhấn mạnh một đặc điểm khác nhau của ký tự.
        """
        clahe  = self._clahe(gray, clip=2.5)
        bilat  = self._bilateral(clahe)
        sharp1 = self._sharpen(clahe, strength=1.2)
        sharp2 = self._sharpen(bilat, strength=1.8)
        otsu1  = self._otsu(bilat)
        otsu2  = self._otsu(bilat, invert=True)
        adap1  = self._adaptive(clahe, block=31, c=8)
        adap2  = self._adaptive(bilat, block=21, c=6)
        # Thêm morph close trên threshold để nối ký tự đứt đoạn
        mclose = self._morph_close(otsu1, ksize=2)
        return [clahe, bilat, sharp1, sharp2, otsu1, otsu2, adap1, adap2, mclose]

    def split_lines(self, gray: np.ndarray):
        """
        Tách biển 2 dòng bằng histogram hàng ngang.
        Trả về (top, bottom) dạng grayscale.
        """
        h, w = gray.shape[:2]
        inv   = self._otsu(gray, invert=True)
        hist  = np.sum(inv > 0, axis=1).astype(np.float32)
        k     = max(3, int(h * 0.05))
        if k % 2 == 0:
            k += 1
        hist  = cv2.GaussianBlur(hist.reshape(-1, 1), (1, k), 0).reshape(-1)
        ys, ye = int(h * 0.25), int(h * 0.75)
        if ye <= ys:
            mid = h // 2
            return gray[:mid], gray[mid:]
        split = ys + int(np.argmin(hist[ys:ye]))
        split = max(int(h * 0.33), min(split, int(h * 0.67)))
        top, bot = gray[:split], gray[split:]
        if top.size == 0 or bot.size == 0:
            mid = h // 2
            return gray[:mid], gray[mid:]
        return top, bot

    # ----------------------------------------------------------
    # OCR CALLS
    # ----------------------------------------------------------
    def _ocr(self, img: np.ndarray, allowlist: str) -> list[tuple[str, float]]:
        """Gọi EasyOCR một lần, trả về list (text, conf)."""
        results = self.reader.readtext(
            img, detail=1, paragraph=False,
            decoder="beamsearch", allowlist=allowlist
        )
        out = []
        for item in results:
            txt  = self.clean(item[1])
            conf = float(item[2])
            if txt:
                out.append((txt, conf))
        return out

    # ----------------------------------------------------------
    # NORMALIZATION - biển số Việt Nam
    # ----------------------------------------------------------
    def _fix_chars(self, raw: str, digit_positions: set, letter_positions: set) -> str:
        """
        Sửa lỗi ký tự theo vị trí biết trước là digit hay letter.
        """
        chars = list(raw)
        for i, ch in enumerate(chars):
            if i in digit_positions:
                chars[i] = self.l2d(ch)
            elif i in letter_positions:
                if ch.isdigit():
                    chars[i] = self.d2l(ch)
        return "".join(chars)

    def norm_car_1line(self, text: str) -> str:
        """Biển ô tô 1 dòng: 51A-12345 hoặc 51A-123.45"""
        raw = self.alnum(text)
        if len(raw) < 7:
            return ""
        # Vị trí: 0,1 → digit; 2 → letter; 3-7 → digit
        chars = list(raw)
        chars[0] = self.l2d(chars[0])
        chars[1] = self.l2d(chars[1])
        if len(chars) > 2 and chars[2].isdigit():
            chars[2] = self.d2l(chars[2])
        for i in range(3, len(chars)):
            chars[i] = self.l2d(chars[i])
        raw = "".join(chars)

        m = re.fullmatch(r"(\d{2})([A-Z])(\d{5})", raw)
        if m and m.group(2) in ALLOWED_SERIES:
            t = m.group(3)
            return f"{m.group(1)}{m.group(2)}-{t[:3]}.{t[3:]}"
        m = re.fullmatch(r"(\d{2})([A-Z])(\d{4})", raw)
        if m and m.group(2) in ALLOWED_SERIES:
            return f"{m.group(1)}{m.group(2)}-{m.group(3)}"
        return ""

    def norm_bike_1line(self, text: str) -> str:
        """Biển xe máy 1 dòng: 51-A1 123.45"""
        raw = self.alnum(text)
        if len(raw) < 8:
            return ""
        chars = list(raw)
        chars[0] = self.l2d(chars[0])
        chars[1] = self.l2d(chars[1])
        if len(chars) > 2 and chars[2].isdigit():
            chars[2] = self.d2l(chars[2])
        if len(chars) > 3:
            chars[3] = self.l2d(chars[3])
        for i in range(4, len(chars)):
            chars[i] = self.l2d(chars[i])
        raw = "".join(chars)

        m = re.fullmatch(r"(\d{2})([A-Z])(\d)(\d{5})", raw)
        if m and m.group(2) in ALLOWED_SERIES:
            t = m.group(4)
            return f"{m.group(1)}-{m.group(2)}{m.group(3)} {t[:3]}.{t[3:]}"
        m = re.fullmatch(r"(\d{2})([A-Z])(\d)(\d{4})", raw)
        if m and m.group(2) in ALLOWED_SERIES:
            return f"{m.group(1)}-{m.group(2)}{m.group(3)} {m.group(4)}"
        return ""

    def norm_car_top(self, text: str) -> str:
        """Dòng trên biển ô tô 2 dòng: 51A"""
        raw = self.alnum(text)
        for i in range(max(1, len(raw) - 2)):
            sub = raw[i:i+3]
            if len(sub) < 3:
                continue
            a, b = self.l2d(sub[0]), self.l2d(sub[1])
            c = self.d2l(sub[2]) if sub[2].isdigit() else sub[2]
            if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES:
                return f"{a}{b}{c}"
        return ""

    def norm_bike_top(self, text: str) -> str:
        """Dòng trên biển xe máy 2 dòng: 51-A1"""
        raw = self.alnum(text)
        for i in range(max(1, len(raw) - 3)):
            sub = raw[i:i+4]
            if len(sub) < 4:
                continue
            a, b = self.l2d(sub[0]), self.l2d(sub[1])
            c = self.d2l(sub[2]) if sub[2].isdigit() else sub[2]
            d = self.l2d(sub[3])
            if a.isdigit() and b.isdigit() and c in ALLOWED_SERIES and d.isdigit():
                return f"{a}{b}-{c}{d}"
        return ""

    def norm_bottom(self, text: str) -> str:
        """Dòng dưới (số): 123.45 hoặc 1234"""
        raw = self.clean(text)
        digits = re.sub(r"[^0-9]", "", "".join(self.l2d(c) for c in raw))
        if len(digits) < 4:
            return ""
        if len(digits) == 4:
            return digits
        if len(digits) >= 5:
            d5 = digits[-5:]
            return f"{d5[:3]}.{d5[3:]}"
        return ""

    @staticmethod
    def assemble_car_2line(top: str, bot: str) -> str:
        if re.fullmatch(r"\d{2}[A-Z]", top):
            if re.fullmatch(r"\d{3}\.\d{2}", bot) or re.fullmatch(r"\d{4}", bot):
                return f"{top}-{bot}"
        return ""

    @staticmethod
    def assemble_bike_2line(top: str, bot: str) -> str:
        if re.fullmatch(r"\d{2}-[A-Z]\d", top):
            if re.fullmatch(r"\d{3}\.\d{2}", bot) or re.fullmatch(r"\d{4}", bot):
                return f"{top} {bot}"
        return ""

    # ----------------------------------------------------------
    # SCORING
    # ----------------------------------------------------------
    def _conv_penalty(self, raw: str, norm: str) -> int:
        """Đếm số ký tự bị sửa giữa raw và normalized."""
        r, n = self.alnum(raw), self.alnum(norm)
        length = min(len(r), len(n))
        diff   = sum(1 for i in range(length) if r[i] != n[i])
        return diff + abs(len(r) - len(n))

    def score(self, cand: dict) -> float:
        text, typ, layout = cand["text"], cand["type"], cand["layout"]
        raw, conf        = cand.get("raw", ""), cand.get("conf", 0.0)

        s = 0.0
        # Format đầy đủ nhất → thưởng cao nhất
        if typ == "car" and re.fullmatch(r"\d{2}[A-Z]-\d{3}\.\d{2}", text):
            s += 7.0
        elif typ == "car" and re.fullmatch(r"\d{2}[A-Z]-\d{4}", text):
            s += 5.0
        elif typ == "motorbike" and re.fullmatch(r"\d{2}-[A-Z]\d \d{3}\.\d{2}", text):
            s += 7.0
        elif typ == "motorbike" and re.fullmatch(r"\d{2}-[A-Z]\d \d{4}", text):
            s += 5.5

        s += conf * 2.5                              # EasyOCR confidence
        s -= self._conv_penalty(raw, text) * 0.3    # Phạt nhiều chỉnh sửa
        if layout == 2:
            s += 0.5                                 # Thưởng nhẹ 2-dòng vì tách rõ hơn
        cand["score"] = s
        return s

    def best_candidate(self, candidates: list[dict]) -> dict | None:
        if not candidates:
            return None
        return max(candidates, key=self.score)

    # ----------------------------------------------------------
    # MAIN ENTRY
    # ----------------------------------------------------------
    def read_plate(self, plate_bgr: np.ndarray) -> dict:
        """
        Nhận crop biển số BGR → trả dict:
          {text, type, layout, conf, raw, score}
        """
        # --- Bước 1: Tiền xử lý cơ bản ---
        refined  = self.refine_roi(plate_bgr)
        deskewed = self.deskew(refined)
        gray     = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY)
        gray     = self._clahe(gray)
        gray     = cv2.medianBlur(gray, 3)

        # --- Bước 2: Upscale nếu biển nhỏ ---
        h = gray.shape[0]
        target_h = UPSCALE_TARGET_H if h < MIN_PLATE_H else max(UPSCALE_TARGET_H, h)
        gray_big = self._upscale(gray, target_h=target_h)

        candidates = []
        ocr_allowlist_full = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"
        ocr_allowlist_num  = "0123456789OQDGILSZB."

        # --- Bước 3: OCR 1 dòng ---
        for var in self.build_variants(gray_big):
            for txt, conf in self._ocr(var, ocr_allowlist_full):
                for fn, typ in [(self.norm_car_1line, "car"),
                                (self.norm_bike_1line, "motorbike")]:
                    norm = fn(txt)
                    if norm:
                        candidates.append({"text": norm, "type": typ, "layout": 1,
                                           "conf": conf, "raw": txt})

        # --- Bước 4: OCR 2 dòng ---
        top_gray, bot_gray = self.split_lines(gray_big)
        top_cands, bot_cands = [], []

        for var in self.build_variants(top_gray):
            for txt, conf in self._ocr(var, ocr_allowlist_full):
                ct = self.norm_car_top(txt)
                if ct:
                    top_cands.append((ct, "car", conf, txt))
                bt = self.norm_bike_top(txt)
                if bt:
                    top_cands.append((bt, "motorbike", conf, txt))

        for var in self.build_variants(bot_gray):
            for txt, conf in self._ocr(var, ocr_allowlist_num):
                nb = self.norm_bottom(txt)
                if nb:
                    bot_cands.append((nb, conf, txt))

        for top_txt, top_typ, top_conf, top_raw in top_cands:
            for bot_txt, bot_conf, bot_raw in bot_cands:
                fn = self.assemble_car_2line if top_typ == "car" \
                     else self.assemble_bike_2line
                plate = fn(top_txt, bot_txt)
                if plate:
                    candidates.append({
                        "text": plate, "type": top_typ, "layout": 2,
                        "conf": (top_conf + bot_conf) / 2.0,
                        "raw": top_raw + "|" + bot_raw
                    })

        best = self.best_candidate(candidates)
        if best is None:
            return {"text": "", "type": "unknown", "layout": 0,
                    "conf": 0.0, "raw": "", "score": 0.0}
        return best


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
        area <= H * W * 0.30  and
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


# ============================================================
# TRACKING - IoU + EMA box smoothing
# ============================================================
class Tracker:
    """
    Tracker đơn giản dùng IoU match + EMA box để giảm nhảy bbox.
    """
    def __init__(self):
        self._tracks: list[dict] = []
        self._next_id = 0

    def _new_track(self, det: dict, frame_idx: int) -> dict:
        tr = {
            "id":        self._next_id,
            "box":       det["box"],
            "smooth_box": list(det["box"]),  # EMA smoothed
            "det_conf":  det["det_conf"],
            "last_seen": frame_idx,
            "miss":      0,
        }
        self._next_id += 1
        return tr

    @staticmethod
    def _ema(old: list, new: tuple, alpha: float = TRACK_BOX_ALPHA) -> list:
        """EMA: smooth_box = alpha * old + (1 - alpha) * new"""
        return [int(alpha * o + (1 - alpha) * n) for o, n in zip(old, new)]

    def update(self, detections: list[dict], frame_idx: int) -> list[tuple]:
        """
        Khớp detection với track hiện tại.
        Trả về list (det, track) đã được gán / tạo mới.
        """
        matched: list[tuple] = []
        used_ids: set = set()

        for det in detections:
            best_tr, best_iou = None, 0.0
            for tr in self._tracks:
                ov = iou_xyxy(det["box"], tr["box"])
                if ov > best_iou:
                    best_iou, best_tr = ov, tr

            if best_tr is not None and best_iou >= TRACK_IOU_THR \
                    and best_tr["id"] not in used_ids:
                # Cập nhật track
                best_tr["smooth_box"] = self._ema(best_tr["smooth_box"], det["box"])
                best_tr["box"]        = det["box"]
                best_tr["det_conf"]   = det["det_conf"]
                best_tr["last_seen"]  = frame_idx
                best_tr["miss"]       = 0
                used_ids.add(best_tr["id"])
                matched.append((det, best_tr))
            else:
                # Track mới
                tr = self._new_track(det, frame_idx)
                self._tracks.append(tr)
                matched.append((det, tr))

        # Tăng miss cho track không được khớp
        for tr in self._tracks:
            if tr["id"] not in used_ids and \
                    any(det is tr for _, tr2 in matched for det in [tr2]) is False:
                # Chỉ tăng miss cho track KHÔNG có trong matched này
                pass
        matched_track_ids = {tr["id"] for _, tr in matched}
        for tr in self._tracks:
            if tr["id"] not in matched_track_ids:
                tr["miss"] += 1

        # Xóa track đã miss quá lâu
        self._tracks[:] = [tr for tr in self._tracks if tr["miss"] <= TRACK_MAX_MISS]
        return matched


# ============================================================
# PASS 1 - DETECT + OCR + LƯU RAW CSV
# ============================================================
def pass1_detect_ocr(model, ocr: PlateOCR) -> list[dict]:
    print("\n===== PASS 1: Detect + OCR từng frame + lưu CSV thô =====")
    cap = open_video(VIDEO_PATH)
    if cap is None:
        raise RuntimeError("Không mở được video!")

    fps   = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    tracker = Tracker()
    rows, frame_idx = [], 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        if FRAME_SKIP > 1 and frame_idx % FRAME_SKIP != 0:
            continue

        dets    = detect_plates(model, frame)
        matched = tracker.update(dets, frame_idx)

        for det, tr in matched:
            x1, y1, x2, y2 = det["box"]
            do_ocr = (frame_idx % OCR_EVERY_N == 0)

            ocr_text = ocr_type = ocr_raw = ""
            ocr_layout = 0
            ocr_conf = ocr_score = 0.0

            if do_ocr:
                crop = crop_plate(frame, det["box"])
                if crop.size > 0:
                    cand = ocr.read_plate(crop)
                    if cand["text"] and cand["score"] >= MIN_SCORE_ACCEPT:
                        ocr_text   = cand["text"]
                        ocr_type   = cand["type"]
                        ocr_layout = cand["layout"]
                        ocr_conf   = cand["conf"]
                        ocr_score  = cand["score"]
                        ocr_raw    = cand["raw"]

            rows.append({
                "frame_nmr":           frame_idx,
                "track_id":            tr["id"],
                "plate_bbox":          f"{x1},{y1},{x2},{y2}",
                "det_conf":            round(det["det_conf"], 6),
                "license_number":      ocr_text,
                "license_number_score": round(ocr_score, 6),
                "ocr_conf":            round(ocr_conf, 6),
                "vehicle_type":        ocr_type,
                "layout":              ocr_layout,
                "raw_ocr":             ocr_raw,
            })

        if frame_idx % 50 == 0:
            print(f"  [Pass1] Frame {frame_idx}/{total}")

    cap.release()

    fieldnames = ["frame_nmr","track_id","plate_bbox","det_conf",
                  "license_number","license_number_score","ocr_conf",
                  "vehicle_type","layout","raw_ocr"]
    with open(RAW_CSV_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print(f"  Đã lưu CSV thô: {RAW_CSV_PATH}  ({len(rows)} dòng)")
    return rows


# ============================================================
# PASS 2 - SMOOTHING + CHỌN BIỂN TỐT NHẤT + LƯU FILLED CSV
# ============================================================
def _best_plate_for_track(track_rows: list[dict]) -> tuple[str, float]:
    """
    Chọn biển tốt nhất cho một track_id:
    - Ưu tiên biển xuất hiện nhiều nhất (majority vote)
    - Tie-break bằng tổng score và best score
    """
    valid = [r for r in track_rows if str(r.get("license_number","")).strip()]
    if not valid:
        return "", 0.0

    agg: dict[str, dict] = {}
    for r in valid:
        text  = r["license_number"]
        score = float(r.get("license_number_score", 0.0) or 0.0)
        if text not in agg:
            agg[text] = {"count": 0, "score_sum": 0.0, "best": 0.0}
        agg[text]["count"]     += 1
        agg[text]["score_sum"] += score
        agg[text]["best"]       = max(agg[text]["best"], score)

    best_text, data = max(
        agg.items(),
        key=lambda kv: (kv[1]["count"], kv[1]["score_sum"], kv[1]["best"])
    )
    return best_text, data["best"]


def _interpolate_boxes(track_rows: list[dict]) -> list[dict]:
    """Nội suy tuyến tính bbox cho các frame bị miss trong cùng track."""
    rows  = sorted(track_rows, key=lambda r: int(r["frame_nmr"]))
    boxes = [parse_box(r.get("plate_bbox","")) for r in rows]

    for i in range(len(rows)):
        if boxes[i] is not None:
            continue
        prev_i = next((j for j in range(i-1,-1,-1) if boxes[j]), None)
        next_i = next((j for j in range(i+1,len(rows)) if boxes[j]), None)
        if prev_i is not None and next_i is not None:
            f0, f1, f = (int(rows[x]["frame_nmr"]) for x in (prev_i, next_i, i))
            alpha = (f - f0) / max(1, f1 - f0)
            b0, b1 = boxes[prev_i], boxes[next_i]
            interp = tuple(int(b0[k] + alpha*(b1[k]-b0[k])) for k in range(4))
            rows[i]["plate_bbox"] = ",".join(map(str, interp))
    return rows


def pass2_smooth(rows: list[dict]) -> tuple[list[dict], dict]:
    print("\n===== PASS 2: Smoothing + chọn biển tốt nhất theo track =====")
    by_track: dict[int, list] = defaultdict(list)
    for r in rows:
        by_track[int(r["track_id"])].append(dict(r))

    filled, best_by_track = [], {}

    for tid, trows in by_track.items():
        best_text, best_score = _best_plate_for_track(trows)
        best_by_track[tid]    = {"text": best_text, "score": best_score}

        for r in _interpolate_boxes(trows):
            r["best_license_number"] = best_text
            r["best_license_score"]  = round(best_score, 6)
            filled.append(r)

    filled.sort(key=lambda r: (int(r["frame_nmr"]), int(r["track_id"])))

    fieldnames = ["frame_nmr","track_id","plate_bbox","det_conf",
                  "license_number","license_number_score","ocr_conf",
                  "vehicle_type","layout","raw_ocr",
                  "best_license_number","best_license_score"]
    with open(FILLED_CSV_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in filled:
            w.writerow({k: r.get(k,"") for k in fieldnames})

    print(f"  Đã lưu CSV sau smoothing: {FILLED_CSV_PATH}")
    print("  Biển tốt nhất theo xe:")
    for tid, info in best_by_track.items():
        print(f"    Track {tid}: '{info['text']}' | score={info['score']:.3f}")
    return filled, best_by_track


# ============================================================
# PASS 3 - VẼ BBOX + XUẤT VIDEO OUTPUT
# ============================================================
def pass3_visualize(filled: list[dict]) -> str:
    print("\n===== PASS 3: Vẽ bbox + xuất video demo =====")
    cap = open_video(VIDEO_PATH)
    if cap is None:
        raise RuntimeError("Không mở được video để visualize!")

    fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    delay  = max(1, int(1000 / fps))

    # Chuẩn bị dict frame → list row
    by_frame: dict[int, list] = defaultdict(list)
    for r in filled:
        if str(r.get("best_license_number","")).strip() and \
                parse_box(r.get("plate_bbox","")) is not None:
            by_frame[int(r["frame_nmr"])].append(r)

    # Tạo VideoWriter
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out    = cv2.VideoWriter(OUTPUT_VIDEO_PATH, fourcc, fps, (width, height))
    out_path = OUTPUT_VIDEO_PATH
    if not out.isOpened():
        fallback = os.path.splitext(OUTPUT_VIDEO_PATH)[0] + ".avi"
        print(f"  MP4 writer thất bại, dùng AVI: {fallback}")
        out = cv2.VideoWriter(fallback, cv2.VideoWriter_fourcc(*"XVID"),
                              fps, (width, height))
        if not out.isOpened():
            raise RuntimeError("Không tạo được VideoWriter!")
        out_path = fallback

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        for r in by_frame.get(frame_idx, []):
            text  = str(r.get("best_license_number","")).strip()
            box   = parse_box(r.get("plate_bbox",""))
            score = float(r.get("best_license_score", 0.0) or 0.0)
            if not text or box is None:
                continue
            x1, y1, x2, y2 = box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 0), 2)
            draw_label(frame, x1, y1, text, score)

        out.write(frame)

        if SHOW_WINDOW:
            cv2.imshow("LPR - Nhan dien bien so xe", frame)
            if cv2.waitKey(delay) & 0xFF in (27, ord("q")):
                break

    cap.release()
    out.release()
    cv2.destroyAllWindows()
    print(f"  Đã xuất video: {out_path}")
    return out_path


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
    print(f"  CSV thô    : {RAW_CSV_PATH}")
    print(f"  CSV đã làm mượt: {FILLED_CSV_PATH}")
    print(f"  Video output   : {output_video}")
    print("=" * 60)


if __name__ == "__main__":
    main()