// controllers/reviewController.js
const Review = require("../models/Review")
const mongoose = require("mongoose")

class ReviewController {
  // POST /reviews — tạo review mới
  createReview = async (req, res) => {
    try {
      const userId = req.user._id // từ auth middleware
      const {
        overallRating,
        aspectRatings,
        usefulFeatures,
        usageFrequency,
        primaryPurpose,
        wouldRecommend,
        requestedFeatures,
        comment,
      } = req.body

      if (!overallRating) {
        return res
          .status(400)
          .json({ success: false, message: "overallRating là bắt buộc" })
      }

      // Mỗi user chỉ submit 1 review (có thể update nếu muốn)
      const existing = await Review.findOne({ userId })
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "Bạn đã gửi đánh giá rồi",
          reviewId: existing._id,
        })
      }

      const review = await Review.create({
        userId,
        overallRating,
        aspectRatings,
        usefulFeatures,
        usageFrequency,
        primaryPurpose,
        wouldRecommend,
        requestedFeatures,
        comment,
      })

      res.status(201).json({ success: true, review })
    } catch (err) {
      console.error("[createReview]", err)
      res.status(500).json({ success: false, message: err.message })
    }
  }

  // PUT /reviews/:id — cập nhật review của mình
  updateReview = async (req, res) => {
    try {
      const userId = req.user._id
      const review = await Review.findOne({ _id: req.params.id, userId })

      if (!review) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy review" })
      }

      const allowed = [
        "overallRating",
        "aspectRatings",
        "usefulFeatures",
        "usageFrequency",
        "primaryPurpose",
        "wouldRecommend",
        "requestedFeatures",
        "comment",
      ]
      allowed.forEach((field) => {
        if (req.body[field] !== undefined) review[field] = req.body[field]
      })

      await review.save()
      res.json({ success: true, review })
    } catch (err) {
      res.status(500).json({ success: false, message: err.message })
    }
  }

  // GET /reviews/me — lấy review của bản thân
  getMyReview = async (req, res) => {
    try {
      const review = await Review.findOne({ userId: req.user._id })
      res.json({ success: true, review: review || null })
    } catch (err) {
      res.status(500).json({ success: false, message: err.message })
    }
  }

  // GET /reviews — admin: lấy tất cả (có phân trang)
  getAllReviews = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      const skip = (page - 1) * limit

      const [reviews, total] = await Promise.all([
        Review.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("userId", "name email"),
        Review.countDocuments(),
      ])

      res.json({
        success: true,
        reviews,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      })
    } catch (err) {
      res.status(500).json({ success: false, message: err.message })
    }
  }

  // GET /reviews/stats — admin: thống kê tổng hợp
  getStats = async (req, res) => {
    try {
      const [avgRating, totalCount, ratingDist, featureDist] =
        await Promise.all([
          Review.aggregate([
            {
              $group: {
                _id: null,
                avg: { $avg: "$overallRating" },
                count: { $sum: 1 },
              },
            },
          ]),
          Review.countDocuments(),
          Review.aggregate([
            { $group: { _id: "$overallRating", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ]),
          Review.aggregate([
            { $unwind: "$usefulFeatures" },
            { $group: { _id: "$usefulFeatures", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ]),
        ])

      res.json({
        success: true,
        stats: {
          totalReviews: totalCount,
          averageRating: avgRating[0]?.avg?.toFixed(1) || 0,
          ratingDistribution: ratingDist,
          topUsefulFeatures: featureDist,
        },
      })
    } catch (err) {
      res.status(500).json({ success: false, message: err.message })
    }
  }
}

module.exports = new ReviewController()
