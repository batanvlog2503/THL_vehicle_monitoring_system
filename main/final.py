import cv2
from ultralytics import YOLO
from collections import defaultdict, deque
import numpy as np
import json
import time

# ===== LOAD MODEL =====
model = YOLO(r"C:\Users\Admin\THL_vehicle_monitoring_system\runs\detect\runs\train\vehicle_model_v23\weights\best.pt")

cap = cv2.VideoCapture(r"test/testvd3.mp4")
fps = cap.get(cv2.CAP_PROP_FPS)

# ===== CONFIG =====
MAX_JUMP = 80
HISTORY = 10
SMOOTH = 7
VANISHING_Y = 180
BASE_SCALE = 0.012

# ===== PERSPECTIVE =====
def get_meter_per_pixel(y):
    effective_y = max(y - VANISHING_Y, 1)
    max_effective = max(640 - VANISHING_Y, 1)
    scale = BASE_SCALE * (max_effective / effective_y)
    return np.clip(scale, 0.005, 0.20)

# ===== DATA =====
track_history = defaultdict(lambda: deque(maxlen=HISTORY))
speed_history = defaultdict(lambda: deque(maxlen=SMOOTH))

# ===== COLOR =====
COLOR_MAP = {
    "Motorcycle": (0, 255, 0),
    "Car": (255, 165, 0),
    "Bus": (0, 255, 255),
    "Truck": (0, 0, 255),
}

def get_color(label):
    return COLOR_MAP.get(label, (255, 255, 255))

# ===== FRAME COUNT =====
frame_count = 0

# ===== MAIN LOOP =====
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1
    frame = cv2.resize(frame, (640, 640))

    results = model.track(
        frame,
        persist=True,
        conf=0.3,
        tracker="botsort.yaml"
    )

    boxes = results[0].boxes

    frame_data = []   # 👉 dữ liệu cho frame này

    if boxes is not None and boxes.id is not None:
        for box, track_id, cls in zip(boxes.xyxy, boxes.id, boxes.cls):

            x1, y1, x2, y2 = map(int, box)
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            track_id = int(track_id)
            label = model.names[int(cls)]
            color = get_color(label)

            # ===== FILTER JUMP =====
            history = track_history[track_id]
            if len(history) > 0:
                prev_cx, prev_cy = history[-1]
                jump = np.hypot(cx - prev_cx, cy - prev_cy)
                if jump > MAX_JUMP:
                    track_history[track_id].clear()
                    speed_history[track_id].clear()

            track_history[track_id].append((cx, cy))

            speed_text = None
            smooth_speed = None

            # ===== SPEED =====
            if len(track_history[track_id]) >= 2:
                pts = list(track_history[track_id])

                x_old, y_old = pts[-2]
                x_new, y_new = pts[-1]

                dy_pixel = abs(y_new - y_old)

                avg_y = np.mean([p[1] for p in pts])
                meter_per_px = get_meter_per_pixel(avg_y)

                dist_meter = dy_pixel * meter_per_px
                time_sec = 1 / fps   # 👉 chuẩn hơn cách cũ

                if time_sec > 0:
                    speed_kmh = (dist_meter / time_sec) * 3.6

                    if 0 < speed_kmh < 120:
                        speed_history[track_id].append(speed_kmh)

                if len(speed_history[track_id]) > 0:
                    smooth_speed = np.mean(speed_history[track_id])
                    speed_text = f"{smooth_speed:.1f} km/h"

            # ===== SAVE DATA =====
            vehicle_info = {
                "id": track_id,
                "bbox": [x1, y1, x2, y2],
                "speed": round(smooth_speed, 2) if smooth_speed else None,
                "class": label
            }
            frame_data.append(vehicle_info)

            # ===== DRAW =====
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            text = f"{label} | ID {track_id}"
            if speed_text:
                text += f" | {speed_text}"

            cv2.putText(frame, text,
                        (x1, max(y1 - 10, 15)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, color, 2)

    # ===== EXPORT JSON =====
    if len(frame_data) > 0:
        output = {
            "frame": frame_count,
            "timestamp": time.time(),
            "vehicles": frame_data
        }

        with open("output.json", "a", encoding="utf-8") as f:
            json.dump(output, f)
            f.write("\n")

    # ===== SHOW =====
    cv2.imshow("Tracking + Speed + Export", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()