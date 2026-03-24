const mongoose = require("mongoose")

const DetectionSchema = new mongoose.Schema({
  frame: { type: Number },
  id: { type: Number },
  label: { type: String },
  conf: { type: Number },
  bbox: [Number],
  time: { type: String }, // "00:01:23" (hiển thị)
  time_ms: { type: Number }, // 83000 (logic)
})

const LogSchema = new mongoose.Schema({
  user_id: String,
  email: String,
  videoName: String,
  createdAt: { type: Date, default: Date.now },
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
