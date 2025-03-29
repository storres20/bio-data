const express = require('express');
const Model = require('../models/data.model');

const router = express.Router();

// ✅ POST Method - create data (optionally include device_id)
router.post('/data', async (req, res) => {
    const data = new Model({
        temperature: req.body.temperature,
        humidity: req.body.humidity,
        dsTemperature: req.body.dsTemperature,
        username: req.body.username,
        datetime: req.body.datetime,
        device_id: req.body.device_id || null  // optional field
    });

    try {
        const dataToSave = await data.save();
        res.status(200).json(dataToSave);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ✅ GET all Method - include device info
router.get('/', async (req, res) => {
    try {
        const data = await Model.find().populate('device_id');
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ GET data by username - include device info
router.get('/username/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const data = await Model.find({ username }).populate('device_id');

        if (data.length === 0) {
            return res.status(404).json({ message: 'No data found for this username' });
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ DELETE all data
router.delete('/', async (req, res) => {
    try {
        await Model.deleteMany({});
        res.status(200).json({ message: 'All data deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ DELETE data by username
router.delete('/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await Model.deleteMany({ username });
        if (result.deletedCount > 0) {
            res.status(200).json({ message: `All data for user ${username} deleted successfully` });
        } else {
            res.status(404).json({ message: `No data found for user ${username}` });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ GET all unique usernames
router.get('/usernames', async (req, res) => {
    try {
        const usernames = await Model.distinct('username');
        res.status(200).json(usernames);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
