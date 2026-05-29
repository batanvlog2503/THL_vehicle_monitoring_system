import { useState, useEffect, useCallback } from "react"

const API_BASE = import.meta.env.VITE_APP_URL

const getToken = () => localStorage.getItem("accessToken")

async function fetchWithAuth(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── helpers ──────────────────────────────────────────────
const roleColors = {
  admin: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  user: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function Avatar({ name }) {
  const initials = name?.slice(0, 2).toUpperCase() || "??"
  const hue =
    [...(name || "")].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: `hsl(${hue},55%,50%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: 14,
        flexShrink: 0,
        fontFamily: "'DM Mono', monospace",
      }}
    >
      {initials}
    </div>
  )
}

function Badge({ role }) {
  const c = roleColors[role] || roleColors.user
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: c.bg,
        color: c.text,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "3px 9px",
        borderRadius: 99,
        fontFamily: "'DM Mono', monospace",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }}
      />
      {role}
    </span>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px solid #e5e7eb",
        borderRadius: 12,
        padding: "18px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#9ca3af",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: color || "#111827",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Modal chi tiết user ───────────────────────────────────
function UserModal({ user, onClose }) {
  if (!user) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "min(480px, 95vw)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            background: "linear-gradient(135deg,#1e293b 0%,#334155 100%)",
            padding: "28px 28px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Avatar name={user.name} />
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>
              {user.name}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 2 }}>
              {user.email}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "#fff",
              width: 32,
              height: 32,
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div
          style={{
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {[
            ["ID", user._id],
            ["Họ tên", user.name],
            ["Email", user.email],
            ["Số điện thoại", user.mobile],
            [
              "Vai trò",
              <Badge
                key="r"
                role={user.role}
              />,
            ],
            [
              "Xác thực",
              user.is_verified == 1 ? "✅ Đã xác thực" : "⏳ Chưa xác thực",
            ],
            ["Ngày tạo", formatDate(user.createdAt)],
            ["Cập nhật", formatDate(user.updatedAt)],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
            >
              <span
                style={{
                  width: 130,
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  paddingTop: 1,
                }}
              >
                {k}
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: "#111827",
                  wordBreak: "break-all",
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────
export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 10

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await fetchWithAuth(`${API_BASE}/user/admin/users`)
      if (data.success) setUsers(data.users)
      else setError(data.message || "Lỗi không xác định")
    } catch (e) {
      setError("Không thể tải danh sách người dùng: " + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // filter + search
  const filtered = users.filter((u) => {
    const matchRole = roleFilter === "all" || u.role === roleFilter
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.mobile?.includes(q)
    return matchRole && matchSearch
  })

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    verified: users.filter((u) => u.is_verified == 1).length,
  }

  // reset page on filter change
  useEffect(() => setPage(1), [search, roleFilter])

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Sora:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', sans-serif; background: #f8fafc; }
        .row-hover { transition: background 0.15s; cursor: pointer; }
        .row-hover:hover { background: #f0f9ff !important; }
        .btn-page { border: 1.5px solid #e5e7eb; background: #fff; color: #374151;
          width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 13px;
          display:flex; align-items:center; justify-content:center; transition: all 0.15s; }
        .btn-page:hover { border-color:#3b82f6; color:#3b82f6; }
        .btn-page.active { background:#1e293b; color:#fff; border-color:#1e293b; }
        .btn-page:disabled { opacity:0.4; cursor:not-allowed; }
      `}</style>

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 24px",
          fontFamily: "'Sora', sans-serif",
        }}
      >
        {/* title */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              fontFamily: "'Times New Roman', serif",
            }}
          >
            Quản lý người dùng
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
            Danh sách tất cả tài khoản trong hệ thống
          </p>
        </div>

        {/* stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <StatCard
            label="Tổng người dùng"
            value={stats.total}
            color="#1e293b"
          />
          <StatCard
            label="Quản trị viên"
            value={stats.admins}
            color="#f59e0b"
          />
          <StatCard
            label="Đã xác thực"
            value={stats.verified}
            color="#10b981"
          />
        </div>

        {/* toolbar */}
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #e5e7eb",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* search */}
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                fontSize: 15,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, email, SĐT..."
              style={{
                width: "100%",
                paddingLeft: 36,
                paddingRight: 12,
                height: 38,
                border: "1.5px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                fontFamily: "'Sora', sans-serif",
                color: "#111827",
                background: "#f9fafb",
              }}
            />
          </div>

          {/* role filter */}
          {["all", "user", "admin"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                border: "1.5px solid",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Sora',sans-serif",
                borderColor: roleFilter === r ? "#1e293b" : "#e5e7eb",
                background: roleFilter === r ? "#1e293b" : "#fff",
                color: roleFilter === r ? "#fff" : "#6b7280",
                transition: "all 0.15s",
              }}
            >
              {r === "all" ? "Tất cả" : r === "admin" ? "Admin" : "User"}
            </button>
          ))}

          {/* refresh */}
          <button
            onClick={fetchUsers}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1.5px solid #e5e7eb",
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              color: "#374151",
              fontFamily: "'Sora',sans-serif",
            }}
          >
            ↺ Tải lại
          </button>
        </div>

        {/* table */}
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              style={{
                padding: "60px 0",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: 15,
              }}
            >
              Đang tải...
            </div>
          ) : error ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "#ef4444",
              }}
            >
              ⚠️ {error}
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: "60px 0",
                textAlign: "center",
                color: "#9ca3af",
              }}
            >
              Không tìm thấy người dùng nào
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1.5px solid #e5e7eb",
                  }}
                >
                  {[
                    "#",
                    "Người dùng",
                    "SĐT",
                    "Vai trò",
                    "Xác thực",
                    "Ngày tạo",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "11px 16px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#6b7280",
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((u, i) => (
                  <tr
                    key={u._id}
                    className="row-hover"
                    onClick={() => setSelected(u)}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: "#fff",
                    }}
                  >
                    <td
                      style={{
                        padding: "13px 16px",
                        color: "#9ca3af",
                        fontSize: 13,
                        fontFamily: "'DM Mono',monospace",
                      }}
                    >
                      {(page - 1) * PER_PAGE + i + 1}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Avatar name={u.name} />
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              color: "#111827",
                            }}
                          >
                            {u.name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#6b7280",
                              marginTop: 1,
                            }}
                          >
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "13px 16px",
                        fontSize: 13,
                        color: "#374151",
                        fontFamily: "'DM Mono',monospace",
                      }}
                    >
                      {u.mobile}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <Badge role={u.role} />
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 13 }}>
                      {u.is_verified == 1 ? (
                        <span style={{ color: "#10b981", fontWeight: 600 }}>
                          ✔ Đã xác thực
                        </span>
                      ) : (
                        <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                          ⏳ Chưa
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "13px 16px",
                        fontSize: 13,
                        color: "#6b7280",
                        fontFamily: "'DM Mono',monospace",
                      }}
                    >
                      {formatDate(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 16,
            }}
          >
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              Hiển thị {(page - 1) * PER_PAGE + 1}–
              {Math.min(page * PER_PAGE, filtered.length)} / {filtered.length}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn-page"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
                )
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…")
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span
                      key={`e${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        color: "#9ca3af",
                        fontSize: 13,
                      }}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={`btn-page${page === p ? " active" : ""}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                className="btn-page"
                onClick={() => setPage((p) => p + 1)}
                disabled={page === totalPages}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* modal */}
      <UserModal
        user={selected}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
