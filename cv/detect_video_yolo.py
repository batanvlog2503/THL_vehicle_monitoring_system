import cv2
from ultralytics import YOLO

# Load model YOLOv8
model = YOLO("yolo11n.pt")

# Mở video
video_path = "test/testvd.mp4"
cap = cv2.VideoCapture(video_path)

# Các class phương tiện cần detect
vehicle_classes = [2, 3, 5, 7]  
# 2: car, 3: motorbike, 5: bus, 7: truck

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    frame = cv2.resize(frame, (640,640))
    # Detect
    results = model(frame)

    # Lấy kết quả
    for r in results:
        boxes = r.boxes

        for box in boxes:
            cls = int(box.cls[0])

            if cls in vehicle_classes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
               #lay ten object
                label = model.names[cls]

                # Vẽ bounding box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2)

                cv2.putText(
                    frame,
                    f"{label} {conf:.2f}",
                    (x1, y1-10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0,255,0),
                    2
                )

    # Hiển thị video
    cv2.imshow("Vehicle Detection", frame)

    # Nhấn q để thoát
    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()