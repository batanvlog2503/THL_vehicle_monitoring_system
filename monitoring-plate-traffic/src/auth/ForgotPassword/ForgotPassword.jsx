import React, { useState } from "react"

import axios from "axios"
import "./ForgotPassword.css"
import { useNavigate } from "react-router-dom"
import axiosInstance from "../../utils/axiosInstance"
const ForgotPassword = () => {
  const navigate = useNavigate() // điều hướng
  const [message, setMessage] = useState("")
  const [type, setType] = useState("")
  const [email, setEmail] = useState("")
  const handleInputChange = (e) => {
    setEmail(e.target.value)
  }
  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const response = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/auth/forgot-password`,
        { email },
      )

      if (response.data.success) {
        console.log("Please verify by your Email")
        alert(response.data.message)
      }

      //reset data
    } catch (error) {
      console.error("Verify Email Error:", error)
      setMessage(error.response?.data?.message || "Có lỗi xảy ra")
      setType("danger")
    }
  }

  return (
    <div className="container-fluid forgot-password">
      <div className="wrapper launch">
        <div className="form-login py-2 px-5">
          <div
            className="title-login text-center"
            style={{ padding: "30px" }}
          >
            <h1 style={{ fontSize: "30px", color: "Black", fontWeight: "700" }}>
              Forgot Password
            </h1>
          </div>
          {message && (
            <div
              className={`alert alert-${type}`}
              style={{
                fontSize: "15px",
                padding: "5px",
                textAlign: "center",
                fontWeight: "800",
              }}
              role="alert"
            >
              {message}
            </div>
          )}
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

            <button
              type="submit"
              className="btn w-100"
            >
              Verify
            </button>
          </form>
          <div
            className=""
            style={{ marginTop: "10px" }}
          >
            <button
              className="previous-login"
              style={{ fontSize: "16px" }}
              onClick={() => navigate("/login")}
            >
              <i className="fa-solid fa-arrow-left"></i> Login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
