import React from "react"
import "./Vehicle.css"
const Vehicle = () => {
  return (
    <div className="container vehicle">
      <div className="inner-wrap row px-3">
        <div className="inner-introduction col-12">
          <h3>
            <i class="fa-solid fa-car"></i> Vehicle & License Plate Details
          </h3>
          <span>
            Complete list of detected vehicles with license plate recognition
          </span>
        </div>

        <div className="inner-filter col-12 row">
          <div className="inner-plate col-4">
            <label>Search License Plate</label>
            <br />
            <input
              type="text"
              placeholder="Enter license plate..."
            />
          </div>
          <div className="inner-type col-4">
            <label htmlFor="">Vehicle Type</label>
            <div class="dropdown">
              <button
                class="btn btn-secondary dropdown-toggle"
                type="button"
                id="dropdownMenuButton"
                data-toggle="dropdown"
                aria-haspopup="true"
                aria-expanded="false"
              >
                Dropdown button
              </button>
              <div
                class="dropdown-menu"
                aria-labelledby="dropdownMenuButton"
              >
                <a
                  class="dropdown-item"
                  href="#"
                >
                  Action
                </a>
                <a
                  class="dropdown-item"
                  href="#"
                >
                  Another action
                </a>
                <a
                  class="dropdown-item"
                  href="#"
                >
                  Something else here
                </a>
              </div>
            </div>
          </div>
          <div className="inner-overspeed col-4">
            <label htmlFor="">Overspeed</label>
            <br />
            <input type="checkbox" />
            <span>Show violations only</span>
          </div>
        </div>

        <div className="inner-list col-12">
            
        </div>
      </div>
    </div>
  )
}

export default Vehicle
