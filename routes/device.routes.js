const express = require('express');
const router = express.Router();
const Device = require('../models/device.model'); // Make sure this file exists!
const mongoose = require('mongoose');

// ✅ Get devices by hospital ID
router.get('/hospital/:id', async (req, res) => {
    try {
        const hospitalId = req.params.id;
        const devices = await Device.find({ hospital_id: hospitalId });
        //const hospitalId = new mongoose.Types.ObjectId(req.params.id);
        //const devices = await Device.find({ hospital_id: hospitalId });
        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ Optional: Get all devices (admin or debug use)
router.get('/', async (req, res) => {
    try {
        const devices = await Device.find();
        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ Optional: Add new device (for testing or admin use)
router.post('/', async (req, res) => {
    const { name, brand, model, serie, hospital_id } = req.body;

    const device = new Device({
        name,
        brand,
        model,
        serie,
        hospital_id
    });

    try {
        const savedDevice = await device.save();
        res.status(201).json(savedDevice);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
