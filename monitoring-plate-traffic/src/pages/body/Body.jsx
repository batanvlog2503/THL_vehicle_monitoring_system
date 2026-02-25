import React from "react"
import "./Body.css"
import demo from "./demo.png"
const Body = () => {
  return (
    <div className="container-fluid body">
      <div className="inner-wrap">
        <div className="inner-route">
          <h1 className="title">
            AI traffic system detects license plates <br />
            <span>and monitor vehicles</span>
          </h1>

          <p style={{ marginTop: "15px" }}>
            This AI model is based on computer vision processing, a creation by
            Pham Ngoc Linh, Do Quang Huan, and Pham Thanh Tan.
            <br />
            <b>Hopefully, I will receive everyone's support.</b>
          </p>
        </div>
        <div className="inner-started">
          <a href="/login">
            <button>
              Get Started <i class="fa-regular fa-star"></i>
            </button>
          </a>
        </div>
        <div className="inner-demo">
          <img
            src={demo}
            alt="demo"
          />
        </div>
      </div>
    </div>
  )
}

export default Body
