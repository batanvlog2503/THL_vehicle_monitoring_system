import React, { useState, useEffect } from "react"
import "./Statistic.css"
import axiosInstance from "../../utils/axiosInstance"
import { Line, Bar, Pie } from "react-chartjs-2"

const Statistic = () => {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    getAllLogs()
  }, [])

  const getAllLogs = async () => {
    try {
      const res = await axiosInstance.get(
        `${import.meta.env.VITE_APP_URL}/user/logs`,
      )
      if (res.data.success) {
        setLogs(res.data.logs)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // tổng detections
  const totalDetections = logs.reduce(
    (t, log) => t + (log.detections?.length || 0),
    0,
  )

  // nhóm dữ liệu
  const groupedData = logs
    .flatMap((l) => l?.detections || [])
    .reduce(
      (acc, d) => {
        if (["car", "truck", "bus"].includes(d.label)) acc.car++
        else if (d.label === "motorcycle") acc.motorcycle++
        else acc.others++
        return acc
      },
      { car: 0, motorcycle: 0, others: 0 },
    )

  const labels = ["Car", "Motorcycle", "Others"]
  const dataValues = [
    groupedData.car,
    groupedData.motorcycle,
    groupedData.others,
  ]

  return (
    <div className="statistic">
      <div className="inner-wrap">
        {/* INTRO */}
        <div className="inner-introduction">
          <h4>
            <i className="fa-solid fa-car"></i> Statistics
          </h4>
          <span>Traffic data visualization</span>
        </div>

        {/* CARDS */}
        <div className="inner-view">
          <div className="inner good">
            <i className="fa-solid fa-road-barrier"></i>
            <h3>{totalDetections}</h3>
            <span>Total Vehicles</span>
          </div>

          <div className="inner good">
            <i className="fa-solid fa-car"></i>
            <h3>{groupedData.car}</h3>
            <span>Total Cars</span>
          </div>

          <div className="inner good">
            <i className="fa-solid fa-motorcycle"></i>
            <h3>{groupedData.motorcycle}</h3>
            <span>Total Motorbikes</span>
          </div>

          <div className="inner bad">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <h3>78</h3>
            <span>Violations</span>
          </div>
        </div>

        {/* CHART */}
        <div className="inner-chart">
          <div className="card">
            <h3>Ratio</h3>
            <Pie
              data={{
                labels,
                datasets: [
                  {
                    data: dataValues,
                    backgroundColor: ["#1677ff", "#52c41a", "#faad14"],
                  },
                ],
              }}
            />
          </div>

          <div className="card">
            <h3>Count</h3>
            <Bar
              data={{
                labels,
                datasets: [
                  {
                    label: "Number Of Detect Object",
                    data: dataValues,
                    backgroundColor: ["#1677ff", "#52c41a", "#faad14"],
                    borderRadius: 6,
                  },
                ],
              }}
            />
          </div>

          <div className="card line">
            <h3>Trend of Vehicles</h3>
            <Line
              data={{
                labels: labels,
                datasets: [
                  {
                    label: "Car",
                    data: [groupedData.car, 0, 0],
                    borderColor: "#1677ff",
                    backgroundColor: "rgba(22,119,255,0.2)",
                    tension: 0.4,
                  },
                  {
                    label: "Motorcycle",
                    data: [0, groupedData.motorcycle, 0],
                    borderColor: "#52c41a",
                    backgroundColor: "rgba(82,196,26,0.2)",
                    tension: 0.4,
                  },
                  {
                    label: "Others",
                    data: [0, 0, groupedData.others],
                    borderColor: "#faad14",
                    backgroundColor: "rgba(250,173,20,0.2)",
                    tension: 0.4,
                  },
                ],
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Statistic
