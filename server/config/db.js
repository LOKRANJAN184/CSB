const mongoose = require('mongoose');

// Disable command buffering so queries fail immediately if not connected instead of hanging for 10s
mongoose.set('bufferCommands', false);

const sanitizeMongoURI = (rawUri) => {
  if (!rawUri || typeof rawUri !== 'string') return null;

  let uri = rawUri.trim().replace(/^["']|["']$/g, '');

  // Fix accidental space in scheme
  uri = uri.replace(/^mongodb\+srv:\s*\/\//i, 'mongodb+srv://');
  uri = uri.replace(/^mongodb:\s*\/\//i, 'mongodb://');

  // If protocol scheme was omitted when copying (e.g. user:pass@cluster0...)
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    if (uri.includes('.mongodb.net')) {
      uri = 'mongodb+srv://' + uri;
    } else {
      uri = 'mongodb://' + uri;
    }
  }

  return uri;
};

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  const rawURI = process.env.MONGODB_URI || (!process.env.VERCEL ? 'mongodb://127.0.0.1:27017/csb_bakery' : null);
  const mongoURI = sanitizeMongoURI(rawURI);

  if (!mongoURI) {
    throw new Error('MONGODB_URI environment variable is missing on Vercel. Please add MONGODB_URI in Vercel Project Settings > Environment Variables and redeploy.');
  }

  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000,
    });
    console.log('[Database] MongoDB connected successfully');
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
