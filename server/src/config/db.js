import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

let reconnectTimer = null;

export const connectDB = async ({ exitOnError = false } = {}) => {
  // Use MongoMemoryServer ONLY when running automated tests
  if (env.NODE_ENV === 'test') {
    if (!memoryServer) {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      const uri = memoryServer.getUri();
      await mongoose.connect(uri);
      console.log(`🧪 Connected to Test In-Memory MongoDB at ${uri}`);
    }
    return;
  }

  // Development and Production: Connect exclusively to persistent MongoDB (Atlas) via MONGODB_URI
  const uri = env.MONGODB_URI;
  if (!uri) {
    console.error('❌ FATAL: MONGODB_URI is not defined in environment variables.');
    if (exitOnError) process.exit(1);
    return;
  }

  if (uri.includes('YOUR_NEW_PASSWORD')) {
    console.error('❌ FATAL: Please replace "YOUR_NEW_PASSWORD" in server/.env with your actual MongoDB Atlas password.');
    if (exitOnError) process.exit(1);
    return;
  }

  // Reuse existing shared connection if already connected or connecting
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Mask credentials for secure logging
  const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  console.log(`Connecting to MongoDB Atlas at: ${maskedUri}`);

  const poolOptions = {
    dbName: 'pr_vision_hrms',
    maxPoolSize: 6,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxIdleTimeMS: 60000,
  };

  try {
    const conn = await mongoose.connect(uri, poolOptions);
    console.log(`✅ Connected to MongoDB Atlas successfully [Host: ${conn.connection.host}, DB: ${conn.connection.name}]`);
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
    return conn;
  } catch (error) {
    console.error(`❌ FATAL: Could not connect to MongoDB Atlas database: ${error.message}`);
    console.error('⚠️ Verify your internet connection, Atlas IP Access List (ensure your IP or 0.0.0.0/0 is whitelisted), and credentials in server/.env.');
    // Do NOT fall back to in-memory database in development or production
    if (exitOnError) {
      process.exit(1);
    } else if (!reconnectTimer) {
      console.log('🔄 Server is active on port 5000. Will retry MongoDB Atlas connection every 10 seconds...');
      reconnectTimer = setInterval(async () => {
        try {
          if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(uri, {
              ...poolOptions,
              serverSelectionTimeoutMS: 5000,
              connectTimeoutMS: 8000,
            });
            console.log(`✅ MongoDB Atlas connected successfully on retry! [DB: ${mongoose.connection.name}]`);
            clearInterval(reconnectTimer);
            reconnectTimer = null;
          }
        } catch (_) {
          // Keep retrying quietly until whitelisted
        }
      }, 10000);
    }
  }
};

export const disconnectDB = async () => {
  try {
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
    console.log('🔌 Disconnected from database.');
  } catch (err) {
    console.error('Error disconnecting database:', err);
  }
};
