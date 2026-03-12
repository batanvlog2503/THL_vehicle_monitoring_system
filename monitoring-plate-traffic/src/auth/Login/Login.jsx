import React, { useState } from "react"
import "./Login.css"
import trafficLight from "./traffic_light.png"
import axios from "axios"
import { data } from "react-router-dom"
import { useNavigate } from "react-router-dom"
const Login = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState({
    name: "",
    password: "",
    email: "",
  })

  const [message, setMessage] = useState("")
  const [type, setType] = useState("")

  const { name, password, email } = user

  const handleInputChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value })
  }
  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const response = await axios.post(
        "http://localhost:3000/auth/login",
        user,
      )

      console.log("Login SuccessFully", response.data.message)

      setMessage(response.data.message)
      setType("success")
      setTimeout(() => {
        ;(setMessage(""), navigate("/main"))
      }, 2000)
      setUser({
        name: "",
        password: "",
        email: "",
      })
    } catch (error) {
      setMessage(error.response?.data?.message || "Có lỗi xảy ra")
      setType("danger")
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
            <b style={{ fontSize: "15px" }}>Name</b>
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
            <b style={{ fontSize: "15px", marginBottom: "5px" }}>Password</b>
            <div className="input-group input-enter mb-3">
              <label
                htmlFor="password"
                className="input-group-text"
              >
                <i class="fa-solid fa-lock"></i>
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
                <i class="fa-solid fa-at"></i>
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
    </div>
  )
}

export default Login
