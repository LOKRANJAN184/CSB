const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('./config/db');
const { initSocket } = require('./socket');
const User = require('./models/User');
const Staff = require('./models/Staff');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Setup Socket.io
initSocket(server);

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve uploaded bill photos statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve public frontend
app.use(express.static(path.join(__dirname, '../public')));

// Seed default users and staff
const seedInitialData = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('[Seed] Seeding initial Owner and Shop Manager accounts...');

      const defaultPhonePins = {
        '9976885361': '7688',
        '9025351545': '5351',
        '9842329813': '2329',
        '9043979813': '4397',
      };
      const phoneCredentials = [];
      for (const [ph, p] of Object.entries(defaultPhonePins)) {
        phoneCredentials.push({
          phone: ph,
          pin: await bcrypt.hash(p, 10),
        });
      }

      const ownerPin = await bcrypt.hash('5351', 10);
      const ownerPass = await bcrypt.hash('5351', 10);

      const managerPin = await bcrypt.hash('8734', 10);
      const managerPass = await bcrypt.hash('8734', 10);

      await User.create([
        {
          username: 'owner',
          name: 'Chendurar Owner',
          role: 'owner',
          pin: ownerPin,
          password: ownerPass,
          phone: '9025351545',
          allowedPhones: Object.keys(defaultPhonePins),
          phoneCredentials,
        },
        {
          username: 'manager',
          name: 'Shop Manager',
          role: 'manager',
          pin: managerPin,
          password: managerPass,
          phone: '9840054321',
        },
      ]);

      console.log('[Seed] Default accounts created:');
      console.log('       1. Owner: Mobile + Dedicated PIN per number');
      console.log('       2. Shop Manager: PIN 8734');
    } else {
      // Ensure Owner has dedicated PINs per mobile number
      const defaultPhonePins = {
        '9976885361': '7688',
        '9025351545': '5351',
        '9842329813': '2329',
        '9043979813': '4397',
      };
      const phoneCredentials = [];
      for (const [ph, p] of Object.entries(defaultPhonePins)) {
        phoneCredentials.push({
          phone: ph,
          pin: await bcrypt.hash(p, 10),
        });
      }

      const existingOwner = await User.findOne({ role: 'owner' });
      if (existingOwner) {
        existingOwner.allowedPhones = Object.keys(defaultPhonePins);
        existingOwner.phoneCredentials = phoneCredentials;
        existingOwner.pin = await bcrypt.hash('5351', 10);
        existingOwner.password = await bcrypt.hash('5351', 10);
        await existingOwner.save();
        console.log('[Seed] Owner mobile numbers and dedicated PINs verified/updated');
      }

      // Always ensure Shop Manager uses PIN & Password 8734
      const existingMgr = await User.findOne({ role: 'manager' });
      if (existingMgr) {
        const isPin8734 = await bcrypt.compare('8734', existingMgr.pin || '');
        if (!isPin8734) {
          existingMgr.pin = await bcrypt.hash('8734', 10);
          existingMgr.password = await bcrypt.hash('8734', 10);
          await existingMgr.save();
          console.log('[Seed] Manager PIN and Password verified/updated to 8734');
        }
      }
    }

    const staffCount = await Staff.countDocuments();
    if (staffCount === 0) {
      console.log('[Seed] Seeding initial bakery staff members...');
      await Staff.create([
        {
          name: 'Muthuvel',
          role: 'Sweet Master',
          phone: '9840111222',
          wageType: 'daily',
          wageRate: 850,
          isActive: true,
          createdBy: 'System Seed',
        },
        {
          name: 'Karthik',
          role: 'Bakery Chef',
          phone: '9840222333',
          wageType: 'daily',
          wageRate: 800,
          isActive: true,
          createdBy: 'System Seed',
        },
        {
          name: 'Selvam',
          role: 'Counter Sales',
          phone: '9840333444',
          wageType: 'daily',
          wageRate: 600,
          isActive: true,
          createdBy: 'System Seed',
        },
        {
          name: 'Priya',
          role: 'Cashier & Billing',
          phone: '9840444555',
          wageType: 'daily',
          wageRate: 600,
          isActive: true,
          createdBy: 'System Seed',
        },
        {
          name: 'Raju',
          role: 'Helper & Packing',
          phone: '9840555666',
          wageType: 'daily',
          wageRate: 500,
          isActive: true,
          createdBy: 'System Seed',
        },
      ]);
      console.log('[Seed] 5 initial staff members created.');
    }
  } catch (err) {
    console.error('[Seed] Error seeding initial data:', err.message);
  }
};

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/history', require('./routes/history'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/devices', require('./routes/devices'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Chendurar Sweets & Bakery API',
    time: new Date().toISOString(),
  });
});

// App Version & In-App APK Updates endpoint
app.get('/api/app-version', (req, res) => {
  try {
    const pkg = require('../package.json');
    res.json({
      success: true,
      version: pkg.version || '1.1.0',
      name: 'Chendurar Sweets & Bakery',
      downloadUrl: '/Chendurar-Bakery.apk',
      githubRepo: process.env.GITHUB_REPO || 'owner/chendurar-sweets',
      releaseNotes: 'Dark Mode support, clean SVG icon system, in-app APK updates, and UI performance enhancements.',
      publishedAt: new Date().toISOString()
    });
  } catch (err) {
    res.json({ success: true, version: '1.1.0', downloadUrl: '/Chendurar-Bakery.apk' });
  }
});

// Single Page Application fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await seedInitialData();

  server.listen(PORT, () => {
    console.log(`======================================================`);
    console.log(` Chendurar Sweets and Bakery App is LIVE!`);
    console.log(` Local URL: http://localhost:${PORT}`);
    console.log(` WebSocket Realtime Sync: Enabled`);
    console.log(`======================================================`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;
module.exports.seedInitialData = seedInitialData;
