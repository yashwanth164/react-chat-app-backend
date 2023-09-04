const nodemailer = require("nodemailer");


const mailSender = async (mailDetails, callback) => {
  let mailTransporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: "yashkrissh@gmail.com",
      pass: process.env.MAIL_PASS,
    },
  });
  console.log(process.env.MAIL_PASS);
  try {
    const info = await mailTransporter.sendMail(mailDetails);
    callback(info);
  } catch (error) {
    console.log(error);
  }
};

module.exports = mailSender;

