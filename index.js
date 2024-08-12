require('dotenv').config();

const express = require('express'); // Server
const cors = require("cors");

const datas = require('./routes/data.routes');

const mongoose = require('mongoose');
const mongoString = process.env.DATABASE_URL;


// Database connection - mongodb
mongoose.set("strictQuery", false);

mongoose.connect(mongoString, { dbName: "bio-data" });
const database = mongoose.connection;

database.on('error', (error) => {
    console.log(error)
})

database.once('connected', () => {
    console.log('Database Connected');
})
// ****

// Server
const app = express();

app.use(express.json());

// Cors
var corsOptions = {
    origin: "*", // Allow all origins
    //origin: "http://localhost:3000" //frontend
    //origin: "https://bio-thesis.vercel.app" //frontend
};

app.use(cors(corsOptions));

// simple route
app.get("/", async (req, res) => {
    res.json({ message: "Welcome to Bio-Thesis Back-End application." });
});

// Routes
app.use('/api/v1/datas', datas)

app.listen(3001, () => {
    console.log(`Server Started at ${3001}`)
})