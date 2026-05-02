import React from "react"
import { useParams } from "react-router-dom"
import axiosInstance from "../../utils/axiosInstance"
import { useState, useEffect } from "react"
import "./LogDetails.scss"

import { chartColors, chartColorsBar } from "./chartColor"
import { Chart as ChartJS, defaults } from "chart.js/auto"
import { Radar, Line, Bar, Doughnut, Pie } from "react-chartjs-2"
defaults.plugins.title.display = true
defaults.plugins.title.color = "black"
const LogDetails = () => {
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  })
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type })

    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" })
    }, 3000)
  }
  const { id } = useParams()
  const [log, setLog] = useState()

  const [showModal, setShowModal] = useState(false)
  // default Date
  const getVNDateString = (log) => {
    if (!log?.createdAt) return "unknown"

    const dateObj = new Date(log.createdAt)

    const date = dateObj.toLocaleDateString("en-GB").replace(/\//g, "_")
    const time = dateObj.toLocaleTimeString("en-GB").replace(/:/g, "-")

    return `${date}_${time}`
  }

  const exportCSV = (log) => {
    if (!log?.detections?.length) {
      showToast("Không có dữ liệu để export", "error")
      return
    }

    const headers = [
      "id",
      "label",
      "conf",
      "speed",
      "speed_limit", // thêm cột speed_limit
      "time",
      "time_ms",
      "bbox_x1",
      "bbox_y1",
      "bbox_x2",
      "bbox_y2",
    ] // label

    const rows = log?.detections.map((d) => [
      d.id,
      d.label,
      d.conf,
      d.speed ?? "",
      log.speedLimit ?? "", // thêm cột speed_limit
      d.time,
      d.time_ms,
      ...(d.bbox ?? ["", "", "", ""]),
    ])

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const fileName = `ket-qua-yolo_${getVNDateString(log)}.csv`
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)

    showToast("Export CSV thành công ", "success")
  }
  const getUniqueLabels = (log) => {
    return [...new Set(log?.detections?.map((d) => d.label))] || []
  }
  const detectList = (log) => {
    const detections = log?.detections || []

    if (detections.length === 0) return 0

    const uniqueLabels = new Set(detections.map((d) => d.label))

    return uniqueLabels.size
  }
  const formatDate = (dateString) => {
    const date = new Date(dateString)

    const time = date.toLocaleTimeString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false,
    })

    const day = date.toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    })

    return `${time} ${day}`
  }
  useEffect(() => {
    getLogDetails()
  }, [id])
  const getLogDetails = async () => {
    try {
      const response = await axiosInstance(
        `${import.meta.env.VITE_APP_URL}/user/logs/${id}`,
      )

      console.log("Log details: ", response.data)

      if (response.data.success) {
        setLog(response.data.log)
      }
    } catch (error) {
      console.error(error.message)
    }
  }

  const countLabel = (log) => {
    const counts = {}
    log?.detections.forEach((d) => {
      counts[d.label] = (counts[d.label] || 0) + 1
    })

    return counts
  }
  return (
    <div className="log-details container">
      <div className="inner-wrap ">
        <div className="inner-title">
          <h2>
            <i className="fa-solid fa-video"></i> {log?.videoName}
          </h2>
          <div className="inner-info">
            <span>{log?.email}</span>
            <span>{formatDate(log?.createdAt)}</span>
          </div>
        </div>
        <div className="inner-overview">
          <h2>Thống kê tổng quan</h2>
          <div className="inner-summary">
            <div className="inner-sum-detect">
              <p>Tổng số phát hiện</p>
              <br />
              <h3>{log?.detections.length}</h3>
            </div>
            <div className="inner-sum-type">
              <p>Số loại đối tượng</p>
              <br />
              <h3>{detectList(log)}</h3>
            </div>
            {/* <div className="inner-last-frame">
              <p>Số loại đối tượng</p>
              <br />
              <h3>{Object.keys(countLabel(log)).length}</h3>
            </div> */}
            <div className="inner-max-speed">
              <p>Tốc độ tối đa</p>
              <br />
              <h3>{log?.speedLimit || 60}</h3>
            </div>
            <div className="inner-total-violation">
              <p>Tổng vi phạm</p>
              <br />
              <h3>
                {log?.detections?.filter((d) => d.status === "violation")
                  .length || 0}
              </h3>
            </div>
          </div>
          <span>Phân bố đối tượng</span>
          <ul>
            {getUniqueLabels(log).map((label, index) => (
              <li key={index}>{label}</li>
            ))}
          </ul>
        </div>
        <div className="inner-chart">
          <div className="card pie">
            <h3>Ratio of Detections</h3>
            <Pie
              data={{
                labels: getUniqueLabels(log),
                datasets: [
                  {
                    label: "Share of Detect Object",
                    data: getUniqueLabels(log).map(
                      (label) => countLabel(log)[label] || 0,
                    ),
                    backgroundColor: chartColors,
                  },
                ],
              }}
            ></Pie>
          </div>
          <div className="card bar">
            <h3>Number of Detections</h3>
            <Bar
              data={{
                labels: getUniqueLabels(log),
                datasets: [
                  {
                    label: "Share of Detect Object",
                    data: getUniqueLabels(log).map(
                      (label) => countLabel(log)[label] || 0,
                    ),
                    backgroundColor: chartColors,
                    borderRadius: 6,
                  },
                ],
              }}
            ></Bar>
          </div>
        </div>
        <div className="inner-table">
          <h3>Chi tiết phát hiện</h3>
          <div className="inner-list-frame">
            {log?.detections.map((detect, index) => (
              <div
                className="frame"
                key={index}
              >
                <div className="frame1">
                  <div className="frame-id-label">
                    <div className="frame">
                      <h3>{index}</h3>
                    </div>
                    <div className="id-label">
                      <h3>Type: {detect?.label}</h3>
                      <span>ID: {detect?.id} </span>
                      <span>
                        <i className="fa-solid fa-clock"></i> {detect?.time}
                      </span>
                    </div>
                  </div>
                  <div className="speed-info">
                    <span className="speed-label">Speed</span>
                    {detect?.speed != null ? (
                      <h3 className="speed-number">{detect.speed} km/h</h3>
                    ) : (
                      <span className="speed-na">—</span>
                    )}
                  </div>

                  <div className="status-info">
                    {detect?.status ? (
                      <span
                        className={`status-badge ${detect.status.toLowerCase()}`}
                      >
                        {detect.status}
                      </span>
                    ) : (
                      <span className="speed-na">—</span>
                    )}
                  </div>
                  <div className="conf">
                    <span>Độ tin cậy: </span>
                    <h3>{detect?.conf * 100}%</h3>
                  </div>
                </div>
                <div className="frame2">
                  <div className="bbox">
                    <span>X1</span>
                    <h4>{detect?.bbox[0].toFixed(3)}</h4>
                  </div>
                  <div className="bbox">
                    <span>Y1</span>
                    <h4>{detect?.bbox[1].toFixed(3)}</h4>
                  </div>
                  <div className="bbox">
                    <span>X2</span>
                    <h4>{detect?.bbox[2].toFixed(3)}</h4>
                  </div>
                  <div className="bbox">
                    <span>Y2</span>
                    <h4>{detect?.bbox[3].toFixed(3)}</h4>
                  </div>
                </div>
                <div className="frame3">
                  <span>License Plate : {detect?.plate ?? "N/A"}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="export-csv"
            onClick={() => setShowModal(true)}
          >
            Export CSV
          </button>
        </div>
      </div>
      {toast.show && (
        <div className={`custom-toast2 ${toast.type}`}>
          <i
            className={`fa-solid ${
              toast.type === "success"
                ? "fa-circle-check"
                : "fa-circle-exclamation"
            }`}
          ></i>
          <span>{toast.message}</span>
        </div>
      )}
      {showModal && (
        <div
          className="modal show d-block"
          tabIndex="-1"
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title-export">Xác nhận export</h4>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>

              <div className="modal-body">
                <p>Bạn có chắc muốn export CSV không?</p>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Hủy
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    exportCSV(log)
                    setShowModal(false)
                  }}
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LogDetails
