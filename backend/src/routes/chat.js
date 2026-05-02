// const express = require("express")
// const router = express.Router()
// const Log = require("../app/models/Log")

// const OpenAI = require("openai")
// const { buildStats } = require("./utils/buildStats")

// const { answerByRule } = require("./utils/answerByRule")

// const openai = new OpenAI({
//   baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
//   apiKey: process.env.OPENAI_API_KEY || "ollama",
// })

// const MODEL = "llama3"

// router.post("/", async (req, res) => {
//   try {
//     const { message, user_id, lang } = req.body

//     const logs = await Log.find({ user_id }).sort({ createdAt: -1 }).lean()

//     console.log("user_id:", user_id)
//     console.log("Số logs tìm thấy:", logs.length)

//     //  Tính toán sẵn, KHÔNG để AI tự đếm

//     const stats = buildStats(logs)

//     const context = logs.length
//       ? `Tổng số lịch sử phân tích: ${stats.tongSoVideo} video\n\n` +
//         `Danh sách:\n${JSON.stringify(stats.danhSachVideo, null, 2)}`
//       : "Chưa có lịch sử phát hiện nào."

//     const langInstruction =
//       lang === "en"
//         ? `You MUST respond in English only.`
//         : `Bạn BẮT BUỘC phải trả lời bằng Tiếng Việt. TUYỆT ĐỐI không dùng tiếng Anh.`

//     const wrappedMessage =
//       lang === "en"
//         ? `[Answer in English] ${message}`
//         : `[Trả lời bằng Tiếng Việt] ${message}`

//     const completion = await openai.chat.completions.create({
//       model: MODEL,
//       messages: [
//         {
//           role: "system",
//           content: `Bạn là trợ lý phân tích dữ liệu phát hiện đối tượng trong video.
// ${langInstruction}

// === DỮ LIỆU THỰC TẾ ===
// ${context}
// ======================

// QUY TẮC QUAN TRỌNG:
// - Chỉ dùng số liệu từ dữ liệu trên, KHÔNG tự bịa
// - Khi hỏi tổng số video: trả lời đúng con số ${stats.tongSoVideo}
// - Dùng "videoName" khi nhắc tên video, KHÔNG dùng "_id"
// - Nếu không có dữ liệu liên quan, nói rõ "Không có dữ liệu"`,
//         },
//         {
//           role: "system",
//           content:
//             lang === "en"
//               ? "Remember: English only. Use ONLY the data provided."
//               : `Nhắc lại: CHỈ Tiếng Việt. Tổng số video là ${stats.tongSoVideo}. Chỉ dùng dữ liệu đã cung cấp.`,
//         },
//         { role: "user", content: wrappedMessage },
//       ],
//       temperature: 0.4, // ← rất thấp để AI không sáng tạo
//       max_tokens: 500,
//     })
//     return res.json({
//       reply: completion.choices[0].message.content,
//     })
//   } catch (err) {
//     console.error(err)
//     res.status(500).json({ reply: "Lỗi server: " + err.message })
//   }
// })

// module.exports = router
const express = require("express")
const router = express.Router()
const Log = require("../app/models/Log")
const { buildStats } = require("./utils/buildStats")
const { GoogleGenerativeAI } = require("@google/generative-ai")

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

router.post("/", async (req, res) => {
  try {
    const { message, user_id, lang } = req.body

    const logs = await Log.find({ user_id }).sort({ createdAt: -1 }).lean()

    console.log("user_id:", user_id)
    console.log("Số logs tìm thấy:", logs.length)

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

    const systemPrompt = `Bạn là trợ lý phân tích dữ liệu phát hiện đối tượng trong video.
${langInstruction}

=== DỮ LIỆU THỰC TẾ ===
${context}
======================

QUY TẮC QUAN TRỌNG:
- Chỉ dùng số liệu từ dữ liệu trên, KHÔNG tự bịa
- Khi hỏi tổng số video: trả lời đúng con số ${stats.tongSoVideo}
- Dùng "videoName" khi nhắc tên video, KHÔNG dùng "_id"
- Nếu không có dữ liệu liên quan, nói rõ "Không có dữ liệu"
- ${lang === "en" ? "English only." : "CHỈ Tiếng Việt, không dùng tiếng Anh."}`

    const result = await model.generateContent({
      systemInstruction: systemPrompt,
      contents: [
        {
          role: "user",
          parts: [{ text: wrappedMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500,
      },
    })

    const reply = result.response.text()

    return res.json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ reply: "Lỗi server: " + err.message })
  }
})

module.exports = router
