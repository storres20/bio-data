const mongoose = require('mongoose');

const simulationSchema = new mongoose.Schema({
    username: { type: String, required: true },
    minT: Number,
    maxT: Number,
    minH: Number,
    maxH: Number,
    minDsT: Number,
    maxDsT: Number,
    fixed: Boolean,
    temperature: Number,
    humidity: Number,
    dsTemperature: Number,
    interval: Number,
    running: Boolean,
}, {
    timestamps: true
});

module.exports = mongoose.model('Simulation', simulationSchema);
