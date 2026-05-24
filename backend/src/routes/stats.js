const express = require("express")
const router = express.Router()
const authorize = require("../app/middlewares/authorize")
const statController = require("../app/controllers/statController")
const auth = require("../app/middlewares/auth")
router.post(
  "/chatbot/query",
  auth,
  authorize("user", "admin"),
  statController.chatbotQuery,
)
router.get(
  "/chatbot/test",
  auth,
  authorize("user", "admin"),
  statController.chatbotTest,
)
module.exports = router
