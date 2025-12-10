// index.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const http = require('http');

// ⬇️ NUEVO: Importar Firebase Admin
const admin = require('firebase-admin');

const datas = require('./routes/data.routes');
const authRoutes = require('./routes/auth.routes');
const devices = require('./routes/device.routes');

const TenMinData = require('./models/tenmin-data.model');
const FourHData = require('./models/fourh-data.model');

const Device = require('./models/device.model');
const Simulation = require('./models/simulation.model');
const DoorEvent = require('./models/door-event.model');

// ⬇️ NUEVO: Inicializar Firebase Admin
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : require('./firebase-service-account.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log('✅ Firebase Admin inicializado');
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
}

const mongoString = process.env.DATABASE_URL;
mongoose.set("strictQuery", false);
mongoose.connect(mongoString, { dbName: "bio-data" });
const database = mongoose.connection;

database.on('error', (error) => console.log(error));
database.once('connected', () => console.log('✅ Database Connected'));

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => res.json({ message: "Welcome to Bio-Data Back-End application." }));
app.use('/api/v1/datas', datas);
app.use('/api/auth', authRoutes);
app.use('/api/devices', devices);

// ⬇️ NUEVO: Endpoint para registrar FCM token
app.post('/api/devices/fcm-token', async (req, res) => {
    try {
        const { observerId, fcmToken } = req.body;

        if (!observerId || !fcmToken) {
            return res.status(400).json({ error: 'observerId and fcmToken required' });
        }

        fcmTokens.set(observerId, fcmToken);
        console.log(`🔑 FCM Token registrado para ${observerId}`);

        res.json({ success: true, message: 'Token registered successfully' });
    } catch (error) {
        console.error('❌ Error registrando FCM token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/simulations', async (req, res) => {
    try {
        const sims = await Simulation.find({}, 'username');
        res.json(sims);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching simulations' });
    }
});

app.get('/api/door-events/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const { limit = 50, status } = req.query;

        const query = { username };
        if (status) query.status = status;

        const events = await DoorEvent.find(query)
            .sort({ opened_at: -1 })
            .limit(parseInt(limit));

        res.json(events);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching door events' });
    }
});

app.get('/api/v1/datas/temp-extremes/:username', async (req, res) => {
    try {
        const { username } = req.params;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const data = await TenMinData.find({
            username: username,
            datetime: {
                $gte: today,
                $lt: tomorrow
            }
        }).sort({ dsTemperature: 1 });

        if (data.length === 0) {
            return res.json({ min: null, max: null });
        }

        const minTemp = data[0].dsTemperature;
        const maxTemp = data[data.length - 1].dsTemperature;

        res.json({
            min: parseFloat(minTemp.toFixed(1)),
            max: parseFloat(maxTemp.toFixed(1)),
            count: data.length
        });

    } catch (err) {
        console.error('Error fetching temp extremes:', err);
        res.status(500).json({ error: 'Error fetching temperature extremes' });
    }
});

// ⬇️ NUEVO: Función para enviar notificación push
async function sendPushNotification(observerId, title, body, data = {}) {
    try {
        const fcmToken = fcmTokens.get(observerId);

        if (!fcmToken) {
            console.log(`⚠️ No hay FCM token para ${observerId}`);
            return;
        }

        const message = {
            notification: {
                title: title,
                body: body,
            },
            data: {
                ...data,
                timestamp: Date.now().toString(),
            },
            token: fcmToken,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'door_alerts',
                    sound: 'default',
                    priority: 'high',
                    defaultVibrateTimings: true,
                    color: '#EF4444',
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log(`✅ Notificación enviada a ${observerId}:`, response);
        return response;
    } catch (error) {
        console.error(`❌ Error enviando notificación a ${observerId}:`, error.message);

        // Si el token es inválido, eliminarlo
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
            fcmTokens.delete(observerId);
            console.log(`🗑️ Token inválido eliminado para ${observerId}`);
        }
    }
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const latestDataPerSensor = new Map();
const userConnections = new Map();
const doorState = new Map();
const fcmTokens = new Map(); // ⬅️ NUEVO: Almacenar FCM tokens

server.on('upgrade', (req, socket, head) => {
    console.log("📡 Upgrade request for WebSocket");
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

wss.on('connection', (ws) => {
    console.log('✅ New WebSocket connection established');
    let username = null;

    const authTimeout = setTimeout(() => {
        if (!username) {
            console.warn('⏱️ Cliente no identificado. Cerrando WebSocket por seguridad.');
            ws.close();
        }
    }, 30000); // ⬅️ MODIFICADO: Aumentado de 10s a 30s

    ws.isAlive = true;
    ws.lastMessageTime = Date.now();

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);

            // ⬇️ NUEVO: Responder a PING sin username (observadores)
            if (parsed.type === 'ping' && !parsed.username) {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                ws.isAlive = true;
                ws.lastMessageTime = Date.now();
                return;
            }

            if (!parsed.username) return;

            if (!username) {
                username = parsed.username;
                ws.username = username;
                clearTimeout(authTimeout);

                if (!userConnections.has(username)) {
                    userConnections.set(username, new Set());
                }
                userConnections.get(username).add(ws);
                console.log(`➕ WebSocket añadido para ${username}`);

                if (!doorState.has(username)) {
                    doorState.set(username, {
                        status: parsed.doorStatus || 'closed',
                        lastSaved10MinSlot: null,
                        lastSaved4HSlot: null,
                        currentEvent: null,
                        doorOpenedAt: null, // ⬅️ NUEVO
                        alertSent: false,   // ⬅️ NUEVO
                    });
                }
            }

            ws.isAlive = true;
            ws.lastMessageTime = Date.now();

            const currentEntry = latestDataPerSensor.get(username);
            const lastDatetime = currentEntry?.data?.datetime;

            if (parsed.datetime !== lastDatetime) {
                latestDataPerSensor.set(username, {
                    data: parsed,
                    lastReceivedAt: Date.now()
                });
            }

            // Guardar en colecciones regulares
            await saveTo10MinData(username, parsed);
            await saveTo4HData(username, parsed);

            // Manejar eventos de puerta
            await handleDoorEvents(username, parsed);

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
        ws.lastMessageTime = Date.now();
    });

    ws.on('close', () => {
        if (username && userConnections.has(username)) {
            userConnections.get(username).delete(ws);

            if (userConnections.get(username).size === 0) {
                userConnections.delete(username);

                if (latestDataPerSensor.has(username)) {
                    latestDataPerSensor.delete(username);
                    console.log(`🧹 Caché de datos eliminado para ${username}`);
                }

                if (doorState.has(username)) {
                    doorState.delete(username);
                    console.log(`🚪 Estado de puerta eliminado para ${username}`);
                }
            }

            console.log(`➖ WebSocket eliminado para ${username}`);
        }
        console.log(`🔌 WebSocket cerrado para ${username ?? 'cliente desconocido'}`);
    });

    ws.on('error', (error) => {
        console.error(`⚠️ Error en WebSocket (${username ?? 'cliente desconocido'}): ${error.message}`);
    });
});

function get10MinSlot(datetime) {
    const date = new Date(datetime);
    const minutes = date.getMinutes();
    const roundedMinutes = Math.floor(minutes / 10) * 10;

    date.setMinutes(roundedMinutes);
    date.setSeconds(0);
    date.setMilliseconds(0);

    return date;
}

function get4HSlot(datetime) {
    const date = new Date(datetime);
    const hours = date.getHours();
    const roundedHours = Math.floor(hours / 4) * 4;

    date.setHours(roundedHours);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);

    return date;
}

async function saveTo10MinData(username, data) {
    try {
        const slot = get10MinSlot(data.datetime);
        const state = doorState.get(username);

        if (state && state.lastSaved10MinSlot && state.lastSaved10MinSlot.getTime() === slot.getTime()) {
            return;
        }

        const device = await Device.findOne({ assigned_sensor_username: username });

        const tenMinData = new TenMinData({
            temperature: parseFloat(data.temperature),
            humidity: parseFloat(data.humidity),
            dsTemperature: parseFloat(data.dsTemperature),
            username: username,
            datetime: new Date(data.datetime),
            device_id: device ? device._id : null,
            doorStatus: data.doorStatus || 'closed',
            time_slot: slot
        });

        await tenMinData.save();

        if (state) {
            state.lastSaved10MinSlot = slot;
            doorState.set(username, state);
        }

        console.log(`📊 10MIN: ${username} → Slot ${slot.toISOString()} - T.OUT: ${data.dsTemperature}°C - Door: ${data.doorStatus || 'N/A'}`);
    } catch (err) {
        if (err.code !== 11000) {
            console.error(`❌ Error guardando en 10mindata:`, err.message);
        }
    }
}

async function saveTo4HData(username, data) {
    try {
        const slot = get4HSlot(data.datetime);
        const state = doorState.get(username);

        if (state && state.lastSaved4HSlot && state.lastSaved4HSlot.getTime() === slot.getTime()) {
            return;
        }

        const device = await Device.findOne({ assigned_sensor_username: username });

        const fourHData = new FourHData({
            temperature: parseFloat(data.temperature),
            humidity: parseFloat(data.humidity),
            dsTemperature: parseFloat(data.dsTemperature),
            username: username,
            datetime: new Date(data.datetime),
            device_id: device ? device._id : null,
            doorStatus: data.doorStatus || 'closed',
            time_slot: slot
        });

        await fourHData.save();

        if (state) {
            state.lastSaved4HSlot = slot;
            doorState.set(username, state);
        }

        console.log(`📈 4H: ${username} → Slot ${slot.toISOString()} - T.OUT: ${data.dsTemperature}°C - Door: ${data.doorStatus || 'N/A'}`);
    } catch (err) {
        if (err.code !== 11000) {
            console.error(`❌ Error guardando en 4hdata:`, err.message);
        }
    }
}

// ⬇️ MODIFICADO: handleDoorEvents con alertas push
async function handleDoorEvents(username, data) {
    const state = doorState.get(username);
    if (!state || !data.doorStatus) return;

    const currentStatus = data.doorStatus;
    const previousStatus = state.status;

    // PUERTA SE ABRE (closed → open)
    if (currentStatus === 'open' && previousStatus === 'closed') {
        console.log(`🔓 ${username}: PUERTA ABIERTA`);

        try {
            const device = await Device.findOne({ assigned_sensor_username: username });

            const newEvent = new DoorEvent({
                username: username,
                opened_at: new Date(data.datetime),
                temp_OUT_before: parseFloat(data.dsTemperature),
                temp_IN_before: parseFloat(data.temperature),
                humidity_before: parseFloat(data.humidity),
                device_id: device ? device._id : null,
                status: 'in_progress'
            });

            await newEvent.save();
            state.currentEvent = newEvent._id;
            state.doorOpenedAt = Date.now(); // ⬅️ NUEVO
            state.alertSent = false; // ⬅️ NUEVO

            console.log(`✅ Evento de puerta creado: ${newEvent._id}`);
        } catch (err) {
            console.error(`❌ Error creando evento de puerta: ${err.message}`);
        }
    }

    // ⬇️ NUEVO: Puerta sigue abierta - verificar alerta
    else if (currentStatus === 'open' && previousStatus === 'open') {
        if (state.doorOpenedAt && !state.alertSent) {
            const timeOpen = Date.now() - state.doorOpenedAt;

            // Si la puerta está abierta por más de 1 minuto
            if (timeOpen > 60000) {
                console.log(`🚨 ${username}: PUERTA ABIERTA >1 MIN - Enviando alertas`);

                // Enviar notificación a TODOS los observadores registrados
                const notificationPromises = [];
                for (const [observerId, token] of fcmTokens.entries()) {
                    const promise = sendPushNotification(
                        observerId,
                        '🚨 DOOR ALERT',
                        `${username}: Door has been open for more than 1 minute!`,
                        {
                            type: 'door_alert',
                            username: username,
                            temperature: data.dsTemperature.toString(),
                            timeOpen: Math.floor(timeOpen / 1000).toString(),
                        }
                    );
                    notificationPromises.push(promise);
                }

                await Promise.all(notificationPromises);
                state.alertSent = true;
            }
        }
    }

    // PUERTA SE CIERRA (open → closed)
    else if (currentStatus === 'closed' && previousStatus === 'open') {
        console.log(`🔒 ${username}: PUERTA CERRADA`);

        if (state.currentEvent) {
            try {
                const event = await DoorEvent.findById(state.currentEvent);
                if (event) {
                    const duration = (new Date(data.datetime) - event.opened_at) / 1000;

                    event.closed_at = new Date(data.datetime);
                    event.temp_OUT_after = parseFloat(data.dsTemperature);
                    event.temp_IN_after = parseFloat(data.temperature);
                    event.humidity_after = parseFloat(data.humidity);
                    event.duration_seconds = duration;
                    event.temp_OUT_drop = parseFloat(data.dsTemperature) - event.temp_OUT_before;
                    event.temp_IN_drop = parseFloat(data.temperature) - event.temp_IN_before;
                    event.status = 'completed';

                    await event.save();

                    console.log(`✅ Evento completado: ${event._id} - Duración: ${duration.toFixed(0)}s - Δ T.OUT: ${event.temp_OUT_drop.toFixed(1)}°C`);
                }
            } catch (err) {
                console.error(`❌ Error cerrando evento: ${err.message}`);
            }

            state.currentEvent = null;
        }

        // ⬅️ NUEVO: Reset alert state
        state.doorOpenedAt = null;
        state.alertSent = false;
    }

    state.status = currentStatus;
    doorState.set(username, state);
}

// Health check para WebSockets
setInterval(() => {
    const now = Date.now();

    wss.clients.forEach(ws => {
        const timeSinceLastMessage = now - (ws.lastMessageTime || 0);

        if (!ws.isAlive && timeSinceLastMessage > 180000) { // ⬅️ MODIFICADO: 3 minutos
            console.warn(`💀 ${ws.username ?? 'Cliente'} sin actividad >3min. Cerrando WebSocket...`);
            return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

setInterval(() => {
    console.log('🧹 Limpiando sensores inactivos...');
    const now = Date.now();

    for (const [username, entry] of latestDataPerSensor.entries()) {
        const { lastReceivedAt } = entry;

        if (now - lastReceivedAt > 5 * 60 * 1000) {
            console.warn(`⚠️ Sensor ${username} inactivo >5min. Eliminando de caché`);
            latestDataPerSensor.delete(username);
            doorState.delete(username);
        }
    }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
