const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/user.model'); // New user model
const Hospital = require('../models/hospital.model'); // New hospital model
const Area = require('../models/area.model'); // New area model
const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
    const { username, password, hospital, area } = req.body;

    try {
        // Check if username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = new User({ username, password: hashedPassword, hospital, area });
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
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        res.status(200).json({ message: 'Login successful' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Fetch hospitals
router.get('/hospitals', async (req, res) => {
    try {
        const hospitals = await Hospital.find();
        res.status(200).json(hospitals);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Fetch areas
router.get('/areas', async (req, res) => {
    try {
        const areas = await Area.find();
        res.status(200).json(areas);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
