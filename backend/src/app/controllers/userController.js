const User = require("../models/User")
const RefreshToken = require("../models/RefreshToken")
const jwt = require("jsonwebtoken")
const Log = require("../models/Log")
const generateAccessToken = async (user) => {
  return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "3h" })
}

const generateRefreshToken = async (user) => {
  return jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "1d" })
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
      const email = req.user.email
      console.log("Detections ", detections)
      console.log("videoName ", videoName)
      const log = new Log({
        user_id,
        email,
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

  // [GET] /user/logs

  async getAllLog(req, res, next) {
    try {
      const user_id = req.user._id.toString()
      if (!user_id) {
        return res.status(400).json({
          success: false,
          message: "Please login to use device",
        })
      }

      const logs = await Log.find({ user_id: user_id })

      if (!logs) {
        return res.status(400).json({
          success: false,
          message: "No data log",
        })
      }
      console.log(logs)
      return res.status(200).json({
        success: true,
        message: "Get Logs Successfully !!!",
        logs: logs,
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      })
    }
  }

  // [GET] /user/logs/:id

  async getLogDetails(req, res, next) {
    try {
      const { id } = req.params

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Missing log id !!! ",
        })
      }

      const log = await Log.findById(id)

      if (!log) {
        return res.status(404).json({
          success: false,
          message: "Log not found",
        })
      }

      return res.status(200).json({
        success: true,
        message: "Get Log Detail Successfully",
        log: log,
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      })
    }
  }

  // [POST] /user/logout

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: "RefreshToken Invalid or Not Found !!!",
        })
      }

      // xóa RefreshToken

      await RefreshToken.deleteOne({ refreshToken: refreshToken })
      return res.status(200).json({
        success: true,
        message: "Logout Successfully !!! ",
      })
    } catch (error) {
      return res.status(400).json({
        message: error.message,
        success: false,
      })
    }
  }
}

module.exports = new UserControllers()
