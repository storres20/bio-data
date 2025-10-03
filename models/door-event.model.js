const mongoose = require('mongoose');

const doorEventSchema = new mongoose.Schema({
    // Identificación
    username: {
        type: String,
        required: true,
        index: true
    },
    device_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Device',
        default: null
    },

    // Datos de apertura
    opened_at: {
        type: Date,
        required: true,
        index: true
    },
    temp_OUT_before: {
        type: Number,
        required: true
    },
    temp_IN_before: {
        type: Number,
        required: true
    },
    humidity_before: {
        type: Number,
        required: true
    },

    // Datos de cierre
    closed_at: {
        type: Date,
        default: null
    },
    temp_OUT_after: {
        type: Number,
        default: null
    },
    temp_IN_after: {
        type: Number,
        default: null
    },
    humidity_after: {
        type: Number,
        default: null
    },
    duration_seconds: {
        type: Number,
        default: null
    },

    // Datos de recuperación
    stabilized_at: {
        type: Date,
        default: null
    },
    temp_OUT_stabilized: {
        type: Number,
        default: null
    },
    recovery_time_seconds: {
        type: Number,
        default: null
    },

    // Análisis calculado
    temp_OUT_drop: {
        type: Number,
        default: null
    },
    temp_IN_drop: {
        type: Number,
        default: null
    },
    recovery_efficiency: {
        type: Number,
        default: null
    },

    // Estado del evento
    status: {
        type: String,
        enum: ['in_progress', 'recovering', 'completed', 'timeout'],
        default: 'in_progress',
        index: true
    },

    // Notas adicionales
    notes: {
        type: String,
        default: null
    }
}, {
    timestamps: true // Agrega createdAt y updatedAt automáticamente
});

// Índice compuesto para búsquedas eficientes
doorEventSchema.index({ username: 1, opened_at: -1 });
doorEventSchema.index({ username: 1, status: 1 });

module.exports = mongoose.model('DoorEvent', doorEventSchema);
