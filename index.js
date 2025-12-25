// index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const http = require('http');
const admin = require('firebase-admin');

const datas = require('./routes/data.routes');
const authRoutes = require('./routes/auth.routes');
const devices = require('./routes/device.routes');

const TenMinData = require('./models/tenmin-data.model');
const FourHData = require('./models/fourh-data.model');
const Device = require('./models/device.model');
const Simulation = require('./models/simulation.model');
const DoorEvent = require('./models/door-event.model');

/* ===================== FIREBASE ===================== */
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : require('./firebase-service-account.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin inicializado');
} catch (err) {
    console.error('❌ Error Firebase:', err.message);
}

/* ===================== DATABASE ===================== */
mongoose.set('strictQuery', false);
mongoose.connect(process.env.DATABASE_URL, { dbName: 'bio-data' });

mongoose.connection
    .on('error', err => console.error(err))
    .once('connected', () => console.log('✅ Database Connected'));

/* ===================== EXPRESS ===================== */
const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

app.get('/', (_, res) =>
    res.json({ message: 'Welcome to Bio-Data Back-End application.' })
);

app.use('/api/v1/datas', datas);
app.use('/api/auth', authRoutes);
app.use('/api/devices', devices);

/* ===================== SERVER ===================== */
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

/* ===================== GLOBAL STATES ===================== */
const latestDataPerSensor = new Map();
const userConnections = new Map();
const doorState = new Map();
const fcmTokens = new Map();
const alertIntervals = new Map();

const tempAlertState = new Map();
const tempAlertIntervals = new Map();

const ALERT_DELAY = 60000;
const ALERT_INTERVAL = 20000;

/* ===================== WEBSOCKET ===================== */
server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
        wss.emit('connection', ws, req);
    });
});

wss.on('connection', ws => {
    let username = null;

    ws.isAlive = true;
    ws.lastMessageTime = Date.now();

    ws.on('message', async message => {
        try {
            const parsed = JSON.parse(message);

            /* ---------- PING ---------- */
            if (parsed.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                ws.isAlive = true;
                ws.lastMessageTime = Date.now();
                return;
            }

            if (!parsed.username) return;

            /* ---------- REGISTRO ---------- */
            if (!username) {
                username = parsed.username;
                ws.username = username;

                if (!userConnections.has(username)) {
                    userConnections.set(username, new Set());
                }
                userConnections.get(username).add(ws);

                if (!doorState.has(username)) {
                    doorState.set(username, {
                        status: parsed.doorStatus || 'closed',
                        lastSaved10MinSlot: null,
                        lastSaved4HSlot: null,
                        currentEvent: null,
                        doorOpenedAt: null,
                        alertSent: false
                    });
                }

                if (!tempAlertState.has(username)) {
                    tempAlertState.set(username, null);
                }

                console.log(`➕ WebSocket activo para ${username}`);
            }

            ws.isAlive = true;
            ws.lastMessageTime = Date.now();

            if (username.startsWith('MOBILE_OBSERVER_')) return;

            /* ---------- VALIDACIÓN CORRECTA ---------- */
            if (
                parsed.temperature === undefined ||
                parsed.humidity === undefined ||
                parsed.dsTemperature === undefined ||
                !parsed.datetime
            ) {
                console.log(`⚠️ ${username}: mensaje incompleto`);
                return;
            }

            latestDataPerSensor.set(username, {
                data: parsed,
                lastReceivedAt: Date.now()
            });

            await saveTo10MinData(username, parsed);
            await saveTo4HData(username, parsed);
            await handleDoorEvents(username, parsed);
            await handleTemperatureAlerts(username, parsed);

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsed));
                }
            });

        } catch (err) {
            console.error('❌ WS Error:', err.message);
        }
    });

    ws.on('pong', () => {
        ws.isAlive = true;
        ws.lastMessageTime = Date.now();
    });

    ws.on('close', () => {
        if (username && userConnections.has(username)) {
            userConnections.get(username).delete(ws);
            if (userConnections.get(username).size === 0) {
                userConnections.delete(username);
                doorState.delete(username);
                latestDataPerSensor.delete(username);

                if (alertIntervals.has(username)) {
                    clearInterval(alertIntervals.get(username));
                    alertIntervals.delete(username);
                }

                if (tempAlertIntervals.has(username)) {
                    clearInterval(tempAlertIntervals.get(username));
                    tempAlertIntervals.delete(username);
                }

                tempAlertState.delete(username);
            }
        }
        console.log(`🔌 WebSocket cerrado: ${username}`);
    });
});

/* ===================== KEEP ALIVE ===================== */
setInterval(() => {
    const now = Date.now();
    wss.clients.forEach(ws => {
        if (!ws.isAlive && now - ws.lastMessageTime > 180000) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

/* ===================== START ===================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
    console.log(`🚀 Server listening on port ${PORT}`)
);
