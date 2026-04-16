import cv2
from ultralytics import YOLO
from collections import defaultdict

# ===== LOAD MODEL =====
model = YOLO(r"C:\Users\Admin\THL_vehicle_monitoring_system\runs\detect\runs\train\vehicle_model_v23\weights\best.pt")

cap = cv2.VideoCapture("test/testvd3.mp4")

# ===== CONFIG =====
PIXEL_TO_METER = 0.2   # ⚠️ chỉnh lại cho đúng thực tế
SMOOTH_N = 10           # làm mượt tốc độ

fps = cap.get(cv2.CAP_PROP_FPS)

# ===== DATA =====
prev_positions = {}
speed_history = defaultdict(list)

# ===== COLOR THEO CLASS =====
def get_color_by_class(label):
    if label == "Motorcycle":
        return (0, 255, 0)        # xanh lá
    elif label == "Car":
        return (255, 0, 0)        # xanh dương
    elif label == "Bus":
        return (0, 255, 255)      # vàng
    elif label == "Truck":
        return (0, 0, 255)        # đỏ
    else:
        return (255, 255, 255)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    frame = cv2.resize(frame, (640, 640))
    results = model.track(
        frame,
        persist=True,
        conf=0.3,
        tracker="bytetrack.yaml",
        imgsz=640
    )

    boxes = results[0].boxes

    if boxes is not None and boxes.id is not None:
        for box, track_id, cls in zip(boxes.xyxy, boxes.id, boxes.cls):

            x1, y1, x2, y2 = map(int, box)
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            track_id = int(track_id)
            cls = int(cls)

            label = model.names[cls]
            color = get_color_by_class(label)

            speed_text = ""

            # ===== TÍNH SPEED =====
            if track_id in prev_positions:
                px, py = prev_positions[track_id]

                dist_pixel = ((cx - px)**2 + (cy - py)**2) ** 0.5
                dist_meter = dist_pixel * PIXEL_TO_METER

                time_sec = 1 / fps
                speed = (dist_meter / time_sec) * 3.6

                if speed < 150:  # lọc nhiễu
                    speed_history[track_id].append(speed)

                speed_history[track_id] = speed_history[track_id][-SMOOTH_N:]

                if len(speed_history[track_id]) > 0:
                    smooth_speed = sum(speed_history[track_id]) / len(speed_history[track_id])
                    speed_text = f"{smooth_speed:.1f} km/h"

            prev_positions[track_id] = (cx, cy)

            # ===== VẼ BOX =====
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # ===== TEXT (TYPE + ID) =====
            text = f"{label} | ID {track_id}"
            text_y = max(y1 - 10, 15)

            cv2.putText(
                frame,
                text,
                (x1, text_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                2
            )

            # ===== SPEED =====
            if speed_text != "":
                cv2.putText(
                    frame,
                    speed_text,
                    (x1, y2 + 20),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 0, 255),
                    2
                )

    cv2.imshow("Tracking + Speed", frame)

    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()