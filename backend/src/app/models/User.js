const mongoose = require("mongoose")

const Schema = mongoose.Schema

const UserSchema = new Schema(
  {
    name: { type: String, unique: true, maxLength: 100, required: true },
    password: { type: String, maxLength: 100, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    is_verified: { default: 0, type: String },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("User", UserSchema)
