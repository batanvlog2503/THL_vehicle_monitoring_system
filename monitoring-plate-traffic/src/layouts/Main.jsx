import React from "react"
import { Outlet } from "react-router-dom"
import Sidebar from "../pages/sidebar/Sidebar"
import NavbarDetails from "../pages/navbar/NavbarDetails"
const Main = () => {
  return (
    <div className="container-fluid main p-0">
      <div className="navbar-details sticky-top">
        <NavbarDetails></NavbarDetails>
      </div>
      <div className="inner-wrap row">
        <div className="sidebar-wrap col-2 col-sm-12 col-lg-2">
          <Sidebar></Sidebar>
        </div>
        <div className="content col-9 col-sm-12 col-lg-9">
          <Outlet></Outlet>
        </div>
      </div>
    </div>
  )
}

export default Main
