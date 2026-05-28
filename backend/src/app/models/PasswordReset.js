const mongoose = require("mongoose")

const Schema = mongoose.Schema

const passwordResetSchema = new Schema(
  {
    user_id: {
      type: String,required: true, ref: "User",
    },
    token: { type: String,required: true,
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("PasswordReset", passwordResetSchema)
