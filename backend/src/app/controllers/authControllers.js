const User = require("../models/User")
const bcrypt = require("bcrypt")
const randomstring = require("randomstring")
const jwt = require("jsonwebtoken")
const mailer = require("../../helpers/mailer")
const { validationResult } = require("express-validator")
const RefreshToken = require("../models/RefreshToken")

const generateAccessToken = async (user) => {
  return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" })
}

const generateRefreshToken = async (user) => {
  return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "3h" })
}
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
      const { email, password } = req.body
      const userData = await User.findOne({ email })

      if (!userData) {
        return res
          .status(400)
          .json({ success: false, message: "Email doesn't exists !!!" })
      }

      const passwordMatch = await bcrypt.compare(password, userData.password)

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: "Password Incorrect !!! ",
        })
      }
      // đăng nhập xong kiểm tra xem đã verify chưa

      if (userData.is_verified == 0) {
        const msg = `<p>Hi ${userData.name} dep trai top 1 server VN, Please <a href=${process.env.APP_URL}/auth/mail-verification?id=${userData._id}>Verify </a>your gmail to login account my website again</p>`

        await mailer.sendMail(userData.email, "Re-verification email", msg)
        return res.status(401).json({
          success: false,
          message: "Please Verify Your Account Again !!! ",
        })
      }


      await RefreshToken.deleteMany({user_id:})
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
      const hashPassword = await bcrypt.hash(password, 10)

      const user = new User({
        name,
        email,
        mobile,
        password: hashPassword,
      })
      const userData = await user.save()

      const msg = `<p>Hi ${userData.name} dep trai top 1 server VN please <a href = ${process.env.APP_URL}/auth/mail-verification?id=${userData._id}>Verify </a>your mail to login account</p>`

      await mailer.sendMail(email, "Mail-verification", msg)

      console.log("MAIL SENT TO:", email)
      console.log(process.env.SMTP_MAIL)
      console.log(process.env.SMTP_PASSWORD)
      return res.status(200).json({
        // B6: trả về user khi status == 200
        success: true,
        message:
          "Register Successfully, please check your mail to verify your account !!!",
        user: userData,
      })
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message })
    }
  }

  // [GET] /auth/mail-verification
  async mailVerification(req, res, next) {
    try {
      if (req.query.id === undefined) {
        return res.render("404")
      }
      console.log(req.query.id)

      const userData = await User.findById({ _id: req.query.id })

      if (userData) {
        if (userData.is_verified === 1) {
          return res.render("mail-verification", {
            message: "Your mail already verify !!!", // đã xác minh truocs đos
          })
        }

        await User.findByIdAndUpdate(req.query.id, { is_verified: 1 })

        return res.render("mail-verification", {
          message: "Email verified successfully !!!", // đã xác minh
        })
      } else {
        return res.render("mail-verification", {
          message: "User Doesn't exists",
        })
      }
    } catch (error) {
      return res.status(400).json({
        message: error.message,
        success: false,
      })
    }
  }

  // [POST] /auth/send-mail-verification
  async sendMailVerification(req, res, next) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: true,
          error: errors.array(),
          message: "Error send Mail Verification",
        })
      }

      const { email } = req.body

      const userData = await User.findOne({ email })

      console.log(process.env.SMTP_MAIL)
      console.log(process.env.SMTP_PASSWORD)
      if (!userData) {
        return res.status(400).json({
          success: false,
          message: "User doesn't exists!!!",
        })
      }

      if (userData.is_verified === 1) {
        return res.status(400).json({
          success: false,
          message: "Your Email Already Verify !!!",
        })
      }

      const msg = `<p>Hi ${userData.name}, Please 
    <a href="${process.env.APP_URL}/auth/mail-verification?id=${userData._id}">
    Verify
    </a> your mail.</p>`

      await mailer.sendMail(userData.email, "Mail Verification", msg)

      return res.status(200).json({
        success: true,
        message: "Verification Link send to mail, please Check",
      })
    } catch (error) {
      return res.status(400).json({
        message: error.message,
        success: false,
      })
    }
  }
}

module.exports = new AuthControllers()
