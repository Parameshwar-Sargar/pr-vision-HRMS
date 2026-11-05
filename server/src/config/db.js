import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

export const connectDB = async () => {
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
    process.exit(1);
  }

  if (uri.includes('YOUR_NEW_PASSWORD')) {
    console.error('❌ FATAL: Please replace "YOUR_NEW_PASSWORD" in server/.env with your actual MongoDB Atlas password.');
    process.exit(1);
  }

  // Mask credentials for secure logging
  const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  console.log(`Connecting to MongoDB Atlas at: ${maskedUri}`);

  try {
    const conn = await mongoose.connect(uri, {
      dbName: 'pr_vision_hrms',
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 15000,
    });
    console.log(`✅ Connected to MongoDB Atlas successfully [Host: ${conn.connection.host}, DB: ${conn.connection.name}]`);
  } catch (error) {
    console.error(`❌ FATAL: Could not connect to MongoDB Atlas database: ${error.message}`);
    console.error('⚠️ Verify your internet connection, Atlas IP Access List (ensure your IP or 0.0.0.0/0 is whitelisted), and credentials in server/.env.');
    // Do NOT fall back to in-memory database in development or production
    process.exit(1);
  }
};

export const disconnectDB = async () => {
  try {
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
