const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const env = require('./config/env');
const connectDB = require('./config/db');
const { seedIfEmpty } = require('./services/seed');
const { HttpError } = require('./lib/http');

// Builds the Express app. It does NOT start listening — that is done by
// server/index.js locally, or by Vercel via api/index.js in production.

const app = express();
app.disable('x-powered-by');

// The Android app runs from a different origin (https://localhost inside the
// WebView), so the API must allow cross-origin requests. We use tokens in a
// header, not cookies, so this is safe.
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '1mb' }));

// Health check (no database needed to answer, but reports DB state)
app.get('/api/health', async (req, res) => {
  let db = 'disconnected';
  try {
    await connectDB();
    db = mongoose.connection.readyState === 1 ? 'connected' : 'connecting';
  } catch (e) {
    db = `error: ${e.message}`;
  }
  res.status(db === 'connected' ? 200 : 503).json({ ok: db === 'connected', db, version: require('../package.json').version });
});

// Make sure the database is connected before any API route runs.
let seeded = false;
app.use('/api', async (req, res, next) => {
  await connectDB();
  if (!seeded) {
    seeded = true;
    await seedIfEmpty().catch((e) => console.error('[seed]', e.message));
  }
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/history', require('./routes/history'));
app.use('/api/app', require('./routes/app'));

app.use('/api', (req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Unknown API route.' }));

// Serve the web app (same files that go inside the Android APK).
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
app.use((req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// One error handler for everything. Express 5 automatically sends errors
// thrown inside async route handlers here — no try/catch needed in routes.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ ok: false, code: err.code, message: err.message, ...err.extra });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ ok: false, code: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large.' : err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, code: 'BAD_JSON', message: 'Invalid request.' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ ok: false, code: 'BAD_ID', message: 'Invalid id.' });
  }
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: env.isProduction ? 'Something went wrong on the server.' : err.message });
});

module.exports = app;
