import React from "react"
import "./Dashboard.css"
import { useState } from "react"
const Dashboard = () => {
  const [videoURL, setVideoURL] = useState(null)

  const handleUpload = (e) => {
    const file = e.target.files[0] // lấy file đầu tiên người dùng chọn

    if (file) {
      const url = URL.createObjectURL(file)
      // tạo đường dãn tạm thời để trình duyeert
      // sử dụng video
      setVideoURL(url)
    }
  }
  return (
    <div className="container-fluid dashboard">
      <div className="inner-wrap row">
        <div className="col-12 col-md-8 video">
          <div
            className="inner-title text-align-left justify-content-left"
            style={{ fontSize: "20px", fontWeight: "500" }}
          >
            <i class="fa-solid fa-video"></i> Real-Time Video Analysis
          </div>
          <div className="video-screen">
            {videoURL ? (
              <video
                src={videoURL}
                controls
                autoPlay
                className="video-player"
              />
            ) : (
              <div className="video-placeholder">No Video Selected</div>
            )}
          </div>
          {/* Nút upload */}
          <label className="upload-btn">
            Upload Video
            <input
              type="file"
              accept="video/*"
              hidden
              onChange={handleUpload}
            />
          </label>
        </div>
        <div className="col-12 col-md-4 data">
          <div className="inner-title">
            <h4>
              <i class="fa-solid fa-chart-line"></i> Live Vehicle Detection
            </h4>
          </div>
          <div className="inner-table">
            <table className="table ">
              <thead className="table-secondary">
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Speed</th>
                  <th scope="col">Plate</th>
                  <th scope="col">Status</th>
                  <th scope="col">Video</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>Car</td>
                  <td>65 km/h</td>
                  <td>30A-12345</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>Motorbike</td>
                  <td>55 km/h</td>
                  <td>29B-56789</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>3</td>
                  <td>Truck</td>
                  <td>80 km/h</td>
                  <td>88C-22222</td>
                  <td style={{ color: "red" }}>Over Speed</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>4</td>
                  <td>Car</td>
                  <td>72 km/h</td>
                  <td>30H-67890</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>5</td>
                  <td>Bus</td>
                  <td>60 km/h</td>
                  <td>51B-11111</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>6</td>
                  <td>Motorbike</td>
                  <td>45 km/h</td>
                  <td>29X-33333</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>7</td>
                  <td>Car</td>
                  <td>95 km/h</td>
                  <td>30A-99999</td>
                  <td style={{ style: "red" }}>Over Speed</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
