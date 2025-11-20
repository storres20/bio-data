const mongoose = require('mongoose');

const fourHDataSchema = new mongoose.Schema({
    temperature: { type: Number, required: true },
    humidity: { type: Number, required: true },
    dsTemperature: { type: Number, required: true },
    username: { type: String, required: true },
    datetime: { type: Date, required: true },
    device_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    doorStatus: { type: String, enum: ['open', 'closed'], default: 'closed' },
    time_slot: { type: Date, required: true } // Slot de 4h (ej: 2025-01-15T08:00:00.000Z)
}, {
    timestamps: true
});

// Índice para evitar duplicados por username y slot
fourHDataSchema.index({ username: 1, time_slot: 1 }, { unique: true });

module.exports = mongoose.model('FourHData', fourHDataSchema, '4hdata');
