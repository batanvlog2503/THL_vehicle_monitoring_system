// components/SurveyModal/SurveyModal.jsx
import React, { useState } from "react"
import "./SurveyModal.css"
import axiosInstance from "../../utils/axiosInstance"

// ─── Constants ────────────────────────────────────────────────────────────────
const USEFUL_FEATURES = [
  { value: "plate_detection", label: "🔍 Nhận diện biển số" },
  { value: "speed_monitoring", label: "⚡ Giám sát tốc độ" },
  { value: "violation_alerts", label: "🚨 Cảnh báo vi phạm" },
  { value: "statistics_charts", label: "📊 Biểu đồ thống kê" },
  { value: "chatbot_analysis", label: "🤖 Chatbot phân tích" },
  { value: "video_management", label: "🎬 Quản lý video" },
  { value: "export_report", label: "📄 Xuất báo cáo" },
]

const REQUESTED_FEATURES = [
  { value: "real_time_monitoring", label: "📡 Giám sát thời gian thực" },
  { value: "mobile_app", label: "📱 App di động" },
  { value: "api_integration", label: "🔗 Tích hợp API" },
  { value: "multi_camera", label: "📷 Nhiều camera" },
  { value: "night_detection", label: "🌙 Nhận diện ban đêm" },
  { value: "cloud_storage", label: "☁️ Lưu trữ đám mây" },
  { value: "email_alerts", label: "📧 Cảnh báo qua email" },
]

const USAGE_FREQUENCY = [
  { value: "daily", label: "Hằng ngày" },
  { value: "weekly", label: "Hằng tuần" },
  { value: "monthly", label: "Hằng tháng" },
  { value: "rarely", label: "Thỉnh thoảng" },
]

const PRIMARY_PURPOSE = [
  { value: "traffic_management", label: "Quản lý giao thông" },
  { value: "law_enforcement", label: "Thực thi pháp luật" },
  { value: "research", label: "Nghiên cứu" },
  { value: "personal_project", label: "Dự án cá nhân" },
  { value: "other", label: "Mục đích khác" },
]

const RECOMMEND = [
  { value: "definitely", label: "Chắc chắn có 👍" },
  { value: "probably", label: "Có thể có" },
  { value: "not_sure", label: "Chưa chắc" },
  { value: "no", label: "Không" },
]

const ASPECT_LABELS = {
  easeOfUse: "Dễ sử dụng",
  performance: "Hiệu năng / Tốc độ",
  accuracy: "Độ chính xác nhận diện",
  ui: "Giao diện người dùng",
}

const STEPS = ["Đánh giá", "Tính năng", "Thông tin", "Nhận xét"]

// ─── StarRating component ─────────────────────────────────────────────────────
function StarRating({ value, onChange, size = "md" }) {
  const [hovered, setHovered] = useState(0)
  const active = hovered || value

  return (
    <div className={`star-group star-${size}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-btn ${active >= star ? "active" : ""}`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          aria-label={`${star} sao`}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <span className="star-label">
          {["", "Rất tệ", "Tệ", "Bình thường", "Tốt", "Xuất sắc"][value]}
        </span>
      )}
    </div>
  )
}

// ─── CheckboxGroup component ──────────────────────────────────────────────────
function CheckboxGroup({ options, selected, onChange }) {
  const toggle = (val) => {
    onChange(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val],
    )
  }
  return (
    <div className="checkbox-grid">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`checkbox-item ${selected.includes(opt.value) ? "checked" : ""}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          <span className="checkbox-custom" />
          <span className="checkbox-label">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── RadioGroup component ─────────────────────────────────────────────────────
function RadioGroup({ options, value, onChange }) {
  return (
    <div className="radio-group">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`radio-item ${value === opt.value ? "selected" : ""}`}
        >
          <input
            type="radio"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="radio-custom" />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Main SurveyModal ─────────────────────────────────────────────────────────
const SurveyModal = ({ onClose }) => {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  })

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type })
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    )
  }

  const [form, setForm] = useState({
    overallRating: 0,
    aspectRatings: { easeOfUse: 0, performance: 0, accuracy: 0, ui: 0 },
    usefulFeatures: [],
    requestedFeatures: [],
    usageFrequency: "",
    primaryPurpose: "",
    wouldRecommend: "",
    comment: "",
  })

  const setField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }))
  const setAspect = (key, val) =>
    setForm((prev) => ({
      ...prev,
      aspectRatings: { ...prev.aspectRatings, [key]: val },
    }))

  const canNext = () => {
    if (step === 0) return form.overallRating > 0
    if (step === 1) return form.usefulFeatures.length > 0
    if (step === 2)
      return form.usageFrequency && form.primaryPurpose && form.wouldRecommend
    return true
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/reviews`,
        form,
      )
      if (res.data.success) {
        showToast("Gửi đánh giá thành công! Cảm ơn bạn 🎉", "success")
        setTimeout(() => onClose(), 2500)
      } else {
        showToast(
          res.data.message || "Gửi thất bại, vui lòng thử lại.",
          "error",
        )
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        "Không thể kết nối server. Vui lòng thử lại."
      showToast(msg, "error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="survey-overlay">
      <div className="survey-modal">
        {/* Header */}
        <div className="survey-header">
          <div className="survey-title">
            <span className="survey-icon">📋</span>
            <div>
              <h3>Đánh giá hệ thống</h3>
              <p>
                THL Monitoring Traffic • {STEPS[step]} ({step + 1}/
                {STEPS.length})
              </p>
            </div>
          </div>
          <button
            className="btn-close-survey"
            onClick={onClose}
            title="Bỏ qua"
          >
            ✕
          </button>
        </div>

        {/* Step progress */}
        <div className="survey-progress">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`progress-step ${i <= step ? "done" : ""} ${i === step ? "active" : ""}`}
            >
              <div className="progress-dot">{i < step ? "✓" : i + 1}</div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="survey-body">
          {/* ── STEP 0: Đánh giá sao ── */}
          {step === 0 && (
            <div className="survey-step">
              <div className="question-block">
                <label className="question-label required">
                  Bạn đánh giá tổng thể hệ thống như thế nào?
                </label>
                <StarRating
                  value={form.overallRating}
                  onChange={(v) => setField("overallRating", v)}
                  size="lg"
                />
              </div>

              <div className="question-block">
                <label className="question-label">
                  Đánh giá từng khía cạnh{" "}
                  <span className="optional">(tuỳ chọn)</span>
                </label>
                <div className="aspect-grid">
                  {Object.entries(ASPECT_LABELS).map(([key, label]) => (
                    <div
                      key={key}
                      className="aspect-row"
                    >
                      <span className="aspect-label">{label}</span>
                      <StarRating
                        value={form.aspectRatings[key]}
                        onChange={(v) => setAspect(key, v)}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 1: Tính năng ── */}
          {step === 1 && (
            <div className="survey-step">
              <div className="question-block">
                <label className="question-label required">
                  Tính năng nào bạn thấy hữu ích nhất?{" "}
                  <span className="hint">(chọn nhiều)</span>
                </label>
                <CheckboxGroup
                  options={USEFUL_FEATURES}
                  selected={form.usefulFeatures}
                  onChange={(v) => setField("usefulFeatures", v)}
                />
              </div>

              <div className="question-block">
                <label className="question-label">
                  Tính năng nào bạn muốn được bổ sung?{" "}
                  <span className="optional">(tuỳ chọn)</span>
                </label>
                <CheckboxGroup
                  options={REQUESTED_FEATURES}
                  selected={form.requestedFeatures}
                  onChange={(v) => setField("requestedFeatures", v)}
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: Thông tin sử dụng ── */}
          {step === 2 && (
            <div className="survey-step">
              <div className="question-block">
                <label className="question-label required">
                  Bạn sử dụng hệ thống với tần suất nào?
                </label>
                <RadioGroup
                  options={USAGE_FREQUENCY}
                  value={form.usageFrequency}
                  onChange={(v) => setField("usageFrequency", v)}
                />
              </div>

              <div className="question-block">
                <label className="question-label required">
                  Mục đích sử dụng chính của bạn là gì?
                </label>
                <RadioGroup
                  options={PRIMARY_PURPOSE}
                  value={form.primaryPurpose}
                  onChange={(v) => setField("primaryPurpose", v)}
                />
              </div>

              <div className="question-block">
                <label className="question-label required">
                  Bạn có giới thiệu hệ thống này cho người khác không?
                </label>
                <RadioGroup
                  options={RECOMMEND}
                  value={form.wouldRecommend}
                  onChange={(v) => setField("wouldRecommend", v)}
                />
              </div>
            </div>
          )}

          {/* ── STEP 3: Nhận xét tự do ── */}
          {step === 3 && (
            <div className="survey-step">
              <div className="question-block">
                <label className="question-label">
                  Nhận xét thêm của bạn{" "}
                  <span className="optional">(tuỳ chọn)</span>
                </label>
                <textarea
                  className="survey-textarea"
                  placeholder="Chia sẻ trải nghiệm, góp ý hoặc những điều bạn muốn cải thiện..."
                  value={form.comment}
                  onChange={(e) => setField("comment", e.target.value)}
                  maxLength={1000}
                  rows={5}
                />
                <span className="char-count">{form.comment.length}/1000</span>
              </div>

              {/* Summary trước khi submit */}
              <div className="summary-box">
                <div className="summary-title">Tóm tắt đánh giá của bạn</div>
                <div className="summary-row">
                  <span>Đánh giá tổng thể</span>
                  <span className="summary-stars">
                    {"★".repeat(form.overallRating)}
                    {"☆".repeat(5 - form.overallRating)}
                  </span>
                </div>
                <div className="summary-row">
                  <span>Tính năng hữu ích</span>
                  <span>{form.usefulFeatures.length} mục đã chọn</span>
                </div>
                <div className="summary-row">
                  <span>Tần suất sử dụng</span>
                  <span>
                    {USAGE_FREQUENCY.find(
                      (f) => f.value === form.usageFrequency,
                    )?.label || "—"}
                  </span>
                </div>
                <div className="summary-row">
                  <span>Giới thiệu cho người khác</span>
                  <span>
                    {RECOMMEND.find((r) => r.value === form.wouldRecommend)
                      ?.label || "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="survey-footer">
          <button
            className="btn-skip"
            onClick={onClose}
          >
            Bỏ qua
          </button>

          <div className="footer-actions">
            {step > 0 && (
              <button
                className="btn-back"
                onClick={() => setStep(step - 1)}
              >
                ← Quay lại
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                className="btn-primary"
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
              >
                Tiếp theo →
              </button>
            ) : (
              <button
                className="btn-submit"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner" /> Đang gửi...
                  </>
                ) : (
                  "✓ Gửi đánh giá"
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast — dùng lại class custom-toast2 từ Login.scss */}
      {toast.show && (
        <div className={`custom-toast5 ${toast.type}`}>
          <i
            className={`fa-solid ${
              toast.type === "success"
                ? "fa-circle-check"
                : "fa-circle-exclamation"
            }`}
          />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}

export default SurveyModal
