const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    temperature: {
        required: true,
        type: String,
    },
    humidity: {
        required: true,
        type: String
    },
    dsTemperature: {
        required: true,
        type: String
    },
    username: {
        required: true,
        type: String
    },
    datetime: {
        required: true,
        type: Date
    },
    device_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Device'
    },
    doorStatus: {
        type: String,
        default: 'closed'  // ← Sin required: true para compatibilidad con simuladores
    },
    // ========================================
    // ✨ NUEVOS CAMPOS para lógica de puerta
    // ========================================
    sampling_rate: {
        type: String,
        enum: ['1min', '10min'],
        default: '10min'
    },
    door_event_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DoorEvent',
        default: null
    }
})

module.exports = mongoose.model('Data', dataSchema)
