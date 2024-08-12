const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json()); // For parsing application/json
app.use(cors()); // For handling CORS

const DATABASE_URL = process.env.DATABASE_URL; // MongoDB connection string from .env

// MongoDB connection
mongoose.connect(DATABASE_URL, {
    dbName: 'bio-data', // Specify the database name explicitly
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define Mongoose schema and model
const dataSchema = new mongoose.Schema({
    temperature: Number,
    humidity: Number,
    timestamp: { type: Date, default: Date.now }
});

const Data = mongoose.model('Data', dataSchema); // This will create/use 'datas' collection

// Basic route to handle GET requests to the root URL
app.get('/', async (req, res) => {
    try {
        const latestData = await Data.findOne().sort({ timestamp: -1 }); // Fetch the latest data entry
        if (latestData) {
            res.send(`
                <h1>Temperature and Humidity Data</h1>
                <p>Temperature: ${latestData.temperature} °C</p>
                <p>Humidity: ${latestData.humidity} %</p>
                <p>Timestamp: ${latestData.timestamp}</p>
            `);
        } else {
            res.send('<h1>No data available</h1>');
        }
    } catch (err) {
        console.error('Error retrieving data:', err);
        res.status(500).send('Error retrieving data');
    }
});

// POST route to receive data and save to MongoDB
app.post('/data', async (req, res) => {
    const { temperature, humidity } = req.body;

    try {
        const newData = new Data({ temperature, humidity });
        await newData.save(); // Save data to MongoDB
        res.status(201).send('Data saved');
    } catch (err) {
        console.error('Error saving data:', err);
        res.status(500).send('Error saving data');
    }
});

// Export the Express app to be used as a serverless function
module.exports = app;
