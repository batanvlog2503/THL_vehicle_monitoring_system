import React from "react"
import { Outlet } from "react-router-dom"
const MainLayout = () => {
  return (
    <div className="container-fluid main-layout p-0">
      <div className="sticky-top">
        <Outlet></Outlet>
      </div>
    </div>
  )
}

export default MainLayout
