# PR VISION HRMS — Database Operations & Runbook

## 1. Starting the Backend Server

Always start the backend from the `server/` directory (or via the root workspace scripts):

```bash
cd server
npm start
# or for development watch mode:
npm run dev
```

Expected startup log sequence:
```text
🔌 [DB] Connecting to MongoDB Atlas: mongodb+srv://***:***@pr-vision-hrms.kelhg3y.mongodb.net/pr_vision_hrms?retryWrites=true&w=majority&appName=PR-VISION-HRMS [DB: pr_vision_hrms, Pool: 5-20, AutoIndex: false]
✅ [DB] Connected to MongoDB Atlas in 2096ms [DB: pr_vision_hrms]
[DEV_ADMIN_SEED] ✅ Admin account verified (admin@prvision.com). Preserving existing account and password.
========================================================
🚀 PR VISION HRMS Server Ready
📍 URL: http://localhost:5000
🌍 Environment: development
🗄️  Database: pr_vision_hrms (connected)
⏱️  DB Connect: 2096ms | Total Startup: 2169ms
🏢 Enterprise Edition: PR VISION INNOVATIONS
✨ Tagline: People. Process. Performance.
========================================================
```

---

## 2. Controlled Index Synchronization Procedure

### Why `SYNC_INDEXES` Defaults to `false`
With 30 Mongoose models and ~95 index definitions, leaving Mongoose `autoIndex: true` enabled on every development restart caused ~95 `createIndex` network operations to fire against MongoDB Atlas during boot, inflating cold startup to `9.3s–15.7s` and first-request latency on `/api/v1/auth/me` to `10.4s`.

### How to Safely Synchronize Indexes
When you add or modify an index in `server/src/models/*.js`, synchronize indexes explicitly using either method below:

1. **One-Off CLI Command (Recommended)**:
   ```bash
   cd server
   npm run db:sync-indexes
   ```
2. **Startup Flag**:
   Set `SYNC_INDEXES=true` for a single startup run:
   ```bash
   cd server
   SYNC_INDEXES=true npm start
   ```

**Safety Guarantee**: `syncDatabaseIndexes()` in `server/src/config/db.js` calls `model.createIndexes()` on each registered model. It **only creates missing indexes** and **never drops existing indexes** in MongoDB Atlas.

---

## 3. Health, Liveness & Readiness Endpoints

The backend exposes three health endpoints that never leak credentials, connection strings, or internal shard hostnames:

1. **Comprehensive Health Check (`GET /api/health` and `GET /api/v1/health`)**:
   - Returns `200 OK` when connected to MongoDB Atlas, or `503 Service Unavailable` when disconnected.
   - Sample response:
     ```json
     {
       "success": true,
       "status": "healthy",
       "live": true,
       "ready": true,
       "server": "running",
       "environment": "development",
       "uptime": 42,
       "timestamp": "2026-11-11T13:42:38.537Z",
       "database": "connected",
       "databaseName": "pr_vision_hrms",
       "databaseState": {
         "ready": true,
         "state": "connected",
         "readyState": 1,
         "initialConnectDurationMs": 2096,
         "lastConnectedAt": "2026-11-11T13:42:38.443Z",
         "lastDisconnectedAt": null,
         "reconnectAttempts": 0,
         "syncIndexesEnabled": false
       }
     }
     ```
2. **Liveness Probe (`GET /api/health/live`)**:
   - Returns `200 OK` (`{ "success": true, "status": "alive", "live": true, ... }`) whenever the Node.js process and HTTP server are responsive.
3. **Readiness Probe (`GET /api/health/ready`)**:
   - Returns `200 OK` when `isDatabaseReady() === true`, or `503 Service Unavailable` if the database connection is down or shutting down.

---

## 4. Reconnection & Troubleshooting

- **Automatic Reconnection**: If the connection to MongoDB Atlas drops after startup, `db.js` logs `⚠️ [DB] MongoDB Atlas connection disconnected.` and schedules a single bounded reconnection loop (`scheduleReconnect()`) using the full validated pool and timeout options (`getConnectionOptions()`).
- **Backoff Policy**: Starts at `DB_RECONNECT_INTERVAL_MS` (`10s`) and scales up to a maximum delay of `60s` for up to `DB_MAX_RECONNECT_ATTEMPTS` (`12`) attempts.
- **Common Connection Failures**:
  - **`Could not connect to MongoDB Atlas` / Timeout**: Ensure your current public IP address is whitelisted in **MongoDB Atlas -> Network Access** and that outbound port `27017` is not blocked by a firewall.
  - **`Authentication failed`**: Verify the database user password in `server/.env` (`MONGODB_URI`).
  - **`EADDRINUSE: address already in use :::5000`**: Another process is already listening on port `5000`. Stop the existing process before starting a new instance.

