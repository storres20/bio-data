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
        dsTemperature: req.body.dsTemperature
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
