const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const Area = require('../models/area.model');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

// Register a new user
router.post('/register', async (req, res) => {
    const { username, password, hospital_id, area_id } = req.body;

    try {
        const hospital = await Hospital.findById(hospital_id);
        const area = await Area.findById(area_id);
        if (!hospital || !area) {
            return res.status(400).json({ message: 'Invalid hospital or area ID' });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, hospital_id, area_id });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Login user & generate JWT
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username }).populate('hospital_id area_id');
        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                username: user.username,
                hospital: {
                    _id: user.hospital_id._id,
                    name: user.hospital_id.name
                },
                area: {
                    _id: user.area_id._id,
                    name: user.area_id.name
                }
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
