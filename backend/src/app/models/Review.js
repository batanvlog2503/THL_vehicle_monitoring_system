// models/Review.js
const mongoose = require("mongoose")

const ReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Đánh giá sao tổng thể (1-5)
    overallRating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    // Đánh giá sao từng khía cạnh
    aspectRatings: {
      easeOfUse: { type: Number, min: 1, max: 5 }, // Dễ sử dụng
      performance: { type: Number, min: 1, max: 5 }, // Hiệu năng / tốc độ
      accuracy: { type: Number, min: 1, max: 5 }, // Độ chính xác nhận diện
      ui: { type: Number, min: 1, max: 5 }, // Giao diện
    },

    // Tính năng hữu ích nhất (checkbox, nhiều lựa chọn)
    usefulFeatures: {
      type: [String],
      enum: [
        "plate_detection", // Nhận diện biển số
        "speed_monitoring", // Giám sát tốc độ
        "violation_alerts", // Cảnh báo vi phạm
        "statistics_charts", // Biểu đồ thống kê
        "chatbot_analysis", // Chatbot phân tích
        "video_management", // Quản lý video
        "export_report", // Xuất báo cáo
      ],
    },

    // Tần suất sử dụng (trắc nghiệm 1 lựa chọn)
    usageFrequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "rarely"],
    },

    // Mục đích sử dụng chính (trắc nghiệm 1 lựa chọn)
    primaryPurpose: {
      type: String,
      enum: [
        "traffic_management", // Quản lý giao thông
        "law_enforcement", // Thực thi pháp luật
        "research", // Nghiên cứu
        "personal_project", // Dự án cá nhân
        "other",
      ],
    },

    // Khả năng giới thiệu cho người khác (trắc nghiệm 1 lựa chọn)
    wouldRecommend: {
      type: String,
      enum: ["definitely", "probably", "not_sure", "no"],
    },

    // Tính năng muốn thêm (checkbox, nhiều lựa chọn)
    requestedFeatures: {
      type: [String],
      enum: [
        "real_time_monitoring", // Giám sát thời gian thực
        "mobile_app", // App di động
        "api_integration", // Tích hợp API
        "multi_camera", // Nhiều camera
        "night_detection", // Nhận diện ban đêm
        "cloud_storage", // Lưu trữ đám mây
        "email_alerts", // Cảnh báo qua email
      ],
    },

    // Nhận xét tự do
    comment: {
      type: String,
      maxlength: 1000,
      trim: true,
    },

    // Đã submit hay chưa (phân biệt draft vs submitted)
    isSubmitted: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt tự động
  },
)

// Index để query nhanh theo userId
ReviewSchema.index({ userId: 1 })
ReviewSchema.index({ overallRating: 1 })
ReviewSchema.index({ createdAt: -1 })

module.exports = mongoose.model("Review", ReviewSchema)
