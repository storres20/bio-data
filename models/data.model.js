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
    }
})

module.exports = mongoose.model('Data', dataSchema)