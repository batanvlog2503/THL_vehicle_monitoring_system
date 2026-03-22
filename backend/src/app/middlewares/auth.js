const jwt = require("jsonwebtoken")

const User = require("../models/User")

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers["authorization"]

    if (!token) {
      return res.status(403).json({
        success: false,
        success: false,
        message: "Token required",
      })
    }

    const bearerToken = token.split(" ")[1]

    console.log("Bearer Token", bearerToken)

    const decode = jwt.verify(bearerToken, process.env.ACCESS_TOKEN_SECRET) // xác nhận accessToken

    req.user = decode // decode mang thông tin user và iat, exp
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    })
  }
}

module.exports = { verifyToken }
