const mongoose = require('mongoose');

// Disable command buffering so queries fail immediately if not connected instead of hanging
mongoose.set('bufferCommands', false);

const sanitizeMongoURI = (rawUri) => {
  if (!rawUri || typeof rawUri !== 'string') return null;

  let text = rawUri.trim();

  // If user pasted text like "Your MongoDB Atlas URI: mongodb+srv://..."
  const match = text.match(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/i);
  if (match) {
    text = match[0];
  } else {
    // Clean outer quotes
    text = text.replace(/^["']|["']$/g, '').trim();

    // Fix accidental space in scheme
    text = text.replace(/^mongodb\+srv:\s*\/\//i, 'mongodb+srv://');
    text = text.replace(/^mongodb:\s*\/\//i, 'mongodb://');

    if (!text.startsWith('mongodb://') && !text.startsWith('mongodb+srv://')) {
      if (text.includes('.mongodb.net')) {
        text = 'mongodb+srv://' + text;
      } else {
        text = 'mongodb://' + text;
      }
    }
  }

  // Handle URL encoding for password if password contains unescaped special characters
  // Format: mongodb+srv://<username>:<password>@<cluster>/<db>?<options>
  try {
    const protocolMatch = text.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/i);
    if (protocolMatch) {
      const scheme = protocolMatch[1];
      const rest = protocolMatch[2];

      const atIndex = rest.lastIndexOf('@');
      if (atIndex !== -1) {
        const authPart = rest.substring(0, atIndex);
        const hostAndRest = rest.substring(atIndex + 1);

        const colonIndex = authPart.indexOf(':');
        if (colonIndex !== -1) {
          const user = authPart.substring(0, colonIndex);
          let pass = authPart.substring(colonIndex + 1);

          // If password is not properly URL-encoded (contains unencoded @, #, $, %, etc.)
          try {
            // decode first to avoid double encoding
            pass = decodeURIComponent(pass);
          } catch (e) {
            // ignore
          }
          const encodedPass = encodeURIComponent(pass);
          const encodedUser = encodeURIComponent(decodeURIComponent(user));
          text = `${scheme}${encodedUser}:${encodedPass}@${hostAndRest}`;
        }
      }
    }
  } catch (e) {
    console.error('URI formatting helper error:', e.message);
  }

  return text;
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
