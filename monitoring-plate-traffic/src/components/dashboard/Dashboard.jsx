import { useState, useRef } from "react"
import "./Dashboard.css"

const Dashboard = () => {
  const canvasRef = useRef(null)
  const wsRef = useRef(null)
  const imgBitmapRef = useRef(null)

  const [detections, setDetections] = useState([])
  const [status, setStatus] = useState("idle")
  const [showModal, setShowModal] = useState(false)

  const startStream = () => {
    setDetections([])
    setStatus("streaming")

    const ws = new WebSocket("ws://localhost:8765")
    ws.binaryType = "blob"
    wsRef.current = ws

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        const data = JSON.parse(event.data)

        if (data.status === "done") {
          setStatus("done")
          return
        }

        if (data.type === "meta") {
          setDetections((prev) => {
            const updated = [...prev]
            data.detections.forEach((d) => {
              const idx = updated.findIndex((x) => x.id === d.id)
              if (idx === -1) updated.push(d)
              else updated[idx] = d
            })
            return updated
          })
        }
        return
      }

      const blob = event.data
      const bitmap = await createImageBitmap(blob)
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      ctx.drawImage(bitmap, 0, 0)

      if (imgBitmapRef.current) imgBitmapRef.current.close()
      imgBitmapRef.current = bitmap
    }

    ws.onclose = () => {
      if (status !== "done") setStatus("idle")
    }
  }

  const stopStream = () => {
    wsRef.current?.close()
    setStatus("stopped")
  }

  // Mở modal confirm trước khi End
  const confirmEnd = () => setShowModal(true)

  // Thực sự kết thúc — giữ detections để xuất CSV
  const endStream = () => {
    wsRef.current?.close()
    setStatus("idle")
    setShowModal(false)

    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext("2d")
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      canvas.width = 0
      canvas.height = 0
    }

    if (imgBitmapRef.current) {
      imgBitmapRef.current.close()
      imgBitmapRef.current = null
    }
    // Không reset detections — giữ lại để xuất CSV
  }

  const exportCSV = () => {
    if (detections.length === 0) return

    const headers = [
      "id",
      "label",
      "conf",
      "bbox_x1",
      "bbox_y1",
      "bbox_x2",
      "bbox_y2",
    ]
    const rows = detections.map((d) => [
      d.id,
      d.label,
      d.conf,
      ...(d.bbox ?? ["", "", "", ""]),
    ])

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = `detections_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isStreaming = status === "streaming"
  const isActive =
    status === "streaming" || status === "stopped" || status === "done"

  return (
    <>
      <div className="dash-root">
        {/* Header */}
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

        {/* Body */}
        <div className="dash-body">
          {/* Video + Controls */}
          <div className="video-panel">
            <div className="canvas-wrapper">
              <canvas ref={canvasRef} />
              {status === "idle" && detections.length === 0 && (
                <div className="canvas-placeholder">
                  <span className="ph-icon">⬡</span>
                  <span>Awaiting stream</span>
                </div>
              )}
            </div>

            <div className="controls">
              <button
                className="btn btn-start"
                onClick={startStream}
                disabled={isStreaming}
              >
                <span className="btn-icon">▶</span> Start
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

              {detections.length > 0 && (
                <button
                  className="btn btn-export"
                  onClick={exportCSV}
                >
                  <span className="btn-icon">↓</span> Export CSV
                </button>
              )}

              {isStreaming && (
                <div className="live-indicator">
                  <div className="live-dot" />
                  Live
                </div>
              )}
            </div>
          </div>

          {/* Detection table */}
          <div className="detect-panel">
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
                  </tr>
                </thead>
                <tbody>
                  {detections.length === 0 ? (
                    <tr className="empty-row">
                      <td colSpan={3}>
                        {isStreaming ? "Analysing..." : "No data"}
                      </td>
                    </tr>
                  ) : (
                    detections.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <span className="id-badge">#{d.id}</span>
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal confirm End */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-icon">⏹</div>
            <h3 className="modal-title">Kết thúc stream?</h3>
            <p className="modal-desc">
              Stream sẽ bị dừng. Dữ liệu detection vẫn được giữ lại và bạn có
              thể xuất CSV sau khi kết thúc.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-modal-cancel"
                onClick={() => setShowModal(false)}
              >
                Huỷ
              </button>
              <button
                className="btn btn-modal-confirm"
                onClick={endStream}
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
