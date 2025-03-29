const express = require('express');
const router = express.Router();
const Device = require('../models/device.model');
const mongoose = require('mongoose');

// ✅ Get devices by hospital ID (with hospital and area populated)
router.get('/hospital/:id', async (req, res) => {
    try {
        const hospitalId = req.params.id;

        // Asegúrate de que sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
            return res.status(400).json({ message: 'Invalid hospital ID format' });
        }

        const devices = await Device.find({ hospital_id: hospitalId })
            .populate('hospital_id', 'name')
            .populate('area_id', 'name');

        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ Get all devices (admin or debug use)
router.get('/', async (req, res) => {
    try {
        const devices = await Device.find()
            .populate('hospital_id', 'name')
            .populate('area_id', 'name');
        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ Create new device
router.post('/', async (req, res) => {
    const { name, brand, model, serie, hospital_id, area_id } = req.body;

    const device = new Device({
        name,
        brand,
        model,
        serie,
        hospital_id,
        area_id
    });

    try {
        const savedDevice = await device.save();
        res.status(201).json(savedDevice);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ✅ PATCH: Assign sensor username to a device
router.patch('/:id/assign-sensor', async (req, res) => {
    const deviceId = req.params.id;
    const { username } = req.body;

    try {
        const device = await Device.findById(deviceId);
        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        device.assigned_sensor_username = username;
        await device.save();

        res.status(200).json(device);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ Get device assigned to a sensor username
router.get('/by-sensor/:username', async (req, res) => {
    try {
        const device = await Device.findOne({ assigned_sensor_username: req.params.username })
            .populate('hospital_id', 'name')
            .populate('area_id', 'name');

        if (!device) {
            return res.status(404).json({ message: 'Device not found for this sensor' });
        }

        res.json(device);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
