class AppError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.message = message
    this.success = false
    this.statusCode = statusCode

    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = AppError

// Route
// → Controller
// → Service
// → throw Error
// → Global Error Middleware
// ✔ Clean code
// Controller chỉ lo request/response
// Service lo logic
// Error handler lo lỗi
