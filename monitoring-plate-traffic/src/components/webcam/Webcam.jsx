import React, { useRef, useEffect, useState, useCallback } from "react"
import "./Webcam.css"

const ZONE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
]

const generateId = () => Math.random().toString(36).substr(2, 9)

const WS_URL = "ws://localhost:8765"

// ─── Modal nhập URL ───────────────────────────────────────────────────────────
const ConnectModal = ({ zoneIndex, onConfirm, onCancel }) => {
  const [url, setUrl] = useState("")
  const [label, setLabel] = useState(`Zone ${zoneIndex + 1}`)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [])

  const presets = [
    { label: "rtsp://", value: "rtsp://" },
    { label: "http://", value: "http://" },
    { label: "CCTV", value: "rtsp://admin:password@192.168.1." },
    { label: "webcam", value: "webcam" },
  ]

  const handleKey = (e) => {
    if (e.key === "Enter") handleConfirm()
    if (e.key === "Escape") onCancel()
  }

  const handleConfirm = () => {
    if (!url.trim()) return
    onConfirm({
      url: url.trim(),
      label: label.trim() || `Zone ${zoneIndex + 1}`,
    })
  }

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
    >
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-ch">
            CH{String(zoneIndex + 1).padStart(2, "0")}
          </span>
          <h3>Connect Camera</h3>
        </div>
        <p className="modal-desc">
          Enter RTSP stream URL, HTTP stream, or type <code>webcam</code>
        </p>

        <div className="preset-row">
          {presets.map((p) => (
            <button
              key={p.label}
              className="preset-btn"
              onClick={() => setUrl(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          ref={inputRef}
          className="modal-input"
          placeholder="rtsp://192.168.1.100:554/stream"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
        />
        <input
          className="modal-input"
          placeholder={`Zone label (default: Zone ${zoneIndex + 1})`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKey}
        />

        <div className="modal-actions">
          <button
            className="btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn-connect"
            onClick={handleConfirm}
            disabled={!url.trim()}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cell camera ──────────────────────────────────────────────────────────────
const CameraCell = ({ zone, onDisconnect, onReconnect }) => {
  const canvasRef = useRef(null)
  const wsRef = useRef(null)
  const webcamStreamRef = useRef(null)
  const animRef = useRef(null)
  const [status, setStatus] = useState("connecting") // connecting | live | error | paused
  const [detections, setDetections] = useState([])
  const [fps, setFps] = useState(0)
  const fpsCountRef = useRef(0)
  const fpsTimerRef = useRef(null)

  const stopAll = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch (_) {}
      wsRef.current = null
    }
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop())
      webcamStreamRef.current = null
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
    if (fpsTimerRef.current) {
      clearInterval(fpsTimerRef.current)
      fpsTimerRef.current = null
    }
  }, [])

  // Vẽ bounding boxes lên canvas
  const drawDetections = useCallback(
    (ctx, dets, w, h) => {
      dets.forEach((d) => {
        if (!d.bbox) return
        const [x1, y1, x2, y2] = d.bbox
        const sx = w / (d.frame_w || w)
        const sy = h / (d.frame_h || h)
        const bx = x1 * sx,
          by = y1 * sy
        const bw = (x2 - x1) * sx,
          bh = (y2 - y1) * sy

        ctx.strokeStyle = zone.color
        ctx.lineWidth = 1.5
        ctx.strokeRect(bx, by, bw, bh)

        const conf = d.conf ? `${(d.conf * 100).toFixed(0)}%` : ""
        const txt = `${d.label || "obj"} ${conf}`
        ctx.font = "bold 10px 'JetBrains Mono', monospace"
        const tw = ctx.measureText(txt).width

        ctx.fillStyle = zone.color + "cc"
        ctx.fillRect(bx - 0.5, by - 16, tw + 8, 16)
        ctx.fillStyle = "#ffffff"
        ctx.fillText(txt, bx + 3, by - 4)
      })
    },
    [zone.color],
  )

  // Kết nối webcam nội bộ
  const startWebcam = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 } })
      .then((stream) => {
        webcamStreamRef.current = stream
        const video = document.createElement("video")
        video.srcObject = stream
        video.autoplay = true
        video.playsInline = true
        video.muted = true
        video.onplay = () => {
          setStatus("live")
          fpsTimerRef.current = setInterval(() => {
            setFps(fpsCountRef.current)
            fpsCountRef.current = 0
          }, 1000)
          const draw = () => {
            const ctx = cv.getContext("2d")
            cv.width = video.videoWidth || 640
            cv.height = video.videoHeight || 480
            ctx.drawImage(video, 0, 0, cv.width, cv.height)
            fpsCountRef.current++
            animRef.current = requestAnimationFrame(draw)
          }
          draw()
        }
      })
      .catch(() => setStatus("error"))
  }, [])

  // Kết nối WebSocket → backend Python
  const startWebSocket = useCallback(
    (url) => {
      const cv = canvasRef.current
      if (!cv) return

      const ws = new WebSocket(WS_URL)
      ws.binaryType = "blob"
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(
          JSON.stringify({ action: "start", path: url, zone_id: zone.id }),
        )
        setStatus("connecting")
      }

      ws.onmessage = async (event) => {
        if (typeof event.data === "string") {
          try {
            const data = JSON.parse(event.data)
            if (data.status === "done") {
              setStatus("done")
              return
            }
            if (data.type === "meta" && Array.isArray(data.detections)) {
              setDetections(data.detections)
            }
          } catch (_) {}
          return
        }

        // Binary frame (JPEG blob từ Python)
        try {
          const bitmap = await createImageBitmap(event.data)
          const ctx = cv.getContext("2d")
          cv.width = bitmap.width
          cv.height = bitmap.height
          ctx.drawImage(bitmap, 0, 0)
          drawDetections(ctx, detections, cv.width, cv.height)
          bitmap.close()
          fpsCountRef.current++
          setStatus("live")
        } catch (_) {}
      }

      ws.onerror = () => setStatus("error")
      ws.onclose = () => {
        if (status !== "done") setStatus("error")
      }

      fpsTimerRef.current = setInterval(() => {
        setFps(fpsCountRef.current)
        fpsCountRef.current = 0
      }, 1000)
    },
    [zone.id, drawDetections, detections, status],
  )

  useEffect(() => {
    if (!zone.url) return
    if (zone.url === "webcam") {
      startWebcam()
    } else {
      startWebSocket(zone.url)
    }
    return () => stopAll()
  }, [zone.url])

  // Vẽ lại bbox mỗi khi detections thay đổi (RTSP mode)
  useEffect(() => {
    if (zone.url === "webcam") return
    const cv = canvasRef.current
    if (!cv || detections.length === 0) return
    const ctx = cv.getContext("2d")
    drawDetections(ctx, detections, cv.width, cv.height)
  }, [detections, drawDetections, zone.url])

  const togglePause = () => {
    if (!wsRef.current) return
    if (status === "live") {
      wsRef.current.send(JSON.stringify({ action: "pause" }))
      setStatus("paused")
    } else if (status === "paused") {
      wsRef.current.send(JSON.stringify({ action: "resume" }))
      setStatus("live")
    }
  }

  const statusColor =
    {
      connecting: "#f59e0b",
      live: "#22c55e",
      error: "#ef4444",
      paused: "#94a3b8",
      done: "#64748b",
    }[status] || "#64748b"

  return (
    <div
      className="cam-cell active"
      style={{ "--cell-color": zone.color }}
    >
      {/* Top overlay */}
      <div className="cell-top-bar">
        <div className="cell-ch-label">
          <span
            className="cell-live-dot"
            style={{ background: statusColor }}
          />
          <span className="cell-ch-text">
            CH{String(zone.index + 1).padStart(2, "0")}
          </span>
          <span className="cell-zone-name">{zone.label}</span>
        </div>
        <div className="cell-actions">
          {(status === "live" || status === "paused") &&
            zone.url !== "webcam" && (
              <button
                className="cell-action-btn"
                onClick={togglePause}
                title={status === "live" ? "Pause" : "Resume"}
              >
                {status === "live" ? "⏸" : "▶"}
              </button>
            )}
          <button
            className="cell-action-btn danger"
            onClick={() => onDisconnect(zone.id)}
            title="Disconnect"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Canvas stream */}
      <canvas
        ref={canvasRef}
        className="cell-canvas"
      />

      {/* Connecting overlay */}
      {status === "connecting" && (
        <div className="cell-overlay">
          <div
            className="cell-spinner"
            style={{ borderTopColor: zone.color }}
          />
          <span className="cell-overlay-text">Connecting…</span>
          <span className="cell-overlay-url">{zone.url}</span>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="cell-overlay error">
          <span className="cell-error-icon">⚠</span>
          <span className="cell-overlay-text">Connection failed</span>
          <span className="cell-overlay-url">{zone.url}</span>
          <button
            className="cell-retry-btn"
            onClick={() => onReconnect(zone.id)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Paused overlay */}
      {status === "paused" && (
        <div className="cell-overlay paused">
          <span className="cell-overlay-text">⏸ Paused</span>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="cell-bottom-bar">
        <span className="cell-url-text">{zone.url}</span>
        <div className="cell-stats">
          {detections.length > 0 && (
            <span className="cell-det-count">{detections.length} obj</span>
          )}
          {status === "live" && <span className="cell-fps">{fps} fps</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Empty cell ────────────────────────────────────────────────────────────────
const EmptyCell = ({ index, onClick }) => (
  <div
    className="cam-cell empty"
    onClick={() => onClick(index)}
  >
    <span className="empty-ch">CH{String(index + 1).padStart(2, "0")}</span>
    <div className="empty-plus">+</div>
    <span className="empty-hint">Click to connect</span>
    <span className="empty-sub">RTSP · HTTP · Webcam</span>
  </div>
)

// ─── Main component ────────────────────────────────────────────────────────────
const Webcam = () => {
  const [zones, setZones] = useState({}) // { index: zone }
  const [modalIndex, setModalIndex] = useState(null)
  const [colorCursor, setColorCursor] = useState(0)

  const handleCellClick = (index) => setModalIndex(index)

  const handleConnect = useCallback(
    ({ url, label }) => {
      const index = modalIndex
      setZones((prev) => ({
        ...prev,
        [index]: {
          id: generateId(),
          index,
          url,
          label,
          color: ZONE_COLORS[colorCursor % ZONE_COLORS.length],
        },
      }))
      setColorCursor((c) => c + 1)
      setModalIndex(null)
    },
    [modalIndex, colorCursor],
  )

  const handleDisconnect = useCallback((id) => {
    setZones((prev) => {
      const next = { ...prev }
      const key = Object.keys(next).find((k) => next[k].id === id)
      if (key !== undefined) delete next[key]
      return next
    })
  }, [])

  const handleReconnect = useCallback((id) => {
    setZones((prev) => {
      const key = Object.keys(prev).find((k) => prev[k].id === id)
      if (key === undefined) return prev
      const zone = { ...prev[key], id: generateId() }
      return { ...prev, [key]: zone }
    })
  }, [])

  const activeCount = Object.keys(zones).length

  return (
    <div className="webcam-root">
      {/* Header */}
      <header className="wc-header">
        <div className="wc-header-left">
          <span className="wc-logo-dot" />
          <span className="wc-title">Camera Monitor</span>
        </div>
        <div className="wc-header-right">
          <span className="wc-badge">{activeCount} / 8 active</span>
          <span className="wc-badge muted">WS: {WS_URL}</span>
        </div>
      </header>

      {/* 8-cell grid */}
      <div className="wc-grid">
        {Array.from({ length: 8 }, (_, i) =>
          zones[i] ? (
            <CameraCell
              key={zones[i].id}
              zone={zones[i]}
              onDisconnect={handleDisconnect}
              onReconnect={handleReconnect}
            />
          ) : (
            <EmptyCell
              key={i}
              index={i}
              onClick={handleCellClick}
            />
          ),
        )}
      </div>

      {/* Modal */}
      {modalIndex !== null && (
        <ConnectModal
          zoneIndex={modalIndex}
          onConfirm={handleConnect}
          onCancel={() => setModalIndex(null)}
        />
      )}
    </div>
  )
}

export default Webcam
