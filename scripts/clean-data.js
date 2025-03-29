require('dotenv').config();
const mongoose = require('mongoose');
const Data = require('../models/data.model');

// Connect to MongoDB
mongoose.connect(process.env.DATABASE_URL, {
    dbName: 'bio-data',
})
    .then(() => {
        console.log('✅ Connected to MongoDB');
        return Data.deleteMany({});
    })
    .then((result) => {
        console.log(`🗑️ Deleted ${result.deletedCount} documents from the datas collection.`);
    })
    .catch((err) => {
        console.error('❌ Error:', err.message);
    })
    .finally(() => {
        mongoose.connection.close();
    });
