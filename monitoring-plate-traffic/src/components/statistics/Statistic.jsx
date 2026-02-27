import React from "react"
import "./Statistic.css"

const Statistic = () => {
  return (
    <div className="container statistic">
      <div className="inner-wrap row px-3">
        <div className="inner-introduction col-12" style={{cursor:"pointer"}}>
          <h3>
            <i className="fa-solid fa-car"></i> Statistics & Data Analysis
          </h3>
          <span>Traffic data visualization and analysis</span>
        </div>

        <div className="inner-view col-12 row">
          <div className="good inner inner-total col-3 col-sm-12 col-md-6 col-xl-3">
            <i class="fa-solid fa-road-barrier"></i>
            <h3>245</h3>
            <span>Total Vehicles</span>
          </div>
          <div className="good inner inner-car col-3 col-sm-12 col-md-6 col-xl-3">
            <i class="fa-solid fa-car"></i>
            <h3>123</h3>
            <span>Total Cars</span>
          </div>
          <div className="good inner inner-motorbike col-3 col-sm-12 col-md-6 col-xl-3">
            <i class="fa-solid fa-motorcycle"></i>
            <h3>122</h3>
            <span>Total Motorbikes</span>
          </div>
          <div className="bad inner inner-violations col-3 col-sm-12 col-md-6 col-xl-3">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>78</h3>
            <span>Violations</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Statistic
