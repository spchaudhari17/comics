const nodemailer = require("nodemailer");


let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'shubhamchaudhari707@gmail.com', 
    pass: "gzkiecjivwxnweor",
  },
});


module.exports = transporter


