const User = require("../models/User")

class UserRepository {
  async findAllUsers() {
    return await User.find({})
  }

  async findUserById(id) {
    return await User.findById(id)
  }

  async create(data) {
    return await User.create(data)
  }
}

module.exports = new UserRepository()
