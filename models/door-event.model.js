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
        default: null  // ⬅️ Cambiado: permite null si sensor desconectado
    },
    temp_IN_before: {
        type: Number,
        default: null  // ⬅️ Cambiado: permite null si sensor desconectado
    },
    humidity_before: {
        type: Number,
        default: null  // ⬅️ Cambiado: permite null si sensor desconectado
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

    // Análisis calculado
    temp_OUT_drop: {
        type: Number,
        default: null
    },
    temp_IN_drop: {
        type: Number,
        default: null
    },

    // Estado del evento
    status: {
        type: String,
        enum: ['in_progress', 'completed', 'incomplete'],  // ⬅️ Agregado: 'incomplete'
        default: 'in_progress',
        index: true
    },

    // Notas adicionales
    notes: {
        type: String,
        default: null
    },

    // ⬇️ NUEVO: Metadata para trazabilidad (opcional pero recomendado)
    metadata: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true // Agrega createdAt y updatedAt automáticamente
});

// Índice compuesto para búsquedas eficientes
doorEventSchema.index({ username: 1, opened_at: -1 });
doorEventSchema.index({ username: 1, status: 1 });
doorEventSchema.index({ status: 1, opened_at: -1 });  // ⬅️ Nuevo: para limpieza periódica

module.exports = mongoose.model('DoorEvent', doorEventSchema);
