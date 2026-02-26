module.exports = {
  multipleMongooseToObject(mongooses) {
    return mongooses.map((mongoose) => mongoose.toObject())
  },
  // Convert 1 document (findOne)
  mongooseToObject(mongoose) {
    return mongoose ? mongoose.toObject() : mongoose
  },
}
// course bạn truyền vào view là  Mongoose document
// field như image , name, description là thuộc tính của document đó nằm trên prototype
//Handlebars chỉ cho truy cập own property (bảo mật)
