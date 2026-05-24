// NavbarDetails.jsx — tích hợp SurveyModal sau logout
import React, { useState } from "react"
import "./NavbarDetails.css"
import axiosInstance from "../../utils/axiosInstance"
import SurveyModal from "../survey/SurveyModal"

const NavbarDetails = () => {
  const [modal, setModal] = useState(false) // confirm logout
  const [showSurvey, setShowSurvey] = useState(false) // survey sau logout

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem("refreshToken")
      const response = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/user/logout`,
        { refreshToken },
      )

      if (response.data.success) {
        // Giữ token lại — survey cần userId từ token khi submit
        // Token sẽ bị xóa trong handleSurveyClose
        setModal(false)
        setShowSurvey(true)
      } else {
        alert("Logout Failed")
      }
    } catch (error) {
      console.error(error.message)
    }
  }

  const handleSurveyClose = () => {
    // Xóa token ở đây — sau khi survey submit xong hoặc bỏ qua
    localStorage.removeItem("accessToken")
    localStorage.removeItem("refreshToken")
    localStorage.removeItem("user")
    setShowSurvey(false)
    window.location.href = "/login"
  }

  return (
    <div className="container-fluid navbar-details">
      <div className="inner-wrap row">
        <div className="inner-title col-lg-3 col-4">
          <a href="/main">
            <h4>
              <i className="fa-solid fa-traffic-light"></i> THL Monitoring
              Traffic
            </h4>
            <p>Statistics & Data Analysis</p>
          </a>
        </div>

        <div className="inner-user col-lg-2 col-4 text-end">
          <button
            className="logout"
            onClick={() => setModal(true)}
          >
            Log Out <i className="fa-solid fa-door-closed"></i>
          </button>
        </div>
      </div>

      {/* Modal xác nhận logout */}
      {modal && (
        <div className="modal show d-block">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title1">Confirm Logout</h5>
                <button
                  className="btn-close"
                  onClick={() => setModal(false)}
                />
              </div>
              <div className="modal-body">
                <p>Bạn có chắc muốn đăng xuất không?</p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setModal(false)}
                >
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleLogout}
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Survey modal sau khi logout thành công */}
      {showSurvey && <SurveyModal onClose={handleSurveyClose} />}
    </div>
  )
}

export default NavbarDetails
