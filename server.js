const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json()); // For parsing application/json
app.use(cors()); // For handling CORS

const PORT = process.env.PORT || 3001; // Use port from .env or default to 3001
const DATABASE_URL = process.env.DATABASE_URL; // MongoDB connection string from .env

// MongoDB connection
mongoose.connect(DATABASE_URL, {
    dbName: 'bio-data' // Specify the database name explicitly
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
app.get('/', (req, res) => {
    res.send('Welcome to the Data API. Use POST /data to submit data.');
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

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
