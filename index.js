require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const http = require('http');

const datas = require('./routes/data.routes');
const authRoutes = require('./routes/auth.routes');
const devices = require('./routes/device.routes');
const Data = require('./models/data.model');
const Device = require('./models/device.model');
const Simulation = require('./models/simulation.model');
const DoorEvent = require('./models/door-event.model'); // ← NUEVO MODELO

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

app.get('/api/simulations', async (req, res) => {
    try {
        const sims = await Simulation.find({}, 'username');
        res.json(sims);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching simulations' });
    }
});

// ========================================
// ✨ NUEVO: Endpoint para eventos de puerta
// ========================================
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

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const latestDataPerSensor = new Map();
const userConnections = new Map();

// ========================================
// ✨ NUEVO: Estado de control de puerta por sensor
// ========================================
const doorState = new Map(); // username => { status, lastSaveTime, samplingRate, currentEvent, tempBeforeOpen, recoveryMode }

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
    }, 10000);

    ws.isAlive = true;

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);
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

                // ========================================
                // ✨ NUEVO: Inicializar estado de puerta
                // ========================================
                if (!doorState.has(username)) {
                    doorState.set(username, {
                        status: parsed.doorStatus || 'closed',
                        lastSaveTime: 0,
                        samplingRate: 10 * 60 * 1000, // 10 minutos por defecto
                        currentEvent: null,
                        tempBeforeOpen: null,
                        recoveryMode: false
                    });
                }
            }

            ws.isAlive = true;

            const currentEntry = latestDataPerSensor.get(username);
            const lastDatetime = currentEntry?.data?.datetime;

            if (parsed.datetime !== lastDatetime) {
                latestDataPerSensor.set(username, {
                    data: parsed,
                    lastReceivedAt: Date.now()
                });
            }

            // ========================================
            // ✨ NUEVO: Detectar cambios de estado de puerta
            // ========================================
            await handleDoorStatusChange(username, parsed);

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
        if (username && userConnections.has(username)) {
            userConnections.get(username).delete(ws);
            if (userConnections.get(username).size === 0) {
                userConnections.delete(username);
            }
            console.log(`➖ WebSocket eliminado para ${username}`);
        }
        console.log(`🔌 WebSocket cerrado para ${username ?? 'cliente desconocido'}`);
    });

    ws.on('error', (error) => {
        console.error(`⚠️ Error en WebSocket (${username ?? 'cliente desconocido'}): ${error.message}`);
    });
});

// ========================================
// ✨ NUEVA FUNCIÓN: Manejar cambios de estado de puerta
// ========================================
async function handleDoorStatusChange(username, data) {
    const state = doorState.get(username);
    if (!state) return;

    const currentStatus = data.doorStatus;
    const previousStatus = state.status;

    // No hay cambio de estado
    if (currentStatus === previousStatus) {
        // Verificar si toca guardar según la frecuencia actual
        await checkAndSaveData(username, data);
        return;
    }

    console.log(`🚪 ${username}: Cambio de estado ${previousStatus} → ${currentStatus}`);

    // ========================================
    // 🚪 PUERTA SE ABRIÓ
    // ========================================
    if (currentStatus === 'open' && previousStatus === 'closed') {
        console.log(`🔓 ${username}: PUERTA ABIERTA - Iniciando monitoreo intensivo`);

        // Guardar snapshot inmediato
        await saveDataToMongo(username, data, '1min', null);

        // Crear nuevo evento de puerta
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
            state.tempBeforeOpen = parseFloat(data.dsTemperature);
            state.samplingRate = 1 * 60 * 1000; // Cambiar a 1 minuto
            state.lastSaveTime = Date.now();
            state.recoveryMode = false;

            console.log(`✅ Evento de puerta creado: ${newEvent._id}`);
        } catch (err) {
            console.error(`❌ Error creando evento de puerta: ${err.message}`);
        }
    }

        // ========================================
        // 🚪 PUERTA SE CERRÓ
    // ========================================
    else if (currentStatus === 'closed' && previousStatus === 'open') {
        console.log(`🔒 ${username}: PUERTA CERRADA - Iniciando modo recuperación`);

        // Guardar snapshot inmediato
        await saveDataToMongo(username, data, '1min', state.currentEvent);

        // Actualizar evento de puerta
        if (state.currentEvent) {
            try {
                const openedEvent = await DoorEvent.findById(state.currentEvent);
                if (openedEvent) {
                    const duration = (new Date(data.datetime) - openedEvent.opened_at) / 1000; // segundos

                    openedEvent.closed_at = new Date(data.datetime);
                    openedEvent.temp_OUT_after = parseFloat(data.dsTemperature);
                    openedEvent.temp_IN_after = parseFloat(data.temperature);
                    openedEvent.humidity_after = parseFloat(data.humidity);
                    openedEvent.duration_seconds = duration;
                    openedEvent.temp_OUT_drop = parseFloat(data.dsTemperature) - state.tempBeforeOpen;
                    openedEvent.temp_IN_drop = parseFloat(data.temperature) - openedEvent.temp_IN_before;
                    openedEvent.status = 'recovering';

                    await openedEvent.save();

                    console.log(`✅ Evento actualizado (cerrado): duración ${duration.toFixed(0)}s, Δ temp ${openedEvent.temp_OUT_drop.toFixed(1)}°C`);
                }
            } catch (err) {
                console.error(`❌ Error actualizando evento al cerrar: ${err.message}`);
            }
        }

        // Mantener sampling de 1 min para recuperación
        state.recoveryMode = true;
        state.lastSaveTime = Date.now();
    }

    // Actualizar estado
    state.status = currentStatus;
    doorState.set(username, state);
}

// ========================================
// ✨ NUEVA FUNCIÓN: Verificar y guardar según frecuencia
// ========================================
async function checkAndSaveData(username, data) {
    const state = doorState.get(username);
    if (!state) return;

    const now = Date.now();
    const timeSinceLastSave = now - state.lastSaveTime;

    // Verificar si toca guardar según la frecuencia actual
    if (timeSinceLastSave >= state.samplingRate) {
        const samplingLabel = state.samplingRate === 600000 ? '10min' : '1min';
        await saveDataToMongo(username, data, samplingLabel, state.currentEvent);
        state.lastSaveTime = now;

        // ========================================
        // 🔍 VERIFICAR RECUPERACIÓN TÉRMICA
        // ========================================
        if (state.recoveryMode && state.currentEvent && state.tempBeforeOpen !== null) {
            const tempDiff = Math.abs(parseFloat(data.dsTemperature) - state.tempBeforeOpen);
            const tolerance = parseFloat(data.dsTemperature) < 15 ? 1.0 : 0.5; // °C (ajustable)

            if (tempDiff <= tolerance) {
                console.log(`✅ ${username}: TEMPERATURA ESTABILIZADA (Δ = ${tempDiff.toFixed(2)}°C) - Volviendo a modo normal`);

                // Guardar snapshot final
                await saveDataToMongo(username, data, '1min', state.currentEvent);

                // Cerrar evento
                try {
                    const event = await DoorEvent.findById(state.currentEvent);
                    if (event) {
                        const recoveryTime = (new Date(data.datetime) - event.closed_at) / 1000;

                        event.stabilized_at = new Date(data.datetime);
                        event.temp_OUT_stabilized = parseFloat(data.dsTemperature);
                        event.recovery_time_seconds = recoveryTime;
                        event.recovery_efficiency = state.tempBeforeOpen !== 0 ? parseFloat(data.dsTemperature) / state.tempBeforeOpen : 1;
                        event.status = 'completed';

                        await event.save();

                        console.log(`✅ Evento completado: recuperación en ${recoveryTime.toFixed(0)}s`);
                    }
                } catch (err) {
                    console.error(`❌ Error completando evento: ${err.message}`);
                }

                // Resetear a modo normal
                state.samplingRate = 10 * 60 * 1000; // Volver a 10 minutos
                state.recoveryMode = false;
                state.currentEvent = null;
                state.tempBeforeOpen = null;
            }
        }

        // ========================================
        // ⚠️ TIMEOUT DE RECUPERACIÓN (30 min)
        // ========================================
        if (state.recoveryMode && state.currentEvent) {
            try {
                const event = await DoorEvent.findById(state.currentEvent);
                if (event && event.closed_at) {
                    const timeSinceClosed = (Date.now() - new Date(event.closed_at).getTime()) / 1000;

                    if (timeSinceClosed > 30 * 60) { // 30 minutos
                        console.warn(`⚠️ ${username}: Recuperación térmica >30min - Forzando modo normal`);

                        event.stabilized_at = new Date(data.datetime);
                        event.temp_OUT_stabilized = parseFloat(data.dsTemperature);
                        event.recovery_time_seconds = timeSinceClosed;
                        event.recovery_efficiency = state.tempBeforeOpen !== 0 ? parseFloat(data.dsTemperature) / state.tempBeforeOpen : 1;
                        event.status = 'timeout';
                        event.notes = 'Recuperación térmica excedió 30 minutos';

                        await event.save();

                        // Resetear a modo normal
                        state.samplingRate = 10 * 60 * 1000;
                        state.recoveryMode = false;
                        state.currentEvent = null;
                        state.tempBeforeOpen = null;
                    }
                }
            } catch (err) {
                console.error(`❌ Error verificando timeout: ${err.message}`);
            }
        }

        doorState.set(username, state);
    }
}

// ========================================
// ✨ NUEVA FUNCIÓN: Guardar datos en MongoDB
// ========================================
async function saveDataToMongo(username, data, samplingRate, eventId) {
    try {
        const device = await Device.findOne({ assigned_sensor_username: username });

        const mongoData = new Data({
            temperature: data.temperature,
            humidity: data.humidity,
            dsTemperature: data.dsTemperature,
            username: username,
            datetime: data.datetime,
            device_id: device ? device._id : null,
            doorStatus: data.doorStatus,
            sampling_rate: samplingRate, // ← NUEVO CAMPO
            door_event_id: eventId // ← NUEVO CAMPO
        });

        await mongoData.save();

        console.log(`💾 ${username}: Guardado en DB [${samplingRate}] - T.OUT: ${data.dsTemperature}°C | Door: ${data.doorStatus}`);
    } catch (err) {
        console.error(`❌ Error guardando ${username}:`, err.message);
    }
}

// 🔄 PING cada 30 segundos
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

// ========================================
// ⚠️ MODIFICADO: Ya no guardamos aquí, se maneja en tiempo real
// Este intervalo ahora solo limpia sensores inactivos
// ========================================
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
}, 10 * 60 * 1000); // Cada 10 minutos

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
