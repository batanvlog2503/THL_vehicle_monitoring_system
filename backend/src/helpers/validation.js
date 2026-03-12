const { check } = require("express-validator")

exports.userValidator = [
  check("name", "name is required").not().isEmpty(),
  check("email", "please include a valid email").isEmail().normalizeEmail({
    gmail_remove_dots: true,
  }),
  check("mobile", "Mobile No. Should be contains 10 digits").isLength({
    min: 10,
    max: 10,
  }),
  check(
    "password",
    "Password must be greater than 6 characters, and container at least one Uppercase, one lowercase letter, and one number, and one special character",
  ).isStrongPassword({
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minLength: 6,
    minSymbols: 1,
  }),
]
