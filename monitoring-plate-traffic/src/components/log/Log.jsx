import React from "react"
import "./Log.scss"
import loadingImage from "./loading.png"
import axiosInstance from "../../utils/axiosInstance"
import { useState, useEffect } from "react"

import { useNavigate } from "react-router-dom"
const Log = () => {
  const hasViolation = (log) => {
    return log?.detections?.some((d) => d.status === "violation")
  }

  const [keyword, setKeyword] = useState("")
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [selectedDate, setSelectedDate] = useState("")
  const detectList = (log) => {
    const detections = log?.detections || []
    if (detections.length === 0) return 0
    const uniqueLabels = new Set(detections.map((d) => d.label))
    return uniqueLabels.size || 0
  }

  const getUniqueLabels = (log) => {
    return [...new Set(log?.detections?.map((d) => d.label) || [])]
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
    getAllLogs()
  }, [selectedDate, keyword])
  const getAllLogs = async () => {
    try {
      const response = await axiosInstance.get(
        `${import.meta.env.VITE_APP_URL}/user/logs`,
        {
          params: {
            date: selectedDate || undefined,
            keyword: keyword || undefined,
          },
        },
      )

      if (response.data.success) {
        setLogs(response.data.logs)
      }
    } catch (error) {
      console.error("Error ", error.message)
    }
  }
  return (
    <div className="log-container container">
      <div className="log inner-wrap">
        <div className="inner-title d-flex flex-column">
          {/* ({logs.length}) */}
          <h1>Lịch sử phát hiện </h1>
          <p>Xem tất cả các log phát hiện từ video xử lí</p>
          <div className="filter-box">
            <input
              type="text"
              placeholder="Tìm theo tên video..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />

            <button onClick={getAllLogs}>
              <i className="fa-solid fa-filter"></i> Lọc
            </button>

            <button
              onClick={() => {
                setSelectedDate("")
                getAllLogs()
              }}
            >
              Reset
            </button>
          </div>
          {logs.length > 0 ? (
            logs.map((log) => (
              <div
                className={`card-log ${hasViolation(log) ? "has-violation" : ""}`}
                key={log._id}
              >
                <h3>
                  <i className="fa-solid fa-video"></i> {log?.videoName}
                </h3>

                <div className="inner-details">
                  <div className="inner-email">
                    <i className="fa-regular fa-user"></i> {log?.email}
                  </div>

                  <div className="inner-time">
                    <i className="fa-regular fa-calendar"></i>{" "}
                    {formatDate(log?.createdAt)}
                  </div>

                  <button onClick={() => navigate(`/main/log/${log._id}`)}>
                    View
                  </button>
                </div>

                <div className="inner-slug">
                  <span>{detectList(log)} phát hiện</span>
                  <ul className="d-flex flex-row">
                    {getUniqueLabels(log).map((label, index) => (
                      <li key={index}>
                        <i className="fa-solid fa-paperclip"></i> {label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <h3>Không có dữ liệu</h3>
              <p>Không tìm thấy video nào trong ngày này</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Log
