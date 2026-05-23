import { useState, useRef, useEffect } from "react"
import axiosInstance from "../../utils/axiosInstance"
import "./Dashboard1.scss"

const BACKEND = "http://localhost:8000"

// ─── helpers ────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const Dashboard1 = () => {
  // ── toast ────────────────────────────────────────────────
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  })

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type })

    setTimeout(() => {
      setToast({
        show: false,
        message: "",
        type: "success",
      })
    }, 3000)
  }

  // ── refs ──────────────────────────────────────────────────
  const fileInputRef = useRef(null)
  const detectionsRef = useRef([])
  const videoNameRef = useRef("")
  const hasExportedRef = useRef(false)

  // ── state ────────────────────────────────────────────────
  const [speedLimit, setSpeedLimit] = useState(60)

  const [phase, setPhase] = useState("idle")
  // idle → uploading → processing → done → error

  const [progress, setProgress] = useState(0)

  const [jobId, setJobId] = useState(null)

  const [resultVideo, setResultVideo] = useState(null)

  const [resultJson, setResultJson] = useState(null)

  const [summary, setSummary] = useState(null)

  const [detections, setDetections] = useState([])

  const [selectedFile, setSelectedFile] = useState(null)

  // ── CSV EXPORT ────────────────────────────────────────────
  const exportCSV = () => {
    if (detectionsRef.current.length === 0) {
      showToast("Không có dữ liệu để export", "error")
      return
    }

    const headers = [
      "ID",
      "Vehicle",
      "Confidence",
      "Time",
      "Speed(km/h)",
      "Plate",
      "Status",
      "BBox_X1",
      "BBox_Y1",
      "BBox_X2",
      "BBox_Y2",
    ]

    const esc = (value) => {
      if (value === null || value === undefined) return ""

      const str = String(value)

      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }

      return str
    }

    const rows = detectionsRef.current.map((d) => [
      d.id,
      d.label,
      (d.conf * 100).toFixed(1) + "%",
      d.time,
      d.speed ?? "",
      d.plate ?? "",
      d.status ?? "",
      ...(d.bbox ?? ["", "", "", ""]),
    ])

    const csvContent = [headers, ...rows]
      .map((row) => row.map(esc).join(","))
      .join("\n")

    // hỗ trợ tiếng Việt Excel
    const BOM = "\uFEFF"

    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    })

    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")

    a.href = url

    a.download = videoNameRef.current || `vehicle_detection_${Date.now()}.csv`

    document.body.appendChild(a)

    a.click()

    document.body.removeChild(a)

    URL.revokeObjectURL(url)

    showToast("Xuất CSV thành công", "success")
  }

  // ── SAVE LOG ──────────────────────────────────────────────
  const saveLog = async () => {
    try {
      const payload = {
        detections: detectionsRef.current,
        videoName: videoNameRef.current,
        speedLimit,
      }

      const res = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/user/save-log`,
        payload,
      )

      if (res.data.success) {
        showToast("Lưu log thành công", "success")
      } else {
        showToast("Lưu log thất bại", "error")
      }
    } catch (err) {
      console.error(err)
      showToast("Lỗi lưu log", "error")
    }
  }

  // ── upload & start job ───────────────────────────────────
  const handleUpload = async () => {
    const file = selectedFile

    if (!file) {
      showToast("Chưa chọn file video!", "error")
      return
    }

    const now = new Date()

    // giờ Việt Nam
    const vnTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }),
    )

    const pad = (n) => String(n).padStart(2, "0")

    const formatted =
      `${pad(vnTime.getDate())}-` +
      `${pad(vnTime.getMonth() + 1)}-` +
      `${vnTime.getFullYear()}_` +
      `${pad(vnTime.getHours())}:` +
      `${pad(vnTime.getMinutes())}:` +
      `${pad(vnTime.getSeconds())}`

    videoNameRef.current = `ket-qua-yolo-${formatted}.csv`

    hasExportedRef.current = false

    setPhase("uploading")
    setProgress(0)

    setResultVideo(null)
    setResultJson(null)

    setSummary(null)

    setDetections([])
    detectionsRef.current = []

    const formData = new FormData()

    formData.append("file", file)
    formData.append("speed_limit", speedLimit)

    try {
      const res = await fetch(`${BACKEND}/process`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        throw new Error("Upload failed")
      }

      const data = await res.json()

      const id = data.job_id

      setJobId(id)

      setPhase("processing")

      pollStatus(id)
    } catch (err) {
      console.error(err)

      setPhase("error")

      showToast("Upload thất bại!", "error")
    }
  }

  // ── poll status ──────────────────────────────────────────
  const pollStatus = async (id) => {
    while (true) {
      await sleep(1500)

      try {
        const res = await fetch(`${BACKEND}/status/${id}`)

        const data = await res.json()

        if (data.status === "processing" || data.status === "queued") {
          setProgress(data.progress ?? 0)
        } else if (data.status === "encoding") {
          setProgress(95)
        } else if (data.status === "done") {
          setProgress(100)

          setPhase("done")

          setResultVideo(`${BACKEND}${data.video_url}`)

          setResultJson(`${BACKEND}${data.result_url}`)

          setSummary({
            total: data.total_vehicles ?? 0,
            violations: data.violations ?? 0,
          })

          await fetchDetections(`${BACKEND}${data.result_url}`)

          // auto export + auto save log
          if (!hasExportedRef.current) {
            hasExportedRef.current = true

            exportCSV()

            await saveLog()
          }

          showToast("Xử lý hoàn tất!", "success")

          return
        } else if (data.status === "error") {
          setPhase("error")

          showToast(data.error ?? "Lỗi backend!", "error")

          return
        }
      } catch (err) {
        console.error(err)

        showToast("Mất kết nối backend", "error")

        setPhase("error")

        return
      }
    }
  }

  // ── fetch detections ─────────────────────────────────────
  const fetchDetections = async (url) => {
    try {
      const res = await fetch(url)
      const data = await res.json()

      const list = data.summary ?? []

      setDetections(list)
      detectionsRef.current = list
    } catch (err) {
      console.error(err)
    }
  }

  // ── reset ────────────────────────────────────────────────
  const reset = () => {
    setPhase("idle")

    setProgress(0)

    setJobId(null)

    setResultVideo(null)

    setResultJson(null)

    setSummary(null)

    setDetections([])

    setSelectedFile(null)

    detectionsRef.current = []

    videoNameRef.current = ""

    hasExportedRef.current = false

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // ── render ───────────────────────────────────────────────
  const phaseLabel = {
    idle: "○ Idle",
    uploading: "↑ Uploading",
    processing: "⚙ Processing",
    done: "✓ Done",
    error: "✕ Error",
  }

  return (
    <div className="dash-root">
      {/* ── Header ── */}
      <header className="dash-root__header">
        <span className="dash-root__logo-dot" />

        <h1>Vehicle Monitoring — Offline Analysis</h1>

        <span
          className={`dash-root__status-badge dash-root__status-badge--${phase}`}
        >
          {phaseLabel[phase] ?? phase}
        </span>
      </header>

      {/* ── Toast ── */}
      {toast.show && (
        <div className={`dash-root__toast dash-root__toast--${toast.type}`}>
          <i
            className={`fa-solid ${
              toast.type === "success"
                ? "fa-circle-check"
                : "fa-circle-exclamation"
            }`}
          />

          <span>{toast.message}</span>
        </div>
      )}

      {/* ── Upload Panel ── */}
      {(phase === "idle" || phase === "error") && (
        <div className="dash-root__upload-panel">
          <div className="dash-root__upload-inner">
            <div className="dash-root__upload-icon">🎬</div>

            <p className="dash-root__upload-title">Chọn video để phân tích</p>

            <p className="dash-root__upload-hint">MP4, AVI, MOV — tối đa 2GB</p>

            <label className="dash-root__file-label">
              <input
                type="file"
                accept="video/*"
                ref={fileInputRef}
                onChange={(e) => setSelectedFile(e.target.files[0] ?? null)}
              />

              {selectedFile ? (
                <span className="dash-root__file-name">
                  📁 {selectedFile.name}
                </span>
              ) : (
                <span>Chọn file…</span>
              )}
            </label>

            <div className="dash-root__speed-row">
              <label>Tốc độ giới hạn:</label>

              <select
                value={speedLimit}
                onChange={(e) => setSpeedLimit(Number(e.target.value))}
              >
                {[30, 40, 50, 60, 80, 100].map((v) => (
                  <option
                    key={v}
                    value={v}
                  >
                    {v} km/h
                  </option>
                ))}
              </select>
            </div>

            <button
              className="dash-root__btn dash-root__btn--primary"
              onClick={handleUpload}
              disabled={!selectedFile}
            >
              ▶ Bắt đầu xử lý
            </button>
          </div>
        </div>
      )}

      {/* ── Processing ── */}
      {(phase === "uploading" || phase === "processing") && (
        <div className="dash-root__processing-panel">
          <div className="dash-root__processing-inner">
            <div className="dash-root__spinner" />

            <p className="dash-root__processing-label">
              {phase === "uploading"
                ? "Đang tải video lên…"
                : `Đang phân tích… ${progress}%`}
            </p>

            <div className="dash-root__progress-track">
              <div
                className="dash-root__progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="dash-root__processing-hint">
              {phase === "processing"
                ? "Đang chạy YOLO tracking + OCR + tính tốc độ"
                : "Vui lòng đợi…"}
            </p>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div className="dash-root__result">
          {/* Stats */}
          {summary && (
            <div className="dash-root__stats">
              <div className="dash-root__stat-card">
                <span className="dash-root__stat-num">{summary.total}</span>

                <span className="dash-root__stat-label">Phương tiện</span>
              </div>

              <div className="dash-root__stat-card dash-root__stat-card--red">
                <span className="dash-root__stat-num">
                  {summary.violations}
                </span>

                <span className="dash-root__stat-label">Vi phạm tốc độ</span>
              </div>

              <div className="dash-root__stat-card dash-root__stat-card--green">
                <span className="dash-root__stat-num">
                  {summary.total - summary.violations}
                </span>

                <span className="dash-root__stat-label">Bình thường</span>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="dash-root__result-body">
            {/* Video */}
            <div className="dash-root__video-wrap">
              <p className="dash-root__section-title">Video kết quả</p>

              <video
                className="dash-root__video"
                src={resultVideo}
                controls
                autoPlay
                muted
              />

              <div className="dash-root__video-actions">
                <a
                  className="dash-root__btn dash-root__btn--outline"
                  href={resultVideo}
                  download
                >
                  ⬇ Tải video
                </a>

                {resultJson && (
                  <a
                    className="dash-root__btn dash-root__btn--outline"
                    href={resultJson}
                    download
                  >
                    ⬇ Tải JSON
                  </a>
                )}

                <button
                  className="dash-root__btn dash-root__btn--cyan"
                  onClick={exportCSV}
                >
                  ⬇ Export CSV
                </button>

                <button
                  className="dash-root__btn dash-root__btn--cyan"
                  onClick={saveLog}
                >
                  💾 Lưu log
                </button>

                <button
                  className="dash-root__btn dash-root__btn--ghost"
                  onClick={reset}
                >
                  ↺ Phân tích mới
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="dash-root__table-wrap">
              <div className="dash-root__table-header">
                <p className="dash-root__section-title">Kết quả phát hiện</p>

                <span className="dash-root__detect-count">
                  {detections.length}
                </span>
              </div>

              <div className="dash-root__table-scroll">
                <table className="dash-root__table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Loại xe</th>
                      <th>Conf</th>
                      <th>Tốc độ</th>
                      <th>Biển số</th>
                      <th>Thời gian</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detections.length === 0 ? (
                      <tr className="dash-root__empty-row">
                        <td colSpan={7}>Không có dữ liệu</td>
                      </tr>
                    ) : (
                      detections.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <span className="dash-root__id-badge">{d.id}</span>
                          </td>

                          <td>
                            <span className="dash-root__label-text">
                              {d.label}
                            </span>
                          </td>

                          <td>
                            <div className="dash-root__conf-wrap">
                              <div className="dash-root__conf-bg">
                                <div
                                  className={`dash-root__conf-fill ${
                                    d.conf > 0.7
                                      ? "dash-root__conf-fill--high"
                                      : ""
                                  }`}
                                  style={{
                                    width: `${d.conf * 100}%`,
                                  }}
                                />
                              </div>

                              <span className="dash-root__conf-val">
                                {(d.conf * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>

                          <td>
                            {d.speed ? (
                              <span
                                className={`dash-root__speed-val ${
                                  d.speed > speedLimit
                                    ? "dash-root__speed-val--over"
                                    : ""
                                }`}
                              >
                                {d.speed} km/h
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td>{d.plate ?? "—"}</td>

                          <td>{d.time}</td>

                          <td>
                            <span
                              className={`dash-root__status-pill dash-root__status-pill--${
                                d.status ?? "normal"
                              }`}
                            >
                              {d.status === "violation"
                                ? "Vi phạm"
                                : "Bình thường"}
                            </span>
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
      )}
    </div>
  )
}

export default Dashboard1
