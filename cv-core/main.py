import cv2
import json
import uuid
import os
import re
import shutil
import subprocess
import threading
import warnings
import numpy as np
import torch
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from ultralytics import YOLO
import easyocr

warnings.filterwarnings("ignore", category=RuntimeWarning)


# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
VEHICLE_MODEL_PATH  = r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt"
PLATE_MODEL_PATH    = r"D:\THL_vehicle_monitoring_system\runs\plate_only_train\weights\best.pt"
TRACKER_CONFIG      = r"D:\cv-core\botsort.yaml"

UPLOAD_DIR  = "uploads"
OUTPUT_DIR  = "outputs"

OCR_EVERY_N         = 5   # OCR biển mỗi N frame
SPEED_LIMIT_DEFAULT = 60

# OCR config (LPR v2)
MIN_SCORE_ACCEPT = 4.5
CROP_PAD_RATIO_X = 0.15
CROP_PAD_RATIO_Y = 0.20
MIN_PLATE_H       = 40
UPSCALE_TARGET_H  = 400
ALLOWED_SERIES    = set("ABCDEFGHKLMNPRSTUVXYZ")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────
# INIT MODELS
# ─────────────────────────────────────────────────────────────
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[Init] Device: {device}")

vehicle_model = YOLO(VEHICLE_MODEL_PATH).to(device)
vehicle_model.fuse()

plate_model = YOLO(PLATE_MODEL_PATH).to(device)
plate_model.fuse()

print("[Init] Đang khởi tạo EasyOCR...")
ocr_reader = easyocr.Reader(["en"], gpu=(device == "cuda"))
print("[Init] EasyOCR sẵn sàng.")

ocr_executor = ThreadPoolExecutor(max_workers=3)

# Job store
jobs: dict = {}


# ─────────────────────────────────────────────────────────────
# KALMAN SPEED FILTER
# ─────────────────────────────────────────────────────────────
class KalmanSpeed:
    def __init__(self):
        self.kf = cv2.KalmanFilter(2, 1)
        self.kf.measurementMatrix   = np.array([[1, 0]], np.float32)
        self.kf.transitionMatrix    = np.array([[1, 1], [0, 1]], np.float32)
        self.kf.processNoiseCov     = np.eye(2, dtype=np.float32) * 0.05
        self.kf.measurementNoiseCov = np.array([[4]], np.float32)
        self.kf.errorCovPost        = np.eye(2, dtype=np.float32)
        self.ready = False

    def update(self, raw: float) -> float:
        if not self.ready:
            self.kf.statePost = np.array([[raw], [0]], np.float32)
            self.ready = True
        self.kf.predict()
        out = self.kf.correct(np.array([[raw]], np.float32))
        return max(0.0, float(out.squeeze()[0]))


# ─────────────────────────────────────────────────────────────
# HOMOGRAPHY
# ─────────────────────────────────────────────────────────────
SRC_PTS = np.float32([[180, 200], [460, 200], [580, 500], [60, 500]])
DST_PTS = np.float32([[0, 0],    [10, 0],    [10, 15],   [0, 15]])
H_MAT, _ = cv2.findHomography(SRC_PTS, DST_PTS)

def pixel_to_world(px: int, py: int):
    pt  = np.array([[[float(px), float(py)]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, H_MAT)
    return float(out[0][0][0]), float(out[0][0][1])

def format_time(ms: float) -> str:
    s = int(ms / 1000)
    return f"{s // 3600:02}:{(s % 3600) // 60:02}:{s % 60:02}"


# ─────────────────────────────────────────────────────────────
# PLATE OCR  (LPR v2 - đầy đủ)
# ─────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────
# PLATE OCR  (LPR v2 - giống hệt code trên)
# ─────────────────────────────────────────────────────────────
class PlateOCR:
    """
    Nhận dạng biển số xe Việt Nam với tiền xử lý đa tầng và multi-variant OCR.
    Hỗ trợ: ô tô 1/2 dòng, xe máy 1/2 dòng, biển nhỏ/xa/mờ/nghiêng.
    Dùng EasyOCR beamsearch để tối đa độ chính xác.
    """

    def __init__(self, reader: easyocr.Reader):
        self.reader = reader

    # ── Helpers ──────────────────────────────────────────────
    @staticmethod
    def clean(text: str) -> str:
        return re.sub(r"[^A-Z0-9.\-]", "", text.upper().replace(" ", ""))

    @staticmethod
    def alnum(text: str) -> str:
        return re.sub(r"[^A-Z0-9]", "", text.upper())

    @staticmethod
    def l2d(ch: str) -> str:
        return {
            "O": "0", "Q": "0", "D": "0",
            "I": "1", "L": "1", "T": "1",
            "Z": "2", "S": "5", "B": "8",
            "G": "6", "J": "1", "U": "0"
        }.get(ch, ch)

    @staticmethod
    def d2l(ch: str) -> str:
        return {
            "0": "D",
            "2": "Z",
            "5": "S",
            "8": "B",
            "6": "G",
            "1": "I",
            "4": "A"
        }.get(ch, ch)

    @staticmethod
    def _fix_chars(raw: str,
                   digit_positions: set,
                   letter_positions: set) -> str:
        chars = list(raw)

        for i, ch in enumerate(chars):
            if i in digit_positions:
                chars[i] = PlateOCR.l2d(ch)
            elif i in letter_positions:
                if ch.isdigit():
                    chars[i] = PlateOCR.d2l(ch)

        return "".join(chars)

    # ── Image preprocessing ───────────────────────────────────
    @staticmethod
    def _upscale(img: np.ndarray,
                 target_h: int = UPSCALE_TARGET_H) -> np.ndarray:
        h, w = img.shape[:2]

        if h == 0 or w == 0:
            return img

        scale = target_h / h
        new_w = max(1, int(w * scale))

        return cv2.resize(
            img,
            (new_w, target_h),
            interpolation=cv2.INTER_LANCZOS4
        )

    @staticmethod
    def _clahe(gray: np.ndarray,
               clip: float = 3.0) -> np.ndarray:
        c = cv2.createCLAHE(
            clipLimit=clip,
            tileGridSize=(8, 8)
        )
        return c.apply(gray)

    @staticmethod
    def _bilateral(gray: np.ndarray) -> np.ndarray:
        return cv2.bilateralFilter(
            gray,
            d=9,
            sigmaColor=75,
            sigmaSpace=75
        )

    @staticmethod
    def _sharpen(gray: np.ndarray,
                 strength: float = 1.5) -> np.ndarray:
        blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=2)

        return cv2.addWeighted(
            gray,
            1 + strength,
            blur,
            -strength,
            0
        )

    @staticmethod
    def _otsu(gray: np.ndarray,
              invert: bool = False) -> np.ndarray:
        flag = cv2.THRESH_BINARY_INV if invert \
            else cv2.THRESH_BINARY

        _, th = cv2.threshold(
            gray,
            0,
            255,
            flag | cv2.THRESH_OTSU
        )

        return th

    @staticmethod
    def _adaptive(gray: np.ndarray,
                  block: int = 31,
                  c: int = 8) -> np.ndarray:
        return cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            block,
            c
        )

    @staticmethod
    def _morph_close(img: np.ndarray,
                     ksize: int = 2) -> np.ndarray:
        k = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (ksize, ksize)
        )

        return cv2.morphologyEx(
            img,
            cv2.MORPH_CLOSE,
            k,
            iterations=1
        )

    @staticmethod
    def _morph_dilate(img: np.ndarray,
                      ksize: int = 2) -> np.ndarray:
        k = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (ksize, ksize)
        )

        return cv2.dilate(img, k, iterations=1)

    # ── Deskew ───────────────────────────────────────────────
    def deskew(self, plate_bgr: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(
            plate_bgr,
            cv2.COLOR_BGR2GRAY
        )

        blur = cv2.GaussianBlur(gray, (5, 5), 0)

        edges = cv2.Canny(
            blur,
            50,
            150,
            apertureSize=3
        )

        angle = 0.0

        lines = cv2.HoughLines(
            edges,
            1,
            np.pi / 180,
            threshold=40
        )

        if lines is not None:
            angles = []

            for rho, theta in lines[:, 0]:
                a = np.degrees(theta) - 90

                if -20 < a < 20:
                    angles.append(a)

            if angles:
                angle = float(np.median(angles))

        # fallback minAreaRect
        if abs(angle) < 0.5:
            th = self._otsu(gray, invert=True)

            coords = np.column_stack(
                np.where(th > 0)
            )

            if len(coords) >= 20:
                rect = cv2.minAreaRect(
                    coords[:, ::-1].astype(np.float32)
                )

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

        M = cv2.getRotationMatrix2D(
            (w // 2, h // 2),
            angle,
            1.0
        )

        return cv2.warpAffine(
            plate_bgr,
            M,
            (w, h),
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_REPLICATE
        )

    # ── Refine ROI ───────────────────────────────────────────
    def refine_roi(self,
                   plate_bgr: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(
            plate_bgr,
            cv2.COLOR_BGR2GRAY
        )

        h, w = gray.shape[:2]

        x1, x2 = int(w * 0.01), int(w * 0.99)
        y1, y2 = int(h * 0.02), int(h * 0.98)

        gray = gray[y1:y2, x1:x2]

        if gray.size == 0:
            return plate_bgr

        clahe = self._clahe(gray)

        blur = cv2.GaussianBlur(
            clahe,
            (3, 3),
            0
        )

        th = self._otsu(blur)

        k = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (2, 2)
        )

        th = cv2.morphologyEx(
            th,
            cv2.MORPH_CLOSE,
            k
        )

        cnts, _ = cv2.findContours(
            th,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        hh, ww = gray.shape[:2]

        best = None
        best_s = -1e18

        for cnt in cnts:
            bx, by, bw, bh = cv2.boundingRect(cnt)

            if bw <= 0 or bh <= 0:
                continue

            area = bw * bh
            ratio = bw / float(bh + 1e-6)

            if area < ww * hh * 0.06:
                continue

            if ratio < 0.4 or ratio > 8.0:
                continue

            cx = bx + bw / 2
            cy = by + bh / 2

            pen = abs(cx - ww / 2) / ww + \
                  abs(cy - hh / 2) / hh

            s = area - 12000 * pen

            if s > best_s:
                best_s = s
                best = (bx, by, bw, bh)

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
                return cv2.cvtColor(
                    roi,
                    cv2.COLOR_GRAY2BGR
                )

        return cv2.cvtColor(
            gray,
            cv2.COLOR_GRAY2BGR
        )

    # ── Build variants ────────────────────────────────────────
    def build_variants(self,
                       gray: np.ndarray) -> list:

        clahe = self._clahe(gray, clip=2.5)

        bilat = self._bilateral(clahe)

        sharp1 = self._sharpen(
            clahe,
            strength=1.2
        )

        sharp2 = self._sharpen(
            bilat,
            strength=1.8
        )

        otsu1 = self._otsu(bilat)

        otsu2 = self._otsu(
            bilat,
            invert=True
        )

        adap1 = self._adaptive(
            clahe,
            block=31,
            c=8
        )

        adap2 = self._adaptive(
            bilat,
            block=21,
            c=6
        )

        mclose = self._morph_close(
            otsu1,
            ksize=2
        )

        # return [
        #     clahe,
        #     bilat,
        #     sharp1,
        #     sharp2,
        #     otsu1,
        #     otsu2,
        #     adap1,
        #     adap2,
        #     mclose
        # ]
        # return [
        #     clahe,
        #     sharp1,
        #     otsu1,
        #     adap1
        # ]

        return [clahe, bilat, sharp1, sharp2, otsu1, otsu2, adap1, adap2, mclose]
    # ── Split 2 lines ────────────────────────────────────────
    def split_lines(self, gray: np.ndarray):
        h, w = gray.shape[:2]

        inv = self._otsu(gray, invert=True)

        hist = np.sum(inv > 0, axis=1).astype(np.float32)

        k = max(3, int(h * 0.05))

        if k % 2 == 0:
            k += 1

        hist = cv2.GaussianBlur(
            hist.reshape(-1, 1),
            (1, k),
            0
        ).reshape(-1)

        ys = int(h * 0.25)
        ye = int(h * 0.75)

        if ye <= ys:
            mid = h // 2
            return gray[:mid], gray[mid:]

        split = ys + int(np.argmin(hist[ys:ye]))

        split = max(
            int(h * 0.33),
            min(split, int(h * 0.67))
        )

        top = gray[:split]
        bot = gray[split:]

        if top.size == 0 or bot.size == 0:
            mid = h // 2
            return gray[:mid], gray[mid:]

        return top, bot

    # ── OCR ──────────────────────────────────────────────────
    def _ocr(self,
             img: np.ndarray,
             allowlist: str) -> list:

        results = self.reader.readtext(
            img,
            detail=1,
            paragraph=False,
            decoder="beamsearch",
            allowlist=allowlist
        )

        out = []

        for item in results:
            txt = self.clean(item[1])
            conf = float(item[2])

            if txt:
                out.append((txt, conf))

        return out

    # ── Normalize ────────────────────────────────────────────
    def norm_car_1line(self, text: str) -> str:
        raw = self.alnum(text)

        if len(raw) < 7:
            return ""

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

        m = re.fullmatch(
            r"(\d{2})([A-Z])(\d)(\d{5})",
            raw
        )

        if m and m.group(2) in ALLOWED_SERIES:
            t = m.group(4)
            return f"{m.group(1)}-{m.group(2)}{m.group(3)} {t[:3]}.{t[3:]}"

        m = re.fullmatch(
            r"(\d{2})([A-Z])(\d)(\d{4})",
            raw
        )

        if m and m.group(2) in ALLOWED_SERIES:
            return f"{m.group(1)}-{m.group(2)}{m.group(3)} {m.group(4)}"

        return ""

    def norm_car_top(self, text: str) -> str:
        raw = self.alnum(text)

        for i in range(max(1, len(raw) - 2)):
            sub = raw[i:i + 3]

            if len(sub) < 3:
                continue

            a = self.l2d(sub[0])
            b = self.l2d(sub[1])

            c = self.d2l(sub[2]) \
                if sub[2].isdigit() else sub[2]

            if a.isdigit() and \
               b.isdigit() and \
               c in ALLOWED_SERIES:
                return f"{a}{b}{c}"

        return ""

    def norm_bike_top(self, text: str) -> str:
        raw = self.alnum(text)

        for i in range(max(1, len(raw) - 3)):
            sub = raw[i:i + 4]

            if len(sub) < 4:
                continue

            a = self.l2d(sub[0])
            b = self.l2d(sub[1])

            c = self.d2l(sub[2]) \
                if sub[2].isdigit() else sub[2]

            d = self.l2d(sub[3])

            if a.isdigit() and \
               b.isdigit() and \
               c in ALLOWED_SERIES and \
               d.isdigit():
                return f"{a}{b}-{c}{d}"

        return ""

    def norm_bottom(self, text: str) -> str:
        raw = self.clean(text)

        digits = re.sub(
            r"[^0-9]",
            "",
            "".join(self.l2d(c) for c in raw)
        )

        if len(digits) < 4:
            return ""

        if len(digits) == 4:
            return digits

        if len(digits) >= 5:
            d5 = digits[-5:]
            return f"{d5[:3]}.{d5[3:]}"

        return ""

    @staticmethod
    def assemble_car_2line(top: str,
                           bot: str) -> str:

        if re.fullmatch(r"\d{2}[A-Z]", top):
            if re.fullmatch(r"\d{3}\.\d{2}", bot) or \
               re.fullmatch(r"\d{4}", bot):
                return f"{top}-{bot}"

        return ""

    @staticmethod
    def assemble_bike_2line(top: str,
                            bot: str) -> str:

        if re.fullmatch(r"\d{2}-[A-Z]\d", top):
            if re.fullmatch(r"\d{3}\.\d{2}", bot) or \
               re.fullmatch(r"\d{4}", bot):
                return f"{top} {bot}"

        return ""

    # ── Scoring ──────────────────────────────────────────────
    def _conv_penalty(self,
                      raw: str,
                      norm: str) -> int:

        r = self.alnum(raw)
        n = self.alnum(norm)

        length = min(len(r), len(n))

        diff = sum(
            1 for i in range(length)
            if r[i] != n[i]
        )

        return diff + abs(len(r) - len(n))

    def score(self, cand: dict) -> float:
        text = cand["text"]
        typ = cand["type"]
        layout = cand["layout"]

        raw = cand.get("raw", "")
        conf = cand.get("conf", 0.0)

        s = 0.0

        if typ == "car" and re.fullmatch(
            r"\d{2}[A-Z]-\d{3}\.\d{2}",
            text
        ):
            s += 7.0

        elif typ == "car" and re.fullmatch(
            r"\d{2}[A-Z]-\d{4}",
            text
        ):
            s += 5.0

        elif typ == "motorbike" and re.fullmatch(
            r"\d{2}-[A-Z]\d \d{3}\.\d{2}",
            text
        ):
            s += 7.0

        elif typ == "motorbike" and re.fullmatch(
            r"\d{2}-[A-Z]\d \d{4}",
            text
        ):
            s += 5.5

        s += conf * 2.5

        s -= self._conv_penalty(raw, text) * 0.3

        if layout == 2:
            s += 0.5

        cand["score"] = s

        return s

    def best_candidate(self,
                       candidates: list) -> dict | None:

        if not candidates:
            return None

        return max(candidates, key=self.score)

    # ── MAIN ─────────────────────────────────────────────────
    def read_plate(self,
                   plate_bgr: np.ndarray) -> dict:

        refined = self.refine_roi(plate_bgr)

        deskewed = self.deskew(refined)

        gray = cv2.cvtColor(
            deskewed,
            cv2.COLOR_BGR2GRAY
        )

        gray = self._clahe(gray)

        gray = cv2.medianBlur(gray, 3)

        h = gray.shape[0]

        target_h = UPSCALE_TARGET_H \
            if h < MIN_PLATE_H \
            else max(UPSCALE_TARGET_H, h)

        gray_big = self._upscale(
            gray,
            target_h=target_h
        )

        candidates = []

        allowlist_full = \
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"

        allowlist_num = \
            "0123456789OQDGILSZB."

        # ── 1 LINE ─────────────────────────────────────
        for var in self.build_variants(gray_big):

            for txt, conf in self._ocr(
                var,
                allowlist_full
            ):

                for fn, typ in [
                    (self.norm_car_1line, "car"),
                    (self.norm_bike_1line, "motorbike")
                ]:

                    norm = fn(txt)

                    if norm:
                        candidates.append({
                            "text": norm,
                            "type": typ,
                            "layout": 1,
                            "conf": conf,
                            "raw": txt
                        })

        # ── 2 LINE ─────────────────────────────────────
        top_gray, bot_gray = self.split_lines(gray_big)

        top_cands = []
        bot_cands = []

        for var in self.build_variants(top_gray):

            for txt, conf in self._ocr(
                var,
                allowlist_full
            ):

                ct = self.norm_car_top(txt)

                if ct:
                    top_cands.append(
                        (ct, "car", conf, txt)
                    )

                bt = self.norm_bike_top(txt)

                if bt:
                    top_cands.append(
                        (bt, "motorbike", conf, txt)
                    )

        for var in self.build_variants(bot_gray):

            for txt, conf in self._ocr(
                var,
                allowlist_num
            ):

                nb = self.norm_bottom(txt)

                if nb:
                    bot_cands.append(
                        (nb, conf, txt)
                    )

        for top_txt, top_typ, top_conf, top_raw in top_cands:

            for bot_txt, bot_conf, bot_raw in bot_cands:

                fn = self.assemble_car_2line \
                    if top_typ == "car" \
                    else self.assemble_bike_2line

                plate = fn(top_txt, bot_txt)

                if plate:
                    candidates.append({
                        "text": plate,
                        "type": top_typ,
                        "layout": 2,
                        "conf": (top_conf + bot_conf) / 2.0,
                        "raw": top_raw + "|" + bot_raw
                    })

        best = self.best_candidate(candidates)

        if best is None:
            return {
                "text": "",
                "type": "unknown",
                "layout": 0,
                "conf": 0.0,
                "raw": "",
                "score": 0.0
            }

        return best

# Khởi tạo PlateOCR dùng reader đã load sẵn
plate_ocr = PlateOCR(reader=ocr_reader)

def iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interW = max(0, xB - xA)
    interH = max(0, yB - yA)

    inter = interW * interH

    if inter <= 0:
        return 0.0

    areaA = (boxA[2]-boxA[0]) * (boxA[3]-boxA[1])
    areaB = (boxB[2]-boxB[0]) * (boxB[3]-boxB[1])

    union = areaA + areaB - inter

    return inter / (union + 1e-6)
# ─────────────────────────────────────────────────────────────
# PLATE CACHE - Majority vote (LPR v2 style)
# ─────────────────────────────────────────────────────────────
class PlateCache:
    """
    Lưu lịch sử OCR theo track_id, chọn biển bằng majority vote + score.
    Tương đương _best_plate_for_track() trong LPR v2.
    """
    def __init__(self):
        self._history: dict[int, list[dict]] = defaultdict(list)

    def add(self, tid: int, text: str, score: float, conf: float):
        self._history[tid].append({"text": text, "score": score, "conf": conf})

    # PlateCache.best() — thay logic max hiện tại
    def best(self, tid: int) -> dict | None:
        entries = [e for e in self._history.get(tid, []) if e["text"]]
        if not entries:
            return None

        agg: dict[str, dict] = {}
        for e in entries:
            t = e["text"]
            if t not in agg:
                agg[t] = {"count": 0, "score_sum": 0.0, "best_score": 0.0, "best_conf": 0.0}
            agg[t]["count"] += 1
            agg[t]["score_sum"] += e["score"]
            agg[t]["best_score"] = max(agg[t]["best_score"], e["score"])
            agg[t]["best_conf"] = max(agg[t]["best_conf"], e["conf"])

        # ── Tăng weight score, giảm weight count ──────────────────
        best_text, data = max(
            agg.items(),
            key=lambda kv: (
                    kv[1]["score_sum"] * 2.0  # ← score_sum quan trọng hơn
                    + kv[1]["count"] * 0.5  # ← count chỉ là tiebreaker
                    + kv[1]["best_score"]  # ← bonus nếu có lần nào rất chắc
            )
        )
        return {"text": best_text, "score": data["best_score"], "conf": data["best_conf"]}

    def clear(self, tid: int):
        self._history.pop(tid, None)


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────
def reencode_h264(input_path: str, output_path: str) -> bool:
    try:
        FFMPEG_PATH = r"C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
        subprocess.run(
            [FFMPEG_PATH, "-y", "-i", input_path,
             "-vcodec", "libx264", "-crf", "23",
             "-preset", "fast", "-movflags", "+faststart",
             output_path],
            check=True, capture_output=True
        )
        os.remove(input_path)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        os.replace(input_path, output_path)
        return False


def crop_plate(frame: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> np.ndarray:
    H, W = frame.shape[:2]
    w, h = x2 - x1, y2 - y1
    px   = int(w * CROP_PAD_RATIO_X)
    py   = int(h * CROP_PAD_RATIO_Y)
    return frame[
        max(0, y1 - py): min(H, y2 + py),
        max(0, x1 - px): min(W, x2 + px)
    ]


# ─────────────────────────────────────────────────────────────
# PROCESS VIDEO
# ─────────────────────────────────────────────────────────────
def process_video(job_id: str, input_path: str, speed_limit: int):
    try:
        jobs[job_id]["status"] = "processing"

        cap    = cv2.VideoCapture(input_path)
        fps    = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

        raw_out_path   = os.path.join(OUTPUT_DIR, f"{job_id}_raw.mp4")
        final_out_path = os.path.join(OUTPUT_DIR, f"{job_id}.mp4")

        out = cv2.VideoWriter(
            raw_out_path,
            # cv2.VideoWriter_fourcc(*"H264ư"),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps, (width, height)
        )

        prev_world:  dict[int, tuple]       = {}
        kalman_map:  dict[int, KalmanSpeed] = defaultdict(KalmanSpeed)
        speed_hist:  dict[int, list]        = defaultdict(list)
        plate_cache  = PlateCache()          # ← dùng PlateCache mới (majority vote)

        detections_all: list[dict] = []
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1

            # ── VEHICLE TRACKING ─────────────────────────────
            results = vehicle_model.track(
                frame, persist=True, conf=0.35,
                tracker=TRACKER_CONFIG, device=device, verbose=False
            )
            r = results[0]
            frame_out = frame.copy()

            vehicle_boxes: dict[int, tuple] = {}
            frame_detections: list[dict]    = []

            if r.boxes.id is not None:
                ids    = r.boxes.id.cpu().numpy().astype(int)
                bboxes = r.boxes.xyxy.cpu().numpy()
                clss   = r.boxes.cls.cpu().numpy().astype(int)
                confs  = r.boxes.conf.cpu().numpy()

                for tid, bbox, cls, conf in zip(ids, bboxes, clss, confs):
                    x1, y1, x2, y2 = map(int, bbox)
                    vehicle_boxes[int(tid)] = (x1, y1, x2, y2)

                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    wx, wy = pixel_to_world(cx, cy)

                    # ── TỐC ĐỘ ───────────────────────────────
                    speed = None
                    if tid in prev_world:
                        pwx, pwy, pf = prev_world[tid]
                        df = frame_idx - pf
                        if df >= 3:
                            dist = ((wx - pwx) ** 2 + (wy - pwy) ** 2) ** 0.5
                            if dist > 0.01:
                                raw_spd = (dist / (df / fps)) * 3.6
                                if 0 < raw_spd < 200:
                                    f_spd = kalman_map[tid].update(raw_spd)
                                    speed_hist[tid].append(f_spd)
                                    if len(speed_hist[tid]) > 10:
                                        speed_hist[tid].pop(0)
                            prev_world[tid] = (wx, wy, frame_idx)
                    else:
                        prev_world[tid] = (wx, wy, frame_idx)

                    if speed_hist[tid]:
                        speed = round(sum(speed_hist[tid]) / len(speed_hist[tid]), 1)

                    # ── PLATE TỪ CACHE (majority vote) ───────
                    best_plate = plate_cache.best(int(tid))
                    plate_text = best_plate["text"] if best_plate else None

                    # ── VẼ OVERLAY ────────────────────────────
                    is_violation = speed is not None and speed > speed_limit
                    color = (0, 0, 255) if is_violation else (0, 220, 0)

                    label_name = vehicle_model.names[int(cls)]
                    cv2.rectangle(frame_out, (x1, y1), (x2, y2), color, 2)
                    # cv2.putText(frame_out, f"ID:{tid}", (x1, max(y1 - 25, 15)),
                    #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                    # LABEL + ID
                    cv2.putText(
                        frame_out,
                        f"{label_name}|ID:{tid}",
                        (x1, max(y1 - 25, 15)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        color,
                        2
                    )
                    if speed is not None:
                        spd_txt = f"{speed} km/h {'!' if is_violation else ''}"
                        cv2.putText(frame_out, spd_txt,
                                    (x1, min(y2 + 22, height - 5)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
                    if plate_text:
                        font_p = cv2.FONT_HERSHEY_SIMPLEX
                        scale_p = 0.9
                        thick_p = 2
                        pad_p = 5

                        (pw, ph), _ = cv2.getTextSize(plate_text, font_p, scale_p, thick_p)

                        # Góc trên bên phải bbox MIN_SCORE_ACCEPT  = 4.5xe
                        px_tl = x2 - pw - pad_p * 2
                        py_tl = y1 - ph - pad_p * 2 - 4

                        # Clamp không ra ngoài frame
                        px_tl = max(0, px_tl)
                        py_tl = max(0, py_tl)

                        # Nền vàng
                        cv2.rectangle(frame_out,
                                      (px_tl, py_tl),
                                      (px_tl + pw + pad_p * 2, py_tl + ph + pad_p * 2),
                                      (0, 220, 255), -1)
                        # Chữ đen
                        cv2.putText(frame_out, plate_text,
                                    (px_tl + pad_p, py_tl + ph + pad_p),
                                    font_p, scale_p, (0, 0, 0), thick_p)

                    frame_detections.append({
                        "frame":  frame_idx,
                        "time":   format_time(cap.get(cv2.CAP_PROP_POS_MSEC)),
                        "id":     int(tid),
                        "label":  vehicle_model.names[int(cls)],
                        "conf":   round(float(conf), 3),
                        "speed":  speed,
                        "plate":  plate_text,
                        "status": "violation" if is_violation else "normal",
                        "bbox":   [x1, y1, x2, y2],
                    })

            # ── PLATE DETECTION + OCR (mỗi OCR_EVERY_N frame) ──
            # if frame_idx % OCR_EVERY_N == 0 and vehicle_boxes:
            #
            #
            #
            #     plate_results = plate_model.predict(
            #         frame, conf=0.3, device=device, verbose=False,imgsz=1280
            #     )
            #     pr = plate_results[0]
            #     if pr.boxes is not None and len(pr.boxes) > 0:
            #         for pbox in pr.boxes.xyxy.cpu().numpy():
            #             px1, py1, px2, py2 = map(int, pbox)
            #             pcx = (px1 + px2) // 2
            #             pcy = (py1 + py2) // 2
            #
            #             # Tìm xe chứa biển
            #             best_tid, best_dist = None, float("inf")
            #             for tid, (vx1, vy1, vx2, vy2) in vehicle_boxes.items():
            #                 if vx1 <= pcx <= vx2 and vy1 <= pcy <= vy2:
            #                     cx = (vx1 + vx2) // 2
            #                     cy = (vy1 + vy2) // 2
            #                     d  = ((pcx - cx) ** 2 + (pcy - cy) ** 2) ** 0.5
            #                     if d < best_dist:
            #                         best_dist, best_tid = d, tid
            #
            #             if best_tid is not None:
            #                 crop = crop_plate(frame, px1, py1, px2, py2)
            #                 if crop.size > 0:
            #                     result = plate_ocr.read_plate(crop)
            #                     text   = result.get("text", "")
            #                     conf   = result.get("conf", 0.0)
            #                     score  = result.get("score", 0.0)
            #                     if text and score >= MIN_SCORE_ACCEPT:
            #                         # Thêm vào history → majority vote tự xử lý
            #                         plate_cache.add(int(best_tid), text, score, conf)
            if frame_idx % OCR_EVERY_N == 0 and vehicle_boxes:

                plate_results = plate_model.predict(
                    frame,
                    conf=0.15,
                    device=device,
                    verbose=False,
                    imgsz=1280
                )

                pr = plate_results[0]

                if pr.boxes is not None and len(pr.boxes) > 0:

                    for pbox in pr.boxes.xyxy.cpu().numpy():

                        px1, py1, px2, py2 = map(int, pbox)

                        pcx = (px1 + px2) // 2
                        pcy = (py1 + py2) // 2

                        best_tid = None
                        best_dist = float("inf")

                        for tid, (vx1, vy1, vx2, vy2) in vehicle_boxes.items():

                            if vx1 <= pcx <= vx2 and vy1 <= pcy <= vy2:

                                cx = (vx1 + vx2) // 2
                                cy = (vy1 + vy2) // 2

                                d = ((pcx - cx) ** 2 + (pcy - cy) ** 2) ** 0.5

                                if d < best_dist:
                                    best_dist = d
                                    best_tid = tid

                        if best_tid is None:
                            continue

                        crop = crop_plate(frame, px1, py1, px2, py2)

                        if crop.size == 0:
                            continue

                        result = plate_ocr.read_plate(crop)

                        text = result.get("text", "")
                        conf = result.get("conf", 0.0)
                        score = result.get("score", 0.0)

                        if text and score >= MIN_SCORE_ACCEPT:
                            plate_cache.add(
                                int(best_tid),
                                text,
                                score,
                                conf
                            )
            # Merge plate tốt nhất vào frame detections
            for d in frame_detections:
                best_plate = plate_cache.best(d["id"])
                if best_plate:
                    d["plate"] = best_plate["text"]

            detections_all.extend(frame_detections)
            out.write(frame_out)

            jobs[job_id]["progress"] = round(frame_idx / total * 100)

        cap.release()
        out.release()

        # ── Re-encode → H.264 ─────────────────────────────────
        jobs[job_id]["status"] = "encoding"
        reencode_h264(raw_out_path, final_out_path)

        # Đợi file xuất hiện
        import time
        wait_count = 0
        while not os.path.exists(final_out_path):
            time.sleep(0.5)
            wait_count += 1
            if wait_count > 20:
                raise Exception("Encoded video not found")

        # ── Tổng hợp kết quả (LPR v2 style) ──────────────────
        # summary: dict[int, dict] = {}
        # for d in detections_all:
        #     tid = d["id"]
        #     if tid not in summary:
        #         summary[tid] = dict(d)
        #     else:
        #         if d["plate"] and not summary[tid].get("plate"):
        #             summary[tid] = dict(d)
        #         if d["speed"] and (not summary[tid].get("speed") or
        #                             d["speed"] > summary[tid]["speed"]):
        #             summary[tid]["speed"] = d["speed"]

        # Thay đoạn summary build cuối process_video
        summary: dict[int, dict] = {}

        for d in detections_all:
            tid = d["id"]

            if tid not in summary:
                summary[tid] = {
                    "id": d["id"],
                    "label": d["label"],
                    "conf": d["conf"],
                    "time": d["time"],
                    "speed": d.get("speed"),
                    "plate": d.get("plate"),
                    "status": d.get("status", "normal"),
                    "bbox": d.get("bbox"),
                }

            else:
                current = summary[tid]
                if d.get("speed") is not None:
                    if current.get("speed") is None or d["speed"] > current["speed"]:
                        current["speed"] = d["speed"]
                if d.get("conf", 0) > current.get("conf", 0):
                    current["conf"] = d["conf"]
                    current["time"] = d["time"]
                    current["bbox"] = d.get("bbox")
                if d.get("status") == "violation":
                    current["status"] = "violation"
                # ← THÊM: update plate khi chưa có hoặc score tốt hơn
                if d.get("plate") and not current.get("plate"):
                    current["plate"] = d["plate"]
        for tid, item in summary.items():
            best = plate_cache.best(tid)
            if best:
                item["plate"] = best["text"]

        result_json_path = os.path.join(OUTPUT_DIR, f"{job_id}.json")
        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump({
                "detections_all": detections_all,
                "summary": list(summary.values()),
                "total_vehicles": len(summary),
                "violations": sum(
                    1 for v in summary.values()
                    if v.get("status") == "violation"
                )
            }, f, ensure_ascii=False, indent=2)

        jobs[job_id].update({
            "status":         "done",
            "progress":       100,
            "video_url":      f"/outputs/{job_id}.mp4",
            "result_url":     f"/outputs/{job_id}.json",
            "total_vehicles": len(summary),
            "violations":     sum(1 for v in summary.values()
                                  if v.get("status") == "violation"),
        })

    except Exception as e:
        import traceback
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"]  = str(e)
        print(f"[ERROR] Job {job_id}:\n{traceback.format_exc()}")
    finally:
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────
# FASTAPI APP
# ─────────────────────────────────────────────────────────────
app = FastAPI(title="Vehicle Monitoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")


@app.post("/process")
async def start_process(
    file: UploadFile = File(...),
    speed_limit: int = Form(default=SPEED_LIMIT_DEFAULT),
):
    job_id    = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_DIR, f"{job_id}.mp4")

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    clean_input = os.path.join(UPLOAD_DIR, f"{job_id}_clean.mp4")
    FFMPEG_PATH=r"C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
    subprocess.run([
        FFMPEG_PATH,
        "-y",
        "-i", save_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        clean_input
    ])
    # subprocess.run([
    #     FFMPEG_PATH,
    #     "-y",
    #     "-i", save_path,
    #     "-c:v", "h264_nvenc",
    #     "-preset", "p5",
    #     "-cq", "18",
    #     "-b:v", "0",
    #     "-pix_fmt", "yuv420p",
    #     "-movflags", "+faststart",
    #     clean_input
    # ], check=True)

    os.remove(save_path)
    save_path = clean_input
    jobs[job_id] = {"status": "queued", "progress": 0,
                    "video_url": None, "result_url": None}

    thread = threading.Thread(
        target=process_video,
        args=(job_id, save_path, speed_limit),
        daemon=True
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/status/{job_id}")
def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return {"error": "Job not found"}
    return job


@app.delete("/job/{job_id}")
def delete_job(job_id: str):
    jobs.pop(job_id, None)
    for ext in [".mp4", ".json"]:
        path = os.path.join(OUTPUT_DIR, f"{job_id}{ext}")
        if os.path.exists(path):
            os.remove(path)
    return {"deleted": job_id}


@app.get("/health")
def health():
    return {"status": "ok", "device": device, "ocr": "easyocr-beamsearch"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)