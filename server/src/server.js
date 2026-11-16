import app from './app.js';
import {
  connectDB,
  disconnectDB,
  isDatabaseReady,
  getDatabaseStatus,
  syncDatabaseIndexes,
} from './config/db.js';
import { env } from './config/env.js';
import { seedDevAdmin } from './scripts/seedDevAdmin.js';

let serverInstance = null;
let isStarting = false;
let isShuttingDown = false;
let shutdownHandlersRegistered = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 [SHUTDOWN] Received ${signal}. Gracefully shutting down PR VISION HRMS...`);

  const forceExitTimer = setTimeout(() => {
    console.error('❌ [SHUTDOWN] Forced exit after 10s graceful shutdown timeout.');
    process.exit(1);
  }, 10000);

  if (typeof forceExitTimer.unref === 'function') {
    forceExitTimer.unref();
  }

  try {
    if (serverInstance) {
      await new Promise((resolve) => {
        serverInstance.close((err) => {
          if (err) {
            console.error('⚠️ [SHUTDOWN] HTTP server close warning:', err.message);
          } else {
            console.log('✅ [SHUTDOWN] HTTP server closed cleanly.');
          }
          resolve();
        });
      });
      serverInstance = null;
    }

    await disconnectDB();
    clearTimeout(forceExitTimer);
    console.log('✅ [SHUTDOWN] Server and database connections closed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('❌ [SHUTDOWN] Error during graceful shutdown:', err.message);
    process.exit(1);
  }
};

const registerShutdownHandlers = () => {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.on('message', (msg) => {
    if (msg === 'SHUTDOWN' || msg === 'shutdown') {
      shutdown('SIGINT');
    }
  });
};

export const startServer = async () => {
  if (serverInstance || isStarting) {
    return serverInstance;
  }

  isStarting = true;
  registerShutdownHandlers();
  const startupStartMs = performance.now();

  try {
    // 1. Connect to MongoDB Atlas FIRST before accepting HTTP traffic
    const conn = await connectDB({ exitOnError: false });

    if (!conn || !isDatabaseReady()) {
      console.error(
        '❌ [STARTUP] Aborting server startup: Database connection is not ready. Refusing to start in a partially initialized state.'
      );
      process.exit(1);
    }

    // 2. Optional controlled index synchronization (only when SYNC_INDEXES=true)
    if (env.SYNC_INDEXES) {
      await syncDatabaseIndexes();
    }

    // 3. Idempotent development admin check (read-only verification if admin already exists)
    if (env.NODE_ENV === 'development' && env.DEV_ADMIN_SEED_ENABLED) {
      try {
        await seedDevAdmin({ disconnect: false });
      } catch (seedErr) {
        console.warn('⚠️ [STARTUP] Dev admin check warning:', seedErr.message);
      }
    }

    // 4. Start HTTP listener only after database readiness is confirmed
    serverInstance = await new Promise((resolve, reject) => {
      const srv = app.listen(env.PORT, () => resolve(srv));
      srv.once('error', reject);
    });

    const totalStartupMs = Math.round(performance.now() - startupStartMs);
    const dbStatus = getDatabaseStatus();

    console.log('========================================================');
    console.log(`🚀 PR VISION HRMS Server Ready`);
    console.log(`📍 URL: http://localhost:${env.PORT}`);
    console.log(`🌍 Environment: ${env.NODE_ENV}`);
    console.log(`🗄️  Database: ${dbStatus.databaseName} (${dbStatus.state})`);
    console.log(`⏱️  DB Connect: ${dbStatus.initialConnectDurationMs}ms | Total Startup: ${totalStartupMs}ms`);
    console.log(`🏢 Enterprise Edition: PR VISION INNOVATIONS`);
    console.log(`✨ Tagline: People. Process. Performance.`);
    console.log('========================================================');

    return serverInstance;
  } catch (error) {
    console.error('❌ [STARTUP] Fatal Server Startup Error:', error.message || error);
    await disconnectDB();
    process.exit(1);
  } finally {
    isStarting = false;
  }
};

startServer();
