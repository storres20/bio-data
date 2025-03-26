require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const http = require('http'); // Needed for raw server
const datas = require('./routes/data.routes');
const authRoutes = require('./routes/auth.routes');
const devices = require('./routes/device.routes');


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

            // Broadcast to all connected clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (error) {
            console.error('❌ Error parsing message:', error);
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
