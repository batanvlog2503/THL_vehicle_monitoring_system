import React from "react"
import "./Log.css"
import loadingImage from "./loading.png"
import axiosInstance from "../../utils/axiosInstance"
import { useState, useEffect } from "react"

import { useNavigate } from "react-router-dom"
const Log = () => {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])

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
  }, [])
  const getAllLogs = async () => {
    try {
      const response = await axiosInstance.get(
        `${import.meta.env.VITE_APP_URL}/user/logs`,
      )

      console.log("Logs ", response.data)

      if (response.data.success) {
        setLogs(response.data.logs)
        console.log("Get All Logs Successfully !!!")
      }
    } catch (error) {
      console.error("Error ", error.message)
    }
  }
  return (
    <div className="log-container container">
      <div className="log inner-wrap">
        <div className="inner-title d-flex flex-column">
          <h1>Lịch sử phát hiện</h1>
          <p>Xem tất cả các log phát hiện từ video xử lí</p>

          {logs.length > 0 &&
            logs.map((log) => (
              <div
                className="card-log"
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

                <div className="inner-slug ">
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
            ))}
        </div>
      </div>
    </div>
  )
}

export default Log
