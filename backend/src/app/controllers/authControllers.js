const User = require("../models/User")
class AuthControllers {
  async login(req, res, next) {
    // [POST] /auth/login
    try {
      // lấy username + password
      const { username, password } = req.body

      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "Thiếu tài khoản hoặc mật khẩu" })
      }
      //Lỗi 400 – Bad Request

      //Ý nghĩa:
      //Server không thể xử lý yêu cầu vì request gửi lên bị sai cú pháp hoặc thiếu dữ liệu.

      const user = await User.findOne({ username, password })
      // Lỗi 401 – Unauthorized

      // Ý nghĩa:
      // Request chưa được xác thực (authentication) hoặc token không hợp lệ.
      if (!user) {
        return res.status(401).json({ message: "Tài khoản hoặc mật khẩu sai" })
      }

      return res.status(200).json({
        message: "Login Successfully",
        user: {
          id: user._id,
          username: user.username,
        },
      })
    } catch (error) {
      res.status(500).json({ message: error.message })
      next(error)
    }
  }

  async signup(req, res, next) {
    try {
      const { username, password } = req.body

      const existingUser = await User.findOne({ username })

      if (existingUser) {
        return res.status(400).json({ message: "Username đã tồn tại" })
      }
      const newUser = await User.create({ username, password })
      console.log(req.body)
      console.log("BODY:", req.body)
      res.status(201).json({ message: "SignUp Successfully", user: newUser })
    } catch (error) {
      res.status(500).json({ message: error.message })
      next(error)
    }
  }
}

module.exports = new AuthControllers()
