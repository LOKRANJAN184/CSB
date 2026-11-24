const app = require('../server/server');
const connectDB = require('../server/config/db');

let isSeeded = false;

module.exports = async (req, res) => {
  try {
    await connectDB();
    if (!isSeeded && app && typeof app.seedInitialData === 'function') {
      await app.seedInitialData().catch((err) => console.error('Seed error:', err.message));
      isSeeded = true;
    }
  } catch (err) {
    console.error('Database connection error in serverless handler:', err);
  }
  return app(req, res);
};
