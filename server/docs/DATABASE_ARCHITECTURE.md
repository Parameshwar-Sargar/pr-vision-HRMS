# PR VISION HRMS — Database Architecture (`pr_vision_hrms`)

## 1. Overview

**PR VISION HRMS** uses **MongoDB Atlas** (`pr_vision_hrms`) with **Mongoose 8.x** as its Object Document Mapper (ODM). All database connectivity, connection pooling, readiness tracking, controlled index synchronization, and reconnection lifecycle management are centralized in [`server/src/config/db.js`](../src/config/db.js) and configured via Zod-validated environment variables in [`server/src/config/env.js`](../src/config/env.js).

Key architectural guarantees implemented in Phase 1:
- **Single Centralized Connection Module**: All database operations use the shared Mongoose connection initialized by `connectDB()` in `server/src/config/db.js`.
- **Exclusive Environment-Driven URI**: Reads `MONGODB_URI` exclusively from `server/.env`. Hardcoded credentials, silent `localhost` fallbacks, and runtime in-memory database fallbacks are strictly prohibited.
- **Database Readiness Gate Before HTTP Listener**: [`server/src/server.js`](../src/server.js) awaits `connectDB()` and verifies `isDatabaseReady() === true` **before** binding `app.listen(PORT)`, eliminating the startup `503 Service Unavailable` race window.
- **Controlled Index Synchronization**: Automatic index rebuilding (`autoIndex` / `autoCreate`) is disabled on ordinary startups (`SYNC_INDEXES=false` by default) so Mongoose does not issue ~95 index build checks across 30 models over the network on every server restart.
- **Pre-Warmed Connection Pool (`minPoolSize: 5`, `maxPoolSize: 20`)**: Eliminates mid-request TCP/TLS socket starvation when pages such as the Dashboard or Employee Directory execute 10+ concurrent MongoDB queries.

---

## 2. Environment Variables

All database settings are validated at startup in [`server/src/config/env.js`](../src/config/env.js):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MONGODB_URI` | *(Required)* | Full `mongodb+srv://` connection URI for the MongoDB Atlas cluster. Never commit credentials to version control. |
| `MONGODB_DB_NAME` | `pr_vision_hrms` | Target database name in MongoDB Atlas. |
| `DB_MIN_POOL_SIZE` | `5` | Minimum number of warm TCP/TLS sockets maintained in the Mongoose connection pool. |
| `DB_MAX_POOL_SIZE` | `20` | Maximum concurrent sockets allowed in the Mongoose connection pool. |
| `DB_SERVER_SELECTION_TIMEOUT_MS` | `25000` | Timeout (ms) for replica set server selection and SRV DNS lookup. |
| `DB_CONNECT_TIMEOUT_MS` | `25000` | Timeout (ms) for initial TCP/TLS socket connection. |
| `DB_SOCKET_TIMEOUT_MS` | `45000` | Timeout (ms) for active socket operations. |
| `DB_MAX_IDLE_TIME_MS` | `60000` | Maximum time (ms) an idle socket remains in the pool above `minPoolSize`. |
| `DB_RECONNECT_INTERVAL_MS` | `10000` | Base interval (ms) for bounded reconnection attempts after an unexpected disconnect. |
| `DB_MAX_RECONNECT_ATTEMPTS` | `12` | Maximum consecutive reconnection attempts before requiring manual intervention. |
| `SYNC_INDEXES` | `false` | When `true`, runs non-destructive `model.createIndexes()` across all 30 Mongoose models at startup. |

---

## 3. Connection Pool & Mongoose Global Settings

Configured in [`server/src/config/db.js`](../src/config/db.js):

```javascript
const shouldAutoIndex = env.NODE_ENV === 'test' || env.SYNC_INDEXES === true;
mongoose.set('bufferCommands', false);
mongoose.set('autoIndex', shouldAutoIndex);
mongoose.set('autoCreate', shouldAutoIndex);
```

- **`bufferCommands: false`**: Prevents Mongoose from silently queuing queries in memory when disconnected.
- **`minPoolSize: 5` / `maxPoolSize: 20`**: Ensures at least 5 warm TLS sockets are ready for multi-query endpoints (`GET /api/v1/dashboard/stats`, `GET /api/v1/employees`) without blocking on on-demand TLS handshakes.
- **Connection Deduplication**: `connectDB()` tracks an in-flight `connectionPromise` and checks `mongoose.connection.readyState === 1`. Calling `connectDB()` concurrently from multiple callers returns the exact same shared connection promise without opening duplicate connections.

---

## 4. Startup & Graceful Shutdown Sequence

### Startup Sequence ([`server/src/server.js`](../src/server.js))
1. **Validate Environment**: `env.js` parses and validates `server/.env` via Zod.
2. **Connect to MongoDB Atlas**: `startServer()` calls `await connectDB({ exitOnError: false })` and verifies `isDatabaseReady() === true`. If the database is unreachable, the server logs a sanitized diagnostic error and exits (`process.exit(1)`) rather than starting in a broken state.
3. **Optional Index Sync**: If `SYNC_INDEXES=true`, executes `await syncDatabaseIndexes()`.
4. **Idempotent Dev Admin Check**: In `development` mode (`DEV_ADMIN_SEED_ENABLED=true`), verifies that `admin@prvision.com` exists via a single read-only `.lean()` query without overwriting existing credentials or profile data.
5. **Bind HTTP Listener**: Starts `app.listen(env.PORT)` only after Steps 1–4 succeed.

### Graceful Shutdown Sequence
1. Listens once for `SIGINT`, `SIGTERM`, and process IPC `'SHUTDOWN'` messages (`shutdownHandlersRegistered` guard prevents duplicate handlers).
2. Marks database readiness as `false` (`isShuttingDown = true`) and stops any reconnection timer.
3. Closes the Express HTTP server (`serverInstance.close()`) so in-flight HTTP requests complete cleanly.
4. Closes the Mongoose connection (`await disconnectDB()`) and exits with code `0` (with a 10-second safety timeout).

---

## 5. Mongoose Models & Collections Summary

The application defines **30 Mongoose models** in `server/src/models/*.js` mapped to the `pr_vision_hrms` database:

- **Identity & Access**: `User` (`users`), `UserSession` (`usersessions`), `AuditLog` (`auditlogs`)
- **Organization & Master Data**: `CompanySettings` (`companysettings`), `Branch` (`branches`), `Department` (`departments`), `Designation` (`designations`), `Shift` (`shifts`), `Holiday` (`holidays`)
- **Core HR & Workforce**: `Employee` (`employees`), `Document` (`documents`), `Announcement` (`announcements`), `Notification` (`notifications`)
- **Time & Attendance**: `Attendance` (`attendances`), `LeaveType` (`leavetypes`), `LeaveBalance` (`leavebalances`), `LeaveRequest` (`leaverequests`)
- **Payroll & Compensation**: `SalaryStructure` (`salarystructures`), `SalaryRevision` (`salaryrevisions`), `PayrollRun` (`payrollruns`), `Payslip` (`payslips`)
- **Talent & Operations**: `JobOpening` (`jobopenings`), `Candidate` (`candidates`), `PerformanceReview` (`performancereviews`), `TrainingProgram` (`trainingprograms`), `TrainingAssignment` (`trainingassignments`), `ExpenseClaim` (`expenseclaims`), `Asset` (`assets`), `AssetAssignment` (`assetassignments`), `Grievance` (`grievances`)

