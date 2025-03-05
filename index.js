require('dotenv').config();

const express = require('express'); // Express server
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws'); // WebSocket server
const datas = require('./routes/data.routes'); // Existing data routes

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
};
app.use(cors(corsOptions));

// Simple route
app.get("/", (req, res) => {
    res.json({ message: "Welcome to Bio-Data Back-End application." });
});

// Routes
app.use('/api/v1/datas', datas);

// Create HTTP server (Railway will handle SSL)
const server = app.listen(3002, () => {
    console.log(`Server started at port 3002`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');

    // Listen for incoming messages
    ws.on('message', async (message) => {
        console.log('Received message:', message);

        try {
            // Parse the incoming WebSocket message as JSON
            const data = JSON.parse(message);
            console.log('Parsed Data:', data);

            // Broadcast the data back to all connected WebSocket clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    // Handle WebSocket disconnection
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});
