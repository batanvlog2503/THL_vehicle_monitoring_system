const mongoose = require("mongoose")

async function connect() {
  try {
    const url1 = "mongodb://localhost:27017/AI_traffic"
    const url =
      "mongodb+srv://tanden1357_db_user:Phamtan2503%40@cluster0.yf6btpb.mongodb.net/ai_traffic?appName=Cluster0"
    await mongoose.connect(url)
    console.log("Connect db Successfully!!!")
  } catch (error) {
    console.error("Connect Failed", error)
  }
}

module.exports = { connect }
