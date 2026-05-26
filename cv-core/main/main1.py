import threading, asyncio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import websockets

from main.websocket.stream_ws import stream
from main.api.upload import router as upload_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)

async def ws_main():
    async with websockets.serve(stream, "0.0.0.0", 8765):
        print("WS running at ws://localhost:8765")
        await asyncio.Future()

if __name__ == "__main__":
    threading.Thread(target=lambda: asyncio.run(ws_main()), daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)