const authRoute = require("./auth")

function route(app) {
  app.use("/auth", authRoute)
}

module.exports = route
