const mongoose = require("mongoose")

async function connect() {
  try {
    await mongoose.connect("mongodb://localhost:27017/AI_traffic")
    console.log("Connect db Successfully!!!")
  } catch (error) {
    console.error("Connect Failed", error)
  }
}

module.exports = { connect }
