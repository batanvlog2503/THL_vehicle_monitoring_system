import React, { useState, useRef, useEffect } from "react"
import axios from "axios"
import "./Chatbot.scss"
import { marked } from "marked"
import { useBlocker } from "react-router-dom"

import ConfirmModal from "./ConfirmModel"
import axiosInstance from "../../utils/axiosInstance"
// Cấu hình marked
marked.setOptions({
  breaks: true, // xuống dòng với \n
  gfm: true, // hỗ trợ GitHub markdown
})
const Chatbot = () => {
  const [lang, setLang] = useState("vi") // ← thêm state ngôn ngữ
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "Xin chào! Tôi có thể giúp bạn phân tích lịch sử phát hiện đối tượng trong video.",
      time: new Date(),
    },
  ])

  const user = JSON.parse(localStorage.getItem("user"))
  const userId = user?._id || "unknown_user"
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(true)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const QUICK_REPLIES = [
    "Tổng số đối tượng phát hiện hôm nay?",
    "Top 3 video có nhiều phát hiện nhất",
    "Xu hướng phát hiện trong tuần",
  ]
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      messages.length > 1 && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const send = async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return

    setMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text: content, // ← convert markdown → HTML,
        time: new Date(),
      },
    ])
    setInput("")
    setLoading(true)

    try {
      const res = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/chat`,
        {
          message: content,
          user_id: userId,
          lang, // ← truyền ngôn ngữ lên server
        },
      )
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: marked.parse(res.data.reply), // ← thêm marked.parse vào đây
          time: new Date(),
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Lỗi kết nối server. Vui lòng thử lại.",
          time: new Date(),
        },
      ])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearHistory = () => {
    setMessages([
      {
        sender: "bot",
        text: "Lịch sử đã được xoá. Tôi có thể giúp gì cho bạn?",
        time: new Date(),
      },
    ])
  }

  return (
    <div className={`chatbot-wrapper ${isOpen ? "open" : "closed"}`}>
      {/* Header */}
      <div className="chatbot-header">
        <div className="header-avatar">
          <svg
            viewBox="0 0 24 24"
            fill="white"
          >
            <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73A2 2 0 0110 4a2 2 0 012-2zM5 18a1 1 0 000 2h14a1 1 0 000-2H5zm1-2h12v-2H6v2z" />
          </svg>
        </div>
        <div className="header-info">
          <span className="header-name">Chatbot AI phân tích video</span>
          <span className="header-status">
            <span className="status-dot" />
            Đang hoạt động
          </span>
        </div>
        {/* Thêm language toggle vào header-actions */}
        <div className="lang-toggle">
          <button
            className={`lang-btn ${lang === "vi" ? "active" : ""}`}
            onClick={() => setLang("vi")}
          >
            VI
          </button>
          <span>|</span>
          <button
            className={`lang-btn ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={clearHistory}
            title="Xoá lịch sử"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4h6v2" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setIsOpen((v) => !v)}
            title="Thu gọn"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline
                points={isOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Message area */}
      <div className="chatbot-messages">
        <div className="date-divider">
          <span>Hôm nay</span>
        </div>

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`msg-row ${msg.sender}`}
          >
            <div className={`msg-avatar ${msg.sender}`}>
              {msg.sender === "bot" ? "AI" : "BN"}
            </div>
            <div className="msg-content">
              <div
                className={`msg-bubble ${msg.sender}`}
                dangerouslySetInnerHTML={{ __html: msg.text }}
              />
              <span className="msg-time">{formatTime(msg.time)}</span>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="msg-row bot typing-row">
            <div className="msg-avatar bot">AI</div>
            <div className="typing-bubble">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}

        {/* Quick replies — show only at start */}
        {messages.length === 1 && !loading && (
          <div className="quick-replies">
            {QUICK_REPLIES.map((q, i) => (
              <button
                key={i}
                className="quick-btn"
                onClick={() => send(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Footer input */}
      <div className="chatbot-footer">
        <div className={`input-wrap ${input ? "has-text" : ""}`}>
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder="Nhập câu hỏi về dữ liệu video..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
        </div>
        <button
          className="send-btn"
          onClick={() => send()}
          disabled={!input.trim() || loading}
        >
          <svg
            viewBox="0 0 24 24"
            fill="white"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
      <ConfirmModal
        isOpen={blocker.state === "blocked"}
        onConfirm={() => blocker.proceed()} // cho đi, lịch sử mất
        onCancel={() => blocker.reset()} // ở lại
      />
    </div>
  )
}

export default Chatbot
