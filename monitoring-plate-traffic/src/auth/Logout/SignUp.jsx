import React, { useState } from "react"
import "./SignUp.scss"
import trafficLight from "../Login/traffic_light.png"
import axios from "axios"

import { useNavigate } from "react-router-dom"
const SignUp = () => {
  const [user, setUser] = useState({
    name: "",
    password: "",
    email: "",
    mobile: "",
  })
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  })

  const navigate = useNavigate() // điều hướng

  const { name, password, email, mobile } = user

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type })

    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" })
    }, 3000)
  }
  const handleInputChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value })
  }
  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_APP_URL}/auth/register`,
        user,
      )

      console.log("Register Successfully !!! ", response.data)
      showToast("Đăng ký thành công , vui lòng xác nhận email", "success")

      setUser({
        name: "",
        password: "",
        email: "",
        mobile: "",
      })

      setTimeout(() => {
        navigate("/login")
      }, 2000)
    } catch (error) {
      showToast(error.response?.data?.message || "Có lỗi xảy ra", "error")
    }
  }

  return (
    <div className="container-fluid signup">
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
            <p style={{ marginTop: "10px" }}>
              Please register to login my website
            </p>
          </div>

          <form
            action=""
            className="input-group mb-5"
            onSubmit={(e) => handleSubmit(e)}
          >
            <b style={{ fontSize: "14px" }}>Name</b>
            <div className="input-group input-enter mb-3">
              <label
                htmlFor="name"
                className="input-group-text"
              >
                <i className="fa-solid fa-user"></i>
              </label>
              <input
                type="text"
                className="form-control"
                name="name"
                id="name"
                placeholder="name"
                aria-label="name"
                aria-describedby="basic-addon1"
                value={name}
                onChange={(e) => handleInputChange(e)}
                required
                autoComplete="new-password"
              />
            </div>
            <b style={{ fontSize: "14px", marginBottom: "5px" }}>Password</b>
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
            <b style={{ fontSize: "14px", marginBottom: "5px" }}>Mobile</b>
            <div className="input-group input-enter mb-3">
              <label
                htmlFor="mobile"
                className="input-group-text"
              >
                <i className="fa-solid fa-mobile"></i>
              </label>
              <input
                type="text"
                className="form-control"
                name="mobile"
                id="mobile"
                placeholder="mobile"
                aria-label="mobile"
                aria-describedby="basic-addon3"
                value={mobile}
                onChange={(e) => handleInputChange(e)}
                required
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              className="btn w-100"
            >
              Sign Up
            </button>
          </form>
          <div
            className="text-center"
            style={{ marginTop: "10px" }}
          >
            <p>
              Bạn đã có tài khoản ? <a href="/login">Đăng nhập tài khoản</a>
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

export default SignUp
