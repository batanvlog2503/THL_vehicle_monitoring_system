import cv2, json, asyncio, websockets, time
import torch
import numpy as np
from ultralytics import YOLO
from collections import defaultdict

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil, os, uuid, threading, uvicorn

# ═══════════════════════════════════════════════════════════════
# CẤU HÌNH ĐƯỜNG DẪN MODEL
# ═══════════════════════════════════════════════════════════════
VEHICLE_MODEL_PATH = r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt"


# ================= KALMAN FILTER CHO TỐC ĐỘ =================
class KalmanSpeed:
    def __init__(self):
        self.kf = cv2.KalmanFilter(2, 1)
        self.kf.measurementMatrix = np.array([[1, 0]], np.float32)
        self.kf.transitionMatrix = np.array([[1, 1], [0, 1]], np.float32)
        self.kf.processNoiseCov = np.eye(2, dtype=np.float32) * 0.05
        self.kf.measurementNoiseCov = np.array([[4]], np.float32)
        self.kf.errorCovPost = np.eye(2, dtype=np.float32)
        self.ready = False

    def update(self, raw):
        if not self.ready:
            self.kf.statePost = np.array([[raw], [0]], np.float32)
            self.ready = True
        self.kf.predict()
        out = self.kf.correct(np.array([[raw]], np.float32))
        return max(0.0, float(out.squeeze()[0]))


def create_state():
    return {
        "cap": None,
        "paused": False,
        "path": None,
        "start_wall_time": 0,
        "start_video_ms": 0,
        "stop_requested": False,
        "prev_world": {},
        "kalman_map": defaultdict(KalmanSpeed),
        "speed_hist": defaultdict(list),
        "frame_count": 0
    }


# ================= KHỞI TẠO =================
device = "cuda" if torch.cuda.is_available() else "cpu"
print("Using device:", device)

model = YOLO(VEHICLE_MODEL_PATH).to(device)
model.fuse()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

video_states = {}

# ================= HOMOGRAPHY (CHUYỂN ĐỔI TỌA ĐỘ) =================
SRC_PTS = np.float32([[180, 200], [460, 200], [580, 500], [60, 500]])
DST_PTS = np.float32([[0, 0], [10, 0], [10, 15], [0, 15]])
H, _ = cv2.findHomography(SRC_PTS, DST_PTS)


def pixel_to_world(px, py):
    pt = np.array([[[float(px), float(py)]]], dtype=np.float32)
    out = cv2.perspectiveTransform(pt, H)
    return float(out[0][0][0]), float(out[0][0][1])


def format_time(ms):
    total_seconds = int(ms / 1000)
    h, m, s = total_seconds // 3600, (total_seconds % 3600) // 60, total_seconds % 60
    return f"{h:02}:{m:02}:{s:02}"


# ================= API UPLOAD =================
@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"path": path}


# ================= WEBSOCKET STREAMING =================
async def stream(websocket):
    client_id = id(websocket)
    video_states[client_id] = create_state()
    state = video_states[client_id]

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.recv(), timeout=0.01)
                data = json.loads(msg)
                action = data.get("action")
                if action == "start":
                    path = data.get("path")
                    if state["cap"]: state["cap"].release()
                    video_states[client_id] = create_state()
                    state = video_states[client_id]
                    state["cap"] = cv2.VideoCapture(path)
                    state["path"] = path
                elif action == "pause":
                    state["paused"] = True
                elif action == "resume":
                    state["paused"] = False
                elif action == "stop":
                    state["stop_requested"] = True
            except asyncio.TimeoutError:
                pass

            if state.get("stop_requested"):
                if state["cap"]: state["cap"].release()
                await websocket.send(json.dumps({"status": "done", "message": "stopped"}))
                break

            if state["cap"] is None or state["paused"]:
                await asyncio.sleep(0.05)
                continue

            ret, frame = state["cap"].read()
            if not ret:
                await websocket.send(json.dumps({"status": "done", "message": "finished"}))
                break

            state["frame_count"] += 1
            fps = state["cap"].get(cv2.CAP_PROP_FPS) or 30

            results = model.track(frame, persist=True, conf=0.5, tracker=r"D:\cv-core\botsort.yaml", device=device,
                                  verbose=False)

            r = results[0]
            # Vẽ khung sạch (labels=False để bỏ bus/motorcycle)
            frame_plot = r.plot(labels=False, conf=False)
            detections = []

            if r.boxes.id is not None:
                ids = r.boxes.id.cpu().numpy().astype(int)
                bboxes = r.boxes.xyxy.cpu().numpy()
                classes = r.boxes.cls.cpu().numpy().astype(int)
                confs = r.boxes.conf.cpu().numpy()

                for tid, bbox, cls, conf in zip(ids, bboxes, classes, confs):
                    x1, y1, x2, y2 = map(int, bbox)
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    wx, wy = pixel_to_world(cx, cy)

                    # --- LOGIC TỐC ĐỘ ---
                    speed = None
                    if tid in state["prev_world"]:
                        pwx, pwy, pf = state["prev_world"][tid]
                        df = state["frame_count"] - pf
                        if df >= 3:
                            dist = ((wx - pwx) ** 2 + (wy - pwy) ** 2) ** 0.5
                            if dist > 0.01:
                                raw_spd = (dist / (df / fps)) * 3.6
                                if 0 < raw_spd < 150:
                                    f_spd = state["kalman_map"][tid].update(raw_spd)
                                    state["speed_hist"][tid].append(f_spd)
                                    if len(state["speed_hist"][tid]) > 10: state["speed_hist"][tid].pop(0)
                            state["prev_world"][tid] = (wx, wy, state["frame_count"])
                    else:
                        state["prev_world"][tid] = (wx, wy, state["frame_count"])

                    if state["speed_hist"][tid]:
                        speed = sum(state["speed_hist"][tid]) / len(state["speed_hist"][tid])

                    # --- VẼ ĐÈ LÊN FRAME ---
                    # 1. Vẽ ID phía trên
                    cv2.putText(frame_plot, f"ID: {tid}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

                    # 2. Vẽ Speed phía dưới
                    if speed:
                        spd_txt = f"{speed:.1f} km/h"
                        ty = y2 + 20 if y2 + 20 < frame_plot.shape[0] else y2 - 5
                        cv2.putText(frame_plot, spd_txt, (x1, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

                    detections.append({
                        "id": int(tid), "label": model.names[int(cls)],
                        "conf": float(conf), "bbox": bbox.tolist(), "speed": round(speed, 1) if speed else None
                    })

            # Gửi dữ liệu
            _, buffer = cv2.imencode('.jpg', frame_plot, [cv2.IMWRITE_JPEG_QUALITY, 90])
            await websocket.send(json.dumps({
                "type": "meta",
                "time": format_time(state["cap"].get(cv2.CAP_PROP_POS_MSEC)),
                "detections": detections
            }))
            await websocket.send(buffer.tobytes())

    except Exception as e:
        print("Stream Error:", e)
    finally:
        if state["cap"]: state["cap"].release()
        video_states.pop(client_id, None)


async def ws_main():
    async with websockets.serve(stream, "0.0.0.0", 8765, max_size=None):
        await asyncio.Future()


if __name__ == "__main__":
    threading.Thread(target=lambda: asyncio.run(ws_main()), daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)