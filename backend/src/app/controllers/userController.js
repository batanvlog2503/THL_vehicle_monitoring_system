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
  // Lấy tất cả user, loại bỏ trường password
  async getAllUsers(req, res, next) {
    try {
      // Lấy tất cả user, loại bỏ trường password
      const users = await User.find({}, { password: 0 })
        .sort({ createdAt: -1 })
        .lean()

      return res.status(200).json({
        success: true,
        message: "Get All Users Successfully !!!",
        total: users.length,
        users,
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      })
    }
  }
  // [GET] /user/admin/users/:id  — lấy chi tiết 1 user (admin)
  async getUserById(req, res, next) {
    try {
      const { id } = req.params

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Missing user id" })
      }

      const user = await User.findById(id, { password: 0 }).lean()

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" })
      }

      return res.status(200).json({
        success: true,
        message: "Get User Successfully !!!",
        user,
      })
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }
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
      console.log("REQ.USER:", req.user)
      const {
        detections,
        videoName,
        originalName,
        speedLimit,
        resultVideoUrl,
      } = req.body

      const user_id = req.user._id
      const email = req.user.email
      console.log("Detections ", detections)
      console.log("videoName ", videoName)
      console.log("speedLimit ", speedLimit)
      console.log("Original Name ", originalName)
      console.log("Result Video URL ", resultVideoUrl)

      const log = new Log({
        user: req.user._id, //  ObjectId từ token

        email: req.user.email,
        videoName,
        detections,
        resultVideoUrl,

        originalName,
        speedLimit, // thêm trường speedLimit vào log
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

  // async getAllLog(req, res, next) {
  //   try {
  //     const user_id = req.user._id.toString()
  //     if (!user_id) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Please login to use device",
  //       })
  //     }

  //     const logs = await Log.find({ user_id: user_id }).sort({ createdAt: -1 })

  //     if (!logs) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "No data log",
  //       })
  //     }
  //     console.log(logs)
  //     return res.status(200).json({
  //       success: true,
  //       message: "Get Logs Successfully !!!",
  //       logs: logs,
  //     })
  //   } catch (error) {
  //     return res.status(400).json({
  //       success: false,
  //       error: error.message,
  //     })
  //   }
  // }
  // get aall log Admin
  // user/logs
  async getAllLog(req, res, next) {
    try {
      const user_id = req.user._id.toString()
      console.log("USER ID: ", user_id)
      const { date, keyword } = req.query //  thêm keyword

      if (!user_id) {
        return res.status(400).json({ 
          success: false,
          message: "Please login",
        })
      }

      let filter = {
        $or: [{ user: user_id }, { user_id: user_id }],
      } // luôn filter theo user

      //  filter theo date
      if (date) {
        const start = new Date(date)
        start.setHours(0, 0, 0, 0)

        const end = new Date(date)
        end.setHours(23, 59, 59, 999)

        filter.createdAt = {
          $gte: start,
          $lte: end,
        }
      }

      // filter theo videoName (search)
      if (keyword) {
        filter.videoName = {
          $regex: keyword,
          $options: "i", // không phân biệt hoa thường
        }
      }

      const logs = await Log.find(filter).sort({ createdAt: -1 })
      console.log("TOTAL LOGS:", logs.length) // 🔥 debug
      return res.status(200).json({
        success: true,
        logs,
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      })
    }
  }
  // /user/me/logs - chỉ lấy log của user hiện tại
  async getAllLogsMe(req, res, next) {
    try {
      const user_id = req.user._id.toString()
      const logs = await Log.find({ user: user_id }).sort({ createdAt: -1 })
      console.log("Total Logs: ", logs)
      return res.status(200).json({
        success: true,
        logs,
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
