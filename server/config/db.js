const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/csb_bakery';
  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[Database] MongoDB connected successfully to ${mongoURI}`);
    return mongoose.connection;
  } catch (err) {
    console.error('[Database] MongoDB connection error:', err.message);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
    throw err;
  }
};

module.exports = connectDB;

