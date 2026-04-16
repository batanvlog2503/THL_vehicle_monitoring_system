import cv2
from ultralytics import YOLO

# load model đã train
model = YOLO(r"C:\Users\Admin\THL_vehicle_monitoring_system\runs\detect\runs\train\vehicle_model_v23\weights\best.pt")

# mở video
video_path = "test/testvd4.mp4"
cap = cv2.VideoCapture(video_path)

while cap.isOpened():

    ret, frame = cap.read()
    if not ret:
        break
    frame=cv2.resize(frame,(640,640))   
    # detect object
    results = model(frame)

    # lấy kết quả
    for r in results:

        boxes = r.boxes

        for box in boxes:

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cls = int(box.cls[0])

            label = model.names[cls]

            # vẽ bounding box
            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)

            # hiển thị label
            cv2.putText(
                frame,
                f"{label} {conf:.2f}",
                (x1, y1-10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0,255,0),
                2
            )

    # hiển thị video
    cv2.imshow("Vehicle Monitoring System", frame)

    # nhấn q để thoát
    if cv2.waitKey(25) & 0xFF == ord('q'):
        break


cap.release()
cv2.destroyAllWindows()