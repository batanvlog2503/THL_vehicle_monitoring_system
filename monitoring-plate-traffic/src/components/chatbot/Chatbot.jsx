import React from "react"
import "./Chatbot.css"
import loadingImage from "./loading.png"

const Chatbot = () => {
  return (
    <div className="chatbot-container">
      <img
        src={loadingImage}
        alt="loadingImage"
      />
    </div>
  )
}

export default Chatbot
