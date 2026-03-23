import cv2
from ultralytics import YOLO

# load segmentation model
model = YOLO("yolov8n.pt")

video_path_car = "sample.mp4"

cap = cv2.VideoCapture(video_path_car)

while True:

    ret, frame = cap.read()
    if not ret:
        break

    # segmentation + tracking
    results = model.track(frame, persist=True)

    r = results[0]

    # vẽ mask + bounding box
    frame_ = r.plot()

    boxes = r.boxes
    masks = r.masks

    if boxes.id is not None:

        ids = boxes.id.cpu().numpy().astype(int)
        classes = boxes.cls.cpu().numpy().astype(int)
        confs = boxes.conf.cpu().numpy()

        for obj_id, cls, conf in zip(ids, classes, confs):

            label = model.names[cls]

            print(f"ID:{obj_id} Class:{label} Conf:{conf:.2f}")

    # hiển thị
    cv2.imshow("Segmentation + Tracking", frame_)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()