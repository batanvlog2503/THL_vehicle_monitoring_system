import cv2
from ultralytics import YOLO
from collections import defaultdict, deque
import numpy as np
import json

# ============================================================
# LOAD MODEL
# ============================================================
model = YOLO(
   r"C:\Users\Admin\OneDrive - ptit.edu.vn\Desktop\THL_vehicle_monitor\THL_vehicle_monitoring_system\cv-core\runs\detect\train\weights\best.pt"
)

cap = cv2.VideoCapture(r"C:\Users\Admin\Videos\Captures\YTSave.com_YouTube_computer-vision-traffic-video-2_Media_RmZQR9NiYWM_001_720p.mp4")

fps = cap.get(cv2.CAP_PROP_FPS)

# ============================================================
# CONFIG
# ============================================================
TRACKER_CONFIG = r"C:\Users\Admin\OneDrive - ptit.edu.vn\Desktop\THL_vehicle_monitor\THL_vehicle_monitoring_system\cv-core\botsort.yaml"

SMOOTH = 7

# ============================================================
# HOMOGRAPHY
# ============================================================

SRC_PTS = np.float32([
    [180, 200],
    [460, 200],
    [580, 500],
    [60, 500]
])

DST_PTS = np.float32([
    [0, 0],
    [10, 0],
    [10, 15],
    [0, 15]
])

H_MAT, _ = cv2.findHomography(
    SRC_PTS,
    DST_PTS
)

def pixel_to_world(px, py):

    pt = np.array(
        [[[float(px), float(py)]]],
        dtype=np.float32
    )

    out = cv2.perspectiveTransform(
        pt,
        H_MAT
    )

    return (
        float(out[0][0][0]),
        float(out[0][0][1])
    )

# ============================================================
# KALMAN FILTER
# ============================================================
class KalmanSpeed:

    def __init__(self):

        self.kf = cv2.KalmanFilter(2, 1)

        self.kf.measurementMatrix = np.array(
            [[1, 0]],
            np.float32
        )

        self.kf.transitionMatrix = np.array(
            [[1, 1],
             [0, 1]],
            np.float32
        )

        self.kf.processNoiseCov = (
            np.eye(2, dtype=np.float32) * 0.05
        )

        self.kf.measurementNoiseCov = np.array(
            [[4]],
            np.float32
        )

        self.kf.errorCovPost = np.eye(
            2,
            dtype=np.float32
        )

        self.ready = False

    def update(self, raw):

        if not self.ready:

            self.kf.statePost = np.array(
                [[raw], [0]],
                np.float32
            )

            self.ready = True

        self.kf.predict()

        out = self.kf.correct(
            np.array([[raw]], np.float32)
        )

        return max(
            0.0,
            float(out.squeeze()[0])
        )

# ============================================================
# DATA
# ============================================================
prev_world = {}

kalman_map = defaultdict(KalmanSpeed)

speed_hist = defaultdict(
    lambda: deque(maxlen=SMOOTH)
)

# ============================================================
# COLOR
# ============================================================
COLOR_MAP = {
    "Motorcycle": (0, 255, 0),
    "Car":        (255, 165, 0),
    "Bus":        (0, 255, 255),
    "Truck":      (0, 0, 255),
}

def get_color(label):

    return COLOR_MAP.get(
        label,
        (255, 255, 255)
    )

# ============================================================
# JSON
# ============================================================
open("output.json", "w").close()

frame_count = 0

# ============================================================
# MAIN LOOP
# ============================================================
while cap.isOpened():

    ret, frame = cap.read()

    if not ret:
        break

    frame_count += 1

    frame = cv2.resize(
        frame,
        (640, 640)
    )

    # ========================================================
    # DETECT + TRACK
    # ========================================================
    results = model.track(
        frame,
        persist=True,
        conf=0.3,
        tracker=TRACKER_CONFIG
    )

    boxes = results[0].boxes

    frame_data = []

    if boxes is not None and boxes.id is not None:

        for box, track_id, cls, conf in zip(
            boxes.xyxy,
            boxes.id,
            boxes.cls,
            boxes.conf
        ):

            x1, y1, x2, y2 = map(int, box)

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            track_id = int(track_id)

            label = model.names[int(cls)]

            confidence = float(conf)

            color = get_color(label)

            # =================================================
            # PIXEL -> WORLD
            # =================================================
            wx, wy = pixel_to_world(
                cx,
                cy
            )

            speed = None
            speed_text = ""

            # =================================================
            # SPEED
            # =================================================
            if track_id in prev_world:

                pwx, pwy, pf = prev_world[track_id]

                # frame difference
                df = frame_count - pf

                if df > 0:

                    # khoảng cách thực
                    dist = np.sqrt(
                        (wx - pwx) ** 2 +
                        (wy - pwy) ** 2
                    )

                    # chống rung nhẹ
                    if dist > 0.001:

                        # m/s -> km/h
                        raw_spd = (
                            dist / (df / fps)
                        ) * 3.6

                        # lọc speed rác
                        if 0 < raw_spd < 200:

                            # kalman
                            f_spd = (
                                kalman_map[track_id]
                                .update(raw_spd)
                            )

                            speed_hist[
                                track_id
                            ].append(f_spd)

                            # smooth
                            speed = round(
                                sum(
                                    speed_hist[track_id]
                                ) / len(
                                    speed_hist[track_id]
                                ),
                                1
                            )

            # UPDATE EVERY FRAME
            prev_world[track_id] = (
                wx,
                wy,
                frame_count
            )

            # =================================================
            # SPEED TEXT
            # =================================================
            if speed is not None:

                speed_text = (
                    f"{speed:.1f} km/h"
                )

            # =================================================
            # SAVE JSON
            # =================================================
            vehicle_info = {

                "id": track_id,

                "bbox": [
                    x1,
                    y1,
                    x2,
                    y2
                ],

                "speed": speed,

                "class": label,

                "confidence": round(
                    confidence,
                    3
                )
            }

            frame_data.append(vehicle_info)

            # =================================================
            # DRAW BOX
            # =================================================
            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                color,
                2
            )

            text = (
                f"{label} | ID {track_id}"
            )

            if speed_text:
                text += f" | {speed_text}"

            cv2.putText(
                frame,
                text,
                (x1, max(y1 - 10, 15)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                2
            )

            # =================================================
            # CENTER POINT
            # =================================================
            cv2.circle(
                frame,
                (cx, cy),
                4,
                (0, 255, 255),
                -1
            )

    # ========================================================
    # EXPORT JSON
    # ========================================================
    if len(frame_data) > 0:

        output = {

            "frame": frame_count,

            "timestamp": round(
                frame_count / fps,
                3
            ),

            "vehicles": frame_data
        }

        with open(
            "output.json",
            "a",
            encoding="utf-8"
        ) as f:

            json.dump(
                output,
                f
            )

            f.write("\n")

    # ========================================================
    # SHOW
    # ========================================================
    cv2.imshow(
        "Tracking + Homography Speed",
        frame
    )

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ============================================================
# RELEASE
# ============================================================
cap.release()

cv2.destroyAllWindows()
