const mongoose = require('mongoose');
const env = require('./env');

// Fail fast instead of silently queueing queries while disconnected.
mongoose.set('bufferCommands', false);

// On Vercel every request may start a fresh "cold" function. We keep the
// connection promise in a module-level variable so warm invocations reuse it.
let connecting = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!env.mongoUri) {
    throw new Error('MONGODB_URI is not set. Add it in Vercel → Project → Settings → Environment Variables.');
  }
  if (!connecting) {
    connecting = mongoose
      .connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 })
      .then((m) => {
        console.log('[db] connected');
        return m.connection;
      })
      .catch((err) => {
        connecting = null; // allow a retry on the next request
        throw err;
      });
  }
  return connecting;
}

module.exports = connectDB;
