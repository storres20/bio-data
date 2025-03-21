require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/user.model'); // Make sure this model is correct

async function hashPasswords() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.DATABASE_URL, { dbName: 'bio-data' });

        // Get all users
        const users = await User.find();

        for (let user of users) {
            if (!user.password.startsWith('$2b$')) { // Check if already hashed
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await User.updateOne({ _id: user._id }, { password: hashedPassword });
                console.log(`Updated password for: ${user.username}`);
            }
        }

        console.log('All passwords updated successfully!');
        mongoose.connection.close();
    } catch (error) {
        console.error('Error updating passwords:', error);
    }
}

hashPasswords();
