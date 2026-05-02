const express = require("express")

const auth = require("../app/middlewares/auth")
const router = express.Router()
const VehicleController = require("../app/controllers/vehicleController")
const AuthControllers = require("../app/controllers/authControllers")
const UserControllers = require("../app/controllers/userController")
// không cần auth vì lúc này đã hết accessToken
router.post("/refresh-token", UserControllers.refreshToken)
router.post("/logout", auth, UserControllers.logout)
router.post("/save-log", auth, UserControllers.createLog)
router.get("/logs/:id", auth, UserControllers.getLogDetails)
router.get("/logs", auth, UserControllers.getAllLog)

router.get("/vehicles", auth, VehicleController.getVehicles)
module.exports = router
