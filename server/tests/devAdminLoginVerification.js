import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import User from '../src/models/User.js';
import { seedDevAdmin } from '../src/scripts/seedDevAdmin.js';
import { ROLES, ROLE_DEFAULT_PERMISSIONS } from '../src/config/constants.js';
import fs from 'fs';
import path from 'path';

async function runVerification() {
  console.log('===============================================================');
  console.log('🧪 PR VISION HRMS – DEVELOPMENT ADMIN LOGIN VERIFICATION');
  console.log('===============================================================');

  const results = {};

  try {
    // 1. Database Connection to MongoDB Atlas
    console.log('\n--- 1. MongoDB Atlas Database Connection ---');
    await connectDB({ exitOnError: true });
    const isConnected = mongoose.connection.readyState === 1;
    const dbName = mongoose.connection.name;
    results.dbConnection = isConnected && dbName === 'pr_vision_hrms';
    console.log(`Atlas Connected: ${results.dbConnection ? 'PASS' : 'FAIL'} [DB: ${dbName}]`);

    // 2. Development Admin Seed (Idempotency Test)
    console.log('\n--- 2. Development Admin Seed Idempotency ---');
    const seedResult1 = await seedDevAdmin({ disconnect: false });
    const adminUser = await User.findOne({ email: 'admin@prvision.com' });
    results.adminExists = !!adminUser && adminUser.role === ROLES.ADMIN && adminUser.isActive === true;
    results.adminName = adminUser?.name === 'PR VISION Admin';
    console.log(`Admin User Exists in Atlas: ${results.adminExists ? 'PASS' : 'FAIL'}`);
    console.log(`Admin User Name ("PR VISION Admin"): ${results.adminName ? 'PASS' : 'FAIL'}`);

    // Verify Password Hash (Never plaintext in DB)
    const isPlaintext = adminUser?.password === 'Password@123';
    const isBcrypt = adminUser?.password?.startsWith('$2');
    const passwordValid = await adminUser.comparePassword('Password@123');
    results.passwordHashed = !isPlaintext && isBcrypt;
    results.passwordAuthenticates = passwordValid;
    console.log(`Password Hashed (Bcrypt, not plaintext): ${results.passwordHashed ? 'PASS' : 'FAIL'}`);
    console.log(`Password Verification (Password@123): ${results.passwordAuthenticates ? 'PASS' : 'FAIL'}`);

    // Second seed execution must not overwrite or duplicate
    const seedResult2 = await seedDevAdmin({ disconnect: false });
    results.idempotent = seedResult2.created === false;
    console.log(`Seeding Idempotent (No duplication/overwrite): ${results.idempotent ? 'PASS' : 'FAIL'}`);

    // 3. Health Endpoint Check
    console.log('\n--- 3. Backend Health Endpoint (/api/health) ---');
    const healthRes = await fetch('http://localhost:5000/api/health');
    const healthData = await healthRes.json();
    results.healthCheck = healthRes.status === 200 && healthData.database === 'connected' && healthData.server === 'running';
    console.log(`Health API Status: ${healthRes.status} -> ${JSON.stringify(healthData)}`);
    console.log(`Health Check: ${results.healthCheck ? 'PASS' : 'FAIL'}`);

    // 4. Actual Backend API Login Test (with rememberMe: true)
    console.log('\n--- 4. Backend Login API (rememberMe: true) ---');
    const loginRes = await fetch('http://localhost:5000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@prvision.com',
        password: 'Password@123',
        rememberMe: true,
      }),
    });
    const loginData = await loginRes.json();
    const setCookieHeader = loginRes.headers.get('set-cookie') || '';
    results.loginApi = loginRes.status === 200 && loginData.success === true;
    results.hasTokens = !!loginData.data?.tokens?.accessToken && !!loginData.data?.tokens?.refreshToken;
    results.rememberMePersistent = setCookieHeader.includes('Max-Age=') || setCookieHeader.includes('Expires=');
    console.log(`Login API Status: ${loginRes.status} [Success: ${loginData.success}]`);
    console.log(`Tokens Issued: ${results.hasTokens ? 'PASS' : 'FAIL'}`);
    console.log(`Persistent Cookie (Max-Age 7d): ${results.rememberMePersistent ? 'PASS' : 'FAIL'}`);

    const accessToken = loginData.data?.tokens?.accessToken;
    const refreshToken = loginData.data?.tokens?.refreshToken;

    // 5. Authenticated Endpoint Access with Bearer Token
    console.log('\n--- 5. Authenticated API Access (/auth/me) ---');
    const meRes = await fetch('http://localhost:5000/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meData = await meRes.json();
    results.authMe = meRes.status === 200 && meData.data?.user?.email === 'admin@prvision.com';
    console.log(`Protected Route (/auth/me): ${results.authMe ? 'PASS' : 'FAIL'} [Email: ${meData.data?.user?.email}]`);

    // 6. Backend Login API (rememberMe: false -> Session Cookie)
    console.log('\n--- 6. Backend Login API (rememberMe: false) ---');
    const sessionLoginRes = await fetch('http://localhost:5000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@prvision.com',
        password: 'Password@123',
        rememberMe: false,
      }),
    });
    const sessionSetCookie = sessionLoginRes.headers.get('set-cookie') || '';
    results.sessionCookie = !sessionSetCookie.includes('Max-Age=');
    console.log(`Session Cookie (No Max-Age / Session scope): ${results.sessionCookie ? 'PASS' : 'FAIL'}`);

    // 7. Logout Invalidation
    console.log('\n--- 7. Logout Session Invalidation ---');
    const logoutRes = await fetch('http://localhost:5000/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const logoutData = await logoutRes.json();
    const refreshedAdmin = await User.findOne({ email: 'admin@prvision.com' });
    results.logoutInvalidates = logoutRes.status === 200 && refreshedAdmin.refreshToken === null;
    console.log(`Logout API Status: ${logoutRes.status}`);
    console.log(`Refresh Token Cleared in Atlas: ${results.logoutInvalidates ? 'PASS' : 'FAIL'} (refreshToken=${refreshedAdmin.refreshToken})`);

    // 8. Other HRMS Roles and Permissions Unchanged
    console.log('\n--- 8. Other HRMS Roles & Permissions Check ---');
    const rolesCount = await User.countDocuments({
      role: { $in: [ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.RECRUITER, ROLES.PAYROLL_ADMIN] },
    });
    results.rolesIntact = rolesCount >= 5;
    console.log(`Other Roles Count in Atlas: ${rolesCount} (${results.rolesIntact ? 'PASS' : 'FAIL'})`);

    // 9. Production Bundle Verification
    console.log('\n--- 9. Production Build Credentials Elimination ---');
    const distDir = path.resolve('../client/dist/assets');
    let foundCredential = false;
    if (fs.existsSync(distDir)) {
      const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(distDir, file), 'utf8');
        if (content.includes('Password@123')) {
          foundCredential = true;
          break;
        }
      }
    }
    results.productionSecure = !foundCredential;
    console.log(`Production Bundle Free of Dev Credentials: ${results.productionSecure ? 'PASS' : 'FAIL'}`);

    console.log('\n===============================================================');
    console.log('📊 FINAL SUMMARY:');
    console.log(JSON.stringify(results, null, 2));
    console.log('===============================================================');

    await disconnectDB();
    const allPassed = Object.values(results).every(v => v === true);
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('❌ Verification failed with error:', err);
    await disconnectDB();
    process.exit(1);
  }
}

runVerification();

