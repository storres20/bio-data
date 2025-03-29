require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const http = require('http');

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

database.on('error', (error) => console.log(error));
database.once('connected', () => console.log('✅ Database Connected'));

// === Express Setup ===
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// === Routes ===
app.get("/", (req, res) => res.json({ message: "Welcome to Bio-Data Back-End application." }));
app.use('/api/v1/datas', datas);
app.use('/api/auth', authRoutes);
app.use('/api/devices', devices);

// === Create raw HTTP server ===
const server = http.createServer(app);

// === WebSocket Setup ===
const wss = new WebSocket.Server({ noServer: true });

const latestDataPerSensor = new Map();  // username => last received data
const lastSavedTimestamps = new Map();  // username => timestamp
const initialSavedSensors = new Set();  // sensors that already saved their first data

server.on('upgrade', (req, socket, head) => {
    console.log("📡 Upgrade request for WebSocket");
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

wss.on('connection', (ws) => {
    console.log('✅ New WebSocket connection established');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (!data.username) return;

            // ⏺️ Save the latest data from this sensor
            latestDataPerSensor.set(data.username, data);

            const now = Date.now();
            const lastSaved = lastSavedTimestamps.get(data.username) || 0;
            const elapsedTime = now - lastSaved;

            // 🔍 Find assigned device
            const device = await Device.findOne({ assigned_sensor_username: data.username });

            // ✅ Save immediately if it's the first message from this sensor
            if (!initialSavedSensors.has(data.username)) {
                const mongoData = new Data({
                    temperature: data.temperature,
                    humidity: data.humidity,
                    dsTemperature: data.dsTemperature,
                    username: data.username,
                    datetime: data.datetime,
                    device_id: device ? device._id : null,
                });

                await mongoData.save();
                console.log(`🆕 Initial data saved for ${data.username}`);

                lastSavedTimestamps.set(data.username, now);
                initialSavedSensors.add(data.username);
            }

            // 🔁 Broadcast to all connected clients
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });

        } catch (err) {
            console.error('❌ Error parsing message:', err.message);
        }
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
    });
});

// === Save in MongoDB every 10 minutes for all sensors ===
setInterval(async () => {
    console.log('⏳ Saving latest data for all sensors...');

    for (const [username, data] of latestDataPerSensor.entries()) {
        try {
            const now = Date.now();
            const lastSaved = lastSavedTimestamps.get(username) || 0;

            if (now - lastSaved >= 10 * 60 * 1000) {
                const device = await Device.findOne({ assigned_sensor_username: username });

                const mongoData = new Data({
                    temperature: data.temperature,
                    humidity: data.humidity,
                    dsTemperature: data.dsTemperature,
                    username: username,
                    datetime: data.datetime,
                    device_id: device ? device._id : null,
                });

                await mongoData.save();
                lastSavedTimestamps.set(username, now);
                console.log(`✅ Saved in DB (10 min) for ${username}`);
            } else {
                console.log(`⏳ Skipping ${username} (last saved ${(Math.round((now - lastSaved) / 1000))} seconds ago)`);
            }

        } catch (err) {
            console.error(`❌ Error saving data for ${username}:`, err.message);
        }
    }

}, 10 * 60 * 1000); // ✅ Every 10 minutes

// === Start HTTP server ===
const PORT = 3002;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
