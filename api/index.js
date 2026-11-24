const app = require('../server/server');
const connectDB = require('../server/config/db');

module.exports = async (req, res) => {
  try {
    await connectDB();
    if (app && typeof app.seedInitialData === 'function') {
      await app.seedInitialData().catch(() => {});
    }
  } catch (err) {
    console.error('Database connection error in serverless handler:', err);
  }
  return app(req, res);
};
