const express = require('express');
require('dotenv').config()
const router = require('./routes/api.js');
const cors = require('cors');
bodyParser = require("body-parser")
const connectToDatabase = require('./config/database.js');
const app = express();
var corsOptions = {
  origin: '*'
}


app.get('/', (req, res) => {
  console.log("triggered====> :)")
  res.send('Hello from Node.js!');
});


app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

app.use("/api", router)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));








