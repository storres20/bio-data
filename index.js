require('dotenv').config();

const express = require('express'); // Express server
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws'); // WebSocket server
const datas = require('./routes/data.routes'); // Existing data routes
const fs = require('fs'); // File system module
const https = require('https'); // HTTPS module
//const DataModel = require('./models/data.model'); // Mongoose data model for saving WebSocket data

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

// SSL options
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/temphu.website101.xyz/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/temphu.website101.xyz/fullchain.pem')
};

// Create HTTPS server
const server = https.createServer(options, app);

// Start the HTTPS server
server.listen(3002, () => {
    console.log(`HTTPS Server started at port 3002`);
});

// WebSocket server
const wss = new WebSocket.Server({ server }); // Attach WebSocket to the same HTTPS server

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');

    // Listen for incoming messages from ESP8266 or frontend
    ws.on('message', async (message) => {
        console.log('Received message:', message);

        try {
            // Parse the incoming WebSocket message as JSON
            const data = JSON.parse(message);

            // Log the parsed data
            console.log('Parsed Data:', data);

            // Commented out the lines that save data to MongoDB
            /*
            const newData = new DataModel({
                temperature: data.temperature,
                humidity: data.humidity,
                dsTemperature: data.dsTemperature,
                username: data.username,
                datetime: data.datetime,
            });

            try {
                const dataToSave = await newData.save(); // Save data to MongoDB
                console.log('Data saved to MongoDB:', dataToSave);

                // Broadcast the saved data back to all connected WebSocket clients (if needed)
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(dataToSave));
                    }
                });

            } catch (error) {
                console.error('Error saving data to MongoDB:', error);
            }
            */

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
