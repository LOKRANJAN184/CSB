const app = require('../server/server');
const connectDB = require('../server/config/db');
const mongoose = require('mongoose');

let isSeeded = false;

module.exports = async (req, res) => {
  // Diagnostic and health endpoint for monitoring Vercel deployment status
  if (req.url === '/api/health' || req.url === '/api/status' || req.url === '/api/db-check') {
    let dbStatus = 'disconnected';
    let dbError = null;
    try {
      await connectDB();
      dbStatus = 'connected';
    } catch (err) {
      dbError = err.message;
    }

    const hasUri = !!process.env.MONGODB_URI;
    let safePreview = 'Not Set';
    if (hasUri) {
      const parts = process.env.MONGODB_URI.split('@');
      safePreview = parts.length > 1 ? `...@${parts[1].split('?')[0]}` : 'Set (no @ found)';
    }

    return res.status(dbStatus === 'connected' ? 200 : 503).json({
      status: dbStatus === 'connected' ? 'ok' : 'error',
      mongodb: dbStatus,
      error: dbError,
      hasMongoUri: hasUri,
      uriPreview: safePreview,
      hasJwtSecret: !!process.env.JWT_SECRET,
      readyState: mongoose.connection.readyState,
    });
  }

  // Attempt database connection before delegating to Express
  try {
    await connectDB();
    if (!isSeeded && app && typeof app.seedInitialData === 'function') {
      await app.seedInitialData().catch((err) => console.error('Seed error:', err.message));
      isSeeded = true;
    }
  } catch (err) {
    console.error('Database connection error in serverless handler:', err.message);
    return res.status(503).json({
      success: false,
      code: 'DB_CONNECTION_ERROR',
      message: `Database connection error: ${err.message}. If using MongoDB Atlas, please verify: 1) MongoDB Atlas Network Access has 0.0.0.0/0 allowed, 2) MONGODB_URI is saved in Vercel settings, and 3) password in connection string is correct.`,
      error: err.message,
    });
  }

  return app(req, res);
};
