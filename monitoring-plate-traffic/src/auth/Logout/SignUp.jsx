import React, { useState } from "react"
import "./SignUp.css"
import trafficLight from "../Login/traffic_light.png"
import axios from "axios"

import { useNavigate } from "react-router-dom"
const SignUp = () => {
  const [users, setUsers] = useState({
    username: "",
    password: "",
  })
  const navigate = useNavigate() // điều hướng
  const [message, setMessage] = useState("")
  const [type, setType] = useState("")
  const { username, password } = users

  const handleInputChange = (e) => {
    setUsers({ ...users, [e.target.name]: e.target.value })
  }
  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const response = await axios.post(
        "http://localhost:3000/auth/signup",
        users,
      )

      console.log("success ", response.data)
      setMessage(response.data.message)
      setType("success")
      setTimeout(() => {
        setMessage("")
      }, 2000)
      setUsers({
        username: "",
        password: "",
      })

      //reset data
    } catch (error) {
      console.error("SignUp Error:", error)
      setMessage(error.response?.data?.message || "Có lỗi xảy ra")
      setType("danger")
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
            <p>Sign Up to create username</p>
          </div>
          {message && (
            <div
              className={`alert alert-${type}`}
              style={{ fontSize: "12px", padding: "5px", textAlign: "center" }}
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
            <b style={{ fontSize: "15px" }}>username</b>
            <div className="input-group input-enter mb-3">
              <label
                htmlFor="username"
                className="input-group-text"
              >
                <i className="fa-solid fa-user"></i>
              </label>
              <input
                type="text"
                className="form-control"
                name="username"
                id="username"
                placeholder="username"
                aria-label="username"
                aria-describedby="basic-addon1"
                value={username}
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

            <button
              type="submit"
              className="btn w-100"
            >
              Sign Up
            </button>
          </form>   

          <div className="text-center">
            <p>
              Bạn đã có tài khoản ? <a href="/login">Đăng nhập tài khoản</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SignUp
