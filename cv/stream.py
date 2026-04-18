import cv2
import torch
from ultralytics import YOLO

# ===== LOAD MODEL =====
device = "cuda" if torch.cuda.is_available() else "cpu"
print("Using device:", device)

model = YOLO(r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt").to(device)
model.fuse()

# ===== VIDEO =====
video_path = r"C:\Users\Admin\Videos\Captures\YTSave.com_YouTube_computer-vision-traffic-video-2_Media_RmZQR9NiYWM_001_720p.mp4"
cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("Không mở được video!")
    exit()

# ===== MAIN LOOP =====
while True:
    ret, frame = cap.read()
    if not ret:
        print("Hết video")
        break

    # ⚠️ KHÔNG resize quá nhỏ (giữ tracking ổn định)
    frame = cv2.resize(frame, (960, 540))

    # ===== TRACK =====
    results = model.track(
        frame,
        conf=0.5,                 # lọc confidence > 0.5
        persist=True,             # giữ ID giữa các frame
        tracker = r"D:\cv-core\botsort.yaml",   # dùng BoT-SORT
        device=device,
        imgsz=640,
        verbose=False
    )

    r = results[0]

    if r.boxes is not None and r.boxes.id is not None:
        boxes = r.boxes

        ids = boxes.id.cpu().numpy().astype(int)
        confs = boxes.conf.cpu().numpy()
        classes = boxes.cls.cpu().numpy().astype(int)
        xyxys = boxes.xyxy.cpu().numpy()

        for obj_id, conf, cls, box in zip(ids, confs, classes, xyxys):

            # ✅ FILTER CONF > 0.5 (double chắc chắn)
            if conf < 0.5:
                continue

            x1, y1, x2, y2 = map(int, box)
            label = model.names[cls]

            # ===== DRAW =====
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            cv2.putText(
                frame,
                f"ID {obj_id} - {label} {conf:.2f}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2
            )

    # ===== SHOW =====
    cv2.imshow("Vehicle Tracking Stable", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()