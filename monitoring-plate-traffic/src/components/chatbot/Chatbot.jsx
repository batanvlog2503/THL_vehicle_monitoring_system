import React, { useState } from "react"
import axios from "axios"
import "./Chatbot.css"

const Chatbot = () => {
  const [message, setMessage] = useState("")
  const [chat, setChat] = useState([])

  const sendMessage = async () => {
    if (!message.trim()) return

    // add user message
    const newChat = [...chat, { sender: "user", text: message }]
    setChat(newChat)

    try {
      const res = await axios.post("http://localhost:5000/chat", {
        message,
      })

      setChat([...newChat, { sender: "bot", text: res.data.reply }])
    } catch (err) {
      console.error(err)
    }

    setMessage("")
  }

  return (
    <div className="chatbot-container">
      <div className="chat-box">
        {chat.map((c, i) => (
          <div
            key={i}
            className={c.sender}
          >
            {c.text}
          </div>
        ))}
      </div>

      <div className="input-box">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Nhập câu hỏi..."
        />
        <button onClick={sendMessage}>Gửi</button>
      </div>
    </div>
  )
}

export default Chatbot
  