import React, { useState } from "react"
import "./Login.css"
import trafficLight from "./traffic_light.png"
const Login = () => {
  const [users, setUsers] = useState({
    username: "",
    password: "",
  })
  const { username, password } = users
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
          >
            <b style={{ fontSize: "15px" }}>Username</b>
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

          <div className="text-center">
            <p>
              Bạn chưa có tài khoản? <a href="#">Đăng kí tài khoản</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
