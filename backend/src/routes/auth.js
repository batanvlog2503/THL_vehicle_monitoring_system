const express = require("express")

const {
  userValidator,
  userRegisterValidation,
  userForgotPasswordValidator,
  userUpdatePasswordValidator,
} = require("../helpers/validation")

const auth = require("../app/middlewares/auth")
const router = express.Router()
const AuthControllers = require("../app/controllers/authControllers")

router.post("/login", AuthControllers.userLogin)
router.post("/register", userValidator, AuthControllers.userRegister)

router.get("/mail-verification", AuthControllers.mailVerification)

router.post(
  "/send-mail-verification",
  userRegisterValidation,
  AuthControllers.sendMailVerification,
)

router.post(
  "/forgot-password",
  userForgotPasswordValidator,
  AuthControllers.forgotPassword,
)
router.get("/reset-password", AuthControllers.resetPassword)
router.post(
  "/update-password",
  userUpdatePasswordValidator,
  AuthControllers.updatePassword,
)
module.exports = router
