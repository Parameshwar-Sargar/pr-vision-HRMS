import mongoose from 'mongoose';
import { env } from './env.js';

// Controlled index synchronization: disable automatic index rebuilds on every ordinary startup
const shouldAutoIndex = env.NODE_ENV === 'test' || env.SYNC_INDEXES === true;
mongoose.set('bufferCommands', false);
mongoose.set('autoIndex', shouldAutoIndex);
mongoose.set('autoCreate', shouldAutoIndex);

const READY_STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let connectionPromise = null;
let reconnectTimer = null;
let listenersRegistered = false;
let isShuttingDown = false;

const dbMetrics = {
  initialConnectDurationMs: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
  reconnectAttempts: 0,
  totalConnectionsEstablished: 0,
};

/**
 * Masks credentials in a MongoDB connection URI for safe logging.
 */
export const maskMongoUri = (uri = '') => {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/\/\/([^:/@]+):([^@]+)@/, '//***:***@');
};

/**
 * Sanitizes any error message to ensure credentials are never leaked in logs.
 */
const sanitizeErrorMessage = (message = '') => {
  if (!message || typeof message !== 'string') return 'Unknown database error';
  return message.replace(/\/\/([^:/@]+):([^@]+)@/g, '//***:***@');
};

/**
 * Centralized, validated Mongoose connection options.
 * Used identically by initial startup and controlled reconnection attempts.
 */
export const getConnectionOptions = () => ({
  dbName: env.MONGODB_DB_NAME || 'pr_vision_hrms',
  minPoolSize: env.DB_MIN_POOL_SIZE || 5,
  maxPoolSize: env.DB_MAX_POOL_SIZE || 20,
  serverSelectionTimeoutMS: env.DB_SERVER_SELECTION_TIMEOUT_MS || 25000,
  connectTimeoutMS: env.DB_CONNECT_TIMEOUT_MS || 25000,
  socketTimeoutMS: env.DB_SOCKET_TIMEOUT_MS || 45000,
  maxIdleTimeMS: env.DB_MAX_IDLE_TIME_MS || 60000,
  autoIndex: shouldAutoIndex,
  autoCreate: shouldAutoIndex,
});

const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

/**
 * Controlled reconnection scheduler with bounded backoff.
 * Ensures only a single reconnect loop can ever be active at once.
 */
const scheduleReconnect = () => {
  if (
    isShuttingDown ||
    env.NODE_ENV === 'test' ||
    reconnectTimer ||
    connectionPromise ||
    mongoose.connection.readyState === 1 ||
    mongoose.connection.readyState === 2
  ) {
    return;
  }

  const maxAttempts = env.DB_MAX_RECONNECT_ATTEMPTS || 12;
  if (dbMetrics.reconnectAttempts >= maxAttempts) {
    console.error(
      `❌ [DB] Maximum reconnection attempts (${maxAttempts}) reached. Manual intervention or service restart required.`
    );
    return;
  }

  const baseInterval = env.DB_RECONNECT_INTERVAL_MS || 10000;
  // Bounded linear/exponential backoff capped at 60s
  const delayMs = Math.min(baseInterval * Math.max(1, dbMetrics.reconnectAttempts + 1), 60000);

  console.warn(
    `🔄 [DB] Scheduling MongoDB Atlas reconnection attempt ${dbMetrics.reconnectAttempts + 1}/${maxAttempts} in ${Math.round(delayMs / 1000)}s...`
  );

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (isShuttingDown || mongoose.connection.readyState === 1 || connectionPromise) {
      return;
    }

    dbMetrics.reconnectAttempts += 1;
    try {
      await connectDB({ exitOnError: false, isRetry: true });
    } catch (_) {
      // Handled inside connectDB
    }
  }, delayMs);

  if (typeof reconnectTimer.unref === 'function') {
    reconnectTimer.unref();
  }
};

/**
 * Registers Mongoose connection lifecycle listeners exactly once.
 */
const registerConnectionListeners = () => {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    clearReconnectTimer();
    dbMetrics.lastConnectedAt = new Date().toISOString();
    dbMetrics.lastError = null;
    dbMetrics.reconnectAttempts = 0;
    dbMetrics.totalConnectionsEstablished += 1;
  });

  mongoose.connection.on('reconnected', () => {
    clearReconnectTimer();
    dbMetrics.lastConnectedAt = new Date().toISOString();
    dbMetrics.lastError = null;
    dbMetrics.reconnectAttempts = 0;
    console.log(
      `✅ [DB] MongoDB Atlas connection restored [DB: ${mongoose.connection.name || env.MONGODB_DB_NAME}]`
    );
  });

  mongoose.connection.on('disconnected', () => {
    dbMetrics.lastDisconnectedAt = new Date().toISOString();
    if (!isShuttingDown && env.NODE_ENV !== 'test') {
      console.warn('⚠️ [DB] MongoDB Atlas connection disconnected.');
      scheduleReconnect();
    }
  });

  mongoose.connection.on('error', (err) => {
    const safeMsg = sanitizeErrorMessage(err?.message);
    dbMetrics.lastError = safeMsg;
    if (!isShuttingDown && env.NODE_ENV !== 'test') {
      console.error(`❌ [DB] MongoDB connection error: ${safeMsg}`);
    }
  });
};

/**
 * Returns true when the database connection is established and ready for traffic.
 */
export const isDatabaseReady = () => {
  return !isShuttingDown && mongoose.connection.readyState === 1;
};

/**
 * Returns non-sensitive database health and readiness metadata.
 */
export const getDatabaseStatus = () => {
  const readyState = mongoose.connection.readyState;
  const options = getConnectionOptions();
  return {
    ready: isDatabaseReady(),
    state: READY_STATE_LABELS[readyState] || 'unknown',
    readyState,
    databaseName: mongoose.connection.name || options.dbName,
    initialConnectDurationMs: dbMetrics.initialConnectDurationMs,
    lastConnectedAt: dbMetrics.lastConnectedAt,
    lastDisconnectedAt: dbMetrics.lastDisconnectedAt,
    reconnectAttempts: dbMetrics.reconnectAttempts,
    syncIndexesEnabled: shouldAutoIndex,
    poolConfig: {
      minPoolSize: options.minPoolSize,
      maxPoolSize: options.maxPoolSize,
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
      connectTimeoutMS: options.connectTimeoutMS,
      socketTimeoutMS: options.socketTimeoutMS,
    },
  };
};

/**
 * Non-destructive index synchronization helper.
 * Creates any missing schema-defined indexes without ever dropping existing indexes.
 */
export const syncDatabaseIndexes = async () => {
  if (!isDatabaseReady()) {
    throw new Error('Cannot synchronize indexes while database is not connected.');
  }

  const startMs = performance.now();
  const modelNames = mongoose.modelNames();
  console.log(`🔧 [DB] Synchronizing indexes across ${modelNames.length} Mongoose models (non-destructive createIndexes)...`);

  for (const modelName of modelNames) {
    const model = mongoose.model(modelName);
    await model.createIndexes();
  }

  const elapsedMs = Math.round(performance.now() - startMs);
  console.log(`✅ [DB] Index synchronization complete across ${modelNames.length} models in ${elapsedMs}ms.`);
  return { modelsProcessed: modelNames.length, durationMs: elapsedMs };
};

/**
 * Connects to MongoDB Atlas using the centralized configuration.
 * Prevents duplicate concurrent connection initialization.
 */
export const connectDB = async ({ exitOnError = false, isRetry = false } = {}) => {
  isShuttingDown = false;
  registerConnectionListeners();

  // 1. Reuse existing active connection if already connected
  if (mongoose.connection.readyState === 1) {
    clearReconnectTimer();
    return mongoose;
  }

  // 2. Deduplicate concurrent connection attempts
  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = env.MONGODB_URI;
  if (!uri) {
    const msg = 'FATAL: MONGODB_URI is not defined in environment variables.';
    console.error(`❌ ${msg}`);
    dbMetrics.lastError = msg;
    if (exitOnError) process.exit(1);
    throw new Error(msg);
  }

  if (uri.includes('YOUR_NEW_PASSWORD') || uri.includes('YOUR_PASSWORD')) {
    const msg = 'FATAL: Please replace the placeholder password in server/.env with your actual MongoDB Atlas password.';
    console.error(`❌ ${msg}`);
    dbMetrics.lastError = msg;
    if (exitOnError) process.exit(1);
    throw new Error(msg);
  }

  const options = getConnectionOptions();
  const maskedUri = maskMongoUri(uri);

  if (!isRetry) {
    console.log(
      `🔌 [DB] Connecting to MongoDB Atlas: ${maskedUri} [DB: ${options.dbName}, Pool: ${options.minPoolSize}-${options.maxPoolSize}, AutoIndex: ${options.autoIndex}]`
    );
  } else {
    console.log(
      `🔌 [DB] Reconnecting to MongoDB Atlas (attempt ${dbMetrics.reconnectAttempts}): ${maskedUri}`
    );
  }

  const startMs = performance.now();

  connectionPromise = mongoose
    .connect(uri, options)
    .then((conn) => {
      const elapsedMs = Math.round(performance.now() - startMs);
      if (dbMetrics.initialConnectDurationMs === null) {
        dbMetrics.initialConnectDurationMs = elapsedMs;
      }
      clearReconnectTimer();
      console.log(
        `✅ [DB] Connected to MongoDB Atlas in ${elapsedMs}ms [DB: ${conn.connection.name}]`
      );
      return conn;
    })
    .catch((error) => {
      const safeError = sanitizeErrorMessage(error?.message);
      dbMetrics.lastError = safeError;
      console.error(`❌ [DB] Could not connect to MongoDB Atlas: ${safeError}`);
      console.error(
        '⚠️ [DB] Verify your internet connection, MongoDB Atlas Network Access IP whitelist, and credentials in server/.env.'
      );

      if (exitOnError) {
        process.exit(1);
      }

      scheduleReconnect();
      return null;
    })
    .finally(() => {
      connectionPromise = null;
    });

  return connectionPromise;
};

/**
 * Cleanly closes the MongoDB connection and stops any pending reconnection timers.
 */
export const disconnectDB = async () => {
  isShuttingDown = true;
  clearReconnectTimer();

  try {
    if (connectionPromise) {
      await connectionPromise.catch(() => {});
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('🔌 [DB] Disconnected from MongoDB Atlas cleanly.');
    }
  } catch (err) {
    console.error('❌ [DB] Error disconnecting database:', sanitizeErrorMessage(err?.message));
  }
};
