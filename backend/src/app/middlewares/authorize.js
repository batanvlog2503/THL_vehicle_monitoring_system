const AppError = require("../utils/AppError")

const authorize = (...roles) => {
  return (req, res, next) => {
    const user = req.user

    if (!user) {
      return next(new AppError(401, "Unauthorized"))
    }
    if (!roles.includes(user.role)) {
      return next(new AppError(403, "Forbidden"))
    }
    next()
  }
}
module.exports = authorize
