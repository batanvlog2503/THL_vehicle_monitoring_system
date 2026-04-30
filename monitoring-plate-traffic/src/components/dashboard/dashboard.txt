import { useState, useRef } from "react"
import "./Dashboard.scss"
import axiosInstance from "../../utils/axiosInstance"
import axios from "axios"

const Dashboard = () => {
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  })
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type })
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    )
  }

  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)
  const wsRef = useRef(null)
  const imgBitmapRef = useRef(null)
  const detectionsRef = useRef([])
  const videoNameRef = useRef(null)
  const hasExportedRef = useRef(false) // ✅ tránh double export

  const [videoPath, setVideoPath] = useState(null)
  const [detections, setDetections] = useState([])
  const [status, setStatus] = useState("idle")
  const [showModal, setShowModal] = useState(false)
  const [speedLimit, setSpeedLimit] = useState(60)

  const getVNDateString = () => {
    const now = new Date()
    const date = now.toLocaleDateString("en-GB").replace(/\//g, "-")
    const time = now.toLocaleTimeString("en-GB").replace(/:/g, ":")
    return `${date}_${time}`
  }

  const createLog = async () => {
    try {
      const payload = {
        detections: detectionsRef.current,
        videoName: videoNameRef.current || "unknown_video",
      }
      console.log("🚀 SEND LOG API:", payload)
      const response = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/user/save-log`,
        payload,
      )
      console.log("✅ RESPONSE:", response.data)
      if (response.data.success) {
        showToast("Save log thành công", "success")
      } else {
        showToast("Save log thất bại", "error")
      }
    } catch (error) {
      console.error("❌ SAVE LOG ERROR:", error.response?.data || error.message)
      showToast("Lỗi save log", "error")
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const fileName = `ket-qua-yolo_${getVNDateString()}.csv`
    videoNameRef.current = fileName

    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await axios.post(
        "http://localhost:8000/upload",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      )
      const serverPath = response.data.path
      setVideoPath(serverPath)
      showToast("Upload video thành công", "success")
    } catch (error) {
      showToast("Upload thất bại!", "error")
      console.error(error)
    }
  }

  const startStream = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setDetections([])
    detectionsRef.current = [] // 🔥 BẮT BUỘC
    setStatus("streaming")

    const ws = new WebSocket("ws://localhost:8765")
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "start", path: videoPath }))
    }

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        const data = JSON.parse(event.data)

        if (data.status === "done") {
          setStatus("done")
          // ✅ dùng flag tránh export 2 lần
          if (detectionsRef.current.length > 0 && !hasExportedRef.current) {
            hasExportedRef.current = true
            exportCSV()
            createLog()
          }
          return
        }

        if (data.type === "meta") {
          setDetections((prev) => {
            const updated = [...prev]
            data.detections.forEach((d) => {
              const idx = updated.findIndex((x) => x.id === d.id)
              const newObj = {
                ...d,
                time: data.time,
                speed: d.speed ?? null,
                status:
                  d.speed && d.speed > speedLimit ? "violation" : "normal",
              }
              if (idx === -1) updated.push(newObj)
              else updated[idx] = newObj
            })
            detectionsRef.current = updated
            return updated
          })
        }
        return
      }

      const blob = event.data
      const bitmap = await createImageBitmap(blob)
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      context.drawImage(bitmap, 0, 0)
      if (imgBitmapRef.current) imgBitmapRef.current.close()
      imgBitmapRef.current = bitmap
    }

    ws.onclose = () => {
      console.log("WS closed")
    }
  }

  const stopStream = () => {
    wsRef.current?.send(JSON.stringify({ action: "pause" }))
    setStatus("stopped")
  }

  const resumeStream = () => {
    wsRef.current?.send(JSON.stringify({ action: "resume" }))
    setStatus("streaming")
  }

  const confirmEnd = () => {
    console.log("confirmEnd called, status:", status)
    setShowModal(true)
  }

  const endStream = () => {
    console.log("✅ endStream called")
    setShowModal(false)

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "stop" }))
      showToast("Đang dừng stream...", "success")
      // export sẽ được gọi khi onmessage nhận { status: "done" } từ backend
    } else {
      // WS đã đóng (video hết), export luôn
      setStatus("done")
      if (detectionsRef.current.length > 0 && !hasExportedRef.current) {
        hasExportedRef.current = true
        exportCSV()
        createLog()
      }
    }

    // ✅ Reset videoPath để buộc upload lại video mới, tránh reuse data cũ
    setVideoPath(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const exportCSV = () => {
    if (detectionsRef.current.length === 0) return

    const headers = [
      "id",
      "label",
      "conf",
      "time",
      "speed",
      "status",
      "bbox_x1",
      "bbox_y1",
      "bbox_x2",
      "bbox_y2",
    ]
    const rows = detectionsRef.current.map((d) => [
      d.id,
      d.label,
      d.conf,
      d.time,
      d.speed ?? "",
      d.status ?? "",
      ...(d.bbox ?? ["", "", "", ""]),
    ])

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = videoNameRef.current || `yolo_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isStreaming = status === "streaming"
  const isActive =
    status === "streaming" || status === "stopped" || status === "done"

  return (
    <>
      <div className="dash-root">
        <header className="dash-header">
          <div className="logo-dot" />
          <h1>YOLO Object Detection — Stream Dashboard</h1>
          <span className={`status-badge ${status}`}>
            {status === "streaming"
              ? "● Live"
              : status === "stopped"
                ? "⏸ Paused"
                : status === "done"
                  ? "✓ Done"
                  : "○ Idle"}
          </span>
        </header>

        {toast.show && (
          <div className={`custom-toast3 ${toast.type}`}>
            <i
              className={`fa-solid ${toast.type === "success" ? "fa-circle-check" : "fa-circle-exclamation"}`}
            ></i>
            <span>{toast.message}</span>
          </div>
        )}

        <div className="speed-limit-box">
          <label>Speed limit:</label>
          <select
            value={speedLimit}
            onChange={(e) => setSpeedLimit(Number(e.target.value))}
          >
            <option value={30}>30 km/h</option>
            <option value={40}>40 km/h</option>
            <option value={50}>50 km/h</option>
            <option value={60}>60 km/h</option>
            <option value={80}>80 km/h</option>
            <option value={100}>100 km/h</option>
          </select>
        </div>

        <div className="dash-body">
          <div className="video-panel inner-wrap-left-video">
            <div className="canvas-wrapper">
              <canvas ref={canvasRef} />
              {status === "idle" && detections.length === 0 && (
                <div className="canvas-placeholder">
                  <span className="ph-icon">⬡</span>
                  <span>Loading...</span>
                </div>
              )}
            </div>

            <div className="controls">
              <input
                type="file"
                accept="video/*"
                ref={fileInputRef}
                onChange={handleUpload}
              />

              <button
                className="btn btn-start"
                onClick={status === "stopped" ? resumeStream : startStream}
                disabled={isStreaming}
              >
                ▶ {status === "stopped" ? "Continue" : "Start"}
              </button>

              <button
                className="btn btn-stop"
                onClick={stopStream}
                disabled={!isStreaming}
              >
                <span className="btn-icon">⏸</span> Stop
              </button>

              <button
                className="btn btn-end"
                onClick={confirmEnd}
                disabled={!isActive}
              >
                <span className="btn-icon">⏹</span> End
              </button>

              <div className="controls-spacer" />

              {isStreaming && (
                <div className="live-indicator">
                  <div className="live-dot" />
                  Live
                </div>
              )}
            </div>

            <div className="controls-note text-align-left">
              <p>Lưu ý:</p>
              <ul>
                <li>Video chất lượng cao có thể làm giảm FPS.</li>
                <li>Nên dùng GPU để đạt hiệu suất tốt nhất.</li>
                <li>Không upload video quá lớn để tránh lag.</li>
                <li>Click "End" để kết thúc và xuất dữ liệu.</li>
              </ul>
            </div>
          </div>

          <div className="detect-pane inner-wrap-right-detect">
            <div className="detect-header">
              <h2>Detections</h2>
              <span className="detect-count">{detections.length}</span>
            </div>

            <div className="detect-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Class</th>
                    <th>Conf</th>
                    <th>Speed</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.length === 0 ? (
                    <tr className="empty-row">
                      <td colSpan={6}>
                        {isStreaming ? "Analysing..." : "No data"}
                      </td>
                    </tr>
                  ) : (
                    detections.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <span className="id-badge">{d.id}</span>
                        </td>
                        <td>
                          <span className="label-text">{d.label}</span>
                        </td>
                        <td>
                          <div className="conf-bar-wrap">
                            <div className="conf-bar-bg">
                              <div
                                className={`conf-bar-fill ${d.conf > 0.7 ? "high" : "low"}`}
                                style={{ width: `${d.conf * 100}%` }}
                              />
                            </div>
                            <span className="conf-val">
                              {(d.conf * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td>
                          {d.speed ? (
                            <span className="speed-val">{d.speed} km/h</span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{d.time}</td>
                        <td>
                          {d.status ? (
                            <span className={`status ${d.status}`}>
                              {d.status === "violation"
                                ? "Violation"
                                : "Normal"}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="modal-box"
            style={{
              background: "white",
              borderRadius: 12,
              padding: 28,
              minWidth: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title1">Kết thúc stream?</h3>
            <p className="modal-desc">
              Stream sẽ bị dừng. Dữ liệu detection vẫn được giữ lại và bạn có
              thể xuất CSV sau khi kết thúc.
            </p>
            <div
              className="modal-actions"
              style={{
                display: "flex",
                gap: 12,
                marginTop: 20,
                justifyContent: "flex-end",
              }}
            >
              <button
                className="btn btn-modal-cancel"
                onClick={() => setShowModal(false)}
              >
                Huỷ
              </button>
              <button
                className="btn btn-modal-confirm"
                onClick={() => {
                  console.log("✅ CONFIRM CLICKED")
                  endStream()
                }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Dashboard
