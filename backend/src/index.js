// tạo express
const express = require("express")
require("dotenv").config()
// tạo cors
const errorHandler = require("./app/middlewares/errorHandler")
const cors = require("cors")
// tạo đường dẫn

const path = require("path")

// log request ra terminal

const morgan = require("morgan")

/// sử dụng handlebars

const { engine } = require("express-handlebars")

// const db = require("./config/db")

const db = require("./config/db")
db.connect()
// tạo app express với cổng 3000

const app = express()

const port = 3000

// import router và middleware với phương thức ghi đè method-override

const route = require("./routes")
const methodOverride = require("method-override")

// Override with Post having

app.use(methodOverride("_method"))

// helpers
const helpers = require("../src/helpers/helpers")

// HTTP logger morgan
app.use(morgan("combined"))

// sử dụng file tĩnh static trong publi

// sử dụng file scss file tĩnh
app.use(express.static(path.join(__dirname, "public")))
console.log("Static path:", path.join(__dirname, "public"))
// Template engine setup
app.use(cors())
app.use(express.urlencoded({ extended: true })) // đọc form
app.use(express.json()) // cho phép đọc json

app.engine("hbs", engine({ extname: ".hbs", helpers: helpers })) // ← đặt ext là .hbs
app.set("view engine", "hbs") // ← view engine là hbs tu tim den file hbs
app.set("views", path.join(__dirname, "resources", "views"))
console.log("Views path:", path.join(__dirname, "resources\\views"))

route(app)

app.use(errorHandler)
app.listen(port, () => console.log(`App listening at http://localhost:${port}`))
