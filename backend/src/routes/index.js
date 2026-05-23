const authRoute = require("./auth")
const userRoute = require("./user")
const chatRoute = require("./chat")
const statRoute = require("./stats")
function route(app) {
  app.use("/auth", authRoute)
  app.use("/user", userRoute)
  app.use("/chat", chatRoute)
  app.use("/stats", statRoute)
}

module.exports = route
