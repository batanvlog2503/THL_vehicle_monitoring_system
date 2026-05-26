import cv2
import numpy as np
from ultralytics import YOLO
from collections import defaultdict

# ===== LOAD MODEL =====
model = YOLO(r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt")

video_path1 = r"C:\Users\Admin\Videos\Captures\YTSave.com_YouTube_computer-vision-traffic-video-2_Media_RmZQR9NiYWM_001_720p.mp4"
cap = cv2.VideoCapture(video_path1)

fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

# ===== CONFIG =====
SMOOTH_N      = 10
MAX_SPEED     = 150
MIN_DIST_PX   = 3      # bỏ qua nếu xe gần như đứng yên (lọc jitter tracker)
SAMPLE_FRAMES = 3      # tính speed mỗi N frame thay vì mỗi frame

# ===== HOMOGRAPHY =====
# Bước 1: Pause video, đọc tọa độ 4 điểm trên mặt đường bằng Paint
# Bước 2: Đo kích thước thực tương ứng (mét)
# Bước 3: Chạy code → H được tính tự động
#
# SRC_PTS: 4 điểm pixel trong frame (chỉnh lại cho đúng video của bạn)
SRC_PTS = np.float32([
    [180, 200],   # trái trên
    [460, 200],   # phải trên
    [580, 500],   # phải dưới
    [ 60, 500],   # trái dưới
])

# DST_PTS: kích thước thực tương ứng (mét)
# Ví dụ đoạn đường = 10m ngang x 15m dọc
DST_PTS = np.float32([
    [ 0,  0],
    [10,  0],
    [10, 15],
    [ 0, 15],
])

H, _ = cv2.findHomography(SRC_PTS, DST_PTS)

def pixel_to_world(px, py):
    """Chuyển tọa độ pixel → tọa độ thực (mét) qua homography."""
    pt  = np.array([[[float(px), float(py)]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, H)
    return float(out[0][0][0]), float(out[0][0][1])

# ===== KALMAN FILTER 1D =====
class KalmanSpeed:
    """Lọc Kalman cho speed — phản ứng nhanh hơn moving average."""
    def __init__(self):
        self.kf = cv2.KalmanFilter(2, 1)
        self.kf.measurementMatrix   = np.array([[1, 0]], np.float32)
        self.kf.transitionMatrix    = np.array([[1, 1], [0, 1]], np.float32)
        self.kf.processNoiseCov     = np.eye(2, dtype=np.float32) * 0.05
        self.kf.measurementNoiseCov = np.array([[4]], np.float32)
        self.kf.errorCovPost        = np.eye(2, dtype=np.float32)
        self.ready = False

    def update(self, raw):
        if not self.ready:
            self.kf.statePost = np.array([[raw], [0]], np.float32)
            self.ready = True
        self.kf.predict()
        out = self.kf.correct(np.array([[raw]], np.float32))
        return max(0.0, float(out[0]))

# ===== COLOR THEO CLASS =====
def get_color_by_class(label):
    return {
        "Motorcycle": (0, 255, 0),
        "Car":        (255, 100, 0),
        "Bus":        (0, 255, 255),
        "Truck":      (0, 60, 255),
    }.get(label, (200, 200, 200))

def speed_color(kmh):
    if kmh < 40:  return (0, 230, 80)
    if kmh < 80:  return (0, 200, 255)
    return (0, 50, 255)

def put_bg(img, text, x, y, color, fs=0.5, th=1):
    font = cv2.FONT_HERSHEY_SIMPLEX
    (tw, fh), bl = cv2.getTextSize(text, font, fs, th)
    ov = img.copy()
    cv2.rectangle(ov, (x-3, y-fh-4), (x+tw+3, y+bl+2), (0,0,0), -1)
    cv2.addWeighted(ov, 0.5, img, 0.5, 0, img)
    cv2.putText(img, text, (x, y), font, fs, color, th, cv2.LINE_AA)

# ===== DATA =====
prev_world   = {}               # {tid: (wx, wy, frame_idx)}
kalman_map   = defaultdict(KalmanSpeed)
speed_hist   = defaultdict(list)
frame_count  = 0

# ===== LOOP =====
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1
    frame = cv2.resize(frame, (640, 640))

    results = model.track(
        frame,
        persist=True,
        conf=0.5,
        tracker=r"D:\cv-core\botsort.yaml",
        imgsz=640,
        verbose=False,
    )

    boxes = results[0].boxes

    if boxes is not None and boxes.id is not None:
        for box, track_id, cls in zip(boxes.xyxy, boxes.id, boxes.cls):

            x1, y1, x2, y2 = map(int, box)
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            tid   = int(track_id)
            cls   = int(cls)
            label = model.names[cls]
            color = get_color_by_class(label)

            # ===== TOẠ ĐỘ THỰC QUA HOMOGRAPHY =====
            wx, wy = pixel_to_world(cx, cy)

            # ===== TÍNH SPEED =====
            speed_text = ""

            if tid in prev_world:
                pwx, pwy, prev_frame = prev_world[tid]
                delta_f = frame_count - prev_frame

                if delta_f >= SAMPLE_FRAMES:
                    # Khoảng cách thực (mét) — không bị ảnh hưởng perspective
                    dist_m = ((wx - pwx)**2 + (wy - pwy)**2) ** 0.5

                    if dist_m >= MIN_DIST_PX * 0.001:   # bỏ qua nếu đứng yên
                        time_s  = delta_f / fps
                        raw_spd = (dist_m / time_s) * 3.6

                        if 0 < raw_spd < MAX_SPEED:
                            filtered = kalman_map[tid].update(raw_spd)

                            speed_hist[tid].append(filtered)
                            if len(speed_hist[tid]) > SMOOTH_N:
                                speed_hist[tid].pop(0)

                    prev_world[tid] = (wx, wy, frame_count)
            else:
                prev_world[tid] = (wx, wy, frame_count)

            if speed_hist[tid]:
                smooth = sum(speed_hist[tid]) / len(speed_hist[tid])
                sc     = speed_color(smooth)
                speed_text = f"{smooth:.1f} km/h"

            # ===== VẼ BOX =====
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # ===== TEXT TYPE + ID =====
            put_bg(frame, f"{label} | ID {tid}",
                   x1, max(y1 - 8, 14), color)

            # ===== SPEED =====
            if speed_text:
                put_bg(frame, speed_text,
                       x1, y2 + 18, sc, fs=0.6, th=2)

    cv2.imshow("Tracking + Speed", frame)
    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()