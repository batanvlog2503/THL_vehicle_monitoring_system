import React, { useEffect, useState } from "react"
import "./Vehicle.scss"
import { useNavigate } from "react-router-dom"
import axiosInstance from "../../utils/axiosInstance"
const Vehicle = () => {
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [totalPages, setTotalPages] = useState(1)

  const [plate, setPlate] = useState("")
  const [overspeed, setOverspeed] = useState(false)

  const fetchVehicles = async () => {
    try {
      const response = await axiosInstance.get(
        `${import.meta.env.VITE_APP_URL}/user/vehicles?page=${page}&limit=${limit}&plate=${plate}&overspeed=${overspeed}`,
      )

      const data = response.data
      console.log("API:", data) //  DEBUG

      setVehicles(Array.isArray(data.data) ? data.data : [])
      setTotalPages(data.totalPages || 1)
    } catch (err) {
      console.error(err)
      setVehicles([]) // tránh crash
    }
  }

  useEffect(() => {
    fetchVehicles()
  }, [page, limit, plate, overspeed])

  return (
    <div className="vehicle container">
      <div className="inner-wrap">
        {/* TITLE */}
        <div className="header">
          <h2>🚗 Vehicle & License Plate</h2>
          <p>Detected vehicles with license plate recognition</p>
        </div>

        {/* FILTER */}
        <div className="filters">
          <input
            type="text"
            placeholder="Search plate..."
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value)
              setPage(1)
            }}
          />

          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(1)
            }}
          >
            <option value={10}>10 / page</option>
            <option value={30}>30 / page</option>
            <option value={60}>60 / page</option>
            <option value={80}>80 / page</option>
          </select>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={overspeed}
              onChange={(e) => {
                setOverspeed(e.target.checked)
                setPage(1)
              }}
            />
            Overspeed only
          </label>
        </div>

        {/* TABLE */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Speed</th>
                <th>Plate</th>
                <th>Time</th>
                <th>Status</th>
                <th>Video</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {Array.isArray(vehicles) &&
                vehicles.map((item, index) => {
                  const d = item?.detection
                  if (!d) return null

                  return (
                    <tr key={index}>
                      <td>{d.id}</td>
                      <td>{d.label}</td>
                      <td>{d.speed || "—"} km/h</td>
                      <td className="plate">{d.plate || "N/A"}</td>
                      <td>{d.time}</td>
                      <td>
                        <span
                          className={`status ${
                            d.status === "violation" ? "violation" : "normal"
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td>{item.videoName}</td>
                      <td>
                        <button
                          className="view-btn"
                          onClick={() => navigate(`/main/log/${item.logId}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="pagination">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ← Prev
          </button>

          <span>
            Page {page} / {totalPages}
          </span>

          {/* 👇 THÊM SELECT Ở ĐÂY */}
          <select
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <option
                key={i + 1}
                value={i + 1}
              >
                Page {i + 1}
              </option>
            ))}
          </select>

          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

export default Vehicle
