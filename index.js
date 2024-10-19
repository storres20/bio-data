require('dotenv').config();

const express = require('express'); // Express server
const cors = require("cors");
const mongoose = require('mongoose');
const WebSocket = require('ws'); // WebSocket server
const datas = require('./routes/data.routes'); // Existing data routes
const fs = require('fs'); // File system module
const https = require('https'); // HTTPS module

// Database connection - MongoDB
const mongoString = process.env.DATABASE_URL;
mongoose.set("strictQuery", false);
mongoose.connect(mongoString, { dbName: "bio-data" });
const database = mongoose.connection;

database.on('error', (error) => {
    console.log(error);
});

database.once('connected', () => {
    console.log('Database Connected');
});

// Express server
const app = express();
app.use(express.json());

// CORS options
const corsOptions = {
    origin: "*", // Allow all origins
    //origin: "http://localhost:3000", // Example frontend
    //origin: "https://bio-thesis.vercel.app", // Example frontend
};

app.use(cors(corsOptions));

// Simple route
app.get("/", (req, res) => {
    res.json({ message: "Welcome to Bio-Data Back-End application." });
});

// Routes
app.use('/api/v1/datas', datas);

// SSL options
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/temphu.lonkansoft.pro/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/temphu.lonkansoft.pro/fullchain.pem')
};

// Create HTTPS server
const server = https.createServer(options, app);

// Start the HTTPS server
server.listen(3002, () => {
    console.log(`HTTPS Server started at port 3002`);
});

// WebSocket server
const wss = new WebSocket.Server({ server }); // Attach WebSocket to the same HTTPS server

wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');

    // Listen for incoming messages from ESP8266
    ws.on('message', (message) => {
        console.log('Received message:', message);

        // You can process the incoming message, save it to MongoDB, etc.
        try {
            const data = JSON.parse(message); // Assuming the ESP8266 sends JSON data
            console.log('Parsed Data:', data);

            // Example: Save data to MongoDB (using your existing Mongoose model)
            // const newData = new DataModel(data); // Assuming you have a Mongoose model
            // newData.save();

            // Echo the message back to the ESP8266 or any client
            ws.send(`Server received the data: ${message}`);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    // Handle WebSocket disconnection
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});
