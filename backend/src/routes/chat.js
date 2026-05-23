const express = require("express")
const router = express.Router()

const Log = require("../app/models/Log")
const { buildStats } = require("../routes/utils/buildStats")

function normalize(str) {
  return (str || "").toLowerCase().trim()
}

router.post("/query", async (req, res) => {
  try {
    const { message, user_id } = req.body

    const text = normalize(message)

    // lấy logs user
    const logs = await Log.find({ user: user_id }).sort({
      createdAt: -1,
    })

    const stats = buildStats(logs)

    let reply = "Không hiểu câu hỏi."

    // ───────────────── SUMMARY ─────────────────
    if (
      text.includes("tổng quan") ||
      text.includes("thống kê") ||
      text.includes("bao nhiêu")
    ) {
      reply =
        `📊 Tổng quan hệ thống\n\n` +
        `• Tổng video: ${stats.tongSoVideo}\n` +
        `• Tổng phát hiện: ${stats.tongSoPhatHien}\n` +
        `• Tổng vi phạm: ${stats.tongSoViPham}\n` +
        `• Tổng bình thường: ${stats.tongSoBinhThuong}\n` +
        `• Tổng biển số: ${stats.tongSoBienSoPhatHien}`
    }

    // ───────────────── TOP VIDEO ─────────────────
    else if (text.includes("top video") || text.includes("nhiều phát hiện")) {
      reply =
        `🎥 Top video nhiều phát hiện nhất\n\n` +
        stats.topVideoNhieuPhatHien
          .map(
            (v, i) =>
              `${i + 1}. ${v.videoName} — ${v.tongSoPhatHien} detections`,
          )
          .join("\n")
    }

    // ───────────────── VIOLATION ─────────────────
    else if (text.includes("vi phạm") || text.includes("vượt tốc")) {
      reply =
        `🚨 Thống kê vi phạm\n\n` + `• Tổng vi phạm: ${stats.tongSoViPham}\n\n`

      if (stats.topVideoNhieuViPham.length > 0) {
        reply +=
          `Top video vi phạm:\n` +
          stats.topVideoNhieuViPham
            .map((v, i) => `${i + 1}. ${v.videoName} — ${v.soViPham} vi phạm`)
            .join("\n")
      }
    }

    // ───────────────── FASTEST ─────────────────
    else if (text.includes("nhanh nhất") || text.includes("tốc độ cao nhất")) {
      const xe = stats.xeChayNhanhNhat

      if (xe) {
        reply =
          `🏎️ Xe chạy nhanh nhất\n\n` +
          `• Biển số: ${xe.bienSo}\n` +
          `• Tốc độ: ${xe.tocDo} km/h\n` +
          `• Video: ${xe.videoName}\n` +
          `• Nhãn: ${xe.nhan}`
      } else {
        reply = "Không có dữ liệu tốc độ."
      }
    }

    // ───────────────── LABEL ─────────────────
    else if (text.includes("loại xe") || text.includes("nhãn")) {
      reply =
        `🚗 Các loại phương tiện phổ biến\n\n` +
        stats.nhanPhoThong
          .slice(0, 10)
          .map((n, i) => `${i + 1}. ${n.label} — ${n.soLan}`)
          .join("\n")
    }

    // ───────────────── PLATE ─────────────────
    else if (text.includes("biển số")) {
      reply =
        `🔍 Danh sách biển số\n\n` +
        stats.bienSoDuyNhat
          .slice(0, 20)
          .map((p, i) => `${i + 1}. ${p}`)
          .join("\n")
    }

    // ───────────────── DAILY ─────────────────
    else if (text.includes("7 ngày") || text.includes("theo ngày")) {
      reply =
        `📅 Thống kê 7 ngày gần nhất\n\n` +
        stats.bay_ngay_gan_nhat
          .map(
            (d) =>
              `• ${d.ngay}: ${d.soPhatHien} detections / ${d.soViPham} vi phạm`,
          )
          .join("\n")
    }

    res.json({
      success: true,
      reply,
      stats,
    })
  } catch (err) {
    console.log(err)

    res.status(500).json({
      success: false,
      reply: "Lỗi server",
    })
  }
})

module.exports = router
