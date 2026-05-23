// // routes/chat.js
// // ==============
// // Route xử lý chat AI, dùng buildStats đã cập nhật.

// const express = require("express")
// const router = express.Router()
// const Log = require("../app/models/Log")
// const OpenAI = require("openai")
// const { buildStats } = require("./utils/buildStats")

// const openai = new OpenAI({
//   baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
//   apiKey: process.env.OPENAI_API_KEY || "ollama",
// })

// const MODEL = "qwen2.5:7b"

// // ─────────────────────────────────────────────────────────────
// // Helper: tạo nội dung context gọn, có cấu trúc cho system prompt
// // ─────────────────────────────────────────────────────────────
// function buildContext(stats, lang) {
//   if (stats.tongSoVideo === 0) {
//     return lang === "en"
//       ? "No analysis history found for this user."
//       : "Chưa có lịch sử phân tích nào cho người dùng này."
//   }

//   const topPH = stats.topVideoNhieuPhatHien
//     .map(
//       (v, i) => `  ${i + 1}. "${v.videoName}" — ${v.tongSoPhatHien} phát hiện`,
//     )
//     .join("\n")

//   const topVP = stats.topVideoNhieuViPham
//     .map((v, i) => `  ${i + 1}. "${v.videoName}" — ${v.soViPham} vi phạm`)
//     .join("\n")

//   const nhanStr = stats.nhanPhoThong
//     .map((n) => `${n.label}: ${n.soLan} lần`)
//     .join(", ")

//   const ngayStr = stats.bay_ngay_gan_nhat
//     .map(
//       (n) =>
//         `  ${n.ngay}: ${n.soVideo} video, ${n.soPhatHien} phát hiện, ${n.soViPham} vi phạm`,
//     )
//     .join("\n")

//   const videoDetail = stats.danhSachVideo
//     .map((v) => {
//       const nhanInfo = v.cacNhanTheoSoLan
//         .map((n) => `${n.label}(${n.soLan})`)
//         .join(", ")

//       const tocDoInfo =
//         v.tocDoCaoNhat != null
//           ? `tốc độ: TB=${v.tocDoTrungBinh} km/h, max=${v.tocDoCaoNhat} km/h, min=${v.tocDoThapNhat} km/h`
//           : "không có dữ liệu tốc độ"

//       const viPhamCaoNhat = v.viPhamTocDoCaoNhat
//         ? `vi phạm cao nhất: biển=${v.viPhamTocDoCaoNhat.bienSo} speed=${v.viPhamTocDoCaoNhat.tocDo}km/h lúc ${v.viPhamTocDoCaoNhat.thoiDiem || "?"}`
//         : ""

//       const bienSoInfo =
//         v.bienSoPhatHien.length > 0
//           ? `biển số: ${v.bienSoPhatHien.join(", ")}`
//           : "không phát hiện biển số"

//       return [
//         `[Video ${v.stt}] "${v.videoName}"`,
//         `  Ngày: ${new Date(v.ngayPhanTich).toLocaleString("vi-VN")}`,
//         `  Giới hạn tốc độ: ${v.gioiHanTocDo} km/h`,
//         `  Phát hiện: ${v.tongSoPhatHien} | Vi phạm: ${v.soViPham} | Bình thường: ${v.soBinhThuong}`,
//         `  Vi phạm tốc độ: ${v.soViPhamTocDo}`,
//         `  ${tocDoInfo}`,
//         viPhamCaoNhat ? `  ${viPhamCaoNhat}` : null,
//         `  Nhãn: ${nhanInfo || "không có"}`,
//         `  ${bienSoInfo}`,
//       ]
//         .filter(Boolean)
//         .join("\n")
//     })
//     .join("\n\n")

//   return `
// === TỔNG QUAN ===
// - Tổng số video đã phân tích: ${stats.tongSoVideo}
// - Tổng số phát hiện: ${stats.tongSoPhatHien}
// - Tổng số vi phạm: ${stats.tongSoViPham}
// - Tổng số bình thường: ${stats.tongSoBinhThuong}
// - Tổng số biển số duy nhất: ${stats.tongSoBienSoPhatHien}
// - Nhãn phổ biến: ${nhanStr}

// === TOP 5 VIDEO NHIỀU PHÁT HIỆN NHẤT ===
// ${topPH}

// === TOP 5 VIDEO NHIỀU VI PHẠM NHẤT ===
// ${topVP}

// === 7 NGÀY GẦN NHẤT ===
// ${ngayStr}

// === CHI TIẾT TỪNG VIDEO ===
// ${videoDetail}
// `.trim()
// }

// // ─────────────────────────────────────────────────────────────
// // POST /chat
// // ─────────────────────────────────────────────────────────────
// router.post("/", async (req, res) => {
//   try {
//     const { message, user_id, lang = "vi" } = req.body

//     // Lấy logs của user
//     const logs = await Log.find({ user_id }).sort({ createdAt: -1 }).lean()
//     console.log(
//       `[CHAT] user_id=${user_id} | logs=${logs.length} | lang=${lang}`,
//     )

//     // Tính stats đầy đủ
//     const stats = buildStats(logs)
//     const context = buildContext(stats, lang)

//     // Instruction ngôn ngữ
//     const langRule =
//       lang === "en"
//         ? "You MUST respond in English only. Never use Vietnamese."
//         : "Bạn BẮT BUỘC trả lời bằng Tiếng Việt. TUYỆT ĐỐI không dùng tiếng Anh."

//     const wrappedMessage =
//       lang === "en"
//         ? `[Answer in English] ${message}`
//         : `[Trả lời bằng Tiếng Việt] ${message}`

//     const completion = await openai.chat.completions.create({
//       model: MODEL,
//       messages: [
//         {
//           role: "system",
//           content: `Bạn là trợ lý AI chuyên phân tích dữ liệu giám sát giao thông từ video.
// ${langRule}

// === DỮ LIỆU THỰC TẾ CỦA NGƯỜI DÙNG ===
// ${context}
// ========================================

// QUY TẮC BẮT BUỘC:
// 1. CHỈ dùng số liệu từ dữ liệu trên. KHÔNG tự bịa hoặc ước lượng.
// 2. Nếu không có dữ liệu liên quan → trả lời "Không có dữ liệu".
// 3. Khi nhắc tên video → dùng trường "videoName", KHÔNG dùng _id.
// 4. Khi người dùng hỏi tổng số video → trả lời đúng: ${stats.tongSoVideo}.
// 5. Khi người dùng hỏi top video → dùng topVideoNhieuPhatHien hoặc topVideoNhieuViPham.
// 6. Khi hỏi xu hướng / tuần → dùng dữ liệu 7 ngày gần nhất.
// 7. Khi hỏi biển số → liệt kê đúng từ trường bienSoPhatHien.
// 8. Trả lời ngắn gọn, rõ ràng, dùng danh sách khi phù hợp.
// 9. Có thể dùng Markdown (bold, bullet) để trình bày đẹp hơn.`,
//         },
//         {
//           role: "user",
//           content: wrappedMessage,
//         },
//       ],
//       temperature: 0.3, // thấp → AI bám sát dữ liệu, ít sáng tạo
//       max_tokens: 600,
//     })

//     return res.json({
//       reply: completion.choices[0].message.content,
//     })
//   } catch (err) {
//     console.error("[CHAT ERROR]", err)
//     res.status(500).json({ reply: "Lỗi server: " + err.message })
//   }
// })

// module.exports = router

const express = require("express")
const router = express.Router()
const Log = require("../app/models/Log")

const OpenAI = require("openai")
const { buildStats } = require("./utils/buildStats")
const { detectIntent } = require("./utils/detectIntent")
const { answerByRule } = require("./utils/answerByRule")

const openai = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  apiKey: process.env.OPENAI_API_KEY || "ollama",
})

const MODEL = "qwen2.5:7b"

router.post("/", async (req, res) => {
  try {
    const { message, user_id, lang } = req.body

    const logs = await Log.find({ user_id }).sort({ createdAt: -1 }).lean()

    console.log("user_id:", user_id)
    console.log("Số logs tìm thấy:", logs.length)

    //  Tính toán sẵn, KHÔNG để AI tự đếm

    const stats = buildStats(logs)

    const context = logs.length
      ? `Tổng số lịch sử phân tích: ${stats.tongSoVideo} video\n\n` +
        `Danh sách:\n${JSON.stringify(stats.danhSachVideo, null, 2)}`
      : "Chưa có lịch sử phát hiện nào."

    const langInstruction =
      lang === "en"
        ? `You MUST respond in English only.`
        : `Bạn BẮT BUỘC phải trả lời bằng Tiếng Việt. TUYỆT ĐỐI không dùng tiếng Anh.`

    const wrappedMessage =
      lang === "en"
        ? `[Answer in English] ${message}`
        : `[Trả lời bằng Tiếng Việt] ${message}`

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Bạn là trợ lý phân tích dữ liệu phát hiện đối tượng trong video.
${langInstruction}

=== DỮ LIỆU THỰC TẾ ===
${context}
======================

QUY TẮC QUAN TRỌNG:
- Chỉ dùng số liệu từ dữ liệu trên, KHÔNG tự bịa
- Khi hỏi tổng số video: trả lời đúng con số ${stats.tongSoVideo}
- Dùng "videoName" khi nhắc tên video, KHÔNG dùng "_id"
- Nếu không có dữ liệu liên quan, nói rõ "Không có dữ liệu"`,
        },
        {
          role: "system",
          content:
            lang === "en"
              ? "Remember: English only. Use ONLY the data provided."
              : `Nhắc lại: CHỈ Tiếng Việt. Tổng số video là ${stats.tongSoVideo}. Chỉ dùng dữ liệu đã cung cấp.`,
        },
        { role: "user", content: wrappedMessage },
      ],
      temperature: 0.4, // ← rất thấp để AI không sáng tạo
      max_tokens: 500,
    })
    return res.json({
      reply: completion.choices[0].message.content,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ reply: "Lỗi server: " + err.message })
  }
})

module.exports = router
