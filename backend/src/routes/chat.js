const express = require("express")
const router = express.Router()
const Log = require("../app/models/Log")
const OpenAI = require("openai")

const openai = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  apiKey: process.env.OPENAI_API_KEY || "ollama",
})

const MODEL = "llama3"

router.post("/", async (req, res) => {
  try {
    const { message, user_id, lang } = req.body

    const logs = await Log.find({ user_id }).sort({ createdAt: -1 }).lean()

    console.log("user_id:", user_id)
    console.log("Số logs tìm thấy:", logs.length)

    // ✅ Tính toán sẵn, KHÔNG để AI tự đếm
    const stats = {
      tongSoVideo: logs.length,
      danhSachVideo: logs.map((l, i) => ({
        stt: i + 1,
        videoName: l.videoName,
        createdAt: l.createdAt,
        soLanPhatHien: l.detections?.length || 0,
        cacNhan: [...new Set(l.detections?.map((d) => d.label))],
      })),
    }

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
      temperature: 0.1, // ← rất thấp để AI không sáng tạo
      max_tokens: 500,
    })

    res.json({ reply: completion.choices[0].message.content })
  } catch (err) {
    console.error(err)
    res.status(500).json({ reply: "Lỗi khi gọi AI: " + err.message })
  }
})

module.exports = router
