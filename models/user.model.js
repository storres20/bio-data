const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    area_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
});

module.exports = mongoose.model('User', userSchema);
