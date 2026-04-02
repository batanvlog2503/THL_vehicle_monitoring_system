import { useState, useRef } from "react"
import "./Dashboard.css"
import axiosInstance from "../../utils/axiosInstance"
import axios from "axios"

// Upload video lên backend (Python)
// Stream video + nhận detection qua WebSocket
// Hiển thị video + bounding box (canvas)
// Lưu + export dữ liệu detection (CSV + API)
const Dashboard = () => {
  // giữ input đầu vào
  const fileInputRef = useRef(null)
  const canvasRef = useRef(null) // canvas vẽ video
  const wsRef = useRef(null) // websocket connection
  const imgBitmapRef = useRef(null) // lấy fram hiện tại
  const detectionsRef = useRef([]) // lưu detection RealTime
  const videoNameRef = useRef(null) // ten file CSV
  const [videoPath, setVideoPath] = useState(null)
  const [detections, setDetections] = useState([])
  const [status, setStatus] = useState("idle") // không có tín hiệu //stopped
  const [showModal, setShowModal] = useState(false)

  // default Date // trả về thời gian thực việt nam
  const getVNDateString = () => {
    const now = new Date()

    // Định dạng: DD-MM-YYYY_HH-mm-ss
    // Sử dụng 'en-GB' để lấy định dạng ngày/tháng/năm (DD/MM/YYYY) dễ xử lý hơn 'vi-VN'
    const date = now.toLocaleDateString("en-GB").replace(/\//g, "-")
    const time = now.toLocaleTimeString("en-GB").replace(/:/g, ":")

    return `${date}_${time}`
  }
  // tạo log để lưu vào trong log
  const createLog = async () => {
    try {
      console.log("DATA SEND:", {
        detections: detectionsRef.current,
        videoName: videoNameRef.current,
      })
      const response = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/user/save-log`,
        { detections: detectionsRef.current, videoName: videoNameRef.current },
      )

      if (response.data.success) {
        console.log("Save log Successfully !!!")
      }
    } catch (error) {
      console.error(error.message)
    }
  }
  // ===== UPLOAD VIDEO =====
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fileName = `ket-qua-yolo_${getVNDateString()}.csv`
    videoNameRef.current = fileName
    const formData = new FormData()
    formData.append("file", file)

    const response = await axios.post(
      "http://localhost:8000/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    )

    const data = response.data
    setVideoPath(data.path)

    alert("Upload thành công!")
  }

  // ===== START STREAM =====
  const startStream = () => {
    if (!videoPath) {
      // nếu không có video Path
      alert("Upload video trước!")
      return
    }

    setDetections([]) // chưa có gì
    setStatus("streaming") // bắt đầu streaming

    const ws = new WebSocket("ws://localhost:8765")
    ws.binaryType = "blob" // binary large object kiểu dữ liệu đại diện dữ liệu thô
    wsRef.current = ws // nếu để ws = new Websocket thì nó sẽ bị render và tạo lại nên dùng wsRef

    //  gửi path video sang backend
    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "start", path: videoPath })) // do websocket hoạt động gửi text or binary
    }

    ws.onmessage = async (event) => {
      // nhận dữ liệu String
      // nếu event.data = "string": xử lí JSON
      // còn event.data = "blob" (dư liệu binary thô)
      // meta → frame → meta → frame → ..
      if (typeof event.data === "string") {
        const data = JSON.parse(event.data) // lấy data gửi bên video python

        if (data.status === "done") {
          // check video kết thúc thì setStatus = "done" và return dừng
          setStatus("done")
          return
        }
        // cập nhật danh sách theo ID tracking
        // mỗi object có 1 id nếu đẫ tồn tại thì update còn chưa có thì new
        if (data.type === "meta") {
          // là meta là nhận về detections
          setDetections((prev) => {
            const updated = [...prev]

            // type detections = [[id, label, cls, [x1, y1, x2, y2]]]
            data.detections.forEach((d) => {
              // idx là vị trí từ  0 -> .....
              const idx = updated.findIndex((x) => x.id === d.id) // tìm object có cùng id

              const newObj = { ...d, time: data.time, time_ms: data.time_ms }
              if (idx === -1) {
                updated.push(newObj) // chưa có thì thêm mới object
              } else {
                updated[idx] = newObj // ghi đè
              }
            })

            detectionsRef.current = updated
            return updated
          })
        }
        return
      }

      // vẽ frame
      const blob = event.data // lấy ảnh đã encode từ python
      const bitmap = await createImageBitmap(blob) // biến đổi binary thành

      // bitmap giải nén jpg từ blob thành bitmap (dữ liệu hình ảnh gpu vẽ được )
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")

      canvas.width = bitmap.width
      canvas.height = bitmap.height
      context.drawImage(bitmap, 0, 0)

      if (imgBitmapRef.current) {
        imgBitmapRef.current.close() // vẽ xong rồi thì xóa cái frame cũ và cập nhật
      } // vẽ xong không
      imgBitmapRef.current = bitmap
    }

    ws.onclose = () => {
      if (status !== "done") {
        setStatus("idle")
      }

      // no signal
    }
  }

  const stopStream = () => {
    // wsRef.current?.close() // đóng

    wsRef.current?.send(JSON.stringify({ action: "pause" }))
    setStatus("stopped") //
  }
  const resumeStream = () => {
    wsRef.current?.send(JSON.stringify({ action: "resume" }))
    setStatus("streaming")
  }
  const confirmEnd = () => {
    setShowModal(true)
  }

  const endStream = async () => {
    wsRef.current?.close() //kết thúc
    setStatus("idle") // no signal
    setShowModal(false) //

    if (detections.length > 0) {
      console.log("Auto exporting detections...")
      exportCSV() // Gọi hàm export đã viết sẵn
      await createLog()
      videoNameRef.current = null
      detectionsRef.current = []
    }
    // resetDataa
    setDetections([])
    setVideoPath(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    const canvas = canvasRef.current
    if (canvas) {
      const context = canvas.getContext("2d")
      context.clearRect(0, 0, canvas.width, canvas.height) // vì ban đầu hiểu là rectangle nên clear
      canvas.width = 0
      canvas.height = 0
    }

    if (imgBitmapRef.current) {
      imgBitmapRef.current.close()
      imgBitmapRef.current = null
    }
  }

  // ===== EXPORT CSV =====
  const exportCSV = () => {
    if (detections.length === 0) return

    const headers = [
      "id",
      "label",
      "conf",
      "time",
      "time_ms",
      "bbox_x1",
      "bbox_y1",
      "bbox_x2",
      "bbox_y2",
    ] // label

    const rows = detections.map((d) => [
      d.id,
      d.label,
      d.conf,
      d.time,
      d.time_ms,
      ...(d.bbox ?? ["", "", "", ""]),
    ])

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const fileName = `ket-qua-yolo_${getVNDateString()}.csv`
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
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
          <div className="video-panel inner-wrap-left-video">
            <div className="canvas-wrapper">
              <canvas ref={canvasRef} />
              {/* không tìm thấy phân tích */}
              {status === "idle" && detections.length === 0 && (
                <div className="canvas-placeholder">
                  <span className="ph-icon">⬡</span>
                  <span>Loading...</span>
                </div>
              )}
            </div>

            <div className="controls">
              {/* Upload */}
              <input
                type="file"
                accept="video/*"
                ref={fileInputRef}
                onChange={handleUpload}
              />

              <button
                className="btn btn-start"
                onClick={status === "stopped" ? resumeStream : startStream}
                disabled={status === "streaming"}
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

              {/* {detections.length > 0 && (
                  <button
                    className="btn btn-export"
                    onClick={exportCSV}
                  >
                    <span className="btn-icon">↓</span> Export CSV
                  </button>
                )} */}

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

          {/* Detection table */}
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
                    <th>Time</th>
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
                          <span className="id-badge">{d.id}</span>
                        </td>
                        <td>
                          <span className="label-text">{d.label}</span>
                        </td>
                        <td>
                          <div className="conf-bar-wrap">
                            <div className="conf-bar-bg">
                              <div
                                className={`conf-bar-fill ${
                                  d.conf > 0.7 ? "high" : "low"
                                }`}
                                style={{ width: `${d.conf * 100}%` }}
                              />
                            </div>
                            <span className="conf-val">
                              {(d.conf * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td>{d.time}</td>
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
