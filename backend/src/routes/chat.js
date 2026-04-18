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

    //  Tính toán sẵn, KHÔNG để AI tự đếm
    const uniqueViolationIds = new Set()

    logs.forEach((log) => {
      log.detections?.forEach((d) => {
        if (d.status === "violation") {
          uniqueViolationIds.add(d.id)
        }
      })
    })
    // gom log và detections thành 1 cấu trúc dễ hiểu cho AI, tránh để AI phải tự suy luận từ dữ liệu thô
    const stats = {
      tongSoVideo: logs.length,

      tongViolationXe: uniqueViolationIds.size, // ✅ XE THỰC

      tongViolationFrame: logs.reduce((sum, log) => {
        return (
          sum +
          (log.detections?.filter((d) => d.status === "violation").length || 0)
        )
      }, 0),

      danhSachVideo: logs.map((l) => ({
        videoName: l.videoName,

        soXeViPham: new Set(
          l.detections
            ?.filter((d) => d.status === "violation")
            ?.map((d) => d.id),
        ).size,
      })),
    }
    // biến dữ liệu stat trên thành prompt dạng văn bản dễ hiểu, tránh để AI phải tự suy luận từ dữ liệu thô
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
      temperature: 0.4  , // ← rất thấp để AI không sáng tạo
      max_tokens: 500,
    })

    res.json({ reply: completion.choices[0].message.content })
  } catch (err) {
    console.error(err)
    res.status(500).json({ reply: "Lỗi khi gọi AI: " + err.message })
  }
})

module.exports = router
