import React from "react"
import "./ConfirmModel.scss"

const ConfirmModal = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null

  return (
    <div className="chatbot-modal-overlay">
      <div className="chatbot-modal-box">
        <div className="chatbot-modal-icon">⚠️</div>
        <h3>Rời khỏi Chatbot?</h3>
        <p>Lịch sử trò chuyện sẽ bị xoá nếu bạn rời trang này.</p>
        <div className="chatbot-modal-actions">
          <button
            className="chatbot-btn-cancel"
            onClick={onCancel}
          >
            Ở lại
          </button>
          <button
            className="chatbot-btn-confirm"
            onClick={onConfirm}
          >
            Rời đi
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
