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

  async login(data) {
    const { email, password } = data
    if (!email || !password) {
      throw new AppError("400", "Email and password are required")
    }
    const user = await UserRepo.findByEmail(email)
    if (!user) {
      throw new AppError("400", "Invalid email or password")
    }
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      throw new AppError("400", "Invalid  password")
    }
    if(user.is_verified === 0){
        
    }
  }
  async create(data) {
    const { name, mobile, email, password } = data
    if (!email || !password || !name || !mobile) {
      throw new AppError("400", "Email and password are required")
    }
    const existingUser = await UserRepo.findByEmail(email)

    if (!existingUser) {
      throw new AppError("400", "Email already exists")
    }
    const user = await UserRepo.create(data)

    return user
  }
}

module.exports = new UserService()
