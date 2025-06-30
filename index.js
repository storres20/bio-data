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
const Simulation = require('./models/simulation.model');

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

app.get('/api/simulations', async (req, res) => {
    try {
        const sims = await Simulation.find({}, 'username');
        res.json(sims);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching simulations' });
    }
});

// === Create raw HTTP server ===
const server = http.createServer(app);

// === WebSocket Setup ===
const wss = new WebSocket.Server({ noServer: true });
const latestDataPerSensor = new Map();

server.on('upgrade', (req, socket, head) => {
    console.log("📡 Upgrade request for WebSocket");
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

wss.on('connection', (ws) => {
    console.log('✅ New WebSocket connection established');
    let username = null;

    // 🛡️ Cierra conexiones que no se identifican en 10 segundos
    const authTimeout = setTimeout(() => {
        if (!username) {
            console.warn('⏱️ Cliente no identificado. Cerrando WebSocket por seguridad.');
            ws.close();
        }
    }, 10000);

    ws.isAlive = true;

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);
            if (!parsed.username) return;

            username = parsed.username;
            ws.username = username;
            ws.isAlive = true;

            clearTimeout(authTimeout);

            const currentEntry = latestDataPerSensor.get(username);
            const lastDatetime = currentEntry?.data?.datetime;

            if (parsed.datetime !== lastDatetime) {
                latestDataPerSensor.set(username, {
                    data: parsed,
                    lastReceivedAt: Date.now()
                });
            }

            // Reenvía datos a todos los clientes conectados
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsed));
                }
            });

        } catch (err) {
            console.error('❌ Error parsing message:', err.message);
        }
    });

    ws.on('pong', () => {
        ws.isAlive = true;
        console.log(`📡 Pong recibido de ${ws.username ?? 'cliente desconocido'}`);
    });

    ws.on('ping', () => {
        console.log(`📶 Ping recibido de ${ws.username ?? 'cliente desconocido'}`);
    });

    ws.on('close', () => {
        console.log(`🔌 WebSocket cerrado para ${ws.username ?? 'cliente desconocido'}`);
    });

    ws.on('error', (error) => {
        console.error(`⚠️ Error en WebSocket (${ws.username ?? 'cliente desconocido'}): ${error.message}`);
    });
});

// 🔄 PING cada 30 segundos para comprobar que los clientes están vivos
setInterval(() => {
    console.log('📋 Verificando conexiones WebSocket...');
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            console.warn(`💀 ${ws.username ?? 'Cliente'} sin respuesta. Cerrando WebSocket...`);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping(() => {});
        console.log(`📤 Ping enviado desde backend a ${ws.username ?? 'cliente desconocido'}`);
    });
}, 30000);

// 🧾 Mostrar lista de clientes activos cada 30s
setInterval(() => {
    const connected = [];
    wss.clients.forEach(ws => connected.push(ws.username ?? 'cliente desconocido'));
    console.log('🔍 Clientes activos:', connected);
}, 30000);

// 💾 Guardar datos recientes en MongoDB cada 10 min
setInterval(async () => {
    console.log('⏳ Guardando datos recientes en MongoDB...');

    const now = Date.now();

    for (const [username, entry] of latestDataPerSensor.entries()) {
        const { data, lastReceivedAt, lastSavedDatetime } = entry;

        if (now - lastReceivedAt > 5 * 60 * 1000) {
            console.warn(`⚠️ Sensor ${username} inactivo. Se omite guardado`);
            latestDataPerSensor.delete(username);
            continue;
        }

        if (data.datetime === lastSavedDatetime) {
            console.log(`ℹ️ Ya se guardó el dato de ${username} con el mismo datetime`);
            continue;
        }

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

            latestDataPerSensor.set(username, {
                ...entry,
                lastSavedDatetime: data.datetime
            });

            console.log(`✅ Guardado en DB para ${username}`);
        } catch (err) {
            console.error(`❌ Error guardando ${username}:`, err.message);
        }
    }

}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
