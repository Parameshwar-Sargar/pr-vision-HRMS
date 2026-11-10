import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import { ROLES, ROLE_DEFAULT_PERMISSIONS } from '../config/constants.js';

/**
 * Idempotent Development Admin Seeder
 * Strictly runs only in development environment when explicitly enabled.
 * Uses environment variables for credentials.
 * Hashes passwords via Mongoose pre-save hook.
 * Never overwrites an existing admin password.
 */
export const seedDevAdmin = async ({ disconnect = false } = {}) => {
  // Guard: Only allow in development environment
  if (env.NODE_ENV !== 'development') {
    console.log('[DEV_ADMIN_SEED] Skipping: Not in development mode (NODE_ENV=' + env.NODE_ENV + ')');
    return { skipped: true, reason: 'NOT_DEVELOPMENT' };
  }

  // Guard: Must be explicitly enabled
  if (!env.DEV_ADMIN_SEED_ENABLED) {
    console.log('[DEV_ADMIN_SEED] Skipping: DEV_ADMIN_SEED_ENABLED is false');
    return { skipped: true, reason: 'DISABLED' };
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB({ exitOnError: false });
    }

    if (mongoose.connection.readyState !== 1) {
      console.warn('[DEV_ADMIN_SEED] Database not ready, skipping dev admin seeding.');
      return { skipped: true, reason: 'DB_DISCONNECTED' };
    }

    const adminEmail = (env.DEV_ADMIN_EMAIL || 'admin@prvision.com').toLowerCase().trim();
    const adminName = env.DEV_ADMIN_NAME || 'PR VISION Admin';
    const adminPassword = env.DEV_ADMIN_PASSWORD || 'Password@123';

    let user = await User.findOne({ email: adminEmail });

    if (user) {
      console.log(`[DEV_ADMIN_SEED] ✅ Admin account exists (${user.email}). Preserving existing password.`);
      // Sync name and active status without modifying the password hash
      let modified = false;
      if (user.name !== adminName) {
        user.name = adminName;
        modified = true;
      }
      if (!user.isActive) {
        user.isActive = true;
        modified = true;
      }
      if (user.role !== ROLES.ADMIN) {
        user.role = ROLES.ADMIN;
        user.permissions = ROLE_DEFAULT_PERMISSIONS.ADMIN;
        modified = true;
      }
      if (modified) {
        await user.save();
        console.log(`[DEV_ADMIN_SEED] Updated Admin profile attributes (name: "${user.name}", role: ${user.role}).`);
      }
      if (disconnect) await disconnectDB();
      return { created: false, user };
    }

    // Locate headquarters branch or fallback to first active branch
    let branch = await Branch.findOne({ isHeadquarters: true });
    if (!branch) {
      branch = await Branch.findOne({ isActive: true });
    }

    // Create development admin user
    user = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword, // Securely hashed by userSchema.pre('save')
      role: ROLES.ADMIN,
      permissions: ROLE_DEFAULT_PERMISSIONS.ADMIN,
      branchId: branch ? branch._id : null,
      isActive: true,
    });

    console.log(`[DEV_ADMIN_SEED] 🎉 Development Admin created successfully in MongoDB Atlas: ${user.email} (${user.role})`);

    if (disconnect) {
      await disconnectDB();
    }

    return { created: true, user };
  } catch (error) {
    console.error('[DEV_ADMIN_SEED] ❌ Error seeding development admin:', error.message);
    if (disconnect) {
      await disconnectDB();
    }
    throw error;
  }
};

// Allow direct CLI execution: node src/scripts/seedDevAdmin.js
if (process.argv[1]?.endsWith('seedDevAdmin.js')) {
  seedDevAdmin({ disconnect: true })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

