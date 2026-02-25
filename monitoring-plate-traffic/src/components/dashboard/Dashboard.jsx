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
        <div className="col-sm-12 col-md-8 col-lg-8 col-8 video">
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
        <div className="col-sm-12 col-md-4 col-lg-4 col-4 data"></div>
      </div>
    </div>
  )
}

export default Dashboard
