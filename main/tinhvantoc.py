import cv2
from ultralytics import YOLO
from collections import defaultdict, deque
import numpy as np

# ===== LOAD MODEL =====
model = YOLO(r"C:\Users\Admin\THL_vehicle_monitoring_system\runs\detect\runs\train\vehicle_model_v23\weights\best.pt")

cap = cv2.VideoCapture(r"C:\Users\Admin\THL_vehicle_monitoring_system\test\result_video7733209278881.mp4")
fps = cap.get(cv2.CAP_PROP_FPS)

# ===== CONFIG =====
MAX_JUMP = 80       # pixel jump tối đa giữa 2 frame (lọc nhiễu tracking)
HISTORY = 10        # số frame lưu lại để tính speed
SMOOTH = 7          # số giá trị speed để làm mượt
VANISHING_Y = 180   # tọa độ Y của điểm tụ (vanishing point) trong video
                    # → chỉnh giá trị này theo video của bạn
                    # → thường là nơi đường thẳng hội tụ ở chân trời
BASE_SCALE = 0.012  # scale mét/pixel ở gần camera (y = 640)
                    # → chỉnh lại nếu tốc độ đọc sai so với thực tế

# ===== PERSPECTIVE CALIBRATION (phi tuyến, chuẩn hơn linear) =====
def get_meter_per_pixel(y):
    """
    Tính tỉ lệ mét/pixel dựa trên vị trí y (perspective correction).
    - Xe ở trên màn hình (y nhỏ, xa camera) → nhiều mét/pixel
    - Xe ở dưới màn hình (y lớn, gần camera) → ít mét/pixel
    Công thức phi tuyến theo nguyên lý phối cảnh thực tế.
    """
    effective_y = max(y - VANISHING_Y, 1)           # khoảng cách từ điểm tụ
    max_effective = max(640 - VANISHING_Y, 1)        # khoảng cách tối đa
    scale = BASE_SCALE * (max_effective / effective_y) # scale chuyển pixel → mét theo phối cảnh (xe càng xa → 1 pixel ≈ nhiều mét hơn)
    return np.clip(scale, 0.005, 0.20)              # giới hạn để tránh outlier

# ===== DATA =====
track_history = defaultdict(lambda: deque(maxlen=HISTORY))
speed_history  = defaultdict(lambda: deque(maxlen=SMOOTH))

# ===== COLOR =====
COLOR_MAP = {
    "Motorcycle": (0, 255, 0),
    "Car":        (255, 165, 0),
    "Bus":        (0, 255, 255),
    "Truck":      (0, 0, 255),
}

def get_color(label):
    return COLOR_MAP.get(label, (255, 255, 255))

# ===== MAIN LOOP =====
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (360, 640))

    results = model.track(
        frame,
        persist=True,
        conf=0.3,
        tracker="botsort.yaml"
    )

    boxes = results[0].boxes

    if boxes is not None and boxes.id is not None:
        for box, track_id, cls in zip(boxes.xyxy, boxes.id, boxes.cls):

            x1, y1, x2, y2 = map(int, box)
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            track_id = int(track_id)
            label    = model.names[int(cls)]
            color    = get_color(label)

            # ===== KIỂM TRA JUMP (lọc tracking sai) =====
            history = track_history[track_id]
            if len(history) > 0:
                prev_cx, prev_cy = history[-1]
                jump = np.hypot(cx - prev_cx, cy - prev_cy)
                if jump > MAX_JUMP:
                    # Tracking bị nhảy lớn → reset để tránh tính speed sai
                    track_history[track_id].clear()
                    speed_history[track_id].clear()

            track_history[track_id].append((cx, cy))

            speed_text = ""

            # ===== TÍNH SPEED =====
            if len(track_history[track_id]) >= 2:
                pts = list(track_history[track_id])

                # Lấy điểm đầu và cuối
                x_old, y_old = pts[0]
                x_new, y_new = pts[-1]

                # Chỉ tính displacement theo trục Y (hướng xe tiến/lùi trên đường)
                # → tránh nhiễu khi xe đổi làn hoặc lắc ngang
                dy_pixel = abs(y_new - y_old)

                # Scale perspective tại vị trí trung bình của quỹ đạo
                avg_y        = np.mean([p[1] for p in pts])
                meter_per_px = get_meter_per_pixel(avg_y)

                dist_meter = dy_pixel * meter_per_px
                time_sec   = len(track_history[track_id]) / fps

                if time_sec > 0:
                    speed_kmh = (dist_meter / time_sec) * 3.6

                    # Lọc nhiễu: chỉ chấp nhận tốc độ hợp lý
                    if 0 < speed_kmh < 100:
                        speed_history[track_id].append(speed_kmh)

                if len(speed_history[track_id]) > 0:
                    smooth_speed = np.mean(speed_history[track_id])
                    speed_text   = f"{smooth_speed:.1f} km/h"

            # ===== DRAW =====
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            text = f"{label} | ID {track_id}"
            if speed_text:
                text += f" | {speed_text}"

            cv2.putText(
                frame, text,
                (x1, max(y1 - 10, 15)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5, color, 2
            )
            # ===== VẼ QUỸ ĐẠO (tuỳ chọn, giúp debug) =====
            pts_draw = list(track_history[track_id])
            for i in range(1, len(pts_draw)):
                cv2.line(frame, pts_draw[i-1], pts_draw[i], color, 1)

    cv2.imshow("Speed", frame) 

    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()