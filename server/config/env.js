// All configuration is read from environment variables in ONE place.
// Every other file imports from here instead of touching process.env directly,
// so you can see at a glance everything the server needs to run.
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

const env = {
  isProduction,
  port: Number(process.env.PORT) || 5000,

  // MongoDB connection string. Locally we fall back to a MongoDB on this machine.
  mongoUri: process.env.MONGODB_URI || (isProduction ? '' : 'mongodb://127.0.0.1:27017/csb_bakery'),

  // Secret used to sign login tokens. MUST be set in production, otherwise
  // anyone who reads this code could forge a login token.
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'dev-only-secret-change-me'),

  // How long a login lasts before the app asks for the PIN again.
  sessionHours: {
    owner: Number(process.env.OWNER_SESSION_HOURS) || 5,
    manager: Number(process.env.MANAGER_SESSION_HOURS) || 1,
  },

  // Where app updates (APK files) are published. See .github/workflows/release.yml
  githubRepo: process.env.GITHUB_REPO || 'LOKRANJAN184/CSB',
  githubToken: process.env.GITHUB_TOKEN || '',

  // The business time zone. "Today" is always calculated in this zone, not the
  // server's zone (Vercel servers run in UTC, which is 5h30m behind India).
  timeZone: process.env.TIME_ZONE || 'Asia/Kolkata',

  // Used only once, when the database is completely empty. Format:
  //   SEED_OWNER_LOGINS="9876543210:1234,9123456780:5678"
  //   SEED_MANAGER_PIN="4321"
  seedOwnerLogins: process.env.SEED_OWNER_LOGINS || '',
  seedManagerPin: process.env.SEED_MANAGER_PIN || '',
};

if (isProduction && !env.jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required in production.');
}

module.exports = env;
