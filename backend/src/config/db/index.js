const mongoose = require("mongoose")

async function connect() {
  try {
    // const url1 = "mongodb://localhost:27017/AI_traffic"
    await mongoose.connect(process.env.MONGO_URL)

    console.log("Connect db Successfully!!!")
  } catch (error) {
    console.error("Connect Failed", error)
  }
}

module.exports = { connect }
