const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const Area = require('../models/area.model');

const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
    const { username, password, hospital_id, area_id } = req.body;

    try {
        // Validate hospital_id and area_id exist
        const hospital = await Hospital.findById(hospital_id);
        const area = await Area.findById(area_id);
        if (!hospital || !area) {
            return res.status(400).json({ message: 'Invalid hospital or area ID' });
        }

        // Check if username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user with IDs
        const newUser = new User({ username, password: hashedPassword, hospital_id, area_id });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Find user by username
        const user = await User.findOne({ username }).populate('hospital_id area_id');
        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        res.status(200).json({
            message: 'Login successful',
            user: {
                username: user.username,
                hospital: user.hospital_id.name,
                area: user.area_id.name
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Fetch hospitals
router.get('/hospitals', async (req, res) => {
    try {
        const hospitals = await Hospital.find({}, '_id name');
        res.status(200).json(hospitals);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Fetch areas
router.get('/areas', async (req, res) => {
    try {
        const areas = await Area.find({}, '_id name');
        res.status(200).json(areas);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
