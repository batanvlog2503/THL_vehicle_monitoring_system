import React from "react"
import "./Sidebar.scss"
import { NavLink } from "react-router-dom"
const Sidebar = () => {
  const user = JSON.parse(localStorage.getItem("user"))
  return (
    <div className="sidebar">
      <ul className="list-feature">
        <li>
          <NavLink
            to="/main"
            className="link"
            end
          >
            <i className="fa-solid fa-person-running"></i> Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/main/webcam"
            className="link"
          >
            <i className="fa-solid fa-camera"></i> Webcam
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/main/vehicle"
            className={({ isActive }) => "link " + (isActive ? "active" : "")}
          >
            <i className="fa-solid fa-car"></i> Vehicle Analysis
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/main/statistic"
            className={({ isActive }) => "link " + (isActive ? "active" : "")}
          >
            <i className="fa-solid fa-chart-pie"></i> Statistics
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/main/chatbot"
            className="link"
          >
            <i className="fa-regular fa-message"></i> AI Chatbot
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/main/log"
            className="link"
          >
            <i className="fa-solid fa-clock-rotate-left"></i> History
          </NavLink>
        </li>
        {user.role === "admin" && (
          <li>
            <NavLink
              to="/main/review"
              className="link"
            >
              <i class="fa-brands fa-wpforms"></i> Review
            </NavLink>
          </li>
        )}
      </ul>
      <div className="sidebar-user">
        <i className="fa-solid fa-user"></i>
        <span>Xin chào, {user?.name || "User"}</span>
      </div>
    </div>
  )
}

export default Sidebar
