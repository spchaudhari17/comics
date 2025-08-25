const express = require('express');
require('dotenv').config()
const router = require('./routes/api.js');
const cors = require('cors');
bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const fileUpload = require("express-fileupload");
const connectToDatabase = require('./config/database.js');
const app = express();
var corsOptions = {
  origin: 'http://localhost:3000', 
  optionsSuccessStatus: 200
}

// app.use(cors({ origin: "http://localhost:3000" })); 
app.use(cors({
  origin: ['http://localhost:3000', 'http://13.60.35.222'],
  credentials: true
}));



app.get('/', (req, res) => {
  console.log("triggered====> :)")
  res.send('Hello from Node.js!');
});


app.use(express.static(path.join(__dirname, 'public')));


// app.use("/comics", cors(corsOptions), express.static(path.join(__dirname, "comics")));
app.use(
  "/comics",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  },
  express.static(path.join(__dirname, "public", "comics"))
);



app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(fileUpload());

app.use("/api", router)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));









