const express = require("express")
const router = express.Router()

const statController = require("../app/controllers/statController")

router.post("/chatbot/query", statController.chatbotQuery)
router.get("/chatbot/test", statController.chatbotTest)
module.exports = router
