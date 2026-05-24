import React, { useEffect, useRef, useState } from "react"
import { marked } from "marked"
import { useBlocker } from "react-router-dom"
import axiosInstance from "../../utils/axiosInstance"
import "./Chatbot1.scss"
import ConfirmModal from "./ConfirmModel"

marked.setOptions({ breaks: true, gfm: true })

// ─────────────────────────────────────────────────────────────────────────────
// MENU
// ─────────────────────────────────────────────────────────────────────────────
const MENU = [
  { label: "Tổng quan", question: "Tổng quan dữ liệu giao thông" },
  { label: "Top video", question: "Top video nhiều phát hiện" },
  {
    label: "Vi phạm ›",
    children: [
      {
        label: "Tổng hợp vi phạm",
        question: "Vi phạm tổng hợp thống kê chung",
      },
      {
        label: "Vi phạm tốc độ",
        question: "Vi phạm tốc độ chi tiết theo từng video",
      },
      {
        label: "Vi phạm theo ngày",
        question: "Vi phạm theo từng ngày trong 2 tuần",
      },
      { label: "Biển số vi phạm", question: "Danh sách biển số xe vi phạm" },
      {
        label: "Video nhiều vi phạm",
        question: "Top video nhiều vi phạm nhất",
      },
    ],
  },
  {
    label: "Tốc độ ›",
    children: [
      {
        label: "Xe nhanh nhất toàn bộ",
        question: "Xe nhanh nhất trong tất cả video",
      },
      { label: "Top 5 tốc độ cao nhất", question: "Top 5 tốc độ cao nhất" },
    ],
  },
  { label: "Loại xe", question: "Thống kê loại phương tiện phát hiện được" },
  { label: "Danh sách video", question: "Danh sách tất cả video đã phân tích" },
  {
    label: "Biển số ›",
    children: [
      {
        label: "Tất cả biển số",
        question: "Thống kê biển số xe phát hiện được",
      },
      { label: "Biển số vi phạm", question: "Danh sách biển số xe vi phạm" },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// HTML TABLE BUILDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_STYLE = `
  style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;"
`
const TH_STYLE = `
  style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;
         text-align:left;border-bottom:1.5px solid #e2e8f0;white-space:nowrap;font-size:11.5px;letter-spacing:.3px;"
`
const TH_NUM_STYLE = `
  style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;
         text-align:right;border-bottom:1.5px solid #e2e8f0;white-space:nowrap;font-size:11.5px;letter-spacing:.3px;"
`
const TD_STYLE = `
  style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;vertical-align:middle;"
`
const TD_NUM_STYLE = `
  style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;
         vertical-align:middle;text-align:right;font-variant-numeric:tabular-nums;font-family:monospace;"
`
const TR_EVEN = `style="background:#ffffff;"`
const TR_ODD = `style="background:#f8fafc;"`

function buildTable(headers, rows) {
  // headers: array of { label, numeric? }
  // rows: array of array of cell strings (can contain HTML)
  const ths = headers
    .map((h) => `<th ${h.numeric ? TH_NUM_STYLE : TH_STYLE}>${h.label}</th>`)
    .join("")

  const trs = rows
    .map((row, i) => {
      const tds = row
        .map((cell, ci) => {
          const style = headers[ci]?.numeric ? TD_NUM_STYLE : TD_STYLE
          return `<td ${style}>${cell}</td>`
        })
        .join("")
      return `<tr ${i % 2 === 0 ? TR_ODD : TR_EVEN}>${tds}</tr>`
    })
    .join("")

  return `<div style="overflow-x:auto;border-radius:8px;border:1px solid #1e293b;margin-top:4px;">
    <table ${TABLE_STYLE}>
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>`
}

function badge(text, color = "#3b82f6") {
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${color}22;color:${color};font-size:12px;font-weight:600;">${text}</span>`
}

function statCard(label, value, accent = "#2563eb") {
  return `<div style="flex:1;min-width:110px;padding:12px 16px;background:#ffffff;border-radius:10px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
    <div style="font-size:11px;color:#64748b;margin-bottom:4px;letter-spacing:.3px;text-transform:uppercase;">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${accent};font-variant-numeric:tabular-nums;line-height:1.2;">${value}</div>
  </div>`
}

function section(icon, title, content) {
  return `<div style="margin-bottom:4px;">
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:16px;line-height:1;">${icon}</span>
      <span style="font-size:13.5px;font-weight:600;color:#1e293b;">${title}</span>
    </div>
    ${content}
  </div>`
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTER
// ─────────────────────────────────────────────────────────────────────────────
function formatReply(intent, data) {
  const fmt = (n) => (n == null ? "—" : n)
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—")
  const fmtSpeed = (s) => (s == null ? "—" : `${s} km/h`)
  const num = (n) => (n == null ? "—" : Number(n).toLocaleString("vi-VN"))
  const truncate = (str, len = 36) =>
    str && str.length > len ? str.slice(0, len) + "…" : str || "—"

  switch (intent) {
    // ── OVERVIEW ──────────────────────────────────────────────────────────
    case "overview": {
      const d = data.overview || {}
      const cards = `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:4px;">
        ${statCard("Tổng video", num(d.tongSoVideo), "#6366f1")}
        ${statCard("Phát hiện", num(d.tongSoPhatHien), "#3b82f6")}
        ${statCard("Vi phạm", num(d.tongSoViPham), "#ef4444")}
        ${statCard("Bình thường", num(d.tongSoBinhThuong), "#22c55e")}
      </div>`
      return section("📊", "Tổng quan hệ thống", cards)
    }

    // ── TOP VIDEOS ────────────────────────────────────────────────────────
    case "topVideos": {
      const list = data.topVideos || []
      if (!list.length)
        return section(
          "🎬",
          "Top video nhiều phát hiện",
          "<p style='color:#64748b'>Chưa có dữ liệu.</p>",
        )
      const table = buildTable(
        [
          { label: "#" },
          { label: "Tên video" },
          { label: "Phát hiện", numeric: true },
          { label: "Ngày" },
        ],
        list.map((v, i) => [
          badge(i + 1, "#6366f1"),
          `<span style="font-size:12px;color:#64748b;" title="${v.videoName}">${truncate(v.videoName, 32)}</span>`,
          `<b style="color:#2563eb">${num(v.tongSoPhatHien)}</b>`,
          `<span style="color:#475569">${fmtDate(v.createdAt)}</span>`,
        ]),
      )
      return section("🎬", "Top video nhiều phát hiện", table)
    }

    // ── VIOLATIONS SUMMARY ────────────────────────────────────────────────
    case "violations": {
      const d = data.violations || {}
      const cards = `<div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${statCard("Tổng vi phạm", num(d.tongViPham), "#ef4444")}
        ${statCard("Số video", num(d.soVideo), "#f59e0b")}
        ${statCard("Tốc độ max", fmtSpeed(d.tocDoCaoNhat), "#f97316")}
        ${statCard("Tốc độ TB", fmtSpeed(d.tocDoTB), "#a78bfa")}
      </div>`
      return section("🚨", "Tổng hợp vi phạm", cards)
    }

    // ── SPEED VIOLATIONS ──────────────────────────────────────────────────
    case "speedViolations": {
      const list = data.speedViolations || []
      if (!list.length)
        return section(
          "🚗",
          "Vi phạm tốc độ theo video",
          "<p style='color:#64748b'>Không có dữ liệu.</p>",
        )
      const table = buildTable(
        [
          { label: "#" },
          { label: "Video" },
          { label: "Vi phạm", numeric: true },
          { label: "Tốc độ max", numeric: true },
          { label: "Tốc độ TB", numeric: true },
        ],
        list.map((v, i) => [
          badge(i + 1, "#6366f1"),
          `<span style="font-size:12px;color:#64748b;" title="${v._id}">${truncate(v._id, 30)}</span>`,
          `<b style="color:#dc2626">${num(v.soViPham)}</b>`,
          `<span style="color:#ea580c;font-weight:600">${fmtSpeed(v.tocDoCaoNhat)}</span>`,
          `<span style="color:#475569">${fmtSpeed(v.tocDoTrungBinh ? Math.round(v.tocDoTrungBinh) : null)}</span>`,
        ]),
      )
      return section("🚗", "Vi phạm tốc độ theo video", table)
    }

    // ── VIOLATIONS BY DAY ─────────────────────────────────────────────────
    case "violationsByDay": {
      const list = data.violationsByDay || []
      if (!list.length)
        return section(
          "📅",
          "Vi phạm theo ngày",
          "<p style='color:#64748b'>Không có dữ liệu.</p>",
        )
      const table = buildTable(
        [
          { label: "Ngày" },
          { label: "Vi phạm", numeric: true },
          { label: "Số video", numeric: true },
        ],
        list.map((d) => [
          `<span style="color:#334155;font-family:monospace;font-weight:500">${d.ngay}</span>`,
          `<b style="color:#dc2626">${num(d.soViPham)}</b>`,
          `<span style="color:#475569">${num(d.soVideo)}</span>`,
        ]),
      )
      return section("📅", "Vi phạm theo ngày (14 ngày gần nhất)", table)
    }

    // ── VIOLATION PLATES ──────────────────────────────────────────────────
    case "violationPlates": {
      const list = data.violationPlates || []
      if (!list.length)
        return section(
          "🪪",
          "Biển số xe vi phạm",
          "<p style='color:#64748b'>Không tìm thấy.</p>",
        )
      const table = buildTable(
        [
          { label: "#" },
          { label: "Biển số" },
          { label: "Lần vi phạm", numeric: true },
          { label: "Tốc độ max", numeric: true },
          { label: "Số video", numeric: true },
        ],
        list.map((p, i) => {
          const bienSo = p.bienSo || p._id || "—"
          return [
            badge(i + 1, "#6366f1"),
            `<code style="background:#fef3c7;padding:2px 7px;border-radius:5px;color:#92400e;font-size:12px;font-weight:600;">${bienSo}</code>`,
            badge(`🚨 ${num(p.soLanViPham)}`, "#dc2626"),
            `<span style="color:#ea580c;font-weight:600">${fmtSpeed(p.tocDoCaoNhat)}</span>`,
            `<span style="color:#475569">${fmt(p.soVideo ?? p.videoNames?.length)}</span>`,
          ]
        }),
      )
      const note = `<p style="font-size:12px;color:#64748b;margin-bottom:8px;">Tổng <b style="color:#1e293b">${list.length}</b> biển số bị ghi nhận vi phạm</p>`
      return section("🪪", "Biển số xe vi phạm", note + table)
    }

    // ── TOP VIOLATION VIDEOS ──────────────────────────────────────────────
    case "topViolationVideos": {
      const list = data.topViolationVideos || []
      if (!list.length)
        return section(
          "🏆",
          "Top video nhiều vi phạm",
          "<p style='color:#64748b'>Chưa có dữ liệu.</p>",
        )
      const table = buildTable(
        [
          { label: "#" },
          { label: "Tên video" },
          { label: "Vi phạm", numeric: true },
          { label: "Ngày" },
        ],
        list.map((v, i) => [
          badge(i + 1, "#f59e0b"),
          `<span style="font-size:12px;color:#64748b;" title="${v.videoName}">${truncate(v.videoName, 32)}</span>`,
          `<b style="color:#dc2626">${num(v.soViPham)}</b>`,
          `<span style="color:#475569">${fmtDate(v.createdAt)}</span>`,
        ]),
      )
      return section("🏆", "Top video nhiều vi phạm nhất", table)
    }

    // ── FASTEST VEHICLE ───────────────────────────────────────────────────
    case "fastestVehicle": {
      const v = data.fastestVehicle
      if (!v)
        return section(
          "🏎️",
          "Xe chạy nhanh nhất",
          "<p style='color:#64748b'>Chưa có dữ liệu.</p>",
        )
      const isViolation = v.status === "violation"
      const cards = `
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
          ${statCard("Tốc độ", fmtSpeed(v.speed), "#f97316")}
          ${statCard("Trạng thái", isViolation ? "Vi phạm" : "Bình thường", isViolation ? "#ef4444" : "#22c55e")}
        </div>
        <div style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;">
          <div><span style="color:#64748b">Loại xe:</span> <span style="color:#1e293b;font-weight:500">${fmt(v.label)}</span></div>
          <div><span style="color:#64748b">Biển số:</span> <code style="background:#fef3c7;padding:1px 6px;border-radius:4px;color:#92400e;font-weight:600">${fmt(v.plate)}</code></div>
          <div><span style="color:#64748b">Thời điểm:</span> <span style="color:#1e293b;font-weight:500">${fmt(v.time)}</span></div>
          <div><span style="color:#64748b">Video:</span> <span style="color:#64748b;font-size:12px">${truncate(v.videoName, 28)}</span></div>
        </div>`
      return section("🏎️", "Xe chạy nhanh nhất", cards)
    }

    // ── TOP 5 SPEED ───────────────────────────────────────────────────────
    case "top5Speed": {
      const list = data.top5Speed || []
      if (!list.length)
        return section(
          "⚡",
          "Top 5 tốc độ cao nhất",
          "<p style='color:#64748b'>Chưa có dữ liệu.</p>",
        )
      const table = buildTable(
        [
          { label: "#" },
          { label: "Tốc độ", numeric: true },
          { label: "Loại xe" },
          { label: "Biển số" },
          { label: "Thời điểm" },
          { label: "Video" },
        ],
        list.map((v, i) => [
          badge(i + 1, "#f59e0b"),
          `<b style="color:#ea580c;font-family:monospace;font-weight:700">${fmtSpeed(v.speed)}</b>`,
          `<span style="color:#1e293b">${fmt(v.label)}</span>`,
          v.plate
            ? `<code style="background:#fef3c7;padding:1px 6px;border-radius:4px;color:#92400e;font-size:12px;font-weight:600">${v.plate}</code>`
            : "—",
          `<span style="color:#475569">${fmt(v.time)}</span>`,
          `<span style="font-size:12px;color:#64748b" title="${v.videoName}">${truncate(v.videoName, 24)}</span>`,
        ]),
      )
      return section("⚡", "Top 5 tốc độ cao nhất", table)
    }

    // ── VEHICLE TYPES ─────────────────────────────────────────────────────
    case "vehicleTypes": {
      const list = data.vehicleTypes || []
      if (!list.length)
        return section(
          "🚦",
          "Thống kê loại phương tiện",
          "<p style='color:#64748b'>Chưa có dữ liệu.</p>",
        )
      const total = list.reduce((s, v) => s + v.soLan, 0)
      const table = buildTable(
        [
          { label: "#" },
          { label: "Loại xe" },
          { label: "Số lần", numeric: true },
          { label: "Tỷ lệ", numeric: true },
          { label: "Vi phạm", numeric: true },
        ],
        list.map((v, i) => {
          const pct = total ? Math.round((v.soLan / total) * 100) : 0
          const barW = Math.max(pct, 2)
          return [
            badge(i + 1, "#6366f1"),
            fmt(v._id),
            `<b>${num(v.soLan)}</b>`,
            `<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">
              <span style="color:#475569">${pct}%</span>
              <div style="width:50px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
                <div style="width:${barW}%;height:100%;background:#2563eb;border-radius:3px;"></div>
              </div>
            </div>`,
            v.soViPham > 0
              ? badge(num(v.soViPham), "#dc2626")
              : `<span style="color:#16a34a;font-weight:500">0</span>`,
          ]
        }),
      )
      return section("🚦", "Thống kê loại phương tiện", table)
    }

    // ── VIDEO LIST ────────────────────────────────────────────────────────
    case "videoList": {
      const list = data.videoList || []
      if (!list.length)
        return section(
          "📁",
          "Danh sách video",
          "<p style='color:#64748b'>Chưa có video nào.</p>",
        )
      const table = buildTable(
        [
          { label: "#" },
          { label: "Tên video" },
          { label: "Phát hiện", numeric: true },
          { label: "Vi phạm", numeric: true },
          { label: "Giới hạn", numeric: true },
          { label: "Ngày" },
        ],
        list.map((v, i) => [
          badge(i + 1, "#6366f1"),
          `<span style="font-size:12px;color:#64748b;" title="${v.videoName}">${truncate(v.videoName, 30)}</span>`,
          `<span style="color:#1e293b;font-weight:500">${num(v.tongSoPhatHien)}</span>`,
          v.soViPham > 0
            ? badge(num(v.soViPham), "#dc2626")
            : `<span style="color:#16a34a;font-weight:500">0</span>`,
          `<span style="color:#475569">${fmt(v.speedLimit)} km/h</span>`,
          `<span style="color:#475569">${fmtDate(v.createdAt)}</span>`,
        ]),
      )
      return section("📁", "Danh sách video đã phân tích", table)
    }

    // ── PLATES ────────────────────────────────────────────────────────────
    case "plates": {
      const list = data.plates || []
      if (!list.length)
        return section(
          "🔍",
          "Thống kê biển số xe",
          "<p style='color:#64748b'>Chưa có dữ liệu.</p>",
        )
      const totalXuatHien = list.reduce((s, p) => s + (p.soLanXuatHien || 0), 0)
      const violationCount = list.filter((p) => p.soViPham > 0).length
      const note = `<p style="font-size:12px;color:#64748b;margin-bottom:8px;">
        Tổng <b style="color:#1e293b">${list.length}</b> biển số —
        <b style="color:#dc2626">${violationCount}</b> có vi phạm
      </p>`
      const table = buildTable(
        [
          { label: "#" },
          { label: "Biển số" },
          { label: "Xuất hiện", numeric: true },
          { label: "Vi phạm", numeric: true },
          { label: "Tốc độ max", numeric: true },
          { label: "Số video", numeric: true },
        ],
        list.map((p, i) => {
          const bienSo = p.bienSo || p._id || "—"
          const pct = totalXuatHien
            ? Math.round((p.soLanXuatHien / totalXuatHien) * 100)
            : 0
          return [
            badge(i + 1, "#6366f1"),
            `<code style="background:#fef3c7;padding:2px 7px;border-radius:5px;color:#92400e;font-size:12px;font-weight:600;">${bienSo}</code>`,
            `<span style="color:#1e293b;font-weight:500">${num(p.soLanXuatHien)}<span style="color:#94a3b8;font-size:11px;margin-left:3px;">(${pct}%)</span></span>`,
            p.soViPham > 0
              ? badge(`🚨 ${num(p.soViPham)}`, "#dc2626")
              : `<span style="color:#16a34a;font-weight:500">✅ 0</span>`,
            `<span style="color:#ea580c;font-weight:600">${fmtSpeed(p.tocDoCaoNhat)}</span>`,
            `<span style="color:#475569">${fmt(p.soVideo ?? p.videoNames?.length)}</span>`,
          ]
        }),
      )
      return section("🔍", "Thống kê biển số xe", note + table)
    }

    // ── GENERAL / DEFAULT ─────────────────────────────────────────────────
    default: {
      const parts = []
      if (data.overview) parts.push(formatReply("overview", data))
      if (data.topVideos) parts.push(formatReply("topVideos", data))
      return (
        parts.join(
          `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">`,
        ) || "<p style='color:#64748b'>Không có dữ liệu.</p>"
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME (plain HTML — not markdown)
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_HTML = `
<div style="line-height:1.6;">
  <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:6px;">Xin chào 👋</div>
  <p style="color:#64748b;margin-bottom:12px;font-size:13px;">Tôi có thể hỗ trợ phân tích dữ liệu video giao thông.</p>
  <div style="font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.5px;margin-bottom:7px;">VÍ DỤ</div>
  <div style="display:flex;flex-direction:column;gap:5px;">
    <div style="display:flex;align-items:center;gap:8px;color:#475569;font-size:13px;">
      <span>📊</span> <b style="color:#1e293b">Tổng quan</b> — thống kê chung toàn bộ
    </div>
    <div style="display:flex;align-items:center;gap:8px;color:#475569;font-size:13px;">
      <span>🚨</span> <b style="color:#1e293b">Vi phạm</b> → theo ngày, tốc độ, biển số
    </div>
    <div style="display:flex;align-items:center;gap:8px;color:#475569;font-size:13px;">
      <span>⚡</span> <b style="color:#1e293b">Tốc độ</b> → xe nhanh nhất, top 5
    </div>
    <div style="display:flex;align-items:center;gap:8px;color:#475569;font-size:13px;">
      <span>🚦</span> <b style="color:#1e293b">Loại xe</b> — phân loại phương tiện
    </div>
  </div>
</div>
`

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function Chatbot1() {
  const [messages, setMessages] = useState([
    { sender: "bot", text: WELCOME_HTML, time: new Date() },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      messages.length > 1 && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const formatTime = (date) =>
    new Date(date).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })

  const pushUser = (text) =>
    setMessages((prev) => [...prev, { sender: "user", text, time: new Date() }])

  const pushBot = (html) =>
    setMessages((prev) => [
      ...prev,
      { sender: "bot", text: html, time: new Date() },
    ])

  // ─────────────────────────────────────────────────────────────────────────
  // SEND
  // ─────────────────────────────────────────────────────────────────────────
  const send = async (questionText = "") => {
    const content = questionText || input.trim()
    if (!content || loading) return

    pushUser(content)
    setInput("")
    setLoading(true)
    setActiveMenu(null)

    try {
      const user = JSON.parse(localStorage.getItem("user"))

      const res = await axiosInstance.post(
        `${import.meta.env.VITE_APP_URL}/stats/chatbot/query`,
        { question: content, userId: user?._id },
      )

      const { intent, data } = res.data
      const html = formatReply(intent, data)
      pushBot(html)
    } catch (err) {
      console.error(err)
      pushBot(
        `<p style="color:#ef4444;">❌ Không thể kết nối server. Vui lòng thử lại.</p>`,
      )
    }

    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearChat = () => {
    setMessages([{ sender: "bot", text: WELCOME_HTML, time: new Date() }])
    setActiveMenu(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUICK BUTTONS
  // ─────────────────────────────────────────────────────────────────────────
  const renderQuickButtons = () => {
    if (activeMenu) {
      return (
        <div className="quick-questions">
          <button
            className="quick-btn back-btn"
            onClick={() => setActiveMenu(null)}
          >
            ← Quay lại
          </button>
          <span className="quick-divider" />
          {activeMenu.children.map((item, i) => (
            <button
              key={i}
              className="quick-btn sub-btn"
              onClick={() => send(item.question)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )
    }

    return (
      <div className="quick-questions">
        {MENU.map((item, i) => (
          <button
            key={i}
            className={`quick-btn ${item.children ? "has-children" : ""}`}
            onClick={() =>
              item.children ? setActiveMenu(item) : send(item.question)
            }
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="chatbot-wrapper open">
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
                dangerouslySetInnerHTML={{ __html: msg.text }}
              />
              <span className="msg-time">{formatTime(msg.time)}</span>
            </div>
          </div>
        ))}

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

        {!loading && renderQuickButtons()}
        <div ref={bottomRef} />
      </div>

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

      <ConfirmModal
        isOpen={blocker.state === "blocked"}
        onConfirm={() => blocker.proceed()}
        onCancel={() => blocker.reset()}
      />
    </div>
  )
}

export default Chatbot1
