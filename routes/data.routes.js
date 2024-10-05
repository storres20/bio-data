const express = require('express');
const Model = require('../models/data.model');

const router = express.Router()

module.exports = router;

//Post Method - create data
router.post('/data', async (req, res) => {
    //res.send('Post API')

    const data = new Model({
        temperature: req.body.temperature,
        humidity: req.body.humidity,
        dsTemperature: req.body.dsTemperature,
        username: req.body.username,
        datetime: req.body.datetime
    })

    try {
        const dataToSave = await data.save();
        res.status(200).json(dataToSave)
    }
    catch (error) {
        res.status(400).json({ message: error.message })
    }
})

//Get all Method
router.get('/', async (req, res) => {
    //res.send('Get All API')

    try {
        const data = await Model.find()
        res.json(data)
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})

// Get data by username
router.get('/username/:username', async (req, res) => {
    try {
        const username = req.params.username; // Get the username from the URL parameters
        const data = await Model.find({ username: username }); // Find records by username

        if (data.length === 0) {
            return res.status(404).json({ message: 'No data found for this username' });
        }

        res.json(data); // Return the data for the given username
    } catch (error) {
        res.status(500).json({ message: error.message }); // Handle any errors
    }
});


// DELETE Method - delete all data
router.delete('/', async (req, res) => {
    try {
        await Model.deleteMany({}); // This deletes all documents
        res.status(200).json({ message: 'All data deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE Method - delete data by username
router.delete('/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await Model.deleteMany({ username: username }); // This deletes documents matching the username
        if (result.deletedCount > 0) {
            res.status(200).json({ message: `All data for user ${username} deleted successfully` });
        } else {
            res.status(404).json({ message: `No data found for user ${username}` });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// Get usernames Method - fetch all unique usernames
router.get('/usernames', async (req, res) => {
    try {
        // Use distinct to get a list of unique usernames
        const usernames = await Model.distinct('username');
        res.status(200).json(usernames);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

