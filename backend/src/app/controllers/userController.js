const User = require("../models/User")
const RefreshToken = require("../models/RefreshToken")
const jwt = require("jsonwebtoken")
const Log = require("../models/Log")
const generateAccessToken = async (user) => {
  return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1m" })
}

const generateRefreshToken = async (user) => {
  return jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "3h" })
}
class UserControllers {
  //[POST] /user/refresh-token

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: "Refresh Token Expired !!! ",
        })
      }
      console.log(`refreshToken: ${refreshToken}`)
      // kiểm tra refresh token trong db

      const tokenInDB = await RefreshToken.findOne({
        refreshToken: refreshToken,
      })

      if (!tokenInDB) {
        return res.status(403).json({
          success: false,
          message: "Invalid Refresh Token !!!",
        })
      }

      // verify refresh Token
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)

      // tìm user thông qua decoded
      console.log("Decoded")
      console.log(JSON.stringify(decoded))
      const userData = await User.findById(decoded._id).lean()

      if (!userData) {
        return res.status(404).json({
          message: "User not found",
          success: false,
        })
      }

      // tạo accessToken mới

      const newAccessToken = await generateAccessToken(userData)

      return res.status(200).json({
        success: true,
        message: "Generate new AccessToken Successfully !!! ",
        accessToken: newAccessToken,
      })
    } catch (error) {
      console.log("REFRESH TOKEN ERROR:", error.message)
      return res.status(400).json({
        success: false,
        message: "Invalid or Refresh Token Expire !!!",
      })
    }
  }

  // [POST] /user/save-log

  async createLog(req, res, next) {
    try {
      const { detections, videoName } = req.body

      const user_id = req.user._id
      console.log("Detections ", detections)
      console.log("videoName ", videoName)
      const log = new Log({
        user_id,
        videoName,
        detections,
      })

      await log.save()

      return res.status(200).json({
        success: true,
        message: "Log saved",
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: "Save Failed",
      })
    }
  }
}

module.exports = new UserControllers()
