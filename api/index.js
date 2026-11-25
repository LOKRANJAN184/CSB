// Vercel entry point. Vercel turns this file into a serverless function and
// vercel.json sends every /api/* request here. An Express app is itself a
// (req, res) function, so we can export it directly.
module.exports = require('../server/app');
