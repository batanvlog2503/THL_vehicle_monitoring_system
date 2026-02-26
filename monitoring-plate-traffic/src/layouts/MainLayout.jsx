import React from "react"
import { Outlet } from "react-router-dom"
import { useEffect } from "react"
import Home from "../components/home/Home"
const MainLayout = () => {
  useEffect(() => {
    document.title = "Trang chủ"
  }, [])
  return (
    <div className="container-fluid main-layout p-0">
      <Outlet></Outlet>
    </div>
  )
}

export default MainLayout
