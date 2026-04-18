import cv2
from ultralytics import YOLO

model = YOLO(r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt")


video_path1 = r"C:\Users\Admin\Videos\Captures\YTSave.com_YouTube_computer-vision-traffic-video-2_Media_RmZQR9NiYWM_001_720p.mp4"
cap = cv2.VideoCapture(video_path1)
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (640, 640))

    results = model.track(
        frame,
        persist=True,
        conf=0.3,
        tracker="bytetrack.yaml"
    )
    annotated_frame = results[0].plot()
    cv2.imshow("Tracking", annotated_frame)

    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()