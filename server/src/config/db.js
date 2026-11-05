import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

export const connectDB = async () => {
  try {
    if (env.USE_MEMORY_DB && env.NODE_ENV !== 'production') {
      console.log('⚡ Initializing embedded in-memory MongoDB instance...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      const uri = memoryServer.getUri();
      await mongoose.connect(uri);
      console.log(`✅ Connected to In-Memory MongoDB at ${uri}`);
      return;
    }

    // Try standard MongoDB connection
    console.log(`Connecting to MongoDB at: ${env.MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
    });
    console.log('✅ Connected to MongoDB database successfully.');
  } catch (error) {
    console.warn(`⚠️ Could not connect to primary MongoDB URI: ${error.message}`);
    if (env.NODE_ENV !== 'production') {
      console.log('🔄 Falling back to embedded MongoMemoryServer for local development/testing...');
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        const uri = memoryServer.getUri();
        await mongoose.connect(uri);
        console.log(`✅ Connected to Fallback In-Memory MongoDB at ${uri}`);
        return;
      } catch (memError) {
        console.error('❌ Failed to start In-Memory MongoDB fallback:', memError.message);
        throw memError;
      }
    } else {
      throw error;
    }
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
    }
    console.log('🔌 Disconnected from database.');
  } catch (err) {
    console.error('Error disconnecting database:', err);
  }
};

