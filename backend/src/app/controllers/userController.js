const User = require("../models/User")
const RefreshToken = require("../models/RefreshToken")
const jwt = require("jsonwebtoken")
const generateAccessToken = async (user) => {
  return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" })
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
        return res.status(400).json({
          message: "refreshToken invalid or expired !!! ",
          success: false,
        })
      }
      console.log("RefreshToken: ", refreshToken)

      // kiểm tra refreshTokne trong db
      const refreshTokenInDB = await RefreshToken.findOne({
        refreshToken: refreshToken,
      })

      if (!refreshTokenInDB) {
        return res.status(403).json({
          success: false,
          message: "Invalid Refresh Token !!!",
        })
      }

      // verify refreshToken

      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)

      console.log("Decode")
      console.log(JSON.stringify(decoded))

      const user = await User.findById(decoded.user._id).lean()

      if (!user) {
        return res.status(404).json({
          message: "User not found",
          success: false,
        })
      }

      // tạo accessToken mới

      const newAccessToken = await generateAccessToken({ user })

      return res.status(200).json({
        success: true,
        message: "Generate new AccessToken Successfully !!! ",
        accessToken: newAccessToken,
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
