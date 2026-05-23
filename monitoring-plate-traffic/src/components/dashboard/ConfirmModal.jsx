import React from "react"
import "./ConfirmModal.scss"

const ConfirmModal = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  description,
  confirmText,
  cancelText,
}) => {
  if (!isOpen) return null

  return (
    <div
      className="confirm-overlay"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="confirm-box">
        <div className="confirm-icon">
          <i
            className="fa-solid fa-triangle-exclamation"
            aria-hidden="true"
          />
        </div>
        <h3 className="confirm-title">{title ?? "Bạn có chắc muốn thoát?"}</h3>
        <p className="confirm-desc">
          {description ?? "Thao tác hiện tại sẽ bị gián đoạn."}
        </p>
        <div className="confirm-actions">
          <button
            className="confirm-btn confirm-btn--cancel"
            onClick={onCancel}
          >
            {cancelText ?? "Ở lại"}
          </button>
          <button
            className="confirm-btn confirm-btn--confirm"
            onClick={onConfirm}
          >
            {confirmText ?? "Rời đi"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
