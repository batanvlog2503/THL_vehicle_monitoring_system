import React from "react"
import "./NavbarDetails.css"
const NavbarDetails = () => {
  return (
    <div className="container-fluid navbar-details">
      <div className="inner-wrap row">
        <div className="inner-title col-sm-12 col-lg-3 col-4">
          <a href="/">
            <h4>
              {" "}
              <i class="fa-solid fa-traffic-light"></i> THL Monitoring Traffic
            </h4>
            <p>Statistics & Data Analysis</p>
          </a>
        </div>
        <div className="inner-feature col-sm-12 col-lg-6 col-4">
          <ul className="list-feature"></ul>
        </div>
        <div
          className="inner-user col-sm-12 col-lg-2 col-4"
          style={{ textAlign: "right" }}
        >
          <i className="fa-regular fa-user"></i>
          <span> Log Out</span>
        </div>
      </div>
    </div>
  )
}

export default NavbarDetails
