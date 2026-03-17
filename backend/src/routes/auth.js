const express = require("express")

const {
  userValidator,
  userRegisterValidation,
} = require("../helpers/validation")
const router = express.Router()
const AuthControllers = require("../app/controllers/authControllers")

router.post("/login", AuthControllers.userLogin)
router.post("/register", userValidator, AuthControllers.userRegister)

router.get("/mail-verification", AuthControllers.mailVerification)

router.get(
  "/send-mail-verification",
  userRegisterValidation,
  AuthControllers.sendMailVerification,
)
module.exports = router
