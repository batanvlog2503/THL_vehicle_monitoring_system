const authRoute = require("./auth")
const userRoute = require("./user")
const chatRoute = require("./chat")

function route(app) {
  app.use("/auth", authRoute)
  app.use("/user", userRoute)
  app.use("/chat", chatRoute)
}

module.exports = route
