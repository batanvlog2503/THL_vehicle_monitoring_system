import cv2
from ultralytics import YOLO

# ===== LOAD MODEL =====
model = YOLO(r"C:\Users\Admin\THL_vehicle_monitoring_system\runs\detect\runs\train\vehicle_model_v23\weights\best.pt")

cap = cv2.VideoCapture(r"test/testvd3.mp4")

# ===== CONFIG =====
MAX_JUMP = 80  # chống bbox bay (pixel)

prev_positions = {}

# ===== COLOR =====
def get_color_by_class(label):
    if label == "Motorcycle":
        return (0, 255, 0)
    elif label == "Car":
        return (255, 0, 0)
    elif label == "Bus":
        return (0, 255, 255)
    elif label == "Truck":
        return (0, 0, 255)
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
    conf=0.3,      # 🔥 giảm xuống
    iou=0.5,
    tracker="deepsort.yaml",
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

            # ===== CHỐNG BOX BAY =====
            if track_id in prev_positions:
                px, py = prev_positions[track_id]

                if abs(cx - px) > MAX_JUMP or abs(cy - py) > MAX_JUMP:
                    continue

            prev_positions[track_id] = (cx, cy)

            # ===== DRAW =====
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

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

    cv2.imshow("DeepSORT Fixed", frame)

    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()