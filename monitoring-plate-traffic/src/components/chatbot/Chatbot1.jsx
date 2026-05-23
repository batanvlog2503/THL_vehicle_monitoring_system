import React, { useEffect, useRef, useState } from "react"
import axios from "axios"
import { marked } from "marked"
import { useBlocker } from "react-router-dom"
import axiosInstance from "../../utils/axiosInstance"
import "./Chatbot1.scss"
import ConfirmModal from "./ConfirmModel"

marked.setOptions({
  breaks: true,
  gfm: true,
})

const QUICK_BUTTONS = [
  "Tổng quan",
  "Top video nhiều phát hiện",
  "Vi phạm",
  "Xe nhanh nhất",
  "Loại xe",
  "Danh sách video",
  "Biển số",
]

const WELCOME = `
# Xin chào 👋

Tôi có thể hỗ trợ phân tích dữ liệu video giao thông.

### Ví dụ:
- Tổng quan
- Vi phạm
- Xe nhanh nhất
- Loại xe
- Danh sách video
- Biển số
`

function Chatbot1() {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: marked.parse(WELCOME),
      time: new Date(),
    },
  ])

  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      messages.length > 1 && currentLocation.pathname !== nextLocation.pathname,
  )

  // ─────────────────────────────────────
  // AUTO SCROLL
  // ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    })
  }, [messages, loading])

  // ─────────────────────────────────────
  // FORMAT TIME
  // ─────────────────────────────────────
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // ─────────────────────────────────────
  // PUSH MESSAGE
  // ─────────────────────────────────────
  const pushUser = (text) => {
    setMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text,
        time: new Date(),
      },
    ])
  }

  const pushBot = (text) => {
    setMessages((prev) => [
      ...prev,
      {
        sender: "bot",
        text,
        time: new Date(),
      },
    ])
  }

  // ─────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────
  const send = async (questionText = "") => {
    const content = questionText || input.trim()

    if (!content || loading) return

    pushUser(content)

    setInput("")
    setLoading(true)

    try {
      const user = JSON.parse(localStorage.getItem("user"))

      const res = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/stats/chatbot/query`,
        {
          question: content,
          userId: user?._id,
        },
      )

      pushBot(marked.parse(res.data.reply))
    } catch (err) {
      console.error(err)

      pushBot(marked.parse("❌ Không thể kết nối server. Vui lòng thử lại."))
    }

    setLoading(false)

    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }

  // ─────────────────────────────────────
  // ENTER
  // ─────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // ─────────────────────────────────────
  // CLEAR CHAT
  // ─────────────────────────────────────
  const clearChat = () => {
    setMessages([
      {
        sender: "bot",
        text: marked.parse(WELCOME),
        time: new Date(),
      },
    ])
  }

  // ─────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────
  return (
    <div className="chatbot-wrapper open">
      {/* HEADER */}
      <div className="chatbot-header">
        <div className="header-avatar">
          <svg
            viewBox="0 0 24 24"
            fill="white"
          >
            <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73A2 2 0 0110 4a2 2 0 012-2zM5 18a1 1 0 000 2h14a1 1 0 000-2H5z" />
          </svg>
        </div>

        <div className="header-info">
          <span className="header-name">Chatbot phân tích giao thông</span>

          <span className="header-status">
            <span className="status-dot" />
            Đang hoạt động
          </span>
        </div>

        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={clearChat}
            title="Xóa lịch sử"
          >
            🗑
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="chatbot-messages">
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
                dangerouslySetInnerHTML={{
                  __html: msg.text,
                }}
              />

              <span className="msg-time">{formatTime(msg.time)}</span>
            </div>
          </div>
        ))}

        {/* LOADING */}
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

        {/* QUICK BUTTONS */}
        {!loading && (
          <div className="quick-questions">
            {QUICK_BUTTONS.map((q, i) => (
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

      {/* FOOTER */}
      <div className="chatbot-footer">
        <div className="input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder="Nhập câu hỏi..."
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

      {/* CONFIRM MODAL */}
      <ConfirmModal
        isOpen={blocker.state === "blocked"}
        onConfirm={() => blocker.proceed()}
        onCancel={() => blocker.reset()}
      />
    </div>
  )
}

export default Chatbot1
