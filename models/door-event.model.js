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
        default: null
    },
    temp_IN_before: {
        type: Number,
        default: null
    },
    humidity_before: {
        type: Number,
        default: null
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

    // ⬇️ NUEVO: Historial de desconexiones/reconexiones
    disconnections: [{
        disconnected_at: {
            type: Date,
            required: true
        },
        reconnected_at: {
            type: Date,
            default: null
        },
        duration_seconds: {
            type: Number,
            default: null
        },
        reason: {
            type: String,
            enum: ['websocket_close', 'timeout', 'unknown', 'estimated_from_inactivity'],
            default: 'websocket_close'
        }
    }],

    // ⬇️ NUEVO: Tiempo total desconectado acumulado
    total_disconnection_time_seconds: {
        type: Number,
        default: 0
    },

    // Estado del evento
    status: {
        type: String,
        enum: ['in_progress', 'completed', 'incomplete'],
        default: 'in_progress',
        index: true
    },

    // Notas adicionales
    notes: {
        type: String,
        default: null
    },

    // Metadata para trazabilidad
    metadata: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true // createdAt y updatedAt
});

// Índices compuestos para queries eficientes
doorEventSchema.index({ username: 1, opened_at: -1 });
doorEventSchema.index({ username: 1, status: 1 });
doorEventSchema.index({ status: 1, opened_at: -1 });

// ⬇️ NUEVO: Virtual para calcular tiempo total con puerta abierta
doorEventSchema.virtual('total_open_time_seconds').get(function() {
    if (!this.opened_at) return null;

    const endTime = this.closed_at || new Date();
    return Math.floor((endTime - this.opened_at) / 1000);
});

// ⬇️ NUEVO: Virtual para verificar si hay desconexión activa
doorEventSchema.virtual('has_active_disconnection').get(function() {
    if (!this.disconnections || this.disconnections.length === 0) return false;

    const lastDisc = this.disconnections[this.disconnections.length - 1];
    return lastDisc.reconnected_at === null;
});

// ⬇️ NUEVO: Virtual para obtener la última desconexión
doorEventSchema.virtual('last_disconnection').get(function() {
    if (!this.disconnections || this.disconnections.length === 0) return null;
    return this.disconnections[this.disconnections.length - 1];
});

// ⬇️ NUEVO: Virtual para contar desconexiones
doorEventSchema.virtual('disconnection_count').get(function() {
    return this.disconnections ? this.disconnections.length : 0;
});

// Asegurar que los virtuals aparezcan en JSON
doorEventSchema.set('toJSON', { virtuals: true });
doorEventSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DoorEvent', doorEventSchema);
