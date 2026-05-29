# THL Vehicle Monitoring System

An end-to-end AI traffic monitoring platform that detects vehicles, tracks them across video frames, estimates speed, recognizes Vietnamese license plates via OCR, flags speed violations, and presents results through a web dashboard with analytics and a rule-based chatbot.

> **Course project (TTCS1)** — Computer Vision + Web Application stack for real-world traffic analysis.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Main Features](#main-features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [OCR Pipeline](#ocr-pipeline)
- [Data & Job Workflow](#data--job-workflow)
- [Frontend Setup](#frontend-setup)
- [Backend Setup](#backend-setup)
- [CV Core Setup](#cv-core-setup)
- [Docker Setup](#docker-setup)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Folder Structure](#folder-structure)
- [Usage Guide](#usage-guide)
- [Screenshots](#screenshots)
- [Troubleshooting](#troubleshooting)
- [Team & Roadmap](#team--roadmap)

---

## Project Overview

The **THL Vehicle Monitoring System** processes traffic video (uploaded files or live streams) through a computer-vision pipeline powered by YOLO and EasyOCR. Detected vehicles receive persistent track IDs, speed estimates (via homography calibration), and license plate readings. Results are exported as annotated video and JSON, persisted in MongoDB through a Node.js API, and visualized in a React dashboard with charts, history logs, and an AI-assisted statistics chatbot.

The system is designed as three cooperating services:

| Service | Role | Default Port |
|---------|------|--------------|
| **cv-core** | Vehicle detection, tracking, speed, plate OCR | `8000` (HTTP), `8765`/`8766` (WebSocket) |
| **backend** | Auth, logs, vehicles, stats, reviews | `3000` |
| **monitoring-plate-traffic** | React SPA dashboard | `5173` (Vite dev) |

---

## Main Features

### Computer Vision
- **Vehicle detection** — YOLOv8 (Ultralytics) for Car, Motorcycle, Bus, Truck
- **Multi-object tracking** — BoT-SORT with ReID (`botsort.yaml`)
- **Speed estimation** — Homography pixel-to-meter mapping + Kalman filtering + rolling average
- **License plate recognition** — Plate YOLO + EasyOCR with Vietnamese format normalization
- **Violation detection** — Flags vehicles exceeding a configurable speed limit (default 60 km/h)
- **Batch & streaming modes** — Upload/process API and optional WebSocket live preview

### Web Application
- **User authentication** — Register, login, email verification, password reset (JWT + refresh tokens)
- **Video upload dashboard** — Upload video, set speed limit, poll job progress, view annotated output
- **Detection history** — Browse, filter, and inspect past analysis logs
- **Statistics** — Pie, bar, and line charts for vehicle types, violations, and trends
- **Vehicle analysis** — Paginated table of detections with plate and overspeed filters
- **AI chatbot** — Natural-language queries over stored detection data (rule-based intent matching)
- **Admin tools** — User management and review/survey analytics
- **CSV export** — Download detection results from the dashboard

---

## Tech Stack

### CV / AI (`cv-core`)
| Layer | Technology |
|-------|------------|
| Language | Python 3.10+ |
| Detection & tracking | [Ultralytics YOLOv8](https://docs.ultralytics.com/), BoT-SORT |
| OCR | [EasyOCR](https://github.com/JaidedAI/EasyOCR) (beam search decoder) |
| Video / geometry | OpenCV, NumPy |
| Deep learning runtime | PyTorch (CUDA optional) |
| API server | FastAPI, Uvicorn |
| Streaming | WebSockets (`websockets`) |
| Transcoding | FFmpeg (H.264) |

### Backend (`backend`)
| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB + Mongoose |
| Auth | JWT, bcrypt, refresh tokens |
| Email | Nodemailer (SMTP) |
| Templates | Express Handlebars |

### Frontend (`monitoring-plate-traffic`)
| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build tool | Vite 8 |
| Routing | React Router 7 |
| HTTP client | Axios (with token refresh interceptor) |
| UI | Bootstrap 5, SCSS |
| Charts | Chart.js, react-chartjs-2 |
| Markdown | marked |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         React Frontend (:5173)                          │
│  Dashboard │ Statistics │ Chatbot │ Logs │ Vehicles │ Auth │ Admin     │
└───────────────┬──────────────────────────────┬──────────────────────────┘
                │ REST (JWT)                   │ Upload / Poll
                ▼                              ▼
┌───────────────────────────┐    ┌────────────────────────────────────────┐
│   Node.js Backend (:3000) │    │     CV Core — FastAPI (:8000)          │
│   Auth │ Logs │ Stats      │    │  YOLO Detect → BoT-SORT Track         │
│   Reviews │ Vehicles       │    │  → Speed (Homography + Kalman)         │
└───────────────┬───────────┘    │  → Plate YOLO → EasyOCR → Normalize    │
                │                │  → Annotated MP4 + JSON                  │
                ▼                └────────────────────────────────────────┘
        ┌───────────────┐
        │   MongoDB     │
        │  users, logs  │
        └───────────────┘
```

### End-to-end data flow

1. User uploads a video on the dashboard and sets a speed limit.
2. Frontend sends `POST /process` to **cv-core**; receives a `job_id`.
3. Frontend polls `GET /status/{job_id}` until processing completes.
4. cv-core returns annotated video URL and detection JSON.
5. Frontend auto-exports CSV and calls `POST /user/save-log` on the **backend** to persist results.
6. Statistics, chatbot, and vehicle pages read aggregated data from MongoDB via the backend API.

### Optional live streaming path

The modular `cv-core/main/` package supports WebSocket streaming on port **8765** (tracking + speed) or **8766** (webcam multi-zone). The primary production dashboard (`Dashboard1`) uses the batch `/process` API instead.

---

## OCR Pipeline

License plate recognition is implemented in two forms: integrated (inside `main.py`) and standalone (`detect-plate/`).

### Integrated pipeline (`cv-core/main.py`)

```
Video Frame
    │
    ▼
Vehicle YOLO + BoT-SORT  ──►  track_id, bbox, label
    │
    ├──► Speed: bottom-center → homography → Kalman → km/h
    │
    └──► Every N frames (OCR_EVERY_N = 5):
              Plate YOLO on vehicle crop
                  │
                  ▼
              crop_plate (with padding)
                  │
                  ▼
              PlateOCR.read_plate()
                  ├── ROI refine (contour tightening)
                  ├── Deskew (Hough lines / minAreaRect)
                  ├── Grayscale + CLAHE + upscale if small
                  ├── Multi-variant OCR (CLAHE, sharpen, Otsu, adaptive threshold)
                  ├── EasyOCR beamsearch (1-line + 2-line split)
                  ├── Vietnamese format normalization (e.g. 51A-123.45)
                  └── Score filter (MIN_SCORE_ACCEPT = 3.5)
                  │
                  ▼
              PlateCache — majority vote per track_id
                  │
                  ▼
              Final plate text bound to vehicle ID
```

### Standalone offline pipeline (`cv-core/detect-plate/`)

Three-pass batch processing for plate-only analysis:

| Pass | Description | Output |
|------|-------------|--------|
| **Pass 1** | Plate YOLO + custom IoU tracker + periodic OCR | `raw_ocr_results.csv` |
| **Pass 2** | Majority vote per track, bbox interpolation | `filled_ocr_results.csv` |
| **Pass 3** | Render annotated video | `result_video*.mp4` |

Key modules: `detect-plate/main/pipeline.py`, `ocr_engine.py`, `detector.py`, `tracker.py`.

---

## Data & Job Workflow

> **Note:** This project does **not** currently use Apache Kafka or any external message broker. Processing uses in-process job queues and background threads. The workflow below describes the actual implementation and a suggested path if you want to add Kafka later.

### Current async job workflow

```
Client                    cv-core (FastAPI)                Worker Thread
  │                              │                                │
  │── POST /process (video) ────►│                                │
  │◄── { job_id } ───────────────│                                │
  │                              │── spawn thread ───────────────►│
  │                              │   jobs[job_id] = "queued"      │ process_video()
  │── GET /status/{job_id} ─────►│                                │  ├─ frame loop
  │◄── { progress, status } ─────│◄── update jobs dict ───────────│  ├─ YOLO + track
  │     (poll every ~1.5s)       │                                │  ├─ speed + OCR
  │                              │                                │  └─ write MP4 + JSON
  │── GET /status/{job_id} ─────►│                                │
  │◄── { status: "done", urls } ─│                                │
  │                              │                                │
  │── POST /user/save-log ───────────────────────────────────────► Node backend → MongoDB
```

### Suggested Kafka integration (future)

For horizontal scaling or decoupled microservices, a typical extension would be:

| Topic | Producer | Consumer | Payload |
|-------|----------|----------|---------|
| `video.jobs` | Backend or Frontend | cv-core worker | `{ job_id, video_path, speed_limit }` |
| `video.progress` | cv-core worker | Frontend (SSE/WebSocket gateway) | `{ job_id, progress, status }` |
| `video.results` | cv-core worker | Backend | `{ job_id, detections, summary, urls }` |

This is **not implemented** in the current codebase.

---

## Frontend Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Steps

```bash
cd monitoring-plate-traffic
npm install
```

Create `.env`:

```env
VITE_APP_URL=http://localhost:3000
```

Start the dev server:

```bash
npm run dev
```

The app runs at **http://localhost:5173** by default.

### Build for production

```bash
npm run build
npm run preview
```

### Key routes

| Path | Page |
|------|------|
| `/` | Landing page |
| `/login`, `/signup`, `/forgot-password` | Authentication |
| `/main` | Video upload & analysis dashboard |
| `/main/statistic` | Charts and KPIs |
| `/main/chatbot` | AI statistics assistant |
| `/main/log`, `/main/log/:id` | Detection history |
| `/main/vehicle` | Vehicle/plate table |
| `/main/user` | Admin user management |
| `/main/review` | Admin review dashboard |
| `/main/webcam` | Live WebSocket stream (optional) |

---

## Backend Setup

### Prerequisites
- Node.js 18+
- MongoDB 6+ (local or Atlas)

### Steps

```bash
cd backend
npm install
```

Create `.env` in the `backend/` directory (see [Environment Variables](#environment-variables)).

Start the server:

```bash
npm start
```

The API listens on **http://localhost:3000**.

---

## CV Core Setup

### Prerequisites
- Python 3.10+
- CUDA-capable GPU (recommended for real-time processing)
- FFmpeg installed and on PATH
- Trained YOLO weights (vehicle + plate models)

### Install Python dependencies

The repository `cv-core/requirements.txt` is currently empty. Install inferred dependencies:

```bash
cd cv-core
pip install opencv-python numpy torch ultralytics easyocr fastapi uvicorn python-multipart websockets
```

### Configure model paths

Edit hardcoded paths at the top of `cv-core/main.py`:

```python
VEHICLE_MODEL_PATH  = r"path/to/vehicle_model/weights/best.pt"
PLATE_MODEL_PATH    = r"path/to/plate_model/weights/best.pt"
TRACKER_CONFIG      = r"path/to/botsort.yaml"
```

Also update the FFmpeg path in the `/process` endpoint if not on Windows.

### Start the CV API

```bash
cd cv-core
python main.py
```

Service available at **http://localhost:8000**.

Verify health:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{ "status": "ok", "device": "cuda", "ocr": "easyocr-beamsearch" }
```

### Alternative entry points

| Script | Purpose |
|--------|---------|
| `main.py` | **Primary** — full pipeline (detect + track + speed + OCR) |
| `streamspeedocr.py` | Same API, different OCR scheduling strategy |
| `main/main1.py` | Upload + WebSocket tracking (no full LPR) |
| `main/streamspeed.py` | WebSocket with speed overlay |
| `detect-plate/main/main.py` | Offline plate-only CLI pipeline |

---

## Docker Setup

There is **no Docker Compose file** for the full stack in this repository. Services are intended to run locally during development.

### Manual multi-service startup

Open three terminals:

```bash
# Terminal 1 — MongoDB (if not running as a service)
mongod

# Terminal 2 — Backend
cd backend && npm start

# Terminal 3 — CV Core
cd cv-core && python main.py

# Terminal 4 — Frontend
cd monitoring-plate-traffic && npm run dev
```

### Optional Docker Compose (reference)

You can containerize the stack yourself. Example skeleton:

```yaml
# docker-compose.yml (not included — create at project root if needed)
services:
  mongodb:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: ["mongo_data:/data/db"]

  backend:
    build: ./backend
    ports: ["3000:3000"]
    env_file: ./backend/.env
    depends_on: [mongodb]

  cv-core:
    build: ./cv-core
    ports: ["8000:8000"]
    # GPU: deploy.resources.reservations.devices for NVIDIA runtime

  frontend:
    build: ./monitoring-plate-traffic
    ports: ["5173:5173"]
    environment:
      VITE_APP_URL: http://localhost:3000

volumes:
  mongo_data:
```

> Dockerfiles for `backend`, `cv-core`, and `frontend` are not provided. The only Docker artifact in the repo is `cv-core/GitNexus/gitnexus/Dockerfile.test`, which belongs to an unrelated GitNexus subproject.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URL` | Yes | MongoDB connection string (e.g. `mongodb://localhost:27017/AI_traffic`) |
| `ACCESS_TOKEN_SECRET` | Yes | Secret for signing JWT access tokens |
| `REFRESH_TOKEN_SECRET` | Yes | Secret for signing JWT refresh tokens |
| `APP_URL` | Yes | Public URL for email verification/reset links |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP port (e.g. `587`) |
| `SMTP_MAIL` | Yes | SMTP username / sender address |
| `SMTP_PASSWORD` | Yes | SMTP password |
| `NODE_ENV` | No | Set to `development` to include stack traces in errors |

### Frontend (`monitoring-plate-traffic/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_APP_URL` | Yes | Backend API base URL (e.g. `http://localhost:3000`) |

> The CV service URL (`http://localhost:8000`) is currently hardcoded in `Dashboard1.jsx`. Consider moving it to `VITE_CV_URL` for easier deployment.

### CV Core (`cv-core/main.py`)

Configuration is code-based (not env-file driven):

| Setting | Default | Description |
|---------|---------|-------------|
| `VEHICLE_MODEL_PATH` | — | Path to vehicle YOLO weights |
| `PLATE_MODEL_PATH` | — | Path to plate YOLO weights |
| `TRACKER_CONFIG` | `botsort.yaml` | BoT-SORT tracker config |
| `OCR_EVERY_N` | `5` | Run OCR every N frames per vehicle |
| `SPEED_LIMIT_DEFAULT` | `60` | Default speed limit (km/h) |
| `MIN_SCORE_ACCEPT` | `3.5` | Minimum OCR confidence score |

---

## API Endpoints

### CV Core — `http://localhost:8000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/process` | Upload video (`file`) + optional `speed_limit`; returns `{ job_id }` |
| `GET` | `/status/{job_id}` | Job status, progress, video/result URLs |
| `DELETE` | `/job/{job_id}` | Delete job and output files |
| `GET` | `/health` | Service health, device, OCR engine info |
| `GET` | `/outputs/{job_id}.mp4` | Annotated result video (static) |
| `GET` | `/outputs/{job_id}.json` | Detection JSON (static) |

**Detection JSON structure:**

```json
{
  "detections_all": [
    {
      "frame": 120,
      "time": "00:00:04",
      "id": 3,
      "label": "Car",
      "conf": 0.91,
      "speed": 72.5,
      "plate": "51A-123.45",
      "status": "violation",
      "bbox": [100, 200, 300, 400]
    }
  ],
  "summary": [],
  "total_vehicles": 12,
  "violations": 2
}
```

### Backend — `http://localhost:3000`

#### Authentication (`/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | No | Login, returns tokens |
| `POST` | `/auth/register` | No | Register new user |
| `GET` | `/auth/mail-verification` | No | Verify email (`?id=`) |
| `POST` | `/auth/send-mail-verification` | No | Resend verification email |
| `POST` | `/auth/forgot-password` | No | Request password reset |
| `GET` | `/auth/reset-password` | No | Render reset form (`?token=`) |
| `POST` | `/auth/update-password` | No | Update password |

#### Users & Logs (`/user`)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `POST` | `/user/refresh-token` | No | — | Refresh access token |
| `POST` | `/user/logout` | Yes | user, admin | Invalidate refresh token |
| `POST` | `/user/save-log` | Yes | user, admin | Save CV detection results |
| `GET` | `/user/me/logs` | Yes | user, admin | Current user's logs |
| `GET` | `/user/logs/:id` | Yes | user, admin | Single log detail |
| `GET` | `/user/logs` | Yes | user, admin | Filter logs (`?date=`, `?keyword=`) |
| `GET` | `/user/admin/users` | Yes | admin | List all users |
| `GET` | `/user/admin/users/:id` | Yes | admin | Get user by ID |
| `GET` | `/user/vehicles` | Yes | user, admin | Paginated detections (`?page=`, `?limit=`, `?plate=`, `?overspeed=`) |

#### Chatbot (`/chat`, `/stats`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/chat/query` | No | Rule-based chatbot (legacy, keyword matching) |
| `POST` | `/stats/chatbot/query` | Yes | Intent-based chatbot with MongoDB aggregations |
| `GET` | `/stats/chatbot/test` | Yes | Chatbot health check |

#### Reviews (`/reviews`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/reviews` | Yes | Submit user review/survey |
| `PUT` | `/reviews/:id` | Yes | Update own review |
| `GET` | `/reviews/me` | Yes | Get own review |
| `GET` | `/reviews` | Yes | List all reviews (paginated) |
| `GET` | `/reviews/stats` | Yes | Aggregate review statistics |

---

## Folder Structure

```
THL_vehicle_monitoring_system/
├── README.md                          # This file
├── roadmap.txt                        # Project progress timeline
│
├── cv-core/                           # Computer vision & AI pipeline
│   ├── main.py                        # Primary FastAPI app (full pipeline)
│   ├── streamspeedocr.py              # Alternate API variant
│   ├── botsort.yaml                   # BoT-SORT tracker configuration
│   ├── requirements.txt               # Python dependencies (populate before use)
│   ├── uploads/                       # Temporary uploaded videos
│   ├── outputs/                       # Processed MP4 + JSON results
│   ├── runs/                          # YOLO training artifacts
│   ├── backup/                        # Backed-up model weights
│   │
│   ├── main/                          # Modular streaming backend
│   │   ├── main1.py                   # FastAPI + WebSocket entry
│   │   ├── api/upload.py              # Video upload endpoint
│   │   ├── model/yolo_model.py        # YOLO model wrapper
│   │   ├── services/tracking_service.py
│   │   ├── websocket/stream_ws.py     # WebSocket frame streaming
│   │   ├── streamspeed.py             # Speed-enabled streaming
│   │   └── webcam.py                  # Webcam multi-zone stream
│   │
│   ├── detect-plate/                  # Standalone LPR pipeline
│   │   ├── main/
│   │   │   ├── main.py                # CLI entry point
│   │   │   ├── pipeline.py            # 3-pass processing
│   │   │   ├── ocr_engine.py          # EasyOCR wrapper
│   │   │   ├── detector.py            # Plate YOLO detector
│   │   │   ├── tracker.py             # Custom IoU tracker
│   │   │   └── config.py              # Paths and thresholds
│   │   └── easyOCR.py                 # Monolithic LPR experiment script
│   │
│   └── GitNexus/                      # Unrelated code-intelligence tool (ignore)
│
├── backend/                           # Node.js REST API
│   ├── package.json
│   ├── nodemon.json
│   └── src/
│       ├── index.js                   # Express entry point (port 3000)
│       ├── config/db/                 # MongoDB connection
│       ├── routes/                    # Route definitions
│       │   ├── auth.js
│       │   ├── user.js
│       │   ├── chat.js
│       │   ├── stats.js
│       │   └── review.js
│       ├── app/
│       │   ├── controllers/           # Request handlers
│       │   ├── middlewares/           # Auth, authorization, errors
│       │   └── models/                # Mongoose schemas (User, Log, Review, …)
│       ├── helpers/                   # Mailer, validation
│       └── resources/views/           # Handlebars email templates
│
└── monitoring-plate-traffic/          # React frontend
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx                    # Router configuration
        ├── utils/axiosInstance.js     # HTTP client + token refresh
        ├── auth/                      # Login, signup, forgot password
        ├── layouts/                   # MainLayout, Main shell
        ├── pages/                     # Navbar, sidebar, survey modal
        └── components/
            ├── dashboard/Dashboard1.jsx   # Primary upload dashboard
            ├── statistics/Statistic.jsx
            ├── chatbot/Chatbot1.jsx
            ├── log/                   # History list & detail
            ├── vehicles/Vehicle.jsx
            ├── webcam/Webcam.jsx
            ├── user/User.jsx
            └── review/                # Review & admin review
```

---

## Usage Guide

### 1. Start all services

Ensure MongoDB is running, then start backend, cv-core, and frontend (see [Docker Setup](#docker-setup) for the terminal commands).

### 2. Register and log in

1. Open **http://localhost:5173**
2. Click **Get Started** → **Sign Up**
3. Verify your email (requires SMTP configuration)
4. Log in with your credentials

### 3. Analyze a traffic video

1. Navigate to **Dashboard** (`/main`)
2. Select an MP4 video file
3. Set the speed limit (30–100 km/h)
4. Click **Upload & Analyze**
5. Wait for processing (progress bar polls cv-core status)
6. View the annotated video, detection table, and summary
7. Results are auto-saved to MongoDB; use **Export CSV** for offline analysis

### 4. Explore results

| Action | Where |
|--------|-------|
| View charts | **Statistics** (`/main/statistic`) |
| Ask questions | **AI Chatbot** (`/main/chatbot`) — e.g. *"Có bao nhiêu xe vượt tốc?"* |
| Browse history | **History** (`/main/log`) |
| Filter by plate | **Vehicle Analysis** (`/main/vehicle`) |

### 5. Admin tasks

Log in as an **admin** user to access **Users** and **Review** pages in the sidebar.

---

## Screenshots

> Place screenshots in a `docs/screenshots/` folder and update the paths below.

| Screenshot | Description |
|------------|-------------|
| `docs/screenshots/dashboard.png` | Video upload and live processing dashboard |
| `docs/screenshots/result-video.png` | Annotated output with bounding boxes, speed, and plates |
| `docs/screenshots/statistics.png` | Charts — vehicle types, violations, trends |
| `docs/screenshots/chatbot.png` | AI chatbot answering traffic statistics questions |
| `docs/screenshots/log-history.png` | Detection history with filters |
| `docs/screenshots/landing.png` | Landing page |

**Placeholder** — add your own captures after running the system locally.

---

## Troubleshooting

### CV Core

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| `FileNotFoundError` for model weights | Hardcoded Windows paths in `main.py` | Update `VEHICLE_MODEL_PATH`, `PLATE_MODEL_PATH`, `TRACKER_CONFIG` |
| FFmpeg not found | Hardcoded FFmpeg path | Install FFmpeg and update `FFMPEG_PATH` in `main.py`, or add FFmpeg to system PATH |
| Slow processing | CPU-only inference | Install CUDA + GPU PyTorch; verify `/health` reports `"device": "cuda"` |
| Empty plate readings | OCR interval too sparse or low plate confidence | Lower `OCR_EVERY_N`, check plate model quality, ensure plate is visible in frame |
| Job stuck at 0% | Thread crash during processing | Check cv-core terminal logs; verify video codec compatibility |

### Backend

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| `Cannot connect to MongoDB` | MongoDB not running or wrong URL | Start MongoDB; verify `MONGO_URL` in `.env` |
| Email verification fails | SMTP misconfigured | Check `SMTP_*` variables; use a test SMTP service (e.g. Mailtrap) |
| `401 Unauthorized` on API calls | Expired or missing token | Log in again; check axios refresh-token flow |
| Server crash on startup | Missing `helpers.js` import | Create `backend/src/helpers/helpers.js` or remove the import in `index.js` |

### Frontend

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| API calls fail | Backend not running | Start backend on port 3000; verify `VITE_APP_URL` |
| Upload fails | cv-core not running | Start `python main.py` on port 8000 |
| CORS errors | Cross-origin mismatch | cv-core enables CORS for all origins; ensure URLs match |
| Blank charts | No saved logs | Run at least one video analysis and save the log |

### General

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| Port already in use | Another process on 3000/8000/5173 | Stop conflicting process or change the port |
| Webcam stream not working | WebSocket server not started | Run `main/main1.py` or `webcam.py`; check ports 8765/8766 |
| Chatbot returns empty data | No logs for current user | Analyze and save at least one video while logged in |

---

## Team & Roadmap

| Member | Responsibility |
|--------|----------------|
| **Đỗ Quang Huân** | CV Core — YOLO detection, BoT-SORT tracking, speed calculation |
| **Phạm Ngọc Linh** | License plate detection, OCR pipeline, violation logic |
| **Phạm Thanh Tân** | Web frontend, Node.js backend, dashboard, chatbot |

See [`roadmap.txt`](roadmap.txt) for the full weekly progress timeline (Weeks 1–8).

### Planned pipeline (demo-ready)

```
Video / Webcam → Vehicle Detection → Tracking → Speed Calculation
    → Plate Recognition → Violation Detection → Web Dashboard → Chatbot AI
```

---

## License

ISC (backend). See individual subproject `package.json` files for details.
