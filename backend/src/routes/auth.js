const express = require("express")

const { userValidator } = require("../helpers/validation")
const router = express.Router()
const AuthControllers = require("../app/controllers/authControllers")

router.post("/login", AuthControllers.userLogin)
router.post("/register", userValidator, AuthControllers.userRegister)

module.exports = router
