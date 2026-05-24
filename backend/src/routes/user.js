const express = require("express")

const auth = require("../app/middlewares/auth")
const router = express.Router()
const authorize = require("../app/middlewares/authorize")
const VehicleController = require("../app/controllers/vehicleController")
const AuthControllers = require("../app/controllers/authControllers")
const UserControllers = require("../app/controllers/userController")
// không cần auth vì lúc này đã hết accessToken
router.post("/refresh-token", UserControllers.refreshToken)
router.post("/logout", auth, authorize("user", "admin"), UserControllers.logout)
router.post(
  "/save-log",
  auth,
  authorize("user", "admin"),
  UserControllers.createLog,
)
router.get("/me/logs", auth, authorize("user"), UserControllers.getAllLogsMe)

router.get(
  "/logs/:id",
  auth,
  authorize("user", "admin"),
  UserControllers.getLogDetails,
)
router.get("/logs", auth, authorize("admin"), UserControllers.getAllLog)

router.get(
  "/vehicles",
  auth,
  authorize("user", "admin"),
  VehicleController.getVehicles,
)
module.exports = router
