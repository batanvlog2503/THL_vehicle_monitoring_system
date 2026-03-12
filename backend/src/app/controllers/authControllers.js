const User = require("../models/User")

const { validationResult } = require("express-validator")
class AuthControllers {
  async userLogin(req, res, next) {
    // [POST] /auth/login
    try {
      // lấy username + password
      const errors = validationResult(req)

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Errors",
          errors: errors.array(),
        })
      }
      const { email, name, password } = req.body
      const user = await User.findOne({ email })

      if (!user) {
        return res
          .status(400)
          .json({ success: false, message: "Email doesn't exists !!!" })
      }

      if (password !== user.password || name !== user.name) {
        return res
          .status(400)
          .json({ success: false, message: "Name or Password Wrong !!!" })
      }

      return res.status(200).json({
        success: true,
        message: "Login Successfully",
        user: user,
      })
    } catch (error) {
      return res.status(400).json({ message: error.message })
    }
  }
  //[POST] /auth/register
  async userRegister(req, res, next) {
    try {
      const errors = validationResult(req)

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Errors",
          errors: errors.array(),
        })
      }
      const { name, password, email, mobile } = req.body
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already Exists !!!",
        })
      }

      const newUser = new User({
        name,
        email,
        mobile,
        password,
      })
      await newUser.save()

      return res
        .status(201)
        .json({ success: true, message: "SignUp Successfully", user: newUser })
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message })
    }
  }
}

module.exports = new AuthControllers()
