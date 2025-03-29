require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const http = require('http'); // Needed for raw server

// === Import routes and models ===
const datas = require('./routes/data.routes');
const authRoutes = require('./routes/auth.routes');
const devices = require('./routes/device.routes');
const Data = require('./models/data.model');
const Device = require('./models/device.model');

// === MongoDB Setup ===
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

// === Express Setup ===
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
    res.json({ message: "Welcome to Bio-Data Back-End application." });
});

app.use('/api/v1/datas', datas);
app.use('/api/auth', authRoutes);
app.use('/api/devices', devices);

// === Create raw HTTP server ===
const server = http.createServer(app);

// === Create WebSocket server with noServer ===
const wss = new WebSocket.Server({ noServer: true });

// === Control: last saved timestamp per sensor ===
const lastSavedTimestamps = new Map(); // username => timestamp

// === Handle WebSocket upgrade manually ===
server.on('upgrade', (request, socket, head) => {
    console.log("📡 Upgrade request for WebSocket");

    // Accept all clients (no mask validation)
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// === WebSocket logic ===
wss.on('connection', (ws) => {
    console.log('✅ New WebSocket connection established');

    ws.on('message', async (message) => {
        console.log('📨 Received message:', message);

        try {
            const data = JSON.parse(message);
            console.log('🔍 Parsed Data:', data);

            const now = Date.now();
            const lastSaved = lastSavedTimestamps.get(data.username) || 0;
            const elapsedTime = now - lastSaved;

            // 🔍 Find assigned device for this sensor
            const device = await Device.findOne({ assigned_sensor_username: data.username });

            // ✅ Save in MongoDB every 60 seconds per username
            if (elapsedTime >= 60 * 1000) {
                const mongoData = new Data({
                    temperature: data.temperature,
                    humidity: data.humidity,
                    dsTemperature: data.dsTemperature,
                    username: data.username,
                    datetime: data.datetime,
                    device_id: device ? device._id : null
                });

                await mongoData.save();
                lastSavedTimestamps.set(data.username, now);
                console.log(`✅ Saved in DB for ${data.username}`);
            } else {
                console.log(`⏳ Not saved in DB. Only ${Math.round(elapsedTime / 1000)}s passed.`);
            }

            // 🔁 Broadcast to all clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });

        } catch (error) {
            console.error('❌ Error handling message:', error.message);
        }
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
    });
});

// === Start HTTP server ===
const PORT = 3002;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
