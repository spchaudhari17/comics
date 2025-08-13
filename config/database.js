

const mongoose = require('mongoose');
// mongoose.connect('mongodb://localhost:27017/comics');
mongoose.connect('mongodb+srv://shubham:shubham@cluster0.e5aknxd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

mongoose.connection.once('open', function () {
  console.log("database connected")
}).on('error', function (error) {
  console.log("error:" + error)
})


module.exports = mongoose;
