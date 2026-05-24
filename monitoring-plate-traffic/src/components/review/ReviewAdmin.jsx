import React, { useEffect, useState, useCallback } from "react"
import "./ReviewAdmin.css"
import axiosInstance from "../../utils/axiosInstance"

// ─── Label maps ────────────────────────────────────────────────────────────────
const FEATURE_LABELS = {
  plate_detection: "Nhận diện biển số",
  speed_monitoring: "Giám sát tốc độ",
  violation_alerts: "Cảnh báo vi phạm",
  statistics_charts: "Biểu đồ thống kê",
  chatbot_analysis: "Chatbot phân tích",
  video_management: "Quản lý video",
  export_report: "Xuất báo cáo",
}

const FREQUENCY_LABELS = {
  daily: "Hằng ngày",
  weekly: "Hằng tuần",
  monthly: "Hằng tháng",
  rarely: "Thỉnh thoảng",
}

const PURPOSE_LABELS = {
  traffic_management: "Quản lý GT",
  law_enforcement: "Thực thi PL",
  research: "Nghiên cứu",
  personal_project: "Dự án cá nhân",
  other: "Khác",
}

const RECOMMEND_LABELS = {
  definitely: "Chắc chắn",
  probably: "Có thể",
  not_sure: "Chưa chắc",
  no: "Không",
}

const RECOMMEND_BADGE = {
  definitely: "teal",
  probably: "blue",
  not_sure: "gray",
  no: "red",
}

const PURPOSE_BADGE = {
  traffic_management: "blue",
  law_enforcement: "blue",
  research: "amber",
  personal_project: "amber",
  other: "gray",
}

const STAR_TEXT = ["", "Rất tệ", "Tệ", "Bình thường", "Tốt", "Xuất sắc"]

// ─── Sub-components ────────────────────────────────────────────────────────────
function Stars({ value = 0 }) {
  return (
    <div className="ra-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`ra-star ${i <= value ? "ra-star--on" : ""}`}
        >
          ★
        </span>
      ))}
    </div>
  )
}

function Badge({ variant = "gray", children }) {
  return <span className={`ra-badge ra-badge--${variant}`}>{children}</span>
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="ra-metric">
      <div className="ra-metric__label">{label}</div>
      <div className="ra-metric__value">{value}</div>
      {sub && <div className="ra-metric__sub">{sub}</div>}
    </div>
  )
}

function BarRow({ label, count, max, color = "#378ADD" }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="ra-bar-row">
      <span className="ra-bar-label">{label}</span>
      <div className="ra-bar-track">
        <div
          className="ra-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="ra-bar-val">{count}</span>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
const ReviewAdmin = () => {
  const [stats, setStats] = useState(null)
  const [reviews, setReviews] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const LIMIT = 10

  const fetchStats = useCallback(async () => {
    const res = await axiosInstance.get(
      `${import.meta.env.VITE_APP_URL}/reviews/stats`,
    )
    if (res.data.success) setStats(res.data.stats)
  }, [])

  const fetchReviews = useCallback(async (p = 1) => {
    const res = await axiosInstance.get(
      `${import.meta.env.VITE_APP_URL}/reviews?page=${p}&limit=${LIMIT}`,
    )
    if (res.data.success) {
      setReviews(res.data.reviews)
      setTotal(res.data.total)
      setTotalPages(res.data.totalPages)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        await Promise.all([fetchStats(), fetchReviews(1)])
      } catch (err) {
        setError(err.response?.data?.message || "Không thể tải dữ liệu.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [fetchStats, fetchReviews])

  const handlePage = async (p) => {
    setPage(p)
    await fetchReviews(p)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("vi-VN") : "—"

  const initials = (user) => {
    if (!user) return "??"
    const name = user.name || user.email || ""
    return name.slice(0, 2).toUpperCase()
  }

  // Tính recommend ratio từ reviews hiện có (stats không trả về)
  const recommendCounts = reviews.reduce((acc, r) => {
    acc[r.wouldRecommend] = (acc[r.wouldRecommend] || 0) + 1
    return acc
  }, {})

  const topFeatures = stats?.topUsefulFeatures || []
  const maxFeatureCount = topFeatures[0]?.count || 1
  const ratingDist = stats?.ratingDistribution || []

  if (loading) {
    return (
      <div className="ra-state">
        <div className="ra-spinner" />
        <p>Đang tải dữ liệu...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ra-state ra-state--error">
        <span className="ra-state__icon">⚠️</span>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="ra-page">
      {/* ── Header ── */}
      <div className="ra-header">
        <div>
          <h2>Tổng hợp đánh giá</h2>
          <p className="ra-header__sub">
            THL Monitoring Traffic • Admin Dashboard
          </p>
        </div>
        <button
          className="ra-btn-refresh"
          onClick={async () => {
            setLoading(true)
            try {
              await Promise.all([fetchStats(), fetchReviews(page)])
            } finally {
              setLoading(false)
            }
          }}
        >
          ↺ Làm mới
        </button>
      </div>

      {/* ── Metrics ── */}
      <div className="ra-metrics">
        <MetricCard
          label="Tổng đánh giá"
          value={stats?.totalReviews ?? "—"}
          sub="lượt gửi"
        />
        <MetricCard
          label="Điểm trung bình"
          value={
            <span>
              {stats?.averageRating ?? "—"}
              <span className="ra-metric__star"> ★</span>
            </span>
          }
          sub={`/ 5 sao`}
        />
        <MetricCard
          label="Chắc chắn giới thiệu"
          value={
            stats?.totalReviews
              ? `${Math.round(
                  (reviews.filter((r) => r.wouldRecommend === "definitely")
                    .length /
                    reviews.length) *
                    100,
                )}%`
              : "—"
          }
          sub="trong trang này"
        />
        <MetricCard
          label="Tính năng phổ biến nhất"
          value={FEATURE_LABELS[topFeatures[0]?._id] ?? "—"}
          sub={topFeatures[0] ? `${topFeatures[0].count} lượt chọn` : ""}
        />
      </div>

      {/* ── Charts row ── */}
      <div className="ra-grid2">
        {/* Phân bố sao */}
        <div className="ra-card">
          <div className="ra-card__header">
            <span className="ra-card__icon">⭐</span>
            <span>Phân bố đánh giá sao</span>
          </div>
          <div className="ra-card__body">
            {[5, 4, 3, 2, 1].map((star) => {
              const found = ratingDist.find((r) => r._id === star)
              return (
                <div
                  key={star}
                  className="ra-bar-row"
                >
                  <span className="ra-bar-label">
                    {star} sao
                    <span className="ra-bar-stars">
                      {"★".repeat(star)}
                      {"☆".repeat(5 - star)}
                    </span>
                  </span>
                  <div className="ra-bar-track">
                    <div
                      className="ra-bar-fill"
                      style={{
                        width: `${
                          stats?.totalReviews
                            ? Math.round(
                                ((found?.count || 0) / stats.totalReviews) *
                                  100,
                              )
                            : 0
                        }%`,
                        background: [
                          "",
                          "#F09595",
                          "#FAC775",
                          "#EF9F27",
                          "#5DCAA5",
                          "#1D9E75",
                        ][star],
                      }}
                    />
                  </div>
                  <span className="ra-bar-val">{found?.count || 0}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tính năng hữu ích */}
        <div className="ra-card">
          <div className="ra-card__header">
            <span className="ra-card__icon">🧩</span>
            <span>Tính năng hữu ích nhất</span>
          </div>
          <div className="ra-card__body">
            {topFeatures.length === 0 ? (
              <p className="ra-empty">Chưa có dữ liệu.</p>
            ) : (
              topFeatures.map((f) => (
                <BarRow
                  key={f._id}
                  label={FEATURE_LABELS[f._id] || f._id}
                  count={f.count}
                  max={maxFeatureCount}
                  color="#378ADD"
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="ra-section-label">Danh sách đánh giá ({total})</div>
      <div className="ra-card">
        <div className="ra-tbl-wrap">
          <table className="ra-tbl">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Tổng thể</th>
                <th>Tần suất</th>
                <th>Mục đích</th>
                <th>Giới thiệu</th>
                <th>Nhận xét</th>
                <th>Ngày gửi</th>
              </tr>
            </thead>
            <tbody>
              {reviews.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    Không có dữ liệu.
                  </td>
                </tr>
              ) : (
                reviews.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <div className="ra-user-cell">
                        <div className="ra-avatar">{initials(r.userId)}</div>
                        <div className="ra-user-info">
                          <span className="ra-user-name">
                            {r.userId?.name || "—"}
                          </span>
                          <span className="ra-user-email">
                            {r.userId?.email || ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="ra-rating-cell">
                        <Stars value={r.overallRating} />
                        <span className="ra-rating-text">
                          {STAR_TEXT[r.overallRating]}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge variant="gray">
                        {FREQUENCY_LABELS[r.usageFrequency] || "—"}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        variant={PURPOSE_BADGE[r.primaryPurpose] || "gray"}
                      >
                        {PURPOSE_LABELS[r.primaryPurpose] || "—"}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        variant={RECOMMEND_BADGE[r.wouldRecommend] || "gray"}
                      >
                        {RECOMMEND_LABELS[r.wouldRecommend] || "—"}
                      </Badge>
                    </td>
                    <td className="ra-comment-cell">
                      {r.comment ? (
                        <span title={r.comment}>
                          {r.comment.slice(0, 40)}
                          {r.comment.length > 40 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="ra-no-comment">—</span>
                      )}
                    </td>
                    <td className="ra-date-cell">{formatDate(r.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="ra-pagination">
            <span className="ra-pg-info">
              Trang {page} / {totalPages} ({total} kết quả)
            </span>
            <div className="ra-pg-btns">
              <button
                className="ra-pg-btn"
                disabled={page <= 1}
                onClick={() => handlePage(page - 1)}
              >
                ← Trước
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i
                if (p < 1 || p > totalPages) return null
                return (
                  <button
                    key={p}
                    className={`ra-pg-btn ${p === page ? "ra-pg-btn--active" : ""}`}
                    onClick={() => handlePage(p)}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                className="ra-pg-btn"
                disabled={page >= totalPages}
                onClick={() => handlePage(page + 1)}
              >
                Tiếp →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReviewAdmin
