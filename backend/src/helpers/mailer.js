const nodeMailer = require("nodemailer")

const transporter = nodeMailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_MAIL,
    pass: process.env.SMTP_PASSWORD,
  },
})

const sendMail = async (email, subject, content) => {
  // gửi email cho người dùng
  try {
    let mailOptions = {
      from: process.env.SMTP_MAIL,
      to: email,
      subject: subject,
      html: content,
    }

    const info = await transporter.sendMail(mailOptions)

    console.log("Mail Sent:", info.messageId)
  } catch (error) {
    console.log(error.message)
  }
}

module.exports = { sendMail }
