import axiosInstance from "../../utils/axiosInstance"

// ─── LABEL MAP ────────────────────────────────────────────────
const LABEL_MAP = {
  car: "Ô tô",
  motorbike: "Xe máy",
  motorcycle: "Xe máy",
  truck: "Xe tải",
  bus: "Xe buýt",
  bicycle: "Xe đạp",
  person: "Người đi bộ",
  van: "Xe van",
}
export const fmtLabel = (raw) =>
  !raw ? "Không xác định" : (LABEL_MAP[raw.toLowerCase()] ?? raw)

// ─── FORMAT THỜI GIAN ─────────────────────────────────────────
export const fmtDate = (iso) =>
  !iso
    ? "?"
    : new Date(iso).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })

// ─── CACHE STATS ──────────────────────────────────────────────
let _stats = null
let _cacheTime = 0
const CACHE_TTL = 60_000

export async function fetchStats() {
  if (_stats && Date.now() - _cacheTime < CACHE_TTL) return _stats
  const res = await axiosInstance.get(
    `${import.meta.env.VITE_APP_URL}/stats/overview`,
  )
  _stats = res.data
  _cacheTime = Date.now()
  return _stats
}

export function clearStatsCache() {
  _stats = null
}

// ─── PATTERNS ─────────────────────────────────────────────────
export const QUERY_PATTERNS = [
  {
    type: "summary",
    label: "📊 Tổng quan",
    questions: [
      { text: "Tổng quan tất cả dữ liệu" },
      { text: "Thống kê toàn bộ" },
      { text: "Bao nhiêu video đã phân tích" },
    ],
    keywords: ["tổng quan", "tổng số", "bao nhiêu", "toàn bộ", "thống kê"],
  },
  {
    type: "by_label",
    label: "🚗 Loại phương tiện",
    questions: [
      { text: "Loại xe nào nhiều nhất" },
      { text: "Thống kê xe máy, ô tô" },
      { text: "Phân loại đối tượng" },
    ],
    keywords: [
      "loại xe",
      "xe máy",
      "ô tô",
      "xe tải",
      "xe buýt",
      "người đi bộ",
      "motorbike",
      "car",
      "truck",
      "nhãn",
      "loại",
    ],
  },
  {
    type: "by_time",
    label: "📅 Theo thời gian",
    questions: [
      { text: "Thống kê theo ngày" },
      { text: "Giờ cao điểm" },
      { text: "Xu hướng 7 ngày gần nhất" },
    ],
    keywords: [
      "theo ngày",
      "theo giờ",
      "hôm nay",
      "hôm qua",
      "tuần",
      "giờ cao điểm",
      "khung giờ",
      "thời gian",
      "xu hướng",
      "ngày",
    ],
  },
  {
    type: "violations",
    label: "🚨 Vi phạm",
    questions: [
      { text: "Tổng số vi phạm" },
      { text: "Video nhiều vi phạm nhất" },
      { text: "Xe vi phạm tốc độ cao nhất" },
    ],
    keywords: [
      "vi phạm",
      "vượt tốc",
      "quá tốc",
      "tốc độ",
      "speed",
      "violation",
    ],
  },
  {
    type: "video_list",
    label: "🎬 Danh sách video",
    questions: [
      { text: "Danh sách video" },
      { text: "Video nhiều phát hiện nhất" },
      { text: "Video gần nhất" },
    ],
    keywords: ["video", "danh sách", "file", "gần nhất", "phân tích", "tên"],
  },
  {
    type: "plate",
    label: "🔍 Biển số",
    questions: [
      { text: "Danh sách biển số phát hiện" },
      { text: "Biển số vi phạm" },
    ],
    keywords: ["biển số", "biển", "plate", "tìm xe", "tra cứu"],
  },
]

// ─── MATCH TYPE ───────────────────────────────────────────────
export function matchType(input) {
  const lower = input.toLowerCase()
  for (const p of QUERY_PATTERNS) {
    if (p.keywords.some((k) => lower.includes(k))) return p.type
  }
  return "summary"
}

// ─── HANDLE QUERY ─────────────────────────────────────────────
export async function handleQuery(input, params = {}) {
  const stats = await fetchStats()
  const type = params.type ?? matchType(input)
  return { type, stats, input }
}

// ─── FORMAT KẾT QUẢ ──────────────────────────────────────────
export function formatResult(type, stats, questionText) {
  if (!stats || stats.tongSoVideo === 0) {
    return "📭 Chưa có dữ liệu. Hãy upload và phân tích video trước."
  }

  switch (type) {
    // ── TỔNG QUAN ──────────────────────────────────────────
    case "summary": {
      const top = stats.topVideoNhieuPhatHien?.[0]
      const lines = [
        `📊 **Tổng quan hệ thống**`,
        ``,
        `🎬 **${stats.tongSoVideo}** video đã phân tích`,
        `🔍 **${stats.tongSoPhatHien}** lượt phát hiện`,
      ]
      if (stats.coDataViPham) {
        lines.push(`🚨 **${stats.tongSoViPham}** vi phạm tốc độ`)
        lines.push(`✅ **${stats.tongSoBinhThuong}** phương tiện bình thường`)
      }
      if (stats.coDataBienSo) {
        lines.push(`🔍 **${stats.tongSoBienSo}** biển số duy nhất`)
      }
      if (stats.byLabel?.[0]) {
        lines.push(
          ``,
          `🏆 Đối tượng nhiều nhất: **${fmtLabel(stats.byLabel[0].label)}** (${stats.byLabel[0].count} lần)`,
        )
      }
      if (top) {
        lines.push(
          `🎬 Video nhiều phát hiện nhất: **${top.videoName}** (${top.tongSoPhatHien} lượt)`,
        )
      }
      if (stats.byDay?.[0]) {
        lines.push(
          `📆 Ngày gần nhất: **${stats.byDay[0].day}** — ${stats.byDay[0].soPhatHien} phát hiện`,
        )
      }
      lines.push(
        ``,
        `💡 Hỏi thêm: *"loại xe"*, *"vi phạm"*, *"danh sách video"*`,
      )
      return lines.join("\n")
    }

    // ── LOẠI PHƯƠNG TIỆN ───────────────────────────────────
    case "by_label": {
      const total = stats.tongSoPhatHien
      const lines = [`🚗 **Thống kê loại phương tiện**`, ``]
      ;(stats.byLabel ?? []).forEach((item, i) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
        const bar = "█".repeat(Math.min(Math.round(pct / 5), 20))
        lines.push(
          `${i + 1}. **${fmtLabel(item.label)}** — ${item.count} lần (${pct}%) ${bar}`,
        )
      })
      if (!stats.byLabel?.length) lines.push("Không có dữ liệu.")
      return lines.join("\n")
    }

    // ── THEO THỜI GIAN ─────────────────────────────────────
    case "by_time": {
      const lines = [`📅 **Phân tích theo thời gian**`, ``]

      if (stats.byDay?.length) {
        lines.push(
          `**📆 Theo ngày** (${Math.min(stats.byDay.length, 7)} ngày gần nhất):`,
        )
        stats.byDay.slice(0, 7).forEach((d) => {
          const bar = "▪".repeat(Math.min(d.soVideo, 8))
          lines.push(
            `- **${d.day}**: ${d.soVideo} video — ${d.soPhatHien} phát hiện — ${d.soViPham} vi phạm ${bar}`,
          )
        })
      }

      if (stats.byHour?.length) {
        lines.push(``, `**⏰ Khung giờ nhiều phát hiện nhất:**`)
        stats.byHour.slice(0, 5).forEach((h, i) => {
          lines.push(
            `${i + 1}. **${String(h.hour).padStart(2, "0")}:00** — ${h.soPhatHien} phát hiện (${h.soVideo} video)`,
          )
        })
      }
      return lines.join("\n")
    }

    // ── VI PHẠM ────────────────────────────────────────────
    case "violations": {
      if (!stats.coDataViPham && !stats.coDataTocDo) {
        return "⚠️ Dữ liệu video chưa có thông tin tốc độ hoặc trạng thái vi phạm."
      }
      const lines = [`🚨 **Thống kê vi phạm tốc độ**`, ``]
      lines.push(`- Tổng vi phạm: **${stats.tongSoViPham}** xe`)
      lines.push(`- Bình thường: **${stats.tongSoBinhThuong}** xe`)

      if (stats.topVideoNhieuViPham?.length) {
        lines.push(``, `**Top video nhiều vi phạm nhất:**`)
        stats.topVideoNhieuViPham.slice(0, 5).forEach((v, i) => {
          lines.push(`${i + 1}. **${v.videoName}** — ${v.soViPham} vi phạm`)
        })
      }

      // Xe vi phạm nhanh nhất
      const topSpeed = stats.danhSachVideo
        ?.filter((v) => v.viPhamCaoNhat)
        .sort(
          (a, b) =>
            (b.viPhamCaoNhat?.tocDo ?? 0) - (a.viPhamCaoNhat?.tocDo ?? 0),
        )?.[0]
      if (topSpeed?.viPhamCaoNhat) {
        const vp = topSpeed.viPhamCaoNhat
        lines.push(``, `🏎️ **Xe vi phạm tốc độ cao nhất:**`)
        lines.push(`- Biển số: **${vp.bienSo}**`)
        lines.push(`- Tốc độ: **${vp.tocDo} km/h**`)
        lines.push(`- Thời điểm: ${vp.thoiDiem ?? "?"}`)
        lines.push(`- Video: ${topSpeed.videoName}`)
      }
      return lines.join("\n")
    }

    // ── DANH SÁCH VIDEO ────────────────────────────────────
    case "video_list": {
      const videos = stats.danhSachVideo ?? []
      const lines = [`🎬 **Danh sách ${stats.tongSoVideo} video**`, ``]

      videos.slice(0, 10).forEach((v, i) => {
        lines.push(`**${i + 1}. ${v.videoName}**`)
        lines.push(
          `   📅 ${fmtDate(v.ngayPhanTich)} | 🔍 ${v.tongSoPhatHien} phát hiện | 🚨 ${v.soViPham} vi phạm`,
        )
        if (v.cacNhan?.length) {
          const nhanStr = v.cacNhan
            .slice(0, 3)
            .map((n) => `${fmtLabel(n.label)}(${n.soLan})`)
            .join(", ")
          lines.push(`   🏷️ ${nhanStr}`)
        }
        if (v.tocDoCao) {
          lines.push(
            `   🏎️ Tốc độ: TB ${v.tocDoTB} — cao nhất ${v.tocDoCao} km/h`,
          )
        }
        if (v.bienSo?.length) {
          lines.push(
            `   🔍 Biển số: ${v.bienSo.slice(0, 3).join(", ")}${v.bienSo.length > 3 ? "..." : ""}`,
          )
        }
        lines.push(``)
      })
      if (videos.length > 10)
        lines.push(`_...và ${videos.length - 10} video khác_`)
      return lines.join("\n")
    }

    // ── BIỂN SỐ ────────────────────────────────────────────
    case "plate": {
      if (!stats.coDataBienSo) {
        return "⚠️ Dữ liệu video chưa có thông tin biển số."
      }
      const allPlates = {}
      ;(stats.danhSachVideo ?? []).forEach((v) => {
        v.bienSo?.forEach((p) => {
          allPlates[p] = (allPlates[p] || 0) + 1
        })
      })
      const sorted = Object.entries(allPlates)
        .map(([plate, count]) => ({ plate, count }))
        .sort((a, b) => b.count - a.count)

      const lines = [
        `🔍 **Danh sách biển số phát hiện** (${sorted.length} biển)`,
        ``,
      ]
      sorted.slice(0, 15).forEach((p, i) => {
        lines.push(`${i + 1}. **${p.plate}** — ${p.count} lần`)
      })
      if (sorted.length > 15)
        lines.push(`_...và ${sorted.length - 15} biển số khác_`)
      return lines.join("\n")
    }

    default:
      return `❓ Không hiểu câu hỏi.\nThử: *"tổng quan"*, *"loại xe"*, *"vi phạm"*, *"danh sách video"*`
  }
}
