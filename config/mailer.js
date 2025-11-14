const nodemailer = require("nodemailer");


let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    // user: 'notifications@kridemy.com',
    user: 'shubhamchaudhari707@gmail.com', 
    // pass: "nfkqiHAxL7gH",
    pass: "gzkiecjivwxnweor",
  },
});


module.exports = transporter


