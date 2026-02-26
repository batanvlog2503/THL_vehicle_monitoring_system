const mongoose = require("mongoose")

const Schema = mongoose.Schema

const UserSchema = new Schema(
  {
    username: { type: String, unique: true, maxLength: 100 },
    password: { type: String, maxLength: 100 },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("User", UserSchema)
