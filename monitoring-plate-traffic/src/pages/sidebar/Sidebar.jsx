import React from "react"
import "./Sidebar.css"
import { NavLink } from "react-router-dom"
const Sidebar = () => {
  return (
    <div className="sidebar">
      <ul className="list-feature">
        <li>
          <NavLink
            to="/main"
            className="link"
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
            className="link"
          >
            <i className="fa-solid fa-car"></i> Vehicle Analysis
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/main/statistic"
            className="link"
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
      </ul>
    </div>
  )
}

export default Sidebar
