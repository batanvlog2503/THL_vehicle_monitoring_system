import cv2
from ultralytics import YOLO

model = YOLO("yolo11n.pt")

cap = cv2.VideoCapture("test/testvd3.mp4")

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
        classes=[2, 3, 5, 7]  # car, motorcycle, bus, truck
    )

    annotated_frame = results[0].plot()
    cv2.imshow("Tracking", annotated_frame)

    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()