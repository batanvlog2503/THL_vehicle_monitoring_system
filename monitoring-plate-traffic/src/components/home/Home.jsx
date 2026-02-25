import React from "react"
import "./Home.css"
import Body from "../../pages/body/Body"
import NavbarHome from "../../pages/navbar/NavbarHome"
const Home = () => {
  return (
    <div className="container-fluid home p-0">
      <div className="inner-wrap">
        <NavbarHome></NavbarHome>
        <Body></Body>
      </div>
    </div>
  )
}

export default Home
