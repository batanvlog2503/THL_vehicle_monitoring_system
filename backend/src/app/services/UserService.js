const UserRepo = require("../repositories/UserRepository")
const AppError = require("../utils/AppError")

class UserService {
  async getAllUsers() {
    const users = await UserRepo.findAllUsers()

    return { users }
  }
  async getUserById(id) {
    if (!id) {
      throw new AppError("404", "Id required")
    }

    const user = await UserRepo.findUserById(id)

    return { user }
  }
  async create(data) {}
}

module.exports = new UserService()
