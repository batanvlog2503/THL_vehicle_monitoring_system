const Log = require("../models/Log")
// GET /vehicles?page=1&limit=10
class VehicleController {
  async getVehicles(req, res) {
    try {
      const { page = 1, limit = 10, plate = "", overspeed } = req.query

      const skip = (page - 1) * limit
      console.log(req.user)
      // Query theo user

      const userId = req.user?._id || req.user?.id || req?.user?.user?._id // fallback nếu cấu trúc token khác

      const logs = await Log.find({ user_id: userId }).sort({
        createdAt: -1,
      })

      // Flatten detections
      let vehicles = []

      logs.forEach((log) => {
        log.detections.forEach((d) => {
          vehicles.push({
            detection: d,
            videoName: log.videoName,
            speedLimit: log.speedLimit,
            createdAt: log.createdAt,
            logId: log._id,
          })
        })
      })

      //  FILTER plate
      if (plate) {
        vehicles = vehicles.filter((v) =>
          v.detection?.plate?.toLowerCase().includes(plate.toLowerCase()),
        )
      }

      //  FILTER overspeed
      if (overspeed === "true") {
        vehicles = vehicles.filter((v) => v.detection?.speed > v.speedLimit)
      }

      // 📄 Pagination
      const total = vehicles.length
      const paginated = vehicles.slice(skip, skip + Number(limit))

      return res.status(200).json({
        data: paginated,
        total,
        totalPages: Math.ceil(total / limit),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: "Server error" })
    }
  }
}

module.exports = new VehicleController()
