import cv2
from main.model.yolo_model import tracking_model
from main.config import DEVICE, TRACKER_PATH

def run_tracking(frame):
    try:
        frame_resized = cv2.resize(frame, (640, 360))

        results = tracking_model.track(
            frame_resized,
            conf=0.3,
            persist=True,
            device=DEVICE,
            verbose=False,
            tracker=TRACKER_PATH,
            imgsz=480
        )

        r = results[0]
        detections = []

        if r.boxes.id is not None:
            ids = r.boxes.id.cpu().numpy().astype(int)
            classes = r.boxes.cls.cpu().numpy().astype(int)
            confs = r.boxes.conf.cpu().numpy()
            bboxes = r.boxes.xyxy.cpu().numpy()

            for obj_id, cls, conf, bbox in zip(ids, classes, confs, bboxes):
                detections.append({
                    "id": int(obj_id),
                    "label": tracking_model.names[cls],
                    "conf": round(float(conf), 2),
                    "bbox": bbox.tolist()
                })

        return r.plot(), detections

    except Exception as e:
        print("Tracking error:", e)
        return frame, []