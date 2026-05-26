# webcam_server.py
import cv2
import json
import asyncio
import websockets
import torch
import numpy as np
from ultralytics import YOLO
from collections import defaultdict

# ================= INIT =================
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

model = YOLO(r"D:\cv-core\backup\vehicle_model_v23\weights\best.pt").to(device)
model.fuse()
print("Model loaded ✓")

# ================= STATE =================
def create_state():
    return {
        "frame_count": 0,
    }

# ================= PROCESS FRAME =================
def process_frame(frame, state):
    state["frame_count"] += 1

    results = model.track(
        frame,
        persist=True,
        conf=0.5,
        tracker=r"D:\cv-core\botsort.yaml",
        device=device,
        verbose=False,
        imgsz=640,
    )

    r          = results[0]
    frame_plot = r.plot()
    detections = []

    if r.boxes.id is not None:
        ids     = r.boxes.id.cpu().numpy().astype(int)
        classes = r.boxes.cls.cpu().numpy().astype(int)
        confs   = r.boxes.conf.cpu().numpy()
        bboxes  = r.boxes.xyxy.cpu().numpy()

        for obj_id, cls, conf, bbox in zip(ids, classes, confs, bboxes):
            detections.append({
                "id":      int(obj_id),
                "label":   model.names[cls],
                "conf":    round(float(conf), 2),
                "bbox":    [round(float(v), 1) for v in bbox],
                "frame_w": frame.shape[1],
                "frame_h": frame.shape[0],
            })

    return frame_plot, detections

# ================= HANDLER =================
async def handle_client(websocket):
    addr = websocket.remote_address
    print(f"[+] Connected: {addr}")
    state = create_state()

    try:
        # Handshake
        first = await asyncio.wait_for(websocket.recv(), timeout=10.0)
        data  = json.loads(first)
        if data.get("action") != "start_webcam":
            await websocket.send(json.dumps({"error": "Expected start_webcam"}))
            return

        print(f"    zone_id={data.get('zone_id', '?')}")
        await websocket.send(json.dumps({"status": "ready"}))

        # Nhận frame liên tục
        async for message in websocket:

            # Lệnh stop
            if isinstance(message, str):
                try:
                    cmd = json.loads(message)
                    if cmd.get("action") in ("stop_webcam", "stop"):
                        break
                except Exception:
                    pass
                continue

            # Decode JPEG frame từ browser
            arr   = np.frombuffer(message, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                continue

            frame = cv2.resize(frame, (640, 360))

            # YOLO detect
            frame_plot, detections = process_frame(frame, state)

            # Gửi meta
            await websocket.send(json.dumps({
                "type":       "meta",
                "detections": detections,
            }))

            # Gửi frame annotated
            _, buf = cv2.imencode(".jpg", frame_plot, [cv2.IMWRITE_JPEG_QUALITY, 85])
            await websocket.send(buf.tobytes())

    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print(f"[x] Disconnected: {addr}  frames={state['frame_count']}")

# ================= RUN =================
async def main():
    async with websockets.serve(
        handle_client,
        "0.0.0.0",
        8766,
        max_size=None,
        ping_interval=20,
        ping_timeout=60,
    ):
        print("WS ready: ws://localhost:8766")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())