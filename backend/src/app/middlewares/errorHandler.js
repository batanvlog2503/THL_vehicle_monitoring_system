// const errorHandler = (err, req, res, next) => {
//   console.error(err)

//   return res.status(err.statusCode || 500).json({
//     success: false,
//     message: err.message || "Internal Server Error",
//   })
// }

// module.exports = errorHandler
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500

  console.error("─────────────────────────────────")
  console.error(`❌ ${req.method} ${req.originalUrl}`)
  console.error(`📌 Status: ${statusCode}`)
  console.error(`💬 Message: ${err.message}`)
  console.error(`📍 Stack:\n${err.stack}`)
  console.error("─────────────────────────────────")

  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  })
}

module.exports = errorHandler
