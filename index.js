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
const latestDataPerSensor = new Map(); // 🔄 username => last received data

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

            // ⏺️ Guardamos los últimos datos por sensor
            latestDataPerSensor.set(data.username, data);

            // 🔁 Reenviamos a todos los clientes conectados
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

    ws.on('error', (error) => {
        console.error('⚠️ WebSocket Error:', error.message);
    });
});

// === Save in MongoDB every 10 minutes the latest data of each sensor ===
setInterval(async () => {
    console.log('⏳ Saving all latest sensor data to DB...');

    for (const [username, data] of latestDataPerSensor.entries()) {
        try {
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
            console.log(`✅ Saved in DB for ${username}`);
        } catch (err) {
            console.error(`❌ Error saving data for ${username}:`, err.message);
        }
    }

}, 600 * 1000); // ✅ Cada 10 minutos

// === Start HTTP server ===
const PORT = process.env.PORT || 3000; // 🛠️ Usa el puerto que Railway te da
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
