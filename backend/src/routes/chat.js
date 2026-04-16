const express = require("express")
const router = express.Router()
const Log = require("../app/models/Log")
const OpenAI = require("openai")

const openai = new OpenAI({
  // Dùng OpenAI: apiKey: process.env.OPENAI_API_KEY
  // Dùng Ollama: baseURL + apiKey giả
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
  apiKey: process.env.OPENAI_API_KEY || "ollama",
})

const MODEL = process.env.AI_MODEL || "llama3" // OpenAI: "gpt-4o-mini"

router.post("/", async (req, res) => {
  try {
    const { message, user_id } = req.body

    // Lấy dữ liệu MongoDB của user
    const logs = await Log.find({ user_id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()

    const context = logs.length
      ? JSON.stringify(logs, null, 2)
      : "Chưa có lịch sử phát hiện nào."

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Bạn là trợ lý phân tích dữ liệu phát hiện đối tượng trong video.
Dữ liệu lịch sử của người dùng (MongoDB):
${context}

Mỗi log gồm: videoName, createdAt, và detections (frame, label, conf, bbox, time).
Hãy trả lời ngắn gọn, dùng số liệu cụ thể từ dữ liệu trên khi có thể.`,
        },
        { role: "user", content: message },
      ],
      temperature: 0.5,
      max_tokens: 500,
    })

    res.json({ reply: completion.choices[0].message.content })
  } catch (err) {
    console.error(err)
    res.status(500).json({ reply: "Lỗi khi gọi AI: " + err.message })
  }
})

module.exports = router
