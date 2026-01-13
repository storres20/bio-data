// index.js - VERSIÓN CON LOOP UNIFICADO Y TRACKING DE DESCONEXIÓN

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

// Inicializar Firebase Admin
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

app.post('/api/devices/fcm-token', async (req, res) => {
    try {
        const { observerId, fcmToken } = req.body;

        if (!observerId || !fcmToken) {
            return res.status(400).json({ error: 'observerId and fcmToken required' });
        }

        let existingObserverId = null;
        for (const [id, data] of fcmTokens.entries()) {
            const existingToken = typeof data === 'string' ? data : data.token;
            if (existingToken === fcmToken && id !== observerId) {
                existingObserverId = id;
                break;
            }
        }

        if (existingObserverId) {
            fcmTokens.delete(existingObserverId);
            console.log(`🗑️ Token duplicado eliminado: ${existingObserverId}`);
        }

        fcmTokens.set(observerId, {
            token: fcmToken,
            registeredAt: Date.now(),
        });

        console.log(`🔑 FCM Token registrado para ${observerId}`);
        console.log(`📊 Total de tokens únicos: ${fcmTokens.size}`);

        res.json({ success: true, message: 'Token registered successfully' });
    } catch (error) {
        console.error('❌ Error registrando FCM token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/debug/fcm-analysis', (req, res) => {
    const analysis = {
        totalEntries: fcmTokens.size,
        entries: [],
        uniqueTokens: new Set(),
        duplicates: []
    };

    for (const [observerId, tokenData] of fcmTokens.entries()) {
        const token = typeof tokenData === 'string' ? tokenData : tokenData.token;

        analysis.entries.push({
            observerId,
            tokenPreview: token.substring(0, 30) + '...',
            registeredAt: typeof tokenData === 'object' ? new Date(tokenData.registeredAt).toISOString() : 'unknown',
        });

        if (analysis.uniqueTokens.has(token)) {
            analysis.duplicates.push({
                observerId,
                token: token.substring(0, 30) + '...',
            });
        } else {
            analysis.uniqueTokens.add(token);
        }
    }

    res.json({
        totalRegisteredIds: analysis.totalEntries,
        uniqueTokens: analysis.uniqueTokens.size,
        duplicatedTokens: analysis.duplicates.length,
        hasDuplicates: analysis.duplicates.length > 0,
        entries: analysis.entries,
        duplicates: analysis.duplicates.length > 0 ? analysis.duplicates : undefined,
    });
});

app.get('/api/debug/active-alerts', (req, res) => {
    const activeAlerts = [];

    for (const [username, intervalId] of alertIntervals.entries()) {
        const state = doorState.get(username);
        activeAlerts.push({
            username,
            status: state?.status,
            doorOpenedAt: state?.doorOpenedAt ? new Date(state.doorOpenedAt).toISOString() : null,
            alertActive: true,
        });
    }

    res.json({
        totalActiveAlerts: activeAlerts.length,
        alerts: activeAlerts,
    });
});

app.get('/api/simulations', async (req, res) => {
    try {
        const sims = await Simulation.find({}, 'username');
        res.json(sims);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching simulations' });
    }
});

app.get('/api/door-events/all', async (req, res) => {
    try {
        const { limit = 100, status } = req.query;

        const query = {};
        if (status) query.status = status;

        const events = await DoorEvent.find(query)
            .sort({ opened_at: -1 })
            .limit(parseInt(limit));

        res.json(events);
    } catch (err) {
        console.error('❌ Error fetching all door events:', err);
        res.status(500).json({ error: 'Error fetching door events' });
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
            },
            dsTemperature: { $ne: null }
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

async function sendPushNotification(observerId, title, body, data = {}) {
    try {
        const tokenData = fcmTokens.get(observerId);

        if (!tokenData) {
            console.log(`⚠️ No hay FCM token para ${observerId}`);
            return;
        }

        const fcmToken = typeof tokenData === 'string' ? tokenData : tokenData.token;

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
                    channelId: 'mhutemp-alerts',
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

        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
            fcmTokens.delete(observerId);
            console.log(`🗑️ Token inválido eliminado para ${observerId}`);
        }
    }
}

async function sendAlertToAllObservers(username, data, alertType = 'door', timeOpen = 0, tempDuration = 0) {
    const notificationPromises = [];
    const totalObservers = fcmTokens.size;

    let title, body, extraData = {};

    // Determinar tipo de alerta
    if (alertType === 'critical') {
        const tempStatus = data.dsTemperature < 1 ? 'TOO LOW' : 'TOO HIGH';
        title = '🚨 CRITICAL ALERT';
        body = `${username}: Door open (${Math.floor(timeOpen/1000)}s) + Temp ${data.dsTemperature}°C (${tempStatus})`;
        extraData.alertType = 'critical';

    } else if (alertType === 'door') {
        title = '🚨 DOOR ALERT';
        body = `${username}: Door has been open for ${Math.floor(timeOpen/1000)} seconds!`;
        extraData.alertType = 'door';

    } else if (alertType === 'temp_low') {
        title = '❄️ LOW TEMPERATURE';
        body = `${username}: Temperature ${data.dsTemperature}°C (${Math.floor(tempDuration/60000)} min below 1°C)`;
        extraData.alertType = 'temp_low';

    } else if (alertType === 'temp_high') {
        title = '🔥 HIGH TEMPERATURE';
        body = `${username}: Temperature ${data.dsTemperature}°C (${Math.floor(tempDuration/60000)} min above 6°C)`;
        extraData.alertType = 'temp_high';
    }

    console.log(`📤 Enviando alerta [${alertType.toUpperCase()}] a ${totalObservers} dispositivos...`);

    for (const [observerId, tokenData] of fcmTokens.entries()) {
        const promise = sendPushNotification(
            observerId,
            title,
            body,
            {
                type: alertType,
                username: username,
                temperature: data.dsTemperature !== null ? data.dsTemperature.toString() : 'N/A',
                timeOpen: Math.floor(timeOpen / 1000).toString(),
                tempDuration: Math.floor(tempDuration / 1000).toString(),
                timestamp: Date.now().toString(),
                ...extraData
            }
        );
        notificationPromises.push(promise);
    }

    await Promise.all(notificationPromises);
    console.log(`✅ Alerta [${alertType.toUpperCase()}] enviada a ${totalObservers} dispositivos`);
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const latestDataPerSensor = new Map();
const userConnections = new Map();
const doorState = new Map();
const fcmTokens = new Map();
const alertIntervals = new Map();
const tempAlertState = new Map();
const disconnectionTimestamps = new Map();  // ⬅️ NUEVO: Rastrear desconexiones

const ALERT_DELAY = 60000;                    // 1 minuto
const ALERT_INTERVAL = 20000;                 // 20 segundos
const RECONNECTION_GRACE_PERIOD = 5 * 60 * 1000;  // 5 minutos

server.on('upgrade', (req, socket, head) => {
    console.log("📡 Upgrade request for WebSocket");
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

function validateSensorData(parsed) {
    if (!parsed.username || !parsed.datetime) {
        return {
            valid: false,
            reason: 'Missing username or datetime'
        };
    }

    const hasValidTemp = parsed.temperature === null || typeof parsed.temperature === 'number';
    const hasValidHumidity = parsed.humidity === null || typeof parsed.humidity === 'number';
    const hasValidDsTemp = parsed.dsTemperature === null || typeof parsed.dsTemperature === 'number';

    if (!hasValidTemp || !hasValidHumidity || !hasValidDsTemp) {
        return {
            valid: false,
            reason: 'Invalid sensor data types'
        };
    }

    const activeSensors = {
        dht: parsed.temperature !== null && parsed.humidity !== null,
        ds18b20: parsed.dsTemperature !== null,
        door: typeof parsed.doorStatus === 'string'
    };

    return {
        valid: true,
        activeSensors: activeSensors
    };
}

wss.on('connection', (ws) => {
    console.log('✅ New WebSocket connection established');
    let username = null;

    const authTimeout = setTimeout(() => {
        if (!username) {
            console.warn('⏱️ Cliente no identificado. Cerrando WebSocket por seguridad.');
            ws.close();
        }
    }, 30000);

    ws.isAlive = true;
    ws.lastMessageTime = Date.now();

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);

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

                // ⬇️ NUEVO: Limpiar timestamp de desconexión al reconectar
                if (disconnectionTimestamps.has(username)) {
                    const disconnectedFor = Date.now() - disconnectionTimestamps.get(username);
                    console.log(`✅ ${username}: Reconectado después de ${Math.floor(disconnectedFor/1000)}s desconectado`);
                    disconnectionTimestamps.delete(username);
                }

                // Restaurar evento activo si existe uno reciente
                if (!username.startsWith('MOBILE_OBSERVER_')) {
                    try {
                        const recentEvent = await DoorEvent.findOne({
                            username: username,
                            status: 'in_progress',
                            opened_at: { $gte: new Date(Date.now() - RECONNECTION_GRACE_PERIOD) }
                        }).sort({ opened_at: -1 });

                        if (recentEvent) {
                            console.log(`🔄 ${username}: Restaurando evento activo tras reconexión: ${recentEvent._id}`);

                            if (parsed.doorStatus === 'closed') {
                                console.log(`🔒 ${username}: Puerta cerrada al reconectar - Cerrando evento restaurado`);

                                const closedAt = new Date(parsed.datetime);
                                const duration = (closedAt - recentEvent.opened_at) / 1000;

                                recentEvent.closed_at = closedAt;
                                recentEvent.duration_seconds = duration;
                                recentEvent.temp_OUT_after = parsed.dsTemperature;
                                recentEvent.temp_IN_after = parsed.temperature;
                                recentEvent.humidity_after = parsed.humidity;

                                if (recentEvent.temp_OUT_before !== null && parsed.dsTemperature !== null) {
                                    recentEvent.temp_OUT_drop = parsed.dsTemperature - recentEvent.temp_OUT_before;
                                }
                                if (recentEvent.temp_IN_before !== null && parsed.temperature !== null) {
                                    recentEvent.temp_IN_drop = parsed.temperature - recentEvent.temp_IN_before;
                                }

                                recentEvent.status = 'completed';
                                recentEvent.metadata = {
                                    reconnection: true,
                                    closed_on_reconnect: true
                                };

                                await recentEvent.save();

                                console.log(`✅ ${username}: Evento cerrado tras reconexión (duración: ${duration.toFixed(0)}s)`);

                                doorState.set(username, {
                                    status: 'closed',
                                    lastSaved10MinSlot: null,
                                    lastSaved4HSlot: null,
                                    currentEvent: null,
                                    doorOpenedAt: null,
                                    alertSent: false,
                                });

                            } else {
                                console.log(`🚨 ${username}: Puerta sigue abierta tras reconexión - Continuando evento`);

                                doorState.set(username, {
                                    status: 'open',
                                    lastSaved10MinSlot: null,
                                    lastSaved4HSlot: null,
                                    currentEvent: recentEvent._id,
                                    doorOpenedAt: recentEvent.opened_at.getTime(),
                                    alertSent: true,
                                });
                            }
                        } else {
                            doorState.set(username, {
                                status: parsed.doorStatus || 'closed',
                                lastSaved10MinSlot: null,
                                lastSaved4HSlot: null,
                                currentEvent: null,
                                doorOpenedAt: null,
                                alertSent: false,
                            });
                            console.log(`🚪 doorState creado para ${username}`);
                        }
                    } catch (err) {
                        console.error(`❌ Error restaurando evento: ${err.message}`);

                        doorState.set(username, {
                            status: parsed.doorStatus || 'closed',
                            lastSaved10MinSlot: null,
                            lastSaved4HSlot: null,
                            currentEvent: null,
                            doorOpenedAt: null,
                            alertSent: false,
                        });
                    }
                }

                if (username.startsWith('MOBILE_OBSERVER_')) {
                    console.log(`👁️ Observador móvil registrado: ${username}`);
                    return;
                }
            }

            ws.isAlive = true;
            ws.lastMessageTime = Date.now();

            if (username.startsWith('MOBILE_OBSERVER_')) {
                return;
            }

            const validation = validateSensorData(parsed);

            if (!validation.valid) {
                console.log(`⚠️ ${username}: ${validation.reason}, esperando datos...`);
                return;
            }

            const sensorStatus = [];
            if (validation.activeSensors.dht) sensorStatus.push('DHT✓');
            else sensorStatus.push('DHT✗');

            if (validation.activeSensors.ds18b20) sensorStatus.push('DS18B20✓');
            else sensorStatus.push('DS18B20✗');

            if (validation.activeSensors.door) sensorStatus.push(`Door:${parsed.doorStatus}`);

            console.log(`📡 ${username}: ${sensorStatus.join(' | ')}`);

            const currentEntry = latestDataPerSensor.get(username);
            const lastDatetime = currentEntry?.data?.datetime;

            if (parsed.datetime !== lastDatetime) {
                latestDataPerSensor.set(username, {
                    data: parsed,
                    lastReceivedAt: Date.now()
                });
            }

            if (validation.activeSensors.dht || validation.activeSensors.ds18b20) {
                await saveTo10MinData(username, parsed);
                await saveTo4HData(username, parsed);
            }

            await handleDoorEvents(username, parsed);
            await handleTemperatureAlerts(username, parsed);
            await handleUnifiedAlerts(username, parsed);  // ⬅️ NUEVO: Manejo unificado de alertas

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

                // ⬇️ NUEVO: Registrar momento de desconexión
                if (!username.startsWith('MOBILE_OBSERVER_')) {
                    const doorStateData = doorState.get(username);
                    if (doorStateData && doorStateData.status === 'open' && doorStateData.currentEvent) {
                        disconnectionTimestamps.set(username, Date.now());
                        console.log(`⏱️ ${username}: Desconexión registrada (puerta abierta)`);
                    }
                }

                if (alertIntervals.has(username)) {
                    clearInterval(alertIntervals.get(username));
                    alertIntervals.delete(username);
                    console.log(`🛑 ${username}: Alertas detenidas (sensor desconectado)`);
                }

                if (tempAlertState.has(username)) {
                    tempAlertState.delete(username);
                }

                if (latestDataPerSensor.has(username)) {
                    latestDataPerSensor.delete(username);
                    console.log(`🧹 Caché de datos eliminado para ${username}`);
                }

                console.log(`⏳ ${username}: Estado preservado para posible reconexión`);

                if (username.startsWith('MOBILE_OBSERVER_')) {
                    if (fcmTokens.has(username)) {
                        fcmTokens.delete(username);
                        console.log(`🗑️ FCM Token eliminado para ${username}`);
                    }
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
            temperature: data.temperature !== null ? parseFloat(data.temperature) : null,
            humidity: data.humidity !== null ? parseFloat(data.humidity) : null,
            dsTemperature: data.dsTemperature !== null ? parseFloat(data.dsTemperature) : null,
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

        const tempOut = data.dsTemperature !== null ? `${data.dsTemperature}°C` : 'N/A';
        const tempIn = data.temperature !== null ? `${data.temperature}°C` : 'N/A';
        const humidity = data.humidity !== null ? `${data.humidity}%` : 'N/A';

        console.log(`📊 10MIN: ${username} → Slot ${slot.toISOString()} - T.OUT: ${tempOut} | T.IN: ${tempIn} | H: ${humidity} | Door: ${data.doorStatus || 'N/A'}`);
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
            temperature: data.temperature !== null ? parseFloat(data.temperature) : null,
            humidity: data.humidity !== null ? parseFloat(data.humidity) : null,
            dsTemperature: data.dsTemperature !== null ? parseFloat(data.dsTemperature) : null,
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

        const tempOut = data.dsTemperature !== null ? `${data.dsTemperature}°C` : 'N/A';
        console.log(`📈 4H: ${username} → Slot ${slot.toISOString()} - T.OUT: ${tempOut} - Door: ${data.doorStatus || 'N/A'}`);
    } catch (err) {
        if (err.code !== 11000) {
            console.error(`❌ Error guardando en 4hdata:`, err.message);
        }
    }
}

// ⬇️ MODIFICADA: Solo actualizar estado, NO enviar alertas
async function handleTemperatureAlerts(username, data) {
    if (data.dsTemperature === null) {
        if (tempAlertState.has(username)) {
            console.log(`🛑 ${username}: Estado temp cancelado (sensor desconectado)`);
            tempAlertState.delete(username);
        }
        return;
    }

    const temp = parseFloat(data.dsTemperature);
    const now = Date.now();
    const isCritical = temp < 1 || temp > 6;

    if (isCritical) {
        const state = tempAlertState.get(username);
        const type = temp < 1 ? 'low' : 'high';

        if (!state) {
            tempAlertState.set(username, {
                startTime: now,
                temperature: temp,
                type: type
            });
            console.log(`🌡️ ${username}: Temperatura ${type === 'low' ? 'BAJA' : 'ALTA'}: ${temp}°C`);
        } else {
            state.temperature = temp;
            state.type = type;
        }
    } else {
        if (tempAlertState.has(username)) {
            console.log(`✅ ${username}: Temperatura normalizada: ${temp}°C`);
            tempAlertState.delete(username);
        }
    }
}

async function handleDoorEvents(username, data) {
    const state = doorState.get(username);
    if (!state || !data.doorStatus) return;

    const currentStatus = data.doorStatus;
    const previousStatus = state.status;

    // PUERTA SE ABRE
    if (currentStatus === 'open' && previousStatus === 'closed') {
        console.log(`🔓 ${username}: PUERTA ABIERTA`);

        try {
            const device = await Device.findOne({ assigned_sensor_username: username });

            const newEvent = new DoorEvent({
                username: username,
                opened_at: new Date(data.datetime),
                temp_OUT_before: data.dsTemperature !== null ? parseFloat(data.dsTemperature) : null,
                temp_IN_before: data.temperature !== null ? parseFloat(data.temperature) : null,
                humidity_before: data.humidity !== null ? parseFloat(data.humidity) : null,
                device_id: device ? device._id : null,
                status: 'in_progress'
            });

            await newEvent.save();
            state.currentEvent = newEvent._id;
            state.doorOpenedAt = Date.now();
            state.alertSent = false;

            console.log(`✅ Evento de puerta creado: ${newEvent._id}`);
        } catch (err) {
            console.error(`❌ Error creando evento de puerta: ${err.message}`);
        }
    }

    // PUERTA SE CIERRA
    else if (currentStatus === 'closed' && previousStatus === 'open') {
        console.log(`🔒 ${username}: PUERTA CERRADA`);

        if (state.currentEvent) {
            try {
                const event = await DoorEvent.findById(state.currentEvent);
                if (event) {
                    const duration = (new Date(data.datetime) - event.opened_at) / 1000;

                    event.closed_at = new Date(data.datetime);
                    event.temp_OUT_after = data.dsTemperature !== null ? parseFloat(data.dsTemperature) : null;
                    event.temp_IN_after = data.temperature !== null ? parseFloat(data.temperature) : null;
                    event.humidity_after = data.humidity !== null ? parseFloat(data.humidity) : null;
                    event.duration_seconds = duration;

                    if (event.temp_OUT_before !== null && data.dsTemperature !== null) {
                        event.temp_OUT_drop = parseFloat(data.dsTemperature) - event.temp_OUT_before;
                    }
                    if (event.temp_IN_before !== null && data.temperature !== null) {
                        event.temp_IN_drop = parseFloat(data.temperature) - event.temp_IN_before;
                    }

                    event.status = 'completed';

                    await event.save();

                    const tempOutDrop = event.temp_OUT_drop !== null ? `${event.temp_OUT_drop.toFixed(1)}°C` : 'N/A';
                    console.log(`✅ Evento completado: ${event._id} - Duración: ${duration.toFixed(0)}s - Δ T.OUT: ${tempOutDrop}`);
                }
            } catch (err) {
                console.error(`❌ Error cerrando evento: ${err.message}`);
            }

            state.currentEvent = null;
        }

        state.doorOpenedAt = null;
        state.alertSent = false;
    }

    state.status = currentStatus;
    doorState.set(username, state);
}

// ⬇️ NUEVA FUNCIÓN: Manejo unificado de alertas (UN SOLO LOOP)
async function handleUnifiedAlerts(username, data) {
    const doorStateData = doorState.get(username);
    if (!doorStateData) return;

    const now = Date.now();
    const isDoorOpen = doorStateData.status === 'open';
    const doorOpenTime = isDoorOpen && doorStateData.doorOpenedAt ? (now - doorStateData.doorOpenedAt) : 0;

    const temp = data.dsTemperature !== null ? parseFloat(data.dsTemperature) : null;
    const isTempCritical = temp !== null && (temp < 1 || temp > 6);

    let tempState = tempAlertState.get(username);
    let tempDuration = tempState ? (now - tempState.startTime) : 0;

    const shouldAlert = (isDoorOpen && doorOpenTime > ALERT_DELAY) ||
        (isTempCritical && tempDuration > ALERT_DELAY);

    if (shouldAlert) {
        let alertType = 'door';
        if (isDoorOpen && doorOpenTime > ALERT_DELAY && isTempCritical && tempDuration > ALERT_DELAY) {
            alertType = 'critical';
        } else if (isTempCritical && tempDuration > ALERT_DELAY) {
            alertType = temp < 1 ? 'temp_low' : 'temp_high';
        }

        if (!alertIntervals.has(username)) {
            console.log(`🚨 ${username}: Primera alerta [${alertType.toUpperCase()}]`);
            await sendAlertToAllObservers(username, data, alertType, doorOpenTime, tempDuration);

            const intervalId = setInterval(async () => {
                const currentDoorState = doorState.get(username);
                const currentTempState = tempAlertState.get(username);

                if (!currentDoorState) {
                    clearInterval(intervalId);
                    alertIntervals.delete(username);
                    return;
                }

                const currentNow = Date.now();
                const currentDoorOpen = currentDoorState.status === 'open';
                const currentDoorTime = currentDoorOpen && currentDoorState.doorOpenedAt
                    ? (currentNow - currentDoorState.doorOpenedAt)
                    : 0;

                const currentTemp = data.dsTemperature;
                const currentTempCritical = currentTemp !== null && (currentTemp < 1 || currentTemp > 6);
                const currentTempDuration = currentTempState ? (currentNow - currentTempState.startTime) : 0;

                let currentAlertType = 'door';
                if (currentDoorOpen && currentDoorTime > ALERT_DELAY &&
                    currentTempCritical && currentTempDuration > ALERT_DELAY) {
                    currentAlertType = 'critical';
                } else if (currentTempCritical && currentTempDuration > ALERT_DELAY) {
                    currentAlertType = currentTemp < 1 ? 'temp_low' : 'temp_high';
                } else if (!currentDoorOpen || currentDoorTime <= ALERT_DELAY) {
                    if (!currentTempCritical || currentTempDuration <= ALERT_DELAY) {
                        clearInterval(intervalId);
                        alertIntervals.delete(username);
                        console.log(`✅ ${username}: Alertas detenidas (condiciones normalizadas)`);
                        return;
                    }
                }

                console.log(`🔔 ${username}: Alerta repetida [${currentAlertType.toUpperCase()}] (${Math.floor(currentDoorTime/1000)}s puerta, ${Math.floor(currentTempDuration/1000)}s temp)`);
                await sendAlertToAllObservers(username, data, currentAlertType, currentDoorTime, currentTempDuration);

            }, ALERT_INTERVAL);

            alertIntervals.set(username, intervalId);
            console.log(`⏰ ${username}: Loop de alertas iniciado (cada 20s)`);
        }
    } else {
        if (alertIntervals.has(username)) {
            clearInterval(alertIntervals.get(username));
            alertIntervals.delete(username);
            console.log(`🛑 ${username}: Alertas detenidas`);
        }
    }
}

setInterval(() => {
    const now = Date.now();

    wss.clients.forEach(ws => {
        const timeSinceLastMessage = now - (ws.lastMessageTime || 0);

        if (!ws.isAlive && timeSinceLastMessage > 180000) {
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

// ⬇️ MODIFICADA: Limpiar eventos huérfanos con tracking de desconexión
setInterval(async () => {
    console.log('🧹 Verificando eventos de puerta...');

    try {
        const now = Date.now();
        const activeEvents = await DoorEvent.find({ status: 'in_progress' });

        for (const event of activeEvents) {
            const username = event.username;
            const isDeviceConnected = userConnections.has(username) && userConnections.get(username).size > 0;

            if (!isDeviceConnected) {
                const disconnectedAt = disconnectionTimestamps.get(username);

                if (disconnectedAt) {
                    const disconnectedTime = now - disconnectedAt;
                    const disconnection_seconds = Math.floor(disconnectedTime / 1000);

                    if (disconnectedTime > RECONNECTION_GRACE_PERIOD) {
                        const totalOpenTime = now - event.opened_at.getTime();
                        const total_open_seconds = Math.floor(totalOpenTime / 1000);

                        console.log(`🔴 ${username}: Evento incompleto (desconectado ${disconnection_seconds}s de ${total_open_seconds}s total)`);

                        event.status = 'incomplete';
                        event.closed_at = new Date();
                        event.duration_seconds = total_open_seconds;
                        event.temp_OUT_after = null;
                        event.temp_IN_after = null;
                        event.humidity_after = null;
                        event.metadata = {
                            reason: 'device_disconnected',
                            disconnection_seconds: disconnection_seconds,
                            total_open_seconds: total_open_seconds,
                            auto_closed: true,
                            detected_at: new Date()
                        };

                        await event.save();

                        if (alertIntervals.has(username)) {
                            clearInterval(alertIntervals.get(username));
                            alertIntervals.delete(username);
                        }

                        if (doorState.has(username)) {
                            doorState.delete(username);
                        }

                        disconnectionTimestamps.delete(username);

                        console.log(`✅ ${username}: Evento marcado como incompleto: ${event._id}`);
                    } else {
                        console.log(`⏳ ${username}: Esperando reconexión (${disconnection_seconds}s/${Math.floor(RECONNECTION_GRACE_PERIOD/1000)}s)`);
                    }
                }
            }
        }

    } catch (err) {
        console.error('❌ Error en limpieza de eventos:', err.message);
    }
}, 2 * 60 * 1000);

setInterval(() => {
    console.log('🧹 Limpiando tokens FCM viejos...');
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;

    for (const [observerId, tokenData] of fcmTokens.entries()) {
        if (typeof tokenData === 'object' && tokenData.registeredAt) {
            const age = now - tokenData.registeredAt;

            if (age > maxAge) {
                fcmTokens.delete(observerId);
                console.log(`🗑️ Token expirado eliminado: ${observerId} (${Math.floor(age / 1000 / 60 / 60)}h)`);
            }
        }
    }

    console.log(`📊 Tokens activos después de limpieza: ${fcmTokens.size}`);
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
