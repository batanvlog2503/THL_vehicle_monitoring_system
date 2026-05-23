// keywords.js
const QUERY_PATTERNS = [
  {
    keywords: ["vi phạm", "vượt tốc", "quá tốc"],
    timeKeywords: ["hôm nay", "hôm qua", "tuần này", "tháng này"],
    type: "violations",
    questions: [
      "Hôm nay có bao nhiêu xe vi phạm?",
      "Xe nào vi phạm tốc độ cao nhất?",
      "Vi phạm nhiều nhất vào giờ nào?",
    ],
  },
  {
    keywords: ["biển số", "biển", "tìm xe"],
    type: "plate_lookup",
    questions: [
      "Tìm xe theo biển số",
      "Lịch sử xe theo biển số",
      "Biển số xuất hiện nhiều nhất",
    ],
  },
  {
    keywords: ["thống kê", "báo cáo", "tổng quan", "tổng"],
    type: "summary",
    questions: [
      "Tổng quan hôm nay",
      "Báo cáo tuần này",
      "So sánh hôm nay với hôm qua",
    ],
  },
  {
    keywords: ["giờ", "khung giờ", "cao điểm", "lúc"],
    type: "time_query",
    questions: [
      "Giờ cao điểm hôm nay",
      "Xe qua nhiều nhất lúc mấy giờ?",
      "Thống kê theo khung giờ",
    ],
  },
  {
    keywords: ["loại xe", "xe máy", "ô tô", "xe tải"],
    type: "vehicle_type",
    questions: [
      "Thống kê theo loại phương tiện",
      "Xe máy vs ô tô hôm nay",
      "Loại xe nào vi phạm nhiều nhất?",
    ],
  },
]
