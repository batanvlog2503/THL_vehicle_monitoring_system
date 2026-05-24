// routes/reviewRoutes.js
const express = require("express")
const router = express.Router()
const reviewController = require("../app/controllers/reviewController")
const auth = require("../app/middlewares/auth")
const authorize = require("../app/middlewares/authorize")
// Điều chỉnh đường dẫn middleware theo project của bạn

// User routes (cần đăng nhập)
router.post("/", auth, reviewController.createReview)
router.put("/:id", auth, reviewController.updateReview)
router.get("/me", auth, reviewController.getMyReview)

// Admin routes
router.get("/", auth, reviewController.getAllReviews)
router.get("/stats", auth, reviewController.getStats)

module.exports = router
