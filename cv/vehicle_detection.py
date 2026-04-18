import cv2
import torch
from ultralytics import YOLO

# load model
model = YOLO(r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt")

# ép chạy CPU để tránh crash GPU
model.to("cpu")

video_path = r"C:\Users\Admin\Videos\Captures\sample.mp4"

video_path1 = r"C:\Users\Admin\Videos\Captures\YTSave.com_YouTube_computer-vision-traffic-video-2_Media_RmZQR9NiYWM_001_720p.mp4"
cap = cv2.VideoCapture(video_path1)

if not cap.isOpened():
    print("Không mở được video!")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        print("Hết video hoặc lỗi đọc frame")
        break

    # resize nhỏ lại cho nhẹ
    frame = cv2.resize(frame, (640, 480))

    try:
        results = model.track(frame, persist=True)
    except Exception as e:
        print("Lỗi YOLO:", e)
        break

    for r in results:
        boxes = r.boxes

        for box in boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cls = int(box.cls[0])

            label = model.names[cls]

            #  LẤY ID
            track_id = int(box.id[0]) if box.id is not None else -1

            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            cv2.putText(
                frame,
                f"ID {track_id} - {label} {conf:.2f}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2
            )

    # HIỂN THỊ VIDEO
    cv2.imshow("Vehicle Monitoring System", frame)

    # delay nhỏ (quan trọng)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()