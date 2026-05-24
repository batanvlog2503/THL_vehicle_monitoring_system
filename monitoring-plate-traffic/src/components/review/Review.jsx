import React, { useEffect, useState } from "react"
import "./Review.css"
import axiosInstance from "../../utils/axiosInstance"

// ─── Label maps ───────────────────────────────────────────────────────────────
const FEATURE_LABELS = {
  plate_detection: "🔍 Nhận diện biển số",
  speed_monitoring: "⚡ Giám sát tốc độ",
  violation_alerts: "🚨 Cảnh báo vi phạm",
  statistics_charts: "📊 Biểu đồ thống kê",
  chatbot_analysis: "🤖 Chatbot phân tích",
  video_management: "🎬 Quản lý video",
  export_report: "📄 Xuất báo cáo",
}

const REQUESTED_LABELS = {
  real_time_monitoring: "📡 Giám sát thời gian thực",
  mobile_app: "📱 App di động",
  api_integration: "🔗 Tích hợp API",
  multi_camera: "📷 Nhiều camera",
  night_detection: "🌙 Nhận diện ban đêm",
  cloud_storage: "☁️ Lưu trữ đám mây",
  email_alerts: "📧 Cảnh báo qua email",
}

const FREQUENCY_LABELS = {
  daily: "Hằng ngày",
  weekly: "Hằng tuần",
  monthly: "Hằng tháng",
  rarely: "Thỉnh thoảng",
}

const PURPOSE_LABELS = {
  traffic_management: "Quản lý giao thông",
  law_enforcement: "Thực thi pháp luật",
  research: "Nghiên cứu",
  personal_project: "Dự án cá nhân",
  other: "Mục đích khác",
}

const RECOMMEND_LABELS = {
  definitely: "Chắc chắn có 👍",
  probably: "Có thể có",
  not_sure: "Chưa chắc",
  no: "Không",
}

const ASPECT_LABELS = {
  easeOfUse: "Dễ sử dụng",
  performance: "Hiệu năng / Tốc độ",
  accuracy: "Độ chính xác nhận diện",
  ui: "Giao diện người dùng",
}

const STAR_TEXT = ["", "Rất tệ", "Tệ", "Bình thường", "Tốt", "Xuất sắc"]

// ─── Sub-components ───────────────────────────────────────────────────────────
function Stars({ value = 0, max = 5, size = "md" }) {
  return (
    <div className={`rv-stars rv-stars--${size}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`rv-star ${i < value ? "rv-star--filled" : ""}`}
        >
          ★
        </span>
      ))}
      {value > 0 && (
        <span className="rv-star-label">
          {STAR_TEXT[value] || `${value}/${max}`}
        </span>
      )}
    </div>
  )
}

function Tag({ label, variant = "default" }) {
  return <span className={`rv-tag rv-tag--${variant}`}>{label}</span>
}

function InfoRow({ label, children }) {
  return (
    <div className="rv-info-row">
      <span className="rv-info-key">{label}</span>
      <span className="rv-info-val">{children}</span>
    </div>
  )
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="rv-metric">
      <div className="rv-metric__label">{label}</div>
      <div className="rv-metric__value">{value}</div>
      {sub && <div className="rv-metric__sub">{sub}</div>}
    </div>
  )
}

function SectionCard({ icon, title, children }) {
  return (
    <div className="rv-card">
      <div className="rv-card__header">
        <span className="rv-card__icon">{icon}</span>
        <span className="rv-card__title">{title}</span>
      </div>
      <div className="rv-card__body">{children}</div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
const Review = () => {
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchReview = async () => {
      try {
        const res = await axiosInstance.get(
          `${import.meta.env.VITE_APP_URL}/reviews/me`,
        )
        if (res.data.success) {
          setReview(res.data.review)
        } else {
          setError("Không tìm thấy đánh giá.")
        }
      } catch (err) {
        setError(err.response?.data?.message || "Không thể tải đánh giá.")
      } finally {
        setLoading(false)
      }
    }
    fetchReview()
  }, [])

  const formatDate = (iso) =>
    iso
      ? new Date(iso).toLocaleString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—"

  if (loading) {
    return (
      <div className="rv-state">
        <div className="rv-spinner" />
        <p>Đang tải đánh giá...</p>
      </div>
    )
  }

  if (error || !review) {
    return (
      <div className="rv-state rv-state--empty">
        <span className="rv-state__icon">📋</span>
        <p>{error || "Bạn chưa gửi đánh giá nào."}</p>
      </div>
    )
  }

  const {
    aspectRatings = {},
    usefulFeatures = [],
    requestedFeatures = [],
  } = review

  return (
    <div className="rv-page">
      {/* Page heading */}
      <div className="rv-heading">
        <h2>Đánh giá của bạn</h2>
        <p className="rv-heading__sub">
          THL Monitoring Traffic •{" "}
          <span
            className={`rv-badge ${review.isSubmitted ? "rv-badge--teal" : "rv-badge--gray"}`}
          >
            {review.isSubmitted ? "Đã gửi" : "Nháp"}
          </span>
        </p>
      </div>

      {/* Metric row */}
      <div className="rv-metrics">
        <MetricCard
          label="Đánh giá tổng thể"
          value={<Stars value={review.overallRating} />}
          sub={STAR_TEXT[review.overallRating]}
        />
        <MetricCard
          label="Tần suất sử dụng"
          value={FREQUENCY_LABELS[review.usageFrequency] || "—"}
        />
        <MetricCard
          label="Mục đích chính"
          value={PURPOSE_LABELS[review.primaryPurpose] || "—"}
        />
        <MetricCard
          label="Giới thiệu?"
          value={RECOMMEND_LABELS[review.wouldRecommend] || "—"}
        />
      </div>

      {/* Cards grid */}
      <div className="rv-grid">
        {/* Aspect ratings */}
        <SectionCard
          icon="⭐"
          title="Đánh giá từng khía cạnh"
        >
          {Object.entries(ASPECT_LABELS).map(([key, label]) => (
            <div
              key={key}
              className="rv-aspect-row"
            >
              <span className="rv-aspect-name">{label}</span>
              <Stars
                value={aspectRatings[key] || 0}
                size="sm"
              />
            </div>
          ))}
        </SectionCard>

        {/* Features */}
        <SectionCard
          icon="🧩"
          title="Tính năng"
        >
          <div className="rv-section-label">Hữu ích nhất</div>
          <div className="rv-tags">
            {Object.entries(FEATURE_LABELS).map(([val, lbl]) => (
              <Tag
                key={val}
                label={lbl}
                variant={usefulFeatures.includes(val) ? "selected" : "default"}
              />
            ))}
          </div>

          <div
            className="rv-section-label"
            style={{ marginTop: "14px" }}
          >
            Muốn bổ sung
          </div>
          <div className="rv-tags">
            {Object.entries(REQUESTED_LABELS).map(([val, lbl]) => (
              <Tag
                key={val}
                label={lbl}
                variant={
                  requestedFeatures.includes(val) ? "requested" : "default"
                }
              />
            ))}
          </div>
        </SectionCard>

        {/* User info */}
        <SectionCard
          icon="👤"
          title="Thông tin"
        >
          <InfoRow label="Review ID">
            <code className="rv-code">{review._id}</code>
          </InfoRow>
          <InfoRow label="Mục đích">
            <span className="rv-badge rv-badge--blue">
              {PURPOSE_LABELS[review.primaryPurpose] || "—"}
            </span>
          </InfoRow>
          <InfoRow label="Tần suất">
            <span className="rv-badge rv-badge--gray">
              {FREQUENCY_LABELS[review.usageFrequency] || "—"}
            </span>
          </InfoRow>
          <InfoRow label="Giới thiệu">
            <span className="rv-badge rv-badge--teal">
              {RECOMMEND_LABELS[review.wouldRecommend] || "—"}
            </span>
          </InfoRow>
          <InfoRow label="Ngày gửi">{formatDate(review.createdAt)}</InfoRow>
          {review.updatedAt !== review.createdAt && (
            <InfoRow label="Cập nhật lần cuối">
              {formatDate(review.updatedAt)}
            </InfoRow>
          )}
        </SectionCard>

        {/* Comment */}
        <SectionCard
          icon="💬"
          title="Nhận xét tự do"
        >
          {review.comment ? (
            <blockquote className="rv-comment">"{review.comment}"</blockquote>
          ) : (
            <p className="rv-empty-text">Không có nhận xét.</p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

export default Review
