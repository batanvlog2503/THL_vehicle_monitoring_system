const mongoose = require("mongoose")

const DetectionSchema = new mongoose.Schema({
  frame: { type: Number },
  id: { type: Number },
  label: { type: String },
  conf: { type: Number },
  bbox: [Number],
  speed: { type: Number },
  time: { type: String }, // "00:01:23" (hiển thị)
  time_ms: { type: Number }, // 83000 (logic)
  status: { type: String }, // "violation" hoặc "normal"
  plate: { type: String }, // "29A-12345"
})

const LogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
    required: true,
  },

  email: String,
  videoName: String,
  createdAt: { type: Date, default: Date.now },
  speedLimit: { type: Number, default: 60 }, // thêm dòng này
  detections: [DetectionSchema],
})

module.exports = mongoose.model("Log", LogSchema)

// {
//   "user_id": "USER_ID_123",
//   "videoName": "video.mp4",
//   "createdAt": "...",
//   "detections": [
//     {
//       "frame": 10,
//       "id": 2,
//       "label": "person",
//       "conf": 0.91,
//       "bbox": [x1, y1, x2, y2]
//     }
//   ]
// }
