import asyncio, json, time, cv2, websockets
from services.tracking_service import run_tracking
from utils.time_utils import format_time

video_states = {}

async def stream(websocket):
    print("Client connected")
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
                    if state["cap"]:
                        state["cap"].release()

                    state["cap"] = cv2.VideoCapture(state["path"])
                    state["paused"] = False
                    state["start_wall_time"] = time.time()
                    state["start_video_ms"] = 0

                elif action == "pause":
                    state["paused"] = True

                elif action == "resume":
                    curr_ms = state["cap"].get(cv2.CAP_PROP_POS_MSEC)
                    state["start_wall_time"] = time.time()
                    state["start_video_ms"] = curr_ms
                    state["paused"] = False

                elif action == "stop":
                    break

            except:
                pass

            if state["cap"] is None or state["paused"]:
                await asyncio.sleep(0.05)
                continue

            cap = state["cap"]
            target_fps = cap.get(cv2.CAP_PROP_FPS) or 30

            expected_video_ms = (
                (time.time() - state["start_wall_time"]) * 1000
                + state["start_video_ms"]
            )

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
                if not ret:
                    break

            frame_plot, detections = run_tracking(frame)

            _, buffer = cv2.imencode('.jpg', frame_plot, [cv2.IMWRITE_JPEG_QUALITY, 80])

            await websocket.send(json.dumps({
                "type": "meta",
                "time": format_time(current_video_ms),
                "time_ms": int(current_video_ms),
                "detections": detections
            }))

            await websocket.send(buffer.tobytes())

            elapsed_after_ai = (
                (time.time() - state["start_wall_time"]) * 1000
                + state["start_video_ms"]
            )

            wait_time = (current_video_ms - elapsed_after_ai) / 1000
            if wait_time > 0:
                await asyncio.sleep(wait_time)

    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")
    finally:
        if state["cap"]:
            state["cap"].release()
        video_states.pop(client_id, None)