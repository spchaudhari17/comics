const nodemailer = require("nodemailer");


let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ajinkya.kridemy@gmail.com',
    // user: 'shubhamchaudhari707@gmail.com', 
    pass: "hbjmkseewsznybol",
    // pass: "gzkiecjivwxnweor", // shubham
  },
});


module.exports = transporter


