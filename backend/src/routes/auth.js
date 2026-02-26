const express = require("express")

const router = express.Router()
const AuthControllers = require("../app/controllers/authControllers")

router.post("/login", AuthControllers.login)
router.post("/signup", AuthControllers.signup)

module.exports = router
