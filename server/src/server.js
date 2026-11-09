import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import User from './models/User.js';
import { seedDatabase } from './scripts/seed.js';
import { seedDevAdmin } from './scripts/seedDevAdmin.js';

const startServer = async () => {
  try {
    const server = app.listen(env.PORT, () => {
      console.log('========================================================');
      console.log(`🚀 PR VISION HRMS Server Running`);
      console.log(`📍 URL: http://localhost:${env.PORT}`);
      console.log(`🌍 Environment: ${env.NODE_ENV}`);
      console.log(`🏢 Enterprise Edition: PR VISION INNOVATIONS`);
      console.log(`✨ Tagline: People. Process. Performance.`);
      console.log('========================================================');
    });

    // Attempt persistent Atlas database connection
    try {
      const conn = await connectDB({ exitOnError: false });
      if (conn) {
        const count = await User.countDocuments();
        if (count === 0 && env.NODE_ENV !== 'production') {
          console.log('⚡ Empty database detected. Auto-seeding initial enterprise master records...');
          await seedDatabase({ disconnect: false });
        } else if (env.NODE_ENV === 'development' && env.DEV_ADMIN_SEED_ENABLED) {
          await seedDevAdmin({ disconnect: false });
        }
      }
    } catch (dbErr) {
      console.error('Database connection error:', dbErr.message);
    }

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down PR VISION HRMS...`);
      server.close(async () => {
        await disconnectDB();
        console.log('Server and database connections successfully closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Fatal Server Startup Error:', error);
    process.exit(1);
  }
};

startServer();
