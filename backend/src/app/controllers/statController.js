const Log = require("../models/Log")
const { buildStats } = require("../../routes/utils/buildStats")

function normalize(str) {
  return (str || "").toLowerCase().trim()
}
class StatController {
  async chatbotTest(req, res) {
    return res.json({
      reply: "Test thành công!",
    })
  }

  async chatbotQuery(req, res) {
    try {
      const { question, userId } = req.body

      const logs = await Log.find({
        user: userId,
      }).sort({ createdAt: -1 })
      console.log("TOTAL LOGS:", logs.length)
      const stats = buildStats(logs)

      const q = normalize(question)

      // ─────────────────────────────────────
      // TỔNG QUAN
      // ─────────────────────────────────────
      if (
        q.includes("tổng quan") ||
        q.includes("thống kê") ||
        q.includes("bao nhiêu")
      ) {
        return res.json({
          reply:
            `📊 TỔNG QUAN HỆ THỐNG\n\n` +
            `- Tổng video: ${stats.tongSoVideo}\n` +
            `- Tổng phát hiện: ${stats.tongSoPhatHien}\n` +
            `- Tổng vi phạm: ${stats.tongSoViPham}\n` +
            `- Tổng biển số: ${stats.tongSoBienSoPhatHien}`,
        })
      }

      // ─────────────────────────────────────
      // TOP VIDEO
      // ─────────────────────────────────────
      if (q.includes("top video") || q.includes("nhiều phát hiện")) {
        const text = stats.topVideoNhieuPhatHien
          .map(
            (v, i) =>
              `${i + 1}. ${v.videoName} — ${v.tongSoPhatHien} phát hiện`,
          )
          .join("\n")

        return res.json({
          reply: `🎥 TOP VIDEO NHIỀU PHÁT HIỆN\n\n${text}`,
        })
      }

      // ─────────────────────────────────────
      // VI PHẠM
      // ─────────────────────────────────────
      if (q.includes("vi phạm") || q.includes("vượt tốc")) {
        const text = stats.topVideoNhieuViPham
          .map((v, i) => `${i + 1}. ${v.videoName} — ${v.soViPham} vi phạm`)
          .join("\n")

        return res.json({
          reply:
            `🚨 THỐNG KÊ VI PHẠM\n\n` +
            `Tổng vi phạm: ${stats.tongSoViPham}\n\n` +
            text,
        })
      }

      // ─────────────────────────────────────
      // XE NHANH NHẤT
      // ─────────────────────────────────────
      if (q.includes("nhanh nhất") || q.includes("tốc độ cao nhất")) {
        const xe = stats.xeChayNhanhNhat

        if (!xe) {
          return res.json({
            reply: "Không có dữ liệu tốc độ.",
          })
        }

        return res.json({
          reply:
            `🏎️ XE NHANH NHẤT\n\n` +
            `- Biển số: ${xe.bienSo}\n` +
            `- Tốc độ: ${xe.tocDo} km/h\n` +
            `- Video: ${xe.videoName}\n` +
            `- Thời điểm: ${xe.thoiDiem || "Không rõ"}`,
        })
      }

      // ─────────────────────────────────────
      // LOẠI XE
      // ─────────────────────────────────────
      if (q.includes("loại xe") || q.includes("xe nhiều nhất")) {
        const text = stats.nhanPhoThong
          .slice(0, 10)
          .map((n, i) => `${i + 1}. ${n.label} — ${n.soLan} lần`)
          .join("\n")

        return res.json({
          reply: `🚗 THỐNG KÊ LOẠI XE\n\n` + text,
        })
      }

      // ─────────────────────────────────────
      // DANH SÁCH VIDEO
      // ─────────────────────────────────────
      if (q.includes("danh sách video") || q.includes("video")) {
        const text = stats.danhSachVideo
          .slice(0, 10)
          .map(
            (v, i) =>
              `${i + 1}. ${v.videoName}\n` +
              `   - Phát hiện: ${v.tongSoPhatHien}\n` +
              `   - Vi phạm: ${v.soViPham}`,
          )
          .join("\n\n")

        return res.json({
          reply: `🎬 DANH SÁCH VIDEO\n\n${text}`,
        })
      }

      // ─────────────────────────────────────
      // BIỂN SỐ
      // ─────────────────────────────────────
      if (q.includes("biển số")) {
        const plates = stats.bienSoDuyNhat.slice(0, 10).join("\n- ")

        return res.json({
          reply: `🔍 BIỂN SỐ ĐÃ PHÁT HIỆN\n\n- ${plates}`,
        })
      }

      // ─────────────────────────────────────
      // DEFAULT
      // ─────────────────────────────────────
      return res.json({
        reply:
          `Tôi có thể hỗ trợ:\n\n` +
          `- Tổng quan\n` +
          `- Vi phạm\n` +
          `- Loại xe\n` +
          `- Xe nhanh nhất\n` +
          `- Danh sách video\n` +
          `- Biển số`,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({
        reply: "Lỗi server",
      })
    }
  }
}

module.exports = new StatController()
