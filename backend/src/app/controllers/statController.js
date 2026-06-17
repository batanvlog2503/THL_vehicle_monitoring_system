// controllers/statController.js
const mongoose = require("mongoose")
const Log = require("../models/Log")

class StatController {
  static INTENT_KEYWORDS = [
    {
      intent: "speedViolations",
      keywords: ["vi phạm tốc độ", "tốc độ vi phạm", "vượt tốc"],
    },
    {
      intent: "violationsByDay",
      keywords: ["vi phạm theo ngày", "vi phạm từng ngày", "ngày vi phạm"],
    },
    {
      intent: "violationPlates",
      keywords: [
        "biển số vi phạm",
        "biển số xe vi phạm",
        "phương tiện vi phạm",
      ],
    },
    {
      intent: "topViolationVideos",
      keywords: ["video nhiều vi phạm", "top video vi phạm"],
    },
    {
      intent: "fastestVehicle",
      keywords: ["xe nhanh nhất", "xe nhanh nhất toàn bộ", "nhanh nhất"],
    },
    {
      intent: "top5Speed",
      keywords: ["top 5 tốc độ", "top 5 nhanh", "5 xe nhanh"],
    },
    {
      intent: "vehicleTypes",
      keywords: ["loại xe", "loại phương tiện", "thống kê loại"],
    },
    {
      intent: "videoList",
      keywords: ["danh sách video", "tất cả video", "các video"],
    },
    {
      intent: "plates",
      keywords: ["biển số", "biển số phát hiện", "thống kê biển số"],
    },
    {
      intent: "overview",
      keywords: ["tổng quan", "tổng hợp", "overview", "thống kê chung"],
    },
    {
      intent: "topVideos",
      keywords: [
        "top video nhiều phát hiện",
        "video nhiều phát hiện",
        "video nhiều nhất",
      ],
    },
    { intent: "violations", keywords: ["vi phạm"] },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  #toObjectId(userId) {
    return typeof userId === "string"
      ? new mongoose.Types.ObjectId(userId)
      : userId
  }

  #detectIntent(question) {
    const q = question.toLowerCase()
    for (const { intent, keywords } of StatController.INTENT_KEYWORDS) {
      if (keywords.some((kw) => q.includes(kw))) return intent
    }
    return "general"
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AGGREGATION PIPELINES
  // ─────────────────────────────────────────────────────────────────────────

  // Tổng quan dữ liệu: số video, số phát hiện, số vi phạm, số bình thường
  async #getOverview(uid) {
    const [result] = await Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      {
        $group: {
          _id: null,
          tongSoVideo: { $addToSet: "$_id" },
          tongSoPhatHien: { $sum: 1 },
          tongSoViPham: {
            $sum: {
              $cond: [{ $eq: ["$detections.status", "violation"] }, 1, 0],
            },
          },
          tongSoBinhThuong: {
            $sum: { $cond: [{ $eq: ["$detections.status", "normal"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          tongSoVideo: { $size: "$tongSoVideo" },
          tongSoPhatHien: 1,
          tongSoViPham: 1,
          tongSoBinhThuong: 1,
        },
      },
    ])
    return result || {}
  }
  // Top video phát hiện nhiều nhất
  async #getTopVideos(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      {
        $project: {
          videoName: 1,
          createdAt: 1,
          tongSoPhatHien: { $size: { $ifNull: ["$detections", []] } },
        },
      },
      { $sort: { tongSoPhatHien: -1 } },
      { $limit: 10 },
    ])
  }

  async #getSpeedViolations(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      {
        $match: {
          $or: [
            { "detections.status": "violation" },
            {
              $expr: {
                $and: [
                  { $ne: ["$detections.speed", null] },
                  { $gt: ["$detections.speed", "$speedLimit"] },
                ],
              },
            },
          ],
        },
      },
      {
        $group: {
          _id: "$videoName",
          soViPham: { $sum: 1 },
          tocDoCaoNhat: { $max: "$detections.speed" },
          tocDoTrungBinh: { $avg: "$detections.speed" },
        },
      },
      { $sort: { soViPham: -1 } },
      { $limit: 10 },
    ])
  }
  // Vi phạm theo ngầy
  async #getViolationsByDay(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      { $match: { "detections.status": "violation" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          soViPham: { $sum: 1 },
          soVideo: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          ngay: "$_id",
          soViPham: 1,
          soVideo: { $size: "$soVideo" },
        },
      },
      { $sort: { ngay: -1 } },
      { $limit: 14 },
    ])
  }
  // biển số vi phạm 10 biển số vi phạm nhiều nhất
  async #getViolationPlates(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      {
        $match: {
          "detections.status": "violation",
          "detections.plate": { $ne: null, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$detections.plate",
          soLanViPham: { $sum: 1 },
          tocDoCaoNhat: { $max: "$detections.speed" },
          videoNames: { $addToSet: "$videoName" },
          latestAt: { $max: "$createdAt" },
        },
      },
      { $sort: { soLanViPham: -1, latestAt: -1 } },
      { $limit: 10 },
    ])
  }
  // Video nhiều vi phạm
  async #getTopViolationVideos(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      {
        $project: {
          videoName: 1,
          createdAt: 1,
          soViPham: {
            $size: {
              $filter: {
                input: { $ifNull: ["$detections", []] },
                as: "d",
                cond: { $eq: ["$$d.status", "violation"] },
              },
            },
          },
        },
      },
      { $sort: { soViPham: -1 } },
      { $limit: 10 },
    ])
  }
  // xe nhanh nhất toàn bộ
  async #getFastestVehicle(uid) {
    const [result] = await Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      { $match: { "detections.speed": { $gt: 0 } } },
      { $sort: { "detections.speed": -1 } },
      { $limit: 1 },
      {
        $project: {
          videoName: 1,
          speed: "$detections.speed",
          plate: "$detections.plate",
          label: "$detections.label",
          time: "$detections.time",
          status: "$detections.status",
        },
      },
    ])
    return result || null
  }
  // top 5 speed
  async #getTop5Speed(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      { $match: { "detections.speed": { $gt: 0 } } },
      { $sort: { "detections.speed": -1 } },
      { $limit: 5 },
      {
        $project: {
          videoName: 1,
          speed: "$detections.speed",
          plate: "$detections.plate",
          label: "$detections.label",
          time: "$detections.time",
          status: "$detections.status",
        },
      },
    ])
  }
  // loai xe
  async #getVehicleTypes(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      {
        $group: {
          _id: "$detections.label",
          soLan: { $sum: 1 },
          soViPham: {
            $sum: {
              $cond: [{ $eq: ["$detections.status", "violation"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { soLan: -1 } },
    ])
  }
  // danh sách video gần nhất
  async #getVideoList(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      {
        $project: {
          videoName: 1,
          createdAt: 1,
          speedLimit: 1,
          tongSoPhatHien: { $size: { $ifNull: ["$detections", []] } },
          soViPham: {
            $size: {
              $filter: {
                input: { $ifNull: ["$detections", []] },
                as: "d",
                cond: { $eq: ["$$d.status", "violation"] },
              },
            },
          },
          cacNhan: {
            $setUnion: {
              $map: {
                input: { $ifNull: ["$detections", []] },
                as: "d",
                in: "$$d.label",
              },
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ])
  }
  // biển số -> Tất cả bieern số
  async #getPlates(uid) {
    return Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      {
        $match: {
          "detections.plate": { $exists: true, $ne: null, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$detections.plate",
          soLanXuatHien: { $sum: 1 },
          soViPham: {
            $sum: {
              $cond: [{ $eq: ["$detections.status", "violation"] }, 1, 0],
            },
          },
          tocDoCaoNhat: { $max: "$detections.speed" },
          videoNames: { $addToSet: "$videoName" },
          latestAt: { $max: "$createdAt" },
        },
      },
      { $sort: { latestAt: -1 } },
      { $limit: 20 },
    ])
  }
  // Tổng hợp vi phạm
  async #getViolations(uid) {
    const [summary] = await Log.aggregate([
      { $match: { user: uid } },
      { $unwind: "$detections" },
      { $match: { "detections.status": "violation" } },
      {
        $group: {
          _id: null,
          tongViPham: { $sum: 1 },
          tocDoCaoNhat: { $max: "$detections.speed" },
          tocDoTB: { $avg: "$detections.speed" },
          soVideo: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          tongViPham: 1,
          tocDoCaoNhat: 1,
          tocDoTB: { $round: ["$tocDoTB", 1] },
          soVideo: { $size: "$soVideo" },
        },
      },
    ])
    return summary || {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DISPATCH
  // ─────────────────────────────────────────────────────────────────────────

  async #fetchData(intent, uid) {
    switch (intent) {
      case "overview":
        return { overview: await this.#getOverview(uid) }
      case "topVideos":
        return { topVideos: await this.#getTopVideos(uid) }
      case "speedViolations":
        return { speedViolations: await this.#getSpeedViolations(uid) }
      case "violationsByDay":
        return { violationsByDay: await this.#getViolationsByDay(uid) }
      case "violationPlates":
        return { violationPlates: await this.#getViolationPlates(uid) }
      case "topViolationVideos":
        return { topViolationVideos: await this.#getTopViolationVideos(uid) }
      case "fastestVehicle":
        return { fastestVehicle: await this.#getFastestVehicle(uid) }
      case "top5Speed":
        return { top5Speed: await this.#getTop5Speed(uid) }
      case "vehicleTypes":
        return { vehicleTypes: await this.#getVehicleTypes(uid) }
      case "videoList":
        return { videoList: await this.#getVideoList(uid) }
      case "plates":
        return { plates: await this.#getPlates(uid) }
      case "violations":
        return { violations: await this.#getViolations(uid) }
      default: {
        const [overview, topVideos] = await Promise.all([
          this.#getOverview(uid),
          this.#getTopVideos(uid),
        ])
        return { overview, topVideos }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC ROUTE HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  chatbotQuery = async (req, res) => {
    try {
      const { question, userId } = req.body
      if (!question || !userId)
        return res.status(400).json({ error: "Thiếu question hoặc userId" })

      const uid = this.#toObjectId(userId)
      const intent = this.#detectIntent(question)
      const data = await this.#fetchData(intent, uid)

      res.json({ intent, data })
    } catch (err) {
      console.error("[chatbotQuery]", err)
      res.status(500).json({ error: "Lỗi server", detail: err.message })
    }
  }

  chatbotTest = async (_req, res) => {
    res.json({ status: "ok", time: new Date() })
  }
}

module.exports = new StatController()
