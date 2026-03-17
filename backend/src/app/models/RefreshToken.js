const mongoose = require("mongoose")

const refreshTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    refreshToken: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model("RefreshToken", refreshTokenSchema)
