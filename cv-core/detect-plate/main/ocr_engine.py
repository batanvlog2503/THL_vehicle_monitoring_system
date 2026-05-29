import re
import cv2
import torch
import easyocr
import numpy as np

from config import (
    UPSCALE_TARGET_H, MIN_PLATE_H, ALLOWED_SERIES
)


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
