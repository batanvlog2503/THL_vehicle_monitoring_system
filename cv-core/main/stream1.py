import cv2, json, asyncio, websockets, time
import torch
from ultralytics import YOLO

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil, os, uuid, threading, uvicorn

# ===== 1. INIT GPU & MODEL (Load 1 lần duy nhất) =====
device = "cuda" if torch.cuda.is_available() else "cpu"
print("Using device:", device)

tracking_model = YOLO(r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt").to(device)
tracking_model.fuse()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

video_states = {}


@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.mp4")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    print("Uploaded:", file_path)
    return {"path": file_path}


def format_time(ms):
    total_seconds = int(ms / 1000)
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    return f"{h:02}:{m:02}:{s:02}"


# ===== 2. WEBSOCKET LOGIC =====
async def stream(websocket):
    print("Client kết nối!")
    client_id = id(websocket)

    video_states[client_id] = {
        "cap": None,
        "paused": False,
        "path": None,
        "start_wall_time": 0,
        "start_video_ms": 0
    }
    state = video_states[client_id]

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.recv(), timeout=0.001)
                data = json.loads(msg)
                action = data.get("action")

                if action == "start":
                    state["path"] = data.get("path")
                    if state["cap"]: state["cap"].release()

                    state["cap"] = cv2.VideoCapture(state["path"])
                    state["paused"] = False
                    state["start_wall_time"] = time.time()
                    state["start_video_ms"] = 0
                    print("Start video:", state["path"])

                elif action == "pause":
                    state["paused"] = True
                    print("Paused")

                elif action == "resume":
                    curr_ms = state["cap"].get(cv2.CAP_PROP_POS_MSEC)
                    state["start_wall_time"] = time.time()
                    state["start_video_ms"] = curr_ms
                    state["paused"] = False
                    print("Resumed")

                elif action == "stop":
                    break
            except (asyncio.TimeoutError, json.JSONDecodeError):
                pass

            if state["cap"] is None or state["paused"]:
                await asyncio.sleep(0.05)
                continue

            cap = state["cap"]
            target_fps = cap.get(cv2.CAP_PROP_FPS) or 30
            expected_video_ms = (time.time() - state["start_wall_time"]) * 1000 + state["start_video_ms"]

            ret, frame = cap.read()
            if not ret:
                await websocket.send(json.dumps({"status": "done"}))
                break

            current_video_ms = cap.get(cv2.CAP_PROP_POS_MSEC)

            if current_video_ms < expected_video_ms - (1000 / target_fps):
                while current_video_ms < expected_video_ms:
                    cap.grab()
                    current_video_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                ret, frame = cap.retrieve()
                if not ret: break

            frame_resized = cv2.resize(frame, (640, 360))

            results = tracking_model.track(
                frame_resized,
                conf=0.3,
                persist=True,
                device=device,
                verbose=False,
                tracker=r"D:\cv-core\botsort.yaml",
                imgsz=480
            )

            r = results[0]
            frame_plot = r.plot()

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

            _, buffer = cv2.imencode('.jpg', frame_plot, [cv2.IMWRITE_JPEG_QUALITY, 80])

            await websocket.send(json.dumps({
                "type": "meta",
                "time": format_time(current_video_ms),
                "time_ms": int(current_video_ms),
                "detections": detections
            }))
            await websocket.send(buffer.tobytes())

            elapsed_after_ai = (time.time() - state["start_wall_time"]) * 1000 + state["start_video_ms"]
            wait_time = (current_video_ms - elapsed_after_ai) / 1000
            if wait_time > 0:
                await asyncio.sleep(wait_time)

    except websockets.exceptions.ConnectionClosed:
        print("Client ngắt kết nối")
    except Exception as e:
        print(f"Lỗi hệ thống: {e}")
    finally:
        if state["cap"]: state["cap"].release()
        video_states.pop(client_id, None)
        print("Cleaned client")


# ===== RUN SERVER =====
async def ws_main():
    async with websockets.serve(stream, "0.0.0.0", 8765, max_size=None):
        print("WS chạy tại ws://localhost:8765")
        await asyncio.Future()


if __name__ == "__main__":
    threading.Thread(target=lambda: asyncio.run(ws_main()), daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)