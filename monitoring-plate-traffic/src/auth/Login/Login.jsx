import React, { useState } from "react"
import "./Login.scss"
import trafficLight from "./traffic_light.png"
import axios from "axios"
import { data } from "react-router-dom"
import { useNavigate } from "react-router-dom"
import axiosInstance from "../../utils/axiosInstance"
const Login = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState({
    password: "",
    email: "",
  })
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
  const [message, setMessage] = useState("")
  const [type, setType] = useState("")

  const { password, email } = user

  const handleInputChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value })
  }
  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const response = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/auth/login`,
        user,
      )
      if (response.data.success) {
        console.log("Login SuccessFully", response.data.message)
        const { accessToken, refreshToken, user: userData } = response.data
        localStorage.setItem("accessToken", accessToken)
        localStorage.setItem("refreshToken", refreshToken)
        localStorage.setItem("user", JSON.stringify(userData))
        showToast(response.data.message, "success")
        setTimeout(() => {
          ;(setMessage(""), navigate("/main"))
        }, 2000)
      }
    } catch (error) {
      showToast(error.response?.data?.message || "Có lỗi xảy ra", "error")
    }
  }
  return (
    <div className="container-fluid login">
      <div className="wrapper launch">
        <div className="form-login py-2 px-5">
          <div
            className="title-login text-center"
            style={{ padding: "30px" }}
          >
            <img
              src={trafficLight}
              alt="traffic-light"
              className="traffic-light"
            />
            <h1 style={{ fontSize: "30px", color: "Black", fontWeight: "700" }}>
              AI Traffic Monitoring System
            </h1>
            <p>Login to access the dashboard</p>
          </div>

          <form
            action=""
            className="input-group mb-5"
            onSubmit={(e) => handleSubmit(e)}
          >
            <b style={{ fontSize: "14px", marginBottom: "5px" }}>Email</b>
            <div className="input-group input-enter mb-3">
              <label
                htmlFor="email"
                className="input-group-text"
              >
                <i className="fa-solid fa-at"></i>
              </label>
              <input
                type="email"
                className="form-control"
                name="email"
                id="email"
                placeholder="Email"
                aria-label="email"
                aria-describedby="basic-addon3"
                value={email}
                onChange={(e) => handleInputChange(e)}
                required
                autoComplete="new-password"
              />
            </div>
            <b style={{ fontSize: "15px", marginBottom: "5px" }}>Password</b>
            <div className="input-group input-enter mb-3">
              <label
                htmlFor="password"
                className="input-group-text"
              >
                <i className="fa-solid fa-lock"></i>
              </label>
              <input
                type="password"
                className="form-control"
                name="password"
                id="password"
                placeholder="password"
                aria-label="password"
                aria-describedby="basic-addon3"
                value={password}
                onChange={(e) => handleInputChange(e)}
                required
                autoComplete="new-password"
              />
            </div>
            <a
              href=""
              onClick={() => navigate("/forgot-password")}
            >
              Forgot Password
            </a>

            <button
              type="submit"
              className="btn w-100"
            >
              Login
            </button>
          </form>

          <div
            className="text-center"
            style={{ marginTop: "10px" }}
          >
            <p>
              Bạn chưa có tài khoản? <a href="/signup">Đăng kí tài khoản</a>
            </p>
          </div>
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
    </div>
  )
}

export default Login
