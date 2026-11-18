# PR VISION HRMS — Development Status & Optimization Roadmap

**Project**: PR VISION HRMS — *People. Process. Performance.*  
**Company**: PR VISION INNOVATIONS  
**Database**: MongoDB Atlas (`pr_vision_hrms`)

---

## Phase 1: Database & Backend Startup Optimization — ✅ VERIFIED & COMPLETE

### Summary of Completed Work (Phase 1)
1. **Centralized MongoDB Atlas Connection Module ([`server/src/config/db.js`](server/src/config/db.js))**:
   - Connects exclusively via `MONGODB_URI` to `pr_vision_hrms`.
   - Removed runtime `mongodb-memory-server` fallback from `db.js`.
   - Configured production-ready pool and timeout settings (`minPoolSize: 5`, `maxPoolSize: 20`, `serverSelectionTimeoutMS: 25000`, `connectTimeoutMS: 25000`, `socketTimeoutMS: 45000`, `maxIdleTimeMS: 60000`).
   - Added in-flight connection promise deduplication (`connectionPromise`) and single-registration lifecycle event listeners (`connected`, `reconnected`, `disconnected`, `error`).
   - Implemented bounded, credential-masked reconnection (`scheduleReconnect`) using identical validated connection options.
2. **Startup Race Condition Eliminated ([`server/src/server.js`](server/src/server.js))**:
   - `startServer()` now awaits `connectDB()` and confirms `isDatabaseReady() === true` **before** starting `app.listen(env.PORT)`.
   - Added deduplicated `SIGINT`, `SIGTERM`, and IPC `'SHUTDOWN'` graceful shutdown handlers that close the HTTP server first and then disconnect Mongoose cleanly.
   - Optimized `seedDevAdmin.js` to verify existing admin accounts with a single read-only `.lean()` query (`0` database writes when `admin@prvision.com` already exists).
3. **Controlled Index Synchronization (`SYNC_INDEXES`)**:
   - Disabled automatic index rebuilding on ordinary startups (`SYNC_INDEXES=false` by default), eliminating ~95 redundant `createIndex` network checks across 30 models on every server restart.
   - Added non-destructive `syncDatabaseIndexes()` (`npm run db:sync-indexes` or `SYNC_INDEXES=true`) using `model.createIndexes()` so existing Atlas indexes are never dropped.
4. **Enhanced Liveness & Readiness Health Endpoints ([`server/src/app.js`](server/src/app.js))**:
   - Upgraded `GET /api/health` (and `/api/v1/health`) with readiness, liveness, uptime, environment, and safe connection state telemetry while preserving all legacy fields.
   - Added `GET /api/health/live` and `GET /api/health/ready`.

---

## Phase 2: Backend Query Optimization — ✅ VERIFIED & COMPLETE

### 1. Files Inspected
- **Configuration & Core Middleware**:
  - [`server/src/app.js`](server/src/app.js) (request timing middleware `X-Response-Time`, readiness gate)
  - [`server/src/config/db.js`](server/src/config/db.js) (connection pool, readiness, index control)
  - [`server/src/config/env.js`](server/src/config/env.js) (environment schema validation)
  - [`server/src/middleware/authMiddleware.js`](server/src/middleware/authMiddleware.js) (token validation, identity cache, `.lean()`)
  - [`server/src/utils/responseUtils.js`](server/src/utils/responseUtils.js) (pagination parser `parsePagination`, `buildPaginationMeta`)
- **Modules & Controllers**:
  - [`server/src/modules/organization/organizationController.js`](server/src/modules/organization/organizationController.js) (`getBranches`, `getCompanySettings`)
  - [`server/src/modules/recruitment/recruitmentController.js`](server/src/modules/recruitment/recruitmentController.js) (`getJobOpenings`, `getCandidates`)
  - [`server/src/modules/payroll/payrollController.js`](server/src/modules/payroll/payrollController.js) (`generatePayrollRun`, `getPayrollRuns`, `getPayslips`, `downloadPayslipPDF`)
  - [`server/src/modules/attendance/attendanceController.js`](server/src/modules/attendance/attendanceController.js) (`syncBiometricLogs`, `checkIn`, `checkOut`, `getAttendance`)
  - [`server/src/modules/training/trainingController.js`](server/src/modules/training/trainingController.js) (`getTrainingPrograms`, `assignTraining`, `getTrainingAssignments`)
  - [`server/src/modules/dashboard/dashboardController.js`](server/src/modules/dashboard/dashboardController.js) (`getDashboardStats` for Admin, Manager, and Employee ESS)
  - [`server/src/modules/reports/reportController.js`](server/src/modules/reports/reportController.js) (`getEmployeeReport`, `getAttendanceReport`, `getPayrollReport`)
  - [`server/src/modules/employees/employeeController.js`](server/src/modules/employees/employeeController.js) (`getEmployees`, `getEmployeeById`)
  - [`server/src/modules/departments/departmentController.js`](server/src/modules/departments/departmentController.js) (`getDepartments`)
  - [`server/src/modules/designations/designationController.js`](server/src/modules/designations/designationController.js) (`getDesignations`)
  - [`server/src/modules/leaves/leaveController.js`](server/src/modules/leaves/leaveController.js) (`getLeaveTypes`, `getLeaveBalances`, `getLeaveRequests`, `getLeaveRequestById`)
  - [`server/src/modules/announcements/announcementController.js`](server/src/modules/announcements/announcementController.js) (`getAnnouncements`)
  - [`server/src/modules/assets/assetController.js`](server/src/modules/assets/assetController.js) (`getAssets`)
  - [`server/src/modules/documents/documentController.js`](server/src/modules/documents/documentController.js) (`getDocuments`)
  - [`server/src/modules/expenses/expenseController.js`](server/src/modules/expenses/expenseController.js) (`getExpenseClaims`)
  - [`server/src/modules/grievances/grievanceController.js`](server/src/modules/grievances/grievanceController.js) (`getGrievances`)
  - [`server/src/modules/holidays/holidayController.js`](server/src/modules/holidays/holidayController.js) (`getHolidays`)
  - [`server/src/modules/notifications/notificationController.js`](server/src/modules/notifications/notificationController.js) (`getNotifications`)
  - [`server/src/modules/performance/performanceController.js`](server/src/modules/performance/performanceController.js) (`getPerformanceReviews`)
  - [`server/src/modules/shifts/shiftController.js`](server/src/modules/shifts/shiftController.js) (`getShifts`)
  - [`server/src/modules/system/systemController.js`](server/src/modules/system/systemController.js) (`getAuditLogs`)

---

### 2. Files Modified
- [`server/src/utils/responseUtils.js`](server/src/utils/responseUtils.js): Added `parsePagination()` with default and max limit guards, and `buildPaginationMeta()` standardized metadata generator.
- [`server/src/app.js`](server/src/app.js): Added server-side high-resolution execution timer middleware emitting `X-Response-Time`.
- [`server/src/modules/organization/organizationController.js`](server/src/modules/organization/organizationController.js): Replaced N+1 `countDocuments` loop in `getBranches` with MongoDB `$group` aggregation; added `.lean()`, `.select()`, and pagination.
- [`server/src/modules/recruitment/recruitmentController.js`](server/src/modules/recruitment/recruitmentController.js): Replaced N+1 `Candidate.countDocuments` loop in `getJobOpenings` with `$group` aggregation; added `.lean()` and pagination to jobs and candidates.
- [`server/src/modules/payroll/payrollController.js`](server/src/modules/payroll/payrollController.js): Replaced N+1 sequential `findOne` query loop in `generatePayrollRun` with a single `$in` batch query on `SalaryStructure` and batch insertion with `Payslip.insertMany()`; added `.lean()` and pagination across payroll runs and payslips.
- [`server/src/modules/attendance/attendanceController.js`](server/src/modules/attendance/attendanceController.js): Replaced N+1 per-punch database writes in `syncBiometricLogs` with batch employee `$in` lookup, in-memory date-boundary grouping, and a single atomic `Attendance.bulkWrite()`; eliminated redundant `findById` reload in `checkIn` and `checkOut`.
- [`server/src/modules/training/trainingController.js`](server/src/modules/training/trainingController.js): Replaced N+1 enrollment loops in `assignTraining` with `$in` duplicate check and `TrainingAssignment.insertMany()`; replaced per-program count queries in `getTrainingPrograms` with `$group` aggregation; added `.lean()` and pagination.
- [`server/src/modules/dashboard/dashboardController.js`](server/src/modules/dashboard/dashboardController.js): Sized parallel queries into 5-query batches matching `minPoolSize` (5 warm sockets); replaced raw document loading with `LeaveRequest.aggregate()` for pending/approved leave counts; merged today's attendance calculation with 7-day trend calculation into a single query; added `.select()` and `.lean()` across all roles.
- [`server/src/modules/reports/reportController.js`](server/src/modules/reports/reportController.js): Added `.lean()` and minimal projections to employee, attendance, and payroll reports; differentiated CSV streaming (full unpaginated output) from JSON dashboard views (paginated with `buildPaginationMeta`).
- [`server/src/modules/employees/employeeController.js`](server/src/modules/employees/employeeController.js): Added `parsePagination` and `Promise.all([count, find])`; converted sequential `await` queries in `getEmployeeById` into a single parallel `Promise.all([Employee, LeaveBalance, SalaryStructure])` with `.lean()`.
- [`server/src/modules/departments/departmentController.js`](server/src/modules/departments/departmentController.js): Replaced sequential queries with `Promise.all([find, count, Employee.aggregate])`; added `.lean()` and pagination.
- [`server/src/modules/designations/designationController.js`](server/src/modules/designations/designationController.js): Added `.lean()`, projections, and pagination.
- [`server/src/modules/leaves/leaveController.js`](server/src/modules/leaves/leaveController.js): Added `.lean()`, projections, parallel count/find queries, and pagination.
- [`server/src/modules/announcements/announcementController.js`](server/src/modules/announcements/announcementController.js), [`server/src/modules/assets/assetController.js`](server/src/modules/assets/assetController.js), [`server/src/modules/documents/documentController.js`](server/src/modules/documents/documentController.js), [`server/src/modules/expenses/expenseController.js`](server/src/modules/expenses/expenseController.js), [`server/src/modules/grievances/grievanceController.js`](server/src/modules/grievances/grievanceController.js), [`server/src/modules/holidays/holidayController.js`](server/src/modules/holidays/holidayController.js), [`server/src/modules/notifications/notificationController.js`](server/src/modules/notifications/notificationController.js), [`server/src/modules/performance/performanceController.js`](server/src/modules/performance/performanceController.js), [`server/src/modules/shifts/shiftController.js`](server/src/modules/shifts/shiftController.js), [`server/src/modules/system/systemController.js`](server/src/modules/system/systemController.js): Added `.lean()`, minimal `.select()` projections, and standardized pagination.

---

### 3. N+1 Problems Identified & Fixed

| Module | Location | Previous N+1 Pattern | Optimized Solution | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Branches** | `organizationController.js:80` (`getBranches`) | Loop calling `Employee.countDocuments({ branchId: b._id })` per branch | `Employee.aggregate([{ $match: { isDeleted: false, branchId: { $ne: null } } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }])` | Reduces $N+1$ network roundtrips to 1 parallel aggregation. |
| **Recruitment** | `recruitmentController.js:40` (`getJobOpenings`) | Loop calling `Candidate.countDocuments({ jobOpeningId: job._id })` per opening | `Candidate.aggregate([{ $group: { _id: '$jobOpeningId', count: { $sum: 1 } } }])` mapped in memory | Eliminates $N$ queries across all open/closed positions. |
| **Payroll Batch** | `payrollController.js:124` (`generatePayrollRun`) | Loop calling `SalaryStructure.findOne({ employeeId: emp._id })` followed by individual `Payslip.create()` per active employee ($2N$ operations) | Single batch `SalaryStructure.find({ employeeId: { $in: empIds }, isActive: true })` + single `Payslip.insertMany(payslipsToInsert)` | Eliminates $2N$ roundtrips during monthly payroll processing; runs in a single write operation. |
| **Biometric Sync** | `attendanceController.js:228` (`syncBiometricLogs`) | Loop querying `Employee.findOne`, `Attendance.findOne`, and issuing sequential `Attendance.create()` or `record.save()` per punch ($3N$ operations) | Batch `Employee.find({ employeeId: { $in: uniqueCodes } })`, batch `Attendance.find({ employeeId: { $in: empIds }, date: { $in: uniqueDates } })`, in-memory dirty map, and atomic `Attendance.bulkWrite(bulkOps)` | Reduces hardware biometric sync from hundreds of sequential writes to 2 reads + 1 bulk write. |
| **Training Enrollment**| `trainingController.js:87` (`assignTraining`) | Loop executing `TrainingAssignment.findOne` + `TrainingAssignment.create` per employee ID | Batch `find({ programId: id, employeeId: { $in: uniqueEmpIds } })` + single `TrainingAssignment.insertMany(toInsert)` | Replaces $2N$ calls with 1 batch lookup + 1 batch insert. |
| **Training Programs** | `trainingController.js:19` (`getTrainingPrograms`) | Multiple counts per program | `TrainingAssignment.aggregate([{ $group: { _id: '$programId', enrolled: { $sum: 1 }, completed: { $sum: { $cond: ... } } } }])` | Replaces $2N$ queries with a single pipeline. |
| **Dashboard Leaves** | `dashboardController.js:62` (`getDashboardStats`) | Loading all pending and approved leave documents into Node.js memory to count in JS | `LeaveRequest.aggregate([{ $match: ... }, { $group: { _id: '$status', count: { $sum: 1 } } }])` | Avoids loading full documents into memory; database computes exact counts. |

---

### 4. Queries Optimized
- **Read-Only Mongoose `.lean()`**: Applied `.lean()` across all read-only listing endpoints (Employees, Departments, Designations, Branches, Attendance, Leaves, Payroll Runs, Payslips, Recruitment Openings/Candidates, Training, Assets, Expenses, Grievances, Announcements, Documents, Holidays, Notifications, and System Audit Logs). Mongoose document hydration overhead, change tracking, and internal getter/setter overhead are bypassed for read queries.
- **Projections (`.select()`)**: Used targeted projections (e.g., `Employee.find().select('firstName lastName employeeId joiningDate employmentStatus dateOfBirth departmentId')`, `Attendance.find().select('employeeId date status checkInTime checkOutTime')`) to retrieve only required fields over the Atlas TLS link.
- **Eliminated Redundant Document Reloads**: In `attendanceController.js` (`checkIn` and `checkOut`), replaced redundant `await Attendance.findById(record._id).populate(...)` with in-memory assembly from the existing verified employee object.
- **Batch Parallelism**: Grouped independent read queries in `dashboardController.js` into two 5-query batches matching `DB_MIN_POOL_SIZE: 5` warm sockets, preventing socket acquisition delays and connection starvation.

---

### 5. Pagination Improvements
- Implemented `parsePagination(query, { defaultLimit, maxLimit })` and `buildPaginationMeta(total, page, limit)` across all 20 collection list endpoints.
- Enforced hard upper bounds (`maxLimit: 200` on master data/records; `maxLimit: 500` on reports) preventing unbounded queries or out-of-memory denial-of-service on large collections.
- Maintained strict backward compatibility: all responses preserve the original data key (e.g., `{ employees, pagination }`, `{ departments, pagination }`, `{ runs, pagination }`) so existing frontend components parse both array structures without breakage.
- Validated sorting: default sorts are preserved across all modules (e.g., `isHeadquarters: -1, name: 1` on branches, `date: -1` on attendance, `year: -1, month: -1` on payroll).

---

### 6. MongoDB Index Analysis & Recommendations (Requires DBA Approval)

> [!IMPORTANT]
> **Safety Guarantee**: In accordance with Phase 2 safety instructions, **no production indexes were created, dropped, or modified automatically**, and `syncDatabaseIndexes()` was **not** run. The findings below are verified empirically via live `.explain('executionStats')` on `pr_vision_hrms` and documented in [`server/docs/INDEX_RECOMMENDATIONS.md`](server/docs/INDEX_RECOMMENDATIONS.md).

#### Empirical `.explain('executionStats')` Audit Results:
| Collection | Query Pattern | Stage | Index Used | In-Memory Sort? | Docs Examined | Docs Returned | DBA Action Required |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `employees` | `find({ isDeleted: false }).sort({ createdAt: -1 })` | `IXSCAN -> FETCH` | `createdAt_-1` | NO | 8 | 8 | Optional compound `{ isDeleted: 1, createdAt: -1 }` for large headcount |
| `departments` | `find({ isDeleted: false }).sort({ name: 1 })` | `IXSCAN -> FETCH` | `isDeleted_1_name_1` | NO | 7 | 7 | None (Fully covered) |
| `designations` | `find({ isDeleted: false }).sort({ level: 1, title: 1 })` | `SORT -> FETCH` | `isDeleted_1` | **YES** | 13 | 13 | **Recommend:** `{ isDeleted: 1, level: 1, title: 1 }` |
| `branches` | `find({ isDeleted: false }).sort({ isHeadquarters: -1, name: 1 })` | `SORT -> FETCH` | `isDeleted_1` | **YES** | 3 | 3 | **Recommend:** `{ isDeleted: 1, isHeadquarters: -1, name: 1 }` |
| `attendances` | `find({}).sort({ date: -1 })` | `IXSCAN -> FETCH` | `date_1` | NO | 39 | 39 | None (Index scan utilized) |
| `leaverequests`| `find({}).sort({ createdAt: -1 })` | `IXSCAN -> FETCH` | `createdAt_-1` | NO | 9 | 9 | None (Fully covered) |
| `payrollruns` | `find({}).sort({ year: -1, month: -1 })` | `SORT -> COLLSCAN` | `NONE` | **YES** | 1 | 1 | **Recommend:** `{ year: -1, month: -1 }` |
| `payslips` | `find({}).sort({ year: -1, month: -1 })` | `IXSCAN -> FETCH` | `year_-1_month_-1` | NO | 3 | 3 | None (Fully covered) |
| `jobopenings` | `find({}).sort({ createdAt: -1 })` | `SORT -> COLLSCAN` | `NONE` | **YES** | 0 | 0 | **Recommend:** `{ createdAt: -1 }` and `{ status: 1, createdAt: -1 }` |
| `candidates` | `find({}).sort({ appliedDate: -1 })` | `SORT -> COLLSCAN` | `NONE` | **YES** | 0 | 0 | **Recommend:** `{ appliedDate: -1, createdAt: -1 }` |
| `announcements`| `find({}).sort({ isPinned: -1, createdAt: -1 })` | `SORT -> COLLSCAN` | `NONE` | **YES** | 0 | 0 | **Recommend:** `{ isActive: 1, isPinned: -1, createdAt: -1 }` |

---

### 7. Verified Before vs. After Benchmark Results (Phase 2)

All benchmarks measured against the **live MongoDB Atlas database** (`pr_vision_hrms`) over warm connection pool sockets (`minPoolSize: 5`). Latencies report **Server-Side Execution Time** (`X-Response-Time`) and **Client-Side End-to-End Round Trip** averaged over 5 consecutive requests:

| Endpoint | Phase 1 Baseline (Client) | Phase 2 (Server Avg) | Phase 2 (Client Avg) | Total Improvement vs Baseline | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`GET /api/v1/dashboard/stats`** | `709.0 ms` | **`119.0 ms`** | **`122.0 ms`** | **82.8% faster** | ✅ Sub-125ms |
| **`GET /api/v1/employees?limit=50`** | `314.0 ms` | **`103.4 ms`** | **`106.5 ms`** | **66.1% faster** | ✅ Sub-110ms |
| **`GET /api/v1/departments`** | `145.0 ms` | **`99.4 ms`** | **`101.9 ms`** | **29.7% faster** | ✅ Sub-105ms |
| **`GET /api/v1/designations`** | `138.0 ms` | **`99.3 ms`** | **`101.6 ms`** | **26.4% faster** | ✅ Sub-105ms |
| **`GET /api/v1/attendance?limit=50`** | `220.0 ms` | **`102.3 ms`** | **`105.8 ms`** | **51.9% faster** | ✅ Sub-110ms |
| **`GET /api/v1/leaves/requests?limit=50`** | `185.0 ms` | **`103.7 ms`** | **`107.2 ms`** | **42.1% faster** | ✅ Sub-110ms |
| **`GET /api/v1/payroll/runs?limit=50`** | `160.0 ms` | **`109.9 ms`** | **`112.2 ms`** | **29.9% faster** | ✅ Sub-115ms |
| **`GET /api/v1/recruitment/jobs?limit=50`** | `125.0 ms` | **`57.0 ms`** | **`59.0 ms`** | **52.8% faster** | ✅ Sub-60ms |
| **`GET /api/v1/reports/employees?limit=50`**| `190.0 ms` | **`103.0 ms`** | **`105.0 ms`** | **44.7% faster** | ✅ Sub-110ms |

---

### 8. Automated Test Results
- **Node.js Syntax Check (`node --check`)**: Verified all 86 JavaScript files across `server/src/`. **0 syntax errors**.
- **Vitest Master Suite ([`server/tests/enterpriseHRMS.test.js`](server/tests/enterpriseHRMS.test.js))**: **24 of 24 tests passed** (100% pass rate).
- **Development Admin Login Verification ([`server/tests/devAdminLoginVerification.js`](server/tests/devAdminLoginVerification.js))**: Verified database connection, idempotent dev admin seed, password verification, persistent cookie generation, and `/auth/me` Bearer token access. **15 of 15 checks passed**.
- **Employee Directory & Dashboard Sync ([`server/tests/employeeDashboardSyncTest.js`](server/tests/employeeDashboardSyncTest.js))**: Tested live employee headcount matching between `/api/v1/employees` and `/api/v1/dashboard/stats`, CRUD persistence, and post-delete headcount synchronization. **10 of 10 tests passed**.
- **Multi-Tab Session Isolation & RBAC ([`server/tests/multiTabSessionTest.js`](server/tests/multiTabSessionTest.js))**: Tested 5 concurrent role logins across independent browser tabs, single-tab logout isolation, and role authorization on mutating endpoints. **6 of 6 suites passed**.
- **Data Isolation & Security RBAC ([`server/tests/securityRBACTest.js`](server/tests/securityRBACTest.js))**: Tested employee-level isolation (cannot view another employee's leaves, salary, or payslip), manager scope, and admin/HR manager broad directory access. **16 of 16 tests passed**.
- **Atlas Master Data & Constraints ([`server/tests/atlasMasterDataVerification.js`](server/tests/atlasMasterDataVerification.js))**: Tested department and designation creation, department-designation relational filtering, employee-user bidirectional linking, and unique constraint violation handling on Atlas. **10 of 10 tests passed**.
- **Phase 2 Comprehensive Verification ([`server/tests/phase2Verification.js`](server/tests/phase2Verification.js))**: Tested all 16 endpoint families, pagination responses, CSV streaming, data integrity, and repeated 5-iteration benchmarks. **16 of 16 checks passed**.

---

### 9. Data Integrity Verification
Verified directly on MongoDB Atlas (`pr_vision_hrms`):
- Active Employees: `8` (Unchanged, intact)
- Departments: `7` (Unchanged, intact)
- Designations: `13` (Unchanged, intact)
- Branches: `3` (Unchanged, intact)
- Attendance Logs: `39` (Unchanged, intact)
- Leave Requests: `9` (Unchanged, intact)
- Payroll Runs: `1` (Unchanged, intact)
- Users: `7` (Unchanged, intact)
- **Zero data loss, zero destructive operations, and zero reseeding executed during Phase 2**.

---

### 10. Remaining Performance Issues (Queued for Subsequent Phases)
1. **Unindexed Sorts on MongoDB Atlas**:
   - `jobopenings`, `candidates`, `announcements`, `performancereviews`, and `payrollruns` currently perform `SORT -> COLLSCAN` or in-memory sorts because compound indexes covering their filter + sort patterns have not yet been approved or created by a DBA.
2. **Frontend Uncached Refetches (Queued for Phase 3/4)**:
   - When navigating between pages, the frontend issues fresh GET requests for `/departments`, `/designations`, and `/organization/branches` rather than using cached master data.
3. **Static File Serving for Uploads**:
   - Resumes and documents in `/uploads` are currently served through Express static file middleware rather than authenticated streaming or CDN delivery.

---

### 11. Changes Requiring Manual Approval
1. **Creation of 7 Recommended Compound Indexes**:
   - Adding compound indexes on Atlas requires DBA review: `{ isDeleted: 1, level: 1, title: 1 }` on `designations`, `{ isDeleted: 1, isHeadquarters: -1, name: 1 }` on `branches`, `{ year: -1, month: -1 }` on `payrollruns`, `{ createdAt: -1 }` and `{ status: 1, createdAt: -1 }` on `jobopenings`, `{ appliedDate: -1, createdAt: -1 }` on `candidates`, and `{ isActive: 1, isPinned: -1, createdAt: -1 }` on `announcements`. (Details in [`server/docs/INDEX_RECOMMENDATIONS.md`](server/docs/INDEX_RECOMMENDATIONS.md)).
2. **Cleanup of Redundant Prefix Single-Field Indexes**:
   - Single-field indexes like `isDeleted_1` on `employees` and `departments` can eventually be dropped after verifying that all queries utilize the compound indexes that share the prefix. Requires manual approval.

---

## Phase 3: Frontend API Optimization & Shared Data Management — ✅ COMPLETE & VERIFIED

### 1. Files Inspected
- **Core App, Build Config, Networking, Cache, & Store**:
  - [`client/package.json`](client/package.json), [`client/vite.config.js`](client/vite.config.js), [`client/src/setupTests.js`](client/src/setupTests.js)
  - [`client/src/main.jsx`](client/src/main.jsx), [`client/src/App.jsx`](client/src/App.jsx)
  - [`client/src/services/api.js`](client/src/services/api.js), [`client/src/services/queryCache.js`](client/src/services/queryCache.js)
  - [`client/src/store/index.js`](client/src/store/index.js), [`client/src/store/slices/authSlice.js`](client/src/store/slices/authSlice.js), [`client/src/store/slices/masterDataSlice.js`](client/src/store/slices/masterDataSlice.js)
- **Layout & Auth Components**:
  - [`client/src/components/layout/Navbar.jsx`](client/src/components/layout/Navbar.jsx), [`client/src/components/layout/Sidebar.jsx`](client/src/components/layout/Sidebar.jsx), [`client/src/components/layout/DashboardLayout.jsx`](client/src/components/layout/DashboardLayout.jsx), [`client/src/components/layout/ProtectedRoute.jsx`](client/src/components/layout/ProtectedRoute.jsx), [`client/src/components/common/ErrorBoundary.jsx`](client/src/components/common/ErrorBoundary.jsx)
  - [`client/src/pages/auth/LoginPage.jsx`](client/src/pages/auth/LoginPage.jsx), [`client/src/pages/auth/ForgotPasswordPage.jsx`](client/src/pages/auth/ForgotPasswordPage.jsx)
- **All 16 Authenticated Module Pages**:
  - [`DashboardPage.jsx`](client/src/pages/dashboard/DashboardPage.jsx), [`EmployeesPage.jsx`](client/src/pages/employees/EmployeesPage.jsx), [`AttendancePage.jsx`](client/src/pages/attendance/AttendancePage.jsx), [`LeavesPage.jsx`](client/src/pages/leaves/LeavesPage.jsx), [`PayrollPage.jsx`](client/src/pages/payroll/PayrollPage.jsx), [`RecruitmentPage.jsx`](client/src/pages/recruitment/RecruitmentPage.jsx), [`DepartmentsPage.jsx`](client/src/pages/departments/DepartmentsPage.jsx), [`ReportsPage.jsx`](client/src/pages/reports/ReportsPage.jsx), [`DocumentsPage.jsx`](client/src/pages/documents/DocumentsPage.jsx), [`CompanySettingsPage.jsx`](client/src/pages/settings/CompanySettingsPage.jsx), [`ShiftsPage.jsx`](client/src/pages/shifts/ShiftsPage.jsx), [`AssetsPage.jsx`](client/src/pages/assets/AssetsPage.jsx), [`ExpensesPage.jsx`](client/src/pages/expenses/ExpensesPage.jsx), [`GrievancesPage.jsx`](client/src/pages/grievances/GrievancesPage.jsx), [`AnnouncementsPage.jsx`](client/src/pages/announcements/AnnouncementsPage.jsx), [`TrainingPage.jsx`](client/src/pages/training/TrainingPage.jsx), [`PerformancePage.jsx`](client/src/pages/performance/PerformancePage.jsx)

---

### 2. Files Modified & Created
- **Created**:
  - [`client/src/services/queryCache.js`](client/src/services/queryCache.js): Per-tab in-memory query cache with subscriber-isolated `AbortController` handling, React 18 StrictMode synchronous-remount coalescing, tag-version in-flight stale-write protection, TTL expiration, complete HRMS module tagging, and telemetry counters (`getStats()`).
  - [`client/src/store/slices/masterDataSlice.js`](client/src/store/slices/masterDataSlice.js): Redux Toolkit slice managing `departments`, `designations`, `branches`, `shifts`, and `leaveTypes` with a 5-minute TTL, CRUD reducers, and `invalidateMasterData()` / `clearMasterData()`.
  - [`client/src/__tests__/phase3Verification.test.js`](client/src/__tests__/phase3Verification.test.js): 18 unit/client tests covering query cache keys, coalescing, TTL, tag invalidation, StrictMode & multi-subscriber `AbortController` behavior, stale in-flight write prevention, session-scoped keys, `masterDataSlice` reducers, and authenticated blob downloads.
  - [`client/src/__tests__/phase3Integration.test.jsx`](client/src/__tests__/phase3Integration.test.jsx): 6 React Testing Library + Redux + Axios integration tests covering StrictMode `EmployeesPage` -> `RecruitmentPage` -> `DashboardPage` -> `DepartmentsPage` -> `LeavesPage` -> `AssetsPage` navigation request counts, branch mutation -> `masterDataSlice` sync, Dashboard check-in mutation invalidation, no duplicate `/auth/me` after login, logout purge, and `PayrollPage` PDF blob download.
- **Modified**:
  - [`client/src/services/api.js`](client/src/services/api.js): Scoped `api.get` cache keys to `${tabId}:${sessionId}`, decoupled caller `signal` from underlying shared request (`internalSignal`), purged `queryCache` and fired `hrms:session-cleared` on `/auth/login` and `/auth/logout`, bumped tag versions on mutations, and refactored `downloadAuthenticatedFile` to route through `api.get(..., { responseType: 'blob', skipDedupe: true })` (inherits `Authorization`, `X-Tab-Id`, `X-Session-Id`, 401 refresh-token rotation, URL revocation, and `FileReader`/`.text()` Blob JSON error extraction).
  - [`client/src/App.jsx`](client/src/App.jsx): Scoped `fetchMe()` to initial boot when an existing `pr_access_token` is restored (preventing duplicate `GET /auth/me` immediately after `POST /auth/login`), and wired `hrms:data-mutated` (`master-data` tag -> `invalidateMasterData()`) + `hrms:session-cleared` (`clearMasterData()`).
  - [`client/src/pages/auth/LoginPage.jsx`](client/src/pages/auth/LoginPage.jsx): Clears `queryCache` and dispatches `clearMasterData()` before `setCredentials()` on manual and quick login, and forwards `employee` payload cleanly.
  - [`client/src/pages/dashboard/DashboardPage.jsx`](client/src/pages/dashboard/DashboardPage.jsx): Isolated `LiveGreeting` (60s) and `LiveClockDisplay` (`React.memo`, 1s) subcomponents so ticking clock updates do not re-render Recharts `BarChart` or KPI cards every second; added `AbortController` cancellation on initial and mutation-triggered stat reloads; retained 30s `cacheTtl`.
  - [`client/src/pages/payroll/PayrollPage.jsx`](client/src/pages/payroll/PayrollPage.jsx): Replaced raw `fetch()` in `handleDownloadPDF` with `downloadAuthenticatedFile` so payslip PDF requests include `X-Tab-Id`, `X-Session-Id`, and automatic 401 token refresh.
  - [`client/src/pages/assets/AssetsPage.jsx`](client/src/pages/assets/AssetsPage.jsx): Normalized `api.get('/employees', { params: { limit: 100 } })` so query keys match `EmployeesPage.jsx`.
  - [`client/src/pages/departments/DepartmentsPage.jsx`](client/src/pages/departments/DepartmentsPage.jsx): Removed unused `fetchMasterData` import alongside `AbortController`, 30s TTL, and Redux sync.
  - [`client/src/store/index.js`](client/src/store/index.js), [`client/src/store/slices/authSlice.js`](client/src/store/slices/authSlice.js), [`client/src/components/layout/Navbar.jsx`](client/src/components/layout/Navbar.jsx), and remaining pages (`EmployeesPage`, `AttendancePage`, `LeavesPage`, `RecruitmentPage`, `ReportsPage`, `DocumentsPage`, `CompanySettingsPage`, `ShiftsPage`, `ExpensesPage`, `GrievancesPage`, `AnnouncementsPage`, `TrainingPage`, `PerformancePage`): Shared `masterDataSlice`, `AbortController`, scoped event listeners, and module TTL caching.

---

### 3. Frontend Bottlenecks Identified
1. **StrictMode & Multi-Subscriber Shared `AbortController` Bug**: Passing caller #1's `AbortSignal` directly into `queryCache.deduplicate()` caused React 18 StrictMode's immediate unmount cleanup (`controller1.abort()`) or sibling unmounts to cancel the single shared Axios HTTP request while mount #2 was awaiting the same in-flight Promise (`ERR_CANCELED`), leaving views empty.
2. **Duplicate `GET /auth/me` Immediately After Login**: `App.jsx` watched `[dispatch, token]`, triggering `GET /auth/me` on login even though `POST /auth/login` already returned `user`, `employee`, `company`, and `session`.
3. **1-Second Root Re-Renders on Dashboard**: Holding `currentTime` in `DashboardPage` root state re-rendered the entire dashboard tree—including Recharts `<BarChart>`—once every second.
4. **Master Data & Cross-Module Redundant Fetches / Cache Sync Gaps**: Pages re-fetched `/departments`, `/designations`, `/organization/branches`, `/shifts`, and `/leaves/types` independently; branch/leave-type mutations did not invalidate Redux `masterDataSlice`; `AssetsPage` used `/employees?limit=100` (bypassing `EmployeesPage`'s `{ params: { limit: 100 } }` key); `queryCache` missed `holidays`, `performance`, `training`, `company`, `sessions`, `auth`, and `system` tags.
5. **Unwrapped PDF Download & In-Flight Stale Cache Race**: `PayrollPage.handleDownloadPDF` used raw `fetch` without `X-Tab-Id` / `X-Session-Id` / 401 refresh rotation, `downloadAuthenticatedFile` lacked `X-Session-Id` and refresh rotation, and GET requests resolving after a concurrent mutation could write stale pre-mutation responses into cache.

---

### 4. Shared Data Architecture Selected
- **Evaluation**: Evaluated adopting RTK Query vs. enhancing the existing Redux Toolkit + Axios client (`api.js` + `masterDataSlice` + `queryCache`). Migrating all 25+ endpoints to RTK Query would risk disrupting the existing per-tab `sessionStorage` auth flow (`X-Tab-Id`, `X-Session-Id`, `refreshSubscribers` token-rotation queue).
- **Selected Dual-Tier Architecture**:
  1. **Tier 1 — Redux `masterDataSlice` (5-min TTL)**: Stores shared `departments`, `designations`, `branches`, `shifts`, and `leaveTypes` across pages; automatically invalidated via `hrms:data-mutated` (`master-data` tag) and purged via `hrms:session-cleared` / `clearMasterData()`.
  2. **Tier 2 — `queryCache` + `api.get` Coalescing Layer**: Transparently wraps `api.get` with session-scoped keys (`${tabId}:${sessionId}:${method}:${url}:${sortedParams}`), subscriber-isolated `AbortController` coalescence, microtask abort deferral (handling StrictMode remounts safely), tag-version stale-write protection, and module TTL caching.

---

### 5. Duplicate Requests Fixed
1. **Login -> Dashboard Redundant `/auth/me` ($1 \to 0$ calls after login)**: `App.jsx` runs `fetchMe()` only when booting with an existing stored token in `sessionStorage`, not after `LoginPage` sets credentials from `/auth/login`.
2. **React 18 StrictMode Mount Duplication & Abort Cancellation**: Microtask abort deferral + internal `AbortController` in `queryCache.deduplicate()` keeps the single live HTTP request alive across StrictMode's synchronous unmount->remount while isolating individual caller aborts.
3. **`EmployeesPage` <-> `RecruitmentPage` <-> `DepartmentsPage` <-> `LeavesPage` Metadata**: Master data fetched once into Redux/`queryCache` is reused across pages with 0 duplicate `/departments`, `/designations`, `/organization/branches`, `/shifts`, or `/leaves/types` requests.
4. **Dashboard Clock-In / Clock-Out**: Relies on `hrms:data-mutated` (`dashboard` tag) instead of firing competing duplicate refetches; manual Refresh uses `skipDedupe: true`.
5. **Navbar Mutation Polling**: Ignores non-`notifications` mutations (`affectedTags.includes('notifications')`).
6. **`AssetsPage` Employee Lookup**: Normalized `/employees?limit=100` to `/employees` + `{ params: { limit: 100 } }` to share cache keys cleanly.

---

### 6. Cache TTL and Invalidation Strategy

| Module Tag | TTL | Invalidated On Mutation | Cross-Module Tags Invalidated |
| :--- | :---: | :--- | :--- |
| **`departments`** | 30,000 ms (5m via `masterData`) | `/departments` write | `master-data`, `departments`, `designations`, `reports` |
| **`designations`** | 30,000 ms (5m via `masterData`) | `/designations` write | `master-data`, `designations` |
| **`branches`** | 30,000 ms (5m via `masterData`) | `/organization/branches` write | `master-data`, `branches`, `company` |
| **`shifts`** | 30,000 ms (5m via `masterData`) | `/shifts` write | `master-data`, `shifts` |
| **`leaveTypes`** | 300,000 ms (5 min) | `/leaves/types` write | `master-data`, `leaveTypes`, `leaves` |
| **`company`** | 30,000 ms (30 sec) | `/organization/settings` write | `master-data` |
| **`employees`** | 10,000 ms (or 60s selector) | `/employees` write | `dashboard`, `master-data`, `reports` |
| **`dashboard`** | 30,000 ms (30 sec) | `attendance`, `leaves`, `holidays`, `payroll`, `expenses`, `employees`, `recruitment` writes | Reflected on `DashboardPage` via `hrms:data-mutated` |
| **`attendance`** | 10,000 ms (10 sec) | `/attendance` write | `dashboard`, `reports` |
| **`leaves`** | 10,000 ms (10 sec) | `/leaves/*` write | `dashboard`, `attendance`, `reports` |
| **`holidays`** | 10–30s as configured | `/holidays` write | `dashboard`, `leaves` |
| **`payroll`** | 10,000 ms (10 sec) | `/payroll/*` write | `dashboard`, `reports` |
| **`recruitment`** | 10,000 ms (10 sec) | `/recruitment/*` write | `dashboard`; `+ employees, master-data, reports` on candidate `/convert` or `/status` |
| **`expenses` / `assets` / `training`** | 10,000 ms (10 sec) | Module write | `expenses` adds `dashboard`; module tag otherwise |
| **`grievances` / `documents` / `announcements` / `performance` / `reports`** | 10,000–15,000 ms | Module write | Module tag (`reports` also invalidated by employee/dept/attendance/leaves/payroll writes) |
| **`notifications`** | 15,000 ms (15 sec) | `/notifications/*` write | `notifications` only |
| **`sessions` / `auth` / `system`** | 0–5,000 ms | `/auth/sessions`, auth changes | `queryCache.clear()` + `clearMasterData()` on `/auth/login` or `/auth/logout` |

---

### 7. Session Isolation Verification
Verified in unit & integration tests ([`phase3Verification.test.js`](client/src/__tests__/phase3Verification.test.js), [`phase3Integration.test.jsx`](client/src/__tests__/phase3Integration.test.jsx)):
- Auth tokens (`pr_access_token`, `pr_refresh_token`), `pr_session_id`, `pr_tab_id`, `pr_user`, and `pr_company` stay strictly inside per-tab `sessionStorage` with `withCredentials: false` and `localStorage` unused.
- `api.js` injects `Authorization`, `X-Tab-Id`, and `X-Session-Id` on both standard `api.get` calls and `downloadAuthenticatedFile` blob downloads (`PayrollPage` PDF, `ReportsPage` CSV, `DocumentsPage` downloads).
- Cache keys in `api.get` are prefixed by `${tabId}:${sessionId}`, and `queryCache.clear()` + `clearMasterData()` execute cleanly on login/account-switch (`LoginPage`), `/auth/login`, `/auth/logout`, `logoutUser`, and `logoutAllSessions`, preventing stale cross-user cache hits or post-logout in-flight cache pollution.

---

### 8. Before-and-After Request Counts (Measured Integration Results & Mode Distinction)
*Note on live browser tooling*: Attempting to drive local Chrome via the `chrome_devtools` MCP (`http://localhost:4173` production preview & `http://localhost:5174` StrictMode dev server) failed because Chrome remote debugging was not active on the host (`Could not find DevToolsActivePort ... ENOENT`). Live end-to-end request counts were therefore verified using the real React components + Redux store + Axios interceptor stack in Vitest across both non-StrictMode and `<React.StrictMode>` mounts (`phase3Integration.test.jsx`), summarized below:

| Workflow Step | Pre-Phase 3 Pattern | Production / Non-StrictMode After Fix | React 18 `<React.StrictMode>` Dev After Fix | Net Impact |
| :--- | :---: | :---: | :---: | :--- |
| **App Mount -> Login -> Dashboard (`POST /login` flow)** | `login` + redundant `GET /auth/me` + `dashboard/stats` + `notifications` (double in StrictMode) | `GET /auth/me` skipped right after `login` (`0` extra); `1` `dashboard/stats` | Deduplicated (`1` `dashboard/stats`, not `2`; `0` `ERR_CANCELED` empty screens) | Eliminates redundant `/auth/me` & StrictMode doubling |
| **Dashboard -> Employees** | 5 separate calls (`/employees` + 4 metadata, doubled in StrictMode = 10) | **6 calls once** (`/employees` + 5 `masterData` endpoints populating 5-min cache) | **6 calls once** (StrictMode mounts coalesce cleanly via `queryCache`) | 40% reduction vs StrictMode double-mount; seeds shared store |
| **Employees -> Recruitment** | 3+ calls (re-fetching `/departments`, `/jobs`, `/candidates`) | **2 calls** (`/recruitment/jobs`, `/recruitment/candidates`; `0` masterData calls) | **2 calls** | Zero duplicate master-data calls |
| **Recruitment -> Return to Dashboard (<30s)** | Full `GET /dashboard/stats` refetch | **0 calls** (30s `queryCache` hit) | **0 calls** (30s `queryCache` hit) | **100% reduction** |
| **Dashboard -> Departments (<30s)** | Fresh `/departments` + `/designations` GETs | **0 calls** (reuses 30s `queryCache` entries from `masterData` load) | **0 calls** | **100% reduction** |
| **Departments -> Leaves** | Fresh `/balances` + `/requests` + `/leaves/types` | **2 calls** (`/leaves/balances`, `/leaves/requests`; `/leaves/types` cached 5m) | **2 calls** | `0` duplicate `/leaves/types` calls |
| **Leaves -> Assets** | Fresh `/assets` + `/employees?limit=100` | **1 call** (`/assets`; `/employees` `limit=100` matches normalized cache key) | **1 call** | Eliminates duplicate employee list fetch |
| **7-Page Navigation Flow Total** | Uncached per-page refetches (+ StrictMode 2x) | **12 HTTP requests total** (`>= 4` cache hits) | **12 HTTP requests total** (`0` dropped/cancelled StrictMode renders) | Consistent 0-duplication navigation |

---

### 9. Production Build Results
Command: `cd client && npm run build` (`vite v6.4.5`):
- **Status**: ✅ Passed cleanly in **10.94s** (2,109 modules transformed, 0 errors).
- **Output Bundles**:
  - `dist/index.html`: `1.94 kB` (`gzip: 0.77 kB`)
  - `dist/assets/index-ATB8h4eU.css`: `37.57 kB` (`gzip: 6.65 kB`)
  - `dist/assets/index-Cs4Fev2o.js` (core app bundle): `116.48 kB` (`gzip: 39.71 kB`)
  - `dist/assets/vendor-BBE_dZcV.js` (`react`, `react-dom`, `react-router-dom`, `@reduxjs/toolkit`, `react-redux`): `207.78 kB` (`gzip: 69.43 kB`)
  - `dist/assets/charts-xXJIdj8n.js` (`recharts`, lazy-loaded on Dashboard only): `395.22 kB` (`gzip: 108.82 kB`)
  - `dist/assets/icons-C0T7KTG3.js` (`lucide-react`): `26.01 kB` (`gzip: 5.57 kB`)
  - Lazy route chunks (`3.37 kB`–`29.55 kB` raw / `1.32 kB`–`6.35 kB` gzip across 18 route bundles; largest pages: `CompanySettingsPage-DCU0YK_a.js` at `29.55 kB`, `EmployeesPage-DpAM0zD9.js` at `29.41 kB`, `DashboardPage-YAWXPmnB.js` at `22.86 kB`).

---

### 10. Frontend & Backend Test Results
- **Frontend Vitest Suite (`cd client && npm test`)**: ✅ **2 Test Files passed, 24 of 24 Tests passed** (`Duration: 10.62s`):
  - `src/__tests__/phase3Verification.test.js`: **18 passed** (cache key sorting, in-flight coalescing, TTL hit/expiry, selective tag invalidation, cross-module tag graph including `holidays`/`performance`/`training`/`company`/`branches`/`leaveTypes`/candidate conversion, logout `clear()`, error non-caching, `masterDataSlice` reducers, sibling-survival & StrictMode synchronous `AbortController` handling, all-subscriber cancellation, stale-write protection on concurrent mutation, per-tab header & session-scoped key isolation, authenticated `blob` file download & error JSON parsing).
  - `src/__tests__/phase3Integration.test.jsx`: **6 passed** (StrictMode `Employees -> Recruitment` shared `masterData` reuse, Dashboard check-in mutation cache invalidation & refresh, no duplicate `/auth/me` after `setCredentials` + logout purge, branch mutation -> `masterDataSlice` invalidation while serving unaffected metadata from cache, 7-page StrictMode/non-StrictMode 12-request benchmark, `PayrollPage` authenticated PDF download).
- **Backend Vitest Regression Suite (`cd server && npx vitest run`)**: ✅ **1 Test File passed, 24 of 24 Tests passed** (`tests/enterpriseHRMS.test.js`, `Duration: 20.26s`).
- **MongoDB Atlas Data Integrity**: No write operations were executed against live Atlas business collections during Phase 3 verification edits/tests (backend unit tests use isolated `test` environment configuration).

---

### 11. Remaining Performance Bottlenecks
1. **Unvirtualized Client Tables (`EmployeesPage`, `AttendancePage`, `ReportsPage`)**: Rendering 100+ employee/attendance rows still mounts all DOM rows simultaneously (`limit: 100` client fetch) without table virtualization or cursor/server pagination controls for larger org growth (1,000+ employees).
2. **`AttendancePage` 1-Second Terminal Clock State**: Similar to Dashboard before our fix, `AttendancePage` still ticks a `setInterval(..., 1000)` on component root state, causing periodic reconciliation of the attendance table if many rows are rendered.
3. **Cold `charts` Chunk Payload (`395.22 kB` / `108.82 kB` gzip)**: Recharts remains the heaviest frontend chunk on initial Admin/HR Dashboard load; code-splitting chart sub-widgets or lightweight SVG charts would further shrink first Dashboard paint on slow networks.
4. **7 Pending Database Compound Indexes from Phase 2**: Backend sorts on `jobopenings`, `candidates`, `announcements`, `performancereviews`, and `payrollruns` (documented in `server/docs/INDEX_RECOMMENDATIONS.md`) remain pending DBA approval and affect cold-cache API latency.

---

### 12. Recommendations for Future Performance Testing
1. **Enable Chrome Remote Debugging / Playwright E2E Network Assertions**: Configure Playwright (or launch Chrome with remote debugging enabled for `chrome_devtools` MCP) to capture live browser waterfalls (`performance.getEntriesByType('resource')`), verify multi-tab Chrome session isolation interactively across tabs 1–5 (`ADMIN`, `HR_MANAGER`, `RECRUITER`, `EMPLOYEE`, `PAYROLL_ADMIN`), and assert zero HTTP `CanceledError`/401/403 errors on real clicks.
2. **Lighthouse & Core Web Vitals Audits on `vite preview`**: Measure LCP, INP (especially during 1s clock intervals and filter typing), and TBT on `DashboardPage` and `EmployeesPage` under throttled 4x CPU / Slow 4G presets.
3. **Large-Dataset React Profiler & Load Benchmarks**: Seed a staging/non-production test dataset of 1,000+ employees and 10,000+ attendance logs to measure DOM commit durations and determine when to introduce server pagination + row virtualization (Phase 4 candidate).
4. **React Query / StrictMode Regression Guard in CI**: Keep [`phase3Verification.test.js`](client/src/__tests__/phase3Verification.test.js) and [`phase3Integration.test.jsx`](client/src/__tests__/phase3Integration.test.jsx) running cleanly on every PR to catch accidental cache bypasses, raw `fetch` downloads, or duplicate `/auth/me` calls.

---

## Phase 4: Enterprise Security, RBAC, IDOR & Multi-Tenant Isolation

**Full Detailed Report**: [SECURITY_AUDIT.md](server/docs/SECURITY_AUDIT.md)

### 1. Executive Security Summary & Phase 4 Scope
Phase 4 hardened PR VISION HRMS authentication, JWT/session validation, RBAC, record ownership (IDOR), PII/financial field projection, private upload/download delivery, error/audit log sanitization, and multi-tenant isolation readiness without altering live MongoDB Atlas records or starting Phase 5.

### 2. Baseline Verification & MongoDB Atlas Data Integrity
Read-only Atlas verification before and after Phase 4 confirmed unchanged collection counts (`users: 7, employees: 8, departments: 7, designations: 13, branches: 3, attendances: 39, leaverequests: 9, payrollruns: 1, documents: 0, usersessions: 53, companysettings: 1`). All automated Vitest checks execute strictly against isolated `MongoMemoryServer`.

### 3. Authentication, JWT & Per-Tab Session Security Hardening
- Production guards (`server/src/config/env.js`): forbid `JWT_ACCESS_SECRET === JWT_REFRESH_SECRET` and forbid `DEV_ADMIN_SEED_ENABLED === true` in `NODE_ENV === 'production'`.
- `authenticate` (`server/src/middleware/authMiddleware.js`) enforces `decoded.type === 'access'`, mandatory `sessionId`, `X-Session-Id` header matching (`401` on mismatch), `UserSession` non-revoked/non-expired checks, `tenantId` consistency, and `sanitizeUserForResponse`.
- Fixed `invalidateAuthCache(userId, sessionId)` key mismatch against `${userId}:${sessionId}:${tenantId}` and restricted `authIdentityCache` writes strictly to `GET` requests so `/logout`, session revocation, and `deleteEmployee` take effect instantaneously.
- `refreshTokenHandler` enforces `decoded.type === 'refresh'`, single-use refresh rotation reuse detection (`401` + session revocation), and `x-target-tenant` rejection (`403`).

### 4. Role-Based Access Control (RBAC) Matrix & Privilege Escalation Controls
- Removed `PERMISSIONS.VIEW_EMPLOYEES` from `ROLE_DEFAULT_PERMISSIONS.RECRUITER` in `server/src/config/constants.js` (leaving `SUPER_ADMIN` / `ADMIN` with all 40 codes, `HR_MANAGER` with 34 codes, `MANAGER` with 15, `PAYROLL_ADMIN` with 13, `EMPLOYEE` with 12, and `RECRUITER` with 9).
- Blocked `HR_MANAGER` privilege escalation into `ADMIN` / `SUPER_ADMIN` (employee creation, update, confirm, promote, resignation, relieving letter, delete -> `403`).
- Restricted `GET /api/v1/system/diagnostics` strictly to `ADMIN` / `SUPER_ADMIN` (`requireRoles(ROLES.ADMIN)`).
- Prevented silent account takeover by returning `409` if employee creation or candidate conversion collides with an existing `User` email.

### 5. IDOR & Record-Ownership Hardening Across All Modules
Closed fall-through ownership gaps across: `employees`, `attendance` (`/attendance`, `POST /:id/correction`), `leaves` (`/balances`, `/requests`, `/requests/:id`, `/cancel`, `/review`), `payroll` (`/payslips`, `/payslips/:id/pdf`, `POST /structures`), `documents`, `expenses` (including authenticated `GET /:id/receipt`), `performance` (`GET`, `POST`, `self-review`, `manager-review`), `training` (`PUT /programs/:id`, `POST /programs/:id/assign`, `GET /assignments`, `PATCH /assignments/:id/progress`), `grievances`, `assets`, `reports`, and `dashboard` (added `SUPER_ADMIN`, withheld `AuditLog`, financial/HR metrics, and employee DOBs from `RECRUITER` / `PAYROLL_ADMIN`).

### 6. Sensitive PII, Financial Redaction & CSV Injection Defense
- Centralized helpers in [`securityUtils.js`](server/src/utils/securityUtils.js): `sanitizeUserForResponse`, `sanitizeCompanyForRole` (strips `biometricConfig` for non-Admin/HR), `sanitizeAuditDetails`, `escapeRegex`, and `sanitizeCsvCell`.
- `MANAGER` employee directory/profile queries strip `bankDetails`, `previousEmployment`, `exitInterviewNotes`, `address`, `emergencyContact`, and `dateOfBirth`; `MANAGER` candidate listings strip `currentCtc` / `expectedCtc`; non-Admin/HR asset queries strip `purchaseCost`; `/reports/employees` excludes `bankDetails` and confidential fields; all CSV exports neutralize formula prefixes (`=`, `+`, `-`, `@`, tab, CR).

### 7. Private Upload & Download Security (`/uploads/*` Blocking & Magic Bytes)
- Replaced `app.use('/uploads', express.static(...))` in `server/src/app.js` with an explicit blocker returning `401` (unauthenticated) / `403` (authenticated bypass attempt).
- Enforced extension + MIME allowlists (`uploadMiddleware.js`), cryptographic filenames, single-file limits, header magic-byte verification (`validateUploadedFileMagicBytes` + `safeDeleteFile` on rejection/failure), canonical path-traversal defense (`resolveSafeUploadPath`), and `X-Content-Type-Options: nosniff` + `Cache-Control: private, no-store` headers on `/documents/:id/download` and `/expenses/:id/receipt`.

### 8. CORS, Rate Limiting, Error & Audit Log Hygiene
Removed `'x-target-tenant'` from CORS `allowedHeaders`; handled malformed JSON and upload validation errors cleanly as `400` in `errorMiddleware.js` with production stack suppression; sanitized audit logs across `auditMiddleware.js`, `systemController.js`, and `organizationController.js`.

### 9. Multi-Tenant Isolation Audit (All 30 Mongoose Models)
- `UserSession` (`1 / 30`) includes `tenantId` (`default: 'pr_vision_hrms'`).
- All remaining `29 / 30` domain models (`Announcement`, `Asset`, `AssetAssignment`, `Attendance`, `AuditLog`, `Branch`, `Candidate`, `CompanySettings`, `Department`, `Designation`, `Document`, `Employee`, `ExpenseClaim`, `Grievance`, `Holiday`, `JobOpening`, `LeaveBalance`, `LeaveRequest`, `LeaveType`, `Notification`, `PayrollRun`, `Payslip`, `PerformanceReview`, `SalaryRevision`, `SalaryStructure`, `Shift`, `TrainingAssignment`, `TrainingProgram`, `User`) do not yet carry `tenantId`.
- Multi-company DB isolation is not yet enabled; runtime guards reject mismatched `x-target-tenant` headers (`403`) and validate `session.tenantId`.

### 10. Safe Multi-Tenant Migration Proposal (Requires Explicit Approval)
**PROPOSAL ONLY — NOT EXECUTED.** Detailed 5-phase additive rollout (`Tenant` collection + additive `tenantId` fields -> idempotent batched backfill -> tenant-scoped compound unique indexes -> Mongoose `tenantId` scoping plugin -> cross-tenant adversarial verification & rollback plan) documented in [SECURITY_AUDIT.md](server/docs/SECURITY_AUDIT.md).

### 11. Automated Verification Results
- **Backend Vitest Suites (`cd server; npm test`)**: **2 test files passed (2), 39 passed / 39 total (0 failed, 0 skipped)** (`Duration: 23.07s`):
  - `tests/enterpriseHRMS.test.js`: **24 / 24 passed**
  - `tests/phase4Security.test.js`: **15 / 15 passed**
- **Syntax Check**: `node --check` exited `0` across all `server/src/**/*.js` files; zero residual uploaded files on disk; zero live Atlas mutations.

### 12. Remaining Risks & Recommendations
1. Single-tenant schema until approved execution of Section 10.
2. Process-local `authIdentityCache` (`15s` GET TTL) should be backed by Redis before horizontal multi-instance scaling.
3. Future expense receipt preview UI should fetch binary blobs through `downloadAuthenticatedFile` at `/api/v1/expenses/:id/receipt`.
4. Add progressive per-account failed-login lockout and optional admin MFA ahead of internet-facing SaaS onboarding.



## Phase 5 — Functional Bug Fixes & Business Logic Reliability Report

### 1. Executive Summary
Phase 5 audited and resolved verified functional bugs, schema/controller mismatches, incomplete CRUD lifecycles, calculation inaccuracies, and frontend/API integration gaps across PR VISION HRMS while preserving all Phase 1–3 performance optimizations, Phase 4 RBAC/IDOR security hardening, and existing MongoDB Atlas production records. Multi-tenant schema migration was intentionally not executed.

### 2. Safety Baseline & MongoDB Atlas Read-Only Integrity
- Baseline & post-Phase-5 read-only counts on MongoDB Atlas (`pr_vision_hrms`) confirmed zero mutations to business/seeded collections (`users: 7, employees: 8, departments: 7, designations: 13, branches: 3, attendances: 39, leaverequests: 9, payrollruns: 1, documents: 0, companysettings: 1, announcements: 0, expenseclaims: 0, grievances: 0, assets: 0`; `usersessions: 54` baseline / `55` read-only check).
- All automated functional and integration tests execute strictly against isolated `MongoMemoryServer` instances (backend) and mocked `api.defaults.adapter` + Redux stores (frontend), leaving zero residual files in upload directories.

### 3. Announcements & Dashboard Synchronization Fixes
- **Backend ([`announcementController.js`](server/src/modules/announcements/announcementController.js), [`announcementRoutes.js`](server/src/modules/announcements/announcementRoutes.js), [`dashboardController.js`](server/src/modules/dashboard/dashboardController.js))**:
  - Replaced schema-mismatched creation logic (`content` field without required `message` and invalid `'General'` category) with Zod validation supporting both `message` and `content`, persisting to `message` and serializing both fields consistently.
  - Added `PUT /:id` and `PATCH /:id` (`updateAnnouncement`) for editing notices and toggling `isActive`.
  - Enforced `isActive: true`, `expiresAt > now`, and `$and`-combined branch + department audience targeting (`buildAnnouncementVisibilityFilter` / `getAnnouncements`) across both the Announcements feed and all Dashboard views.
- **Frontend ([`AnnouncementsPage.jsx`](client/src/pages/announcements/AnnouncementsPage.jsx), [`queryCache.js`](client/src/services/queryCache.js))**:
  - Added Edit modal, publish/unpublish toggle, branch/department targeting dropdowns backed by Redux `masterData`, complete category/priority options, `includeInactive: 'true'` for Admin/HR views, `SUPER_ADMIN` support, and `'announcements' -> 'dashboard'` cache tag invalidation.

### 4. Document Vault Fixes
- **Backend ([`documentController.js`](server/src/modules/documents/documentController.js))**: Added explicit `DOCUMENT_CATEGORIES` allowlist validation (deleting temporary uploads on `400`), trimmed title fallback, and populated `employeeId`/`uploadedBy` in `uploadDocument`.
- **Frontend ([`DocumentsPage.jsx`](client/src/pages/documents/DocumentsPage.jsx))**: Removed invalid `'Contract'` category, aligned category filters/options with [`Document.js`](server/src/models/Document.js), fixed download filenames (`getDownloadFilename` deriving extension from `fileName`/`mimeType` rather than nonexistent `doc.fileType`), added employee assignment selector and Admin/HR Delete action, and switched download paths to relative `/documents/${doc._id}/download`.

### 5. Payroll Engine & Statutory/Attendance Proration Fixes
- **Backend ([`payrollController.js`](server/src/modules/payroll/payrollController.js))**:
  - Added `conveyanceAllowance` persistence in `saveSalaryStructure` and validated `month` (`1..12`) / `year` (`2000..2100`).
  - Replaced narrow `{ employmentStatus: 'Active' }` filter with full active payroll eligibility (`Probation`, `Confirmed`, `Promoted`, `Transferred`, `Onboarding`, `Active`, or separated employees whose `lastWorkingDate >= monthStart`) where `joiningDate <= monthEnd`.
  - Replaced hardcoded `workingDays = 30` with shift-aware monthly working days (respecting `Shift.weeklyOffDays`, excluding non-optional `Holiday` dates scoped to employee `branchId` or company-wide).
  - Integrated attendance statuses (`Half-day` = `0.5` LOP, `Absent` = `1.0` LOP), approved `LeaveRequest` days (`isPaid === false` counted as LOP; paid leaves counted without double-counting), and mid-month join/exit `unservedDays`.
  - Prorated `basicSalary`, `hra`, `specialAllowance`, `conveyanceAllowance`, and fixed/basic earnings by `prorationFactor = presentDays / workingDays`; computed `percentage_of_gross` earnings on earned pre-custom gross; calculated PF (`12%` default on earned basic), ESI (`0.75%` default on earned gross), PT/TDS/custom deductions when `presentDays > 0`; recorded `calculationSnapshot`; enforced `isLocked`/`Paid` immutability against regeneration or double-pay.
- **Frontend ([`PayrollPage.jsx`](client/src/pages/payroll/PayrollPage.jsx))**: Included `SUPER_ADMIN` in `isAdminOrHR` and rendered `Paid / Working Days` and `LOP` breakdown in the payslips table.

### 6. Expenses & Recruitment Workflow Fixes
- **Expenses ([`expenseController.js`](server/src/modules/expenses/expenseController.js), [`ExpensesPage.jsx`](client/src/pages/expenses/ExpensesPage.jsx))**:
  - Validated expense dates (cleaning uploaded receipts on invalid dates) and stored `receipt:${filename}` atomically on creation.
  - Enforced expense workflow transitions (`Pending -> Approved/Rejected`, `Approved -> Reimbursed` restricted to Admin/HR/Payroll) and blocked mutations once `'Rejected'` or `'Reimbursed'`.
  - Added receipt attachment upload (`FormData`), authenticated receipt download via `downloadAuthenticatedFile`, `'Client Entertainment'` category option, `'Mark Reimbursed'` button for `'Approved'` claims, and form resets.
- **Recruitment ([`Candidate.js`](server/src/models/Candidate.js), [`recruitmentController.js`](server/src/modules/recruitment/recruitmentController.js), [`recruitmentRoutes.js`](server/src/modules/recruitment/recruitmentRoutes.js), [`RecruitmentPage.jsx`](client/src/pages/recruitment/RecruitmentPage.jsx))**:
  - Added optional `interviewSchedule` subdocument (`scheduledAt`, `interviewerName`, `mode`, `meetingLink`), `PUT/PATCH /candidates/:id` (`updateCandidate`), closed-job rejection (`400`), duplicate `(jobOpeningId, email)` check (`409`), `?stage=` mapping to `status`, and removal of nonexistent `stage` query in [`dashboardController.js`](server/src/modules/dashboard/dashboardController.js).
  - Blocked converting `'Rejected'` candidates, blocked changing status of converted hires away from `'Hired'`, and auto-provisioned annual `LeaveBalance` (`defaultDaysPerYear ?? 12`) upon candidate conversion.
  - Added Edit Job modal, Edit/Schedule Interview modal, Onboarding Convert modal, and role-scoped action controls in `RecruitmentPage.jsx`.

### 7. Attendance, Leave Balance Invariant & Holiday Calendar Fixes
- **Attendance ([`attendanceController.js`](server/src/modules/attendance/attendanceController.js), [`AttendancePage.jsx`](client/src/pages/attendance/AttendancePage.jsx))**:
  - Added default active `Shift` fallback when `employee.shiftId` is unassigned, overnight shift check-in math, dynamic shift/company standard hours for overtime calculation, duplicate check-in `400` handling, check-out >= check-in validation, and automatic `correctionRequest.status = 'Approved'` synchronization on HR adjustment.
  - Fixed UTC-to-local `datetime-local` formatting bug in `AttendancePage.jsx`, added Employee "Request Correction" modal + status badges, and added "Load Requested Times" / "Reject Request" controls for HR/Admin.
- **Leaves ([`leaveController.js`](server/src/modules/leaves/leaveController.js), [`LeavesPage.jsx`](client/src/pages/leaves/LeavesPage.jsx))**:
  - Auto-initialized missing annual `LeaveBalance` (and missing `LeaveType` entries using `defaultDaysPerYear ?? 12`), maintained exact `remaining = allocated - used - pending` invariant across `applyLeave`, `cancelLeaveRequest`, and `reviewLeaveRequest`, prevented self-approval, and synced approved leaves to `Attendance` (`On Leave`) on unpunched dates.
  - Allowed all roles (including Managers) to cancel their own pending leave requests while hiding self-Approve buttons, added date-range `totalDays` auto-calculation, and added a lazy-loaded `Holiday Calendar` tab (`/holidays` aware) matching [`Holiday.js`](server/src/models/Holiday.js) fields without adding extra initial-load network calls on `/leaves`.

### 8. Performance, Training & Asset Lifecycle Fixes
- **Performance ([`performanceController.js`](server/src/modules/performance/performanceController.js), [`PerformancePage.jsx`](client/src/pages/performance/PerformancePage.jsx))**: Added Zod rating (`1..5`) and goal validation, blocked self-review edits after `'Completed'`, computed default `finalScore` when omitted, replaced fake `'4.0'`/`3`-star display fallbacks with `'Pending'`, and added Initiate Cycle, Self-Review, and Complete Evaluation modals.
- **Training ([`trainingController.js`](server/src/modules/training/trainingController.js), [`TrainingPage.jsx`](client/src/pages/training/TrainingPage.jsx))**: Added Zod validation with `endDate >= startDate` enforcement, assignment status/score (`0..100`) validation, `'Product Training'` option, Enroll Employees modal, and Update Progress modal.
- **Assets ([`assetController.js`](server/src/modules/assets/assetController.js), [`AssetsPage.jsx`](client/src/pages/assets/AssetsPage.jsx))**: Fixed schema field mismatch by writing `assignedCondition`, `returnCondition`, and `notes` matching [`AssetAssignment.js`](server/src/models/AssetAssignment.js), blocked assigning non-`Available` assets, mapped return conditions (`'Needs Maintenance' -> 'Under Repair'`, `'Retired' -> 'Decommissioned'`), and added condition/remarks selectors in Assign and Return modals.

### 9. Organization, Departments, Designations, Shifts, Holidays, Employees & UI Integration Fixes
- **Master Data & Validation ([`organizationController.js`](server/src/modules/organization/organizationController.js), [`departmentController.js`](server/src/modules/departments/departmentController.js), [`designationController.js`](server/src/modules/designations/designationController.js), [`shiftController.js`](server/src/modules/shifts/shiftController.js), [`holidayController.js`](server/src/modules/holidays/holidayController.js), [`employeeController.js`](server/src/modules/employees/employeeController.js))**:
  - Required branch `city`/`state` (`400`), enforced duplicate branch `code` check on update (`409`), blocked deleting Headquarters branch (`400`).
  - Applied `escapeRegex` + `isValidObjectId` + duplicate update checks across departments (`R&D (India)` safe) and designations, added `startTime !== endTime` and duplicate-name checks in shifts, validated dates/ObjectIds/`11000` in holidays, prevented employee self-manager assignment (`managerId === id` -> `400`), and added `ensureCanManageTargetEmployee` in `confirmProbation` and `promoteEmployee`.
- **Frontend UI & State Sync ([`authSlice.js`](client/src/store/slices/authSlice.js), [`masterDataSlice.js`](client/src/store/slices/masterDataSlice.js), [`CompanySettingsPage.jsx`](client/src/pages/settings/CompanySettingsPage.jsx), [`DepartmentsPage.jsx`](client/src/pages/departments/DepartmentsPage.jsx), [`ShiftsPage.jsx`](client/src/pages/shifts/ShiftsPage.jsx), [`EmployeesPage.jsx`](client/src/pages/employees/EmployeesPage.jsx), [`Sidebar.jsx`](client/src/components/layout/Sidebar.jsx), [`App.jsx`](client/src/App.jsx))**:
  - Added `updateCompanyInfo` and branch CRUD reducers so organization settings & branches reflect immediately without manual refresh; added Branch Edit modal, Designation Edit modal, Shift Edit modal + `weeklyOffDays` toggles, Reporting Manager selectors (filtering self in Edit modal) + Dossier manager display, and consistent `'SUPER_ADMIN'` access alongside `'ADMIN'`.

### 10. Files Created & Modified in Phase 5
- **Created**:
  - `server/tests/phase5Functional.test.js`
  - `client/src/__tests__/phase5Integration.test.jsx`
- **Modified (Backend — 20 files)**: `server/src/models/Candidate.js`, `announcementController.js`, `announcementRoutes.js`, `assetController.js`, `attendanceController.js`, `dashboardController.js`, `departmentController.js`, `designationController.js`, `documentController.js`, `employeeController.js`, `expenseController.js`, `holidayController.js`, `leaveController.js`, `organizationController.js`, `payrollController.js`, `performanceController.js`, `recruitmentController.js`, `recruitmentRoutes.js`, `shiftController.js`, `trainingController.js`.
- **Modified (Frontend — 19 files)**: `App.jsx`, `Sidebar.jsx`, `queryCache.js`, `authSlice.js`, `masterDataSlice.js`, `AnnouncementsPage.jsx`, `AssetsPage.jsx`, `AttendancePage.jsx`, `DepartmentsPage.jsx`, `DocumentsPage.jsx`, `EmployeesPage.jsx`, `ExpensesPage.jsx`, `LeavesPage.jsx`, `PayrollPage.jsx`, `PerformancePage.jsx`, `RecruitmentPage.jsx`, `CompanySettingsPage.jsx`, `ShiftsPage.jsx`, `TrainingPage.jsx`.

### 11. Final Automated Verification Results (Post-Final-Edit)
- **Backend Syntax Check (`node --check` on `server/src/**/*.js`)**: `SYNTAX_OK: 93 files` (exit `0`).
- **Backend Test Suite (`cd server; npm test`)**: **3 test files passed (3), 47 passed (47), 0 failed, 0 skipped**:
  - `tests/enterpriseHRMS.test.js`: **24 / 24 passed**
  - `tests/phase4Security.test.js`: **15 / 15 passed**
  - `tests/phase5Functional.test.js`: **8 / 8 passed**
- **Frontend Test Suite (`cd client; npm test`)**: **3 test files passed (3), 29 passed (29), 0 failed, 0 skipped**:
  - `src/__tests__/phase3Verification.test.js`: **18 / 18 passed**
  - `src/__tests__/phase3Integration.test.jsx`: **6 / 6 passed**
  - `src/__tests__/phase5Integration.test.jsx`: **5 / 5 passed**
- **Frontend Production Build (`cd client; npm run build`)**: Vite production bundle built cleanly (`dist/` generated with 0 errors).
- **Upload Hygiene & DB Safety**: Zero leftover files in upload directories; live MongoDB Atlas `pr_vision_hrms` data preserved untouched.

### 12. Remaining Deferred Scope (Beyond Phase 5)
1. Multi-tenant schema migration (`tenantId` column additions & backfill) remains intentionally deferred for explicit approval before Phase 6/multi-company activation.
2. Live manual browser QA across tabs and optional visual/UX polish remain deferred pending Phase 7 approval.

---

## Phase 6: End-to-End Workflow Validation, Data Integrity & Production Simulation (Completed)

> [!NOTE]
> Phase 6 validated end-to-end HRMS business workflows, exact payroll mathematics, cross-module data integrity, and role-based UI/API isolation. **Live MongoDB Atlas (`pr_vision_hrms`) was queried strictly read-only (`0` writes, `0` repairs); all E2E tests ran on isolated `MongoMemoryServer` instances and mocked frontend API adapters.** Detailed simulation breakdown is documented in [`server/docs/PHASE6_WORKFLOW_REPORT.md`](server/docs/PHASE6_WORKFLOW_REPORT.md).

### 1. Phase 6 Fixes Implemented
- **Training Schema Alignment ([`TrainingProgram.js`](server/src/models/TrainingProgram.js))**: Removed `required: true` from `description` and added `trim: true, default: ''` to match Zod `createProgramSchema`, eliminating `400` validation failures when API clients omit optional descriptions.
- **Circular Manager Protection ([`employeeController.js`](server/src/modules/employees/employeeController.js))**: Extended `updateEmployee` `managerId` validation with multi-hop ancestor traversal (up to 20 hops) to reject indirect circular reporting hierarchies (`400`) in addition to self-management.

### 2. End-to-End Workflow Coverage & Payroll Calculation Results
- **Backend E2E Suite ([`server/tests/phase6WorkflowE2E.test.js`](server/tests/phase6WorkflowE2E.test.js))**: **10 / 10 passed** covering Steps 2–11:
  - Employee lifecycle (`Probation -> Confirmed -> Promoted -> Resigned [July prorated / Aug excluded] -> Relieved -> Soft-Delete & Session Revocation`), duplicate/privilege/cycle guards.
  - Attendance live punches, night-shift cross-midnight overtime (`22:00–08:00` = `10h`, `2h` OT), batch biometric sync, employee regularization -> HR approval -> LOP removal.
  - Complete leave workflow (`Pending`/`Approved`/`Rejected`/`Cancelled`), balance invariant, `'On Leave'` attendance sync, approved cancellation block (`400`), Paid (`0` LOP) vs Unpaid LWP (`2` LOP -> Net `₹27,400` on Sept 2026) payroll impact.
  - Comprehensive June 2026 6-employee Payroll Matrix verified to exact rupees: `PAY-01` (`₹60,500 / ₹54,246`), `PAY-02` (`₹29,600 / ₹27,180`), `PAY-03` (`₹54,000 / ₹49,480`), `PAY-04` mid-month joiner (`₹32,000 / ₹29,400`), `PAY-05` mid-month exit (`₹33,000 / ₹30,160`), `PAY-06` Pune `[0]` shift + regional/optional holidays (`₹36,000 / ₹32,920`); `PayrollRun` totals (`₹2,45,100` Gross / `₹21,714` Ded / `₹2,23,386` Net) matched sum of all 6 payslips, locked cleanly upon `Paid`, and generated valid `%PDF-` binary downloads with IDOR protection.
  - Recruitment-to-Employee conversion (`PRV-XXXX` + `User` + `LeaveBalance`), Expenses (`Pending -> Approved -> Reimbursed` + receipt magic-byte & `/uploads` block), Private Documents (upload/download/delete disk cleanup), Performance Reviews, Training Programs, Asset assign/repair/retire state machine, Targeted Announcements + Dashboard consistency, All 7 `ROLES` matrix (`HR` invalid per schema), and Post-Run Relational & Balance Integrity Sweep.
- **Frontend UI + API E2E Integration ([`client/src/__tests__/phase6WorkflowIntegration.test.jsx`](client/src/__tests__/phase6WorkflowIntegration.test.jsx))**: **6 / 6 passed** covering selective `queryCache` invalidation (`/shifts` vs `/leaves/apply`), `PerformancePage` self + manager evaluation flow, `TrainingPage` completion update, `AssetsPage` assign + return (`Under Repair`), `RecruitmentPage` convert modal, and 7-role `Sidebar` visibility.
- **Live Browser Testing Disclosure**: Live Chrome DevTools E2E flows were intentionally skipped to protect live MongoDB Atlas (`pr_vision_hrms`) from write mutations during Phase 6; client branding (`index.html`, `manifest.json`) verified clean of legacy references.

### 3. Statutory Flags, Workflow Gaps & Live Atlas Read-Only Anomalies
- **Statutory / Payroll Rules Flagged**: PF/ESI/PT/TDS are manual per-employee flags (`isVerifiedByProfessional: false`) without statutory ₹15k PF cap, ₹21k ESI cutoff, state PT slabs, or tax-regime TDS automation; unlocked `'Approved'` payroll runs overwrite `Payslip` IDs on re-generation; no `/reverse` payroll endpoint exists.
- **Remaining Workflow Observations**: Backend modules do not automatically insert `Notification` rows upon leave/expense/payroll/announcement events; `cancelLeaveRequest` restricts cancellation to `'Pending'` requests; `syncBiometricLogs` omits `overtimeHours` calculation; live Atlas lacks a default unpaid leave type (`isPaid: false`).
- **Pre-Existing Live Atlas Anomalies (Read-Only Reported Only)**: 2 stale `LeaveBalance.remaining` values (`6aece67107df77bcc5827b85`, `6aece67107df77bcc5827b8b`), 3 orphan `LeaveBalance` records (`6af2fbb3a87716f06462cbb7`, `6af30edc185b67482e74f4f0`, `6af48fca9fc4b1cf63c0e26b`), and 1 historical `10/2026` `PayrollRun` (`6aece67a07df77bcc5827bfc`) header mismatch (`7` vs `3` `Payslip` docs).

### 4. Phase 6 Final Verification Snapshot & Deferred Scope
- **Backend Syntax Check (`server/src/**/*.js`)**: `93` files, `0` errors.
- **Backend Suite (`cd server; npm test`)**: **4 files, 57 passed, 0 failed, 0 skipped** (`enterpriseHRMS: 24`, `phase4Security: 15`, `phase5Functional: 8`, `phase6WorkflowE2E: 10`).
- **Frontend Suite (`cd client; npm test`)**: **4 files, 35 passed, 0 failed, 0 skipped** (`phase3Verification: 18`, `phase3Integration: 6`, `phase5Integration: 5`, `phase6WorkflowIntegration: 6`).
- **Frontend Build (`cd client; npm run build`)**: Vite production build succeeded (`2109 modules`, `0` errors).
- **Deferred (Beyond Phase 6)**: Multi-tenant schema migration (`tenantId`), automated statutory slab engines (pending CA/business rules sign-off), automated notification emitters, and optional live staging browser QA remain deferred for future approval. *(Note: Approved-leave cancellation authorization was implemented in Phase 6.1 below.)*

---

## Phase 6.1: Approved Leave Cancellation Authorization (Completed)

> [!NOTE]
> Implemented HR-authorized cancellation of Approved leave requests with mandatory audit reasoning, atomic balance restoration, Attendance reversion, and a safe `PayrollAdjustment` workflow that preserves locked/paid historical payroll immutability. Detailed report: [`server/docs/PHASE6_1_APPROVED_LEAVE_CANCELLATION_REPORT.md`](server/docs/PHASE6_1_APPROVED_LEAVE_CANCELLATION_REPORT.md).

### 1. Summary of Changes
- **Authorization & Schema ([`LeaveRequest.js`](server/src/models/LeaveRequest.js), [`leaveController.js`](server/src/modules/leaves/leaveController.js), [`auditMiddleware.js`](server/src/middleware/auditMiddleware.js))**:
  - Allowed `HR_MANAGER`, `ADMIN`, and `SUPER_ADMIN` (`isAdminOrHR`) to cancel both `'Pending'` and `'Approved'` leave requests; blocked employees (`403`), managers (`403`), recruiters (`403`), and payroll admins (`403`) from cancelling `'Approved'` requests while preserving owner self-cancellation on `'Pending'` leaves.
  - Enforced mandatory `cancellationReason` (`>= 3` characters) on `'Approved'` leave cancellations, stored `cancellationReason`, `cancelledBy`, `cancelledAt`, and `cancelledFromStatus`, and persisted full `AuditLog` (`LEAVE_CANCELLED`) metadata.
  - Added atomic `LeaveRequest.findOneAndUpdate` Compare-And-Set locking and single-write aggregation-pipeline `LeaveBalance.findOneAndUpdate` to prevent concurrent duplicate cancellations or double balance restorations.
  - Synced `'On Leave'` attendance records on cancellation (`checkInTime -> Present`/`Half-day`, future/weekly-off/holiday placeholders deleted cleanly, past/today unpunched scheduled workdays -> `Absent`).
- **Locked Payroll Protection & Future Adjustment Workflow ([`PayrollAdjustment.js`](server/src/models/PayrollAdjustment.js), [`payrollController.js`](server/src/modules/payroll/payrollController.js), [`payrollRoutes.js`](server/src/modules/payroll/payrollRoutes.js))**:
  - Kept `Paid` / `isLocked` `PayrollRun` and `Payslip` documents 100% immutable when overlapping approved leaves are cancelled; created unique-indexed `Pending` `PayrollAdjustment` entries (`CREDIT` or `DEDUCTION`).
  - Added `GET /api/v1/payroll/adjustments` and `PATCH /api/v1/payroll/adjustments/:id` (`Pending -> Approved / Waived`) and automatic itemized settlement in subsequent `generatePayrollRun` batches (`status -> Applied`).
- **Frontend & Cache Sync ([`LeavesPage.jsx`](client/src/pages/leaves/LeavesPage.jsx), [`PayrollPage.jsx`](client/src/pages/payroll/PayrollPage.jsx), [`queryCache.js`](client/src/services/queryCache.js))**:
  - Added HR/Admin-only `Cancel Approved` action and mandatory reason confirmation modal in `LeavesPage.jsx`, cancelled reason rendering, lazy `Future Payroll Adjustments` tab in `PayrollPage.jsx`, and `'payroll'` cache invalidation on `/leaves/.../cancel`.

### 2. Tests Added & Updated
- [`server/tests/phase61ApprovedLeaveCancel.test.js`](server/tests/phase61ApprovedLeaveCancel.test.js) (**4 / 4 passed**) & updated [`server/tests/phase6WorkflowE2E.test.js`](server/tests/phase6WorkflowE2E.test.js) (employee Approved cancel `403` guard).
- [`client/src/__tests__/phase61ApprovedLeaveCancelUI.test.jsx`](client/src/__tests__/phase61ApprovedLeaveCancelUI.test.jsx) (**3 / 3 passed**).

### 3. Phase 6.1 Final Verification Results
- **Backend Syntax Check (`server/src/**/*.js`)**: `94` files checked, `0` errors.
- **Backend Suite (`cd server; npm test`)**: **5 files, 61 passed, 0 failed, 0 skipped** (`enterpriseHRMS: 24`, `phase4Security: 15`, `phase5Functional: 8`, `phase6WorkflowE2E: 10`, `phase61ApprovedLeaveCancel: 4`).
- **Frontend Suite (`cd client; npm test`)**: **5 files, 38 passed, 0 failed, 0 skipped** (`phase3Verification: 18`, `phase3Integration: 6`, `phase5Integration: 5`, `phase6WorkflowIntegration: 6`, `phase61ApprovedLeaveCancelUI: 3`).
- **Frontend Build (`cd client; npm run build`)**: Vite production build succeeded (`2109 modules`, `0` errors).
- **Live DB Safety**: MongoDB Atlas `pr_vision_hrms` untouched (`0` writes); ready for Phase 7 upon explicit approval.

---

## Phase 7: Enterprise Performance Profiling & Load Testing Audit (Completed — Read-Only)

> [!NOTE]
> Phase 7 conducted a strictly **read-only** performance audit covering production bundle metrics, React/API profiling, live Atlas index & RTT telemetry, Atlas-mirrored `.explain()` plans, and isolated staging load tests (`10 / 25 / 50` concurrent users). **Zero application source files, packages, `.env` configs, or live MongoDB Atlas (`pr_vision_hrms`) records/indexes were modified.** Complete audit findings and ranked remediation roadmap: [`server/docs/PHASE7_PERFORMANCE_AUDIT.md`](server/docs/PHASE7_PERFORMANCE_AUDIT.md).

### 1. Key Empirical Findings
- **Live MongoDB Atlas Telemetry (`pr_vision_hrms` Read-Only):** Initial connect `666.98 ms`; 5-sample warm ping RTT avg **`42.62 ms`** across `29` collections. `SYNC_INDEXES=false` leaves index gaps on `payrollruns`, `jobopenings`, `candidates`, `announcements`, `documents`, `designations`, `branches`, `performancereviews`, and `trainingprograms` (confirmed `COLLSCAN + SORT` in Atlas-mirrored explain plans), plus `employees` missing `{ isDeleted: 1, departmentId: 1, createdAt: -1 }` (`inMem SORT`) while carrying `15` indexes.
- **Controlled Staging Load Tests (`MongoMemoryServer`, `300` Emps / `3,000` Att / `600` Leaves):**
  - *Admin-Heavy 7-Endpoint Mix:* **`10` users:** `74.94 RPS`, `p95 202.21 ms`, EL lag `p99 50.82 ms`; **`25` users:** `67.66 RPS`, `p95 601.02 ms`, EL lag `p99 108.40 ms`; **`50` users:** `62.73 RPS`, `p95 1409.32 ms`, `p99 1701.41 ms`, `/dashboard/stats` **`avg 1329.07 ms` / `max 1753.25 ms`**, EL lag `p99 192.02 ms`, CPU `131.7%` (`0` errors, `RATE_LIMIT_MAX=100000`).
  - *Realistic Role Split (`50` Distinct Users: `5` Admin/HR + `45` ESS):* `274.14 RPS`, `p95 293.03 ms`, `p99 404.15 ms`, EL lag `p99 37.39 ms` (`0` errors).
- **Critical & High Bottlenecks Isolated:**
  1. `dashboardController.js` (`getDashboardStats`): pulls full `Employee` & 7-day `Attendance` collections into JS loops over `2` sequential batches (`11` queries × `42.62 ms` Atlas RTT; saturates CPU at `50` concurrency).
  2. Live Atlas index sync gaps (`COLLSCAN + SORT` across `5+` modules) & redundant `employees` single-field indexes.
  3. `authMiddleware.js` (`authenticate`): cold cache miss latency (`14.58 ms` vs `3.49 ms` warm, `4.18×`) with unprojected `.populate('employeeId')`.
  4. `DashboardPage.jsx` static `recharts` import (`charts-*.js` **`395.22 kB`** / **`108.82 kB` gzip**) downloaded even by 4 roles without charts.
  5. `app.js` missing HTTP `compression()` (`getEmployees?limit=100` sends `111.75 KB` uncompressed JSON across `6` `.populate()` queries; fetched across `5` dropdown pages without a slim lookup endpoint).
  6. `AttendancePage.jsx` root 1-second `setInterval` causing `60` full-table React reconciliations/minute.
- **Browser Profiling Disclosure:** Automated Chrome DevTools attachment against our isolated staging SPA (`localhost:4173`) was **blocked** by inactive browser remote debugging (`DevToolsActivePort` `ENOENT`); live browser FCP/LCP, DOM node counts, and heap telemetry remain pending Chrome debugging availability.

### 2. Audit Hygiene & Next Stage
- Staging server/UI daemons stopped cleanly; user workspace processes untouched; repository source unchanged (`server/src/*`, `client/src/*` clean relative to Phase 6.1).
- Ready for **Phase 8 — Performance Optimization Implementation** upon explicit approval.

---

## Phase 8 — Batch A: Safe Performance Optimizations (Completed)

> [!NOTE]
> Implemented **Phase 8 Batch A** strictly within safe application boundaries: zero MongoDB Atlas data/index modifications, `SYNC_INDEXES` left `false`, no `tenantId` schema migration, zero `.env` or dependency churn (`node:zlib` used instead of adding third-party packages), and existing RBAC/payroll/workflow rules preserved.

### 1. Summary of Changes
- **Attendance Page Re-Render Isolation ([`AttendancePage.jsx`](client/src/pages/attendance/AttendancePage.jsx))**: Moved per-second `currentTime` state and `setInterval(..., 1000)` out of `AttendancePage` into an isolated `React.memo` leaf component `LiveAttendanceClock`, eliminating full-page / attendance-table reconciliation ticks (`0` table row re-renders over 10 ticks) while preserving unmount `clearInterval` cleanup.
- **Lazy Recharts Chart Chunking ([`AttendanceTrendChart.jsx`](client/src/pages/dashboard/AttendanceTrendChart.jsx), [`DashboardPage.jsx`](client/src/pages/dashboard/DashboardPage.jsx))**: Extracted Recharts (`ResponsiveContainer`, `BarChart`, etc.) from static top-level imports into `React.lazy(() => import('./AttendanceTrendChart'))` wrapped in `<Suspense>`, ensuring `charts-*.js` (`395.22 kB` / `108.82 kB` gzip) is only fetched asynchronously when an Admin/HR dashboard renders non-empty attendance trends (excluded entirely for Employee, Manager, Recruiter, and Payroll Admin roles).
- **Auth Middleware Query Projections ([`authMiddleware.js`](server/src/middleware/authMiddleware.js))**: Added explicit `AUTH_EMPLOYEE_SELECT` projection to `User.populate('employeeId')` and fallback `Employee.findOne` queries, and `.select('-refreshTokenHash -__v')` to `UserSession.findOne(...).lean()` + `-__v` on `User.findById`, dropping heavy PII/financial subdocuments (`bankDetails`, `education`, `previousEmployment`, `address`, `emergencyContact`, `exitInterviewNotes`) from auth context and shrinking `/auth/me` decoded size by `35.9%` (`3,405 B -> 2,184 B`) while cutting 29-user cold-auth average latency from `5.19 ms` to `4.13 ms` locally.
- **Safe HTTP Gzip Compression ([`compressionMiddleware.js`](server/src/middleware/compressionMiddleware.js), [`app.js`](server/src/app.js))**: Implemented built-in `node:zlib` `gzip` compression middleware for compressible JSON/text/CSV responses `>= 1024` bytes (shrinking `GET /employees?limit=100` wire payload by **`97.2%`**, `145,807 B -> 4,142 B`), while bypassing payloads `< 1024 B`, `HEAD`, `x-no-compression`, `Accept-Encoding: identity`, `application/pdf` payslips, and `res.download()` static file streams (`Accept-Ranges`).

### 2. Batch A Verification Results
- **Backend Syntax Check (`server/src/**/*.js` + `phase8BatchA.test.js`)**: `96` files checked, `0` errors.
- **Backend Test Suite (`cd server; npm test`)**: **6 files, 63 passed, 0 failed, 0 skipped** (includes new `tests/phase8BatchA.test.js`).
- **Frontend Test Suite (`cd client; npm test`)**: **6 files, 40 passed, 0 failed, 0 skipped** (includes new `src/__tests__/phase8BatchA.test.jsx`).
- **Frontend Production Build (`cd client; npm run build`)**: Vite production build succeeded (`2110 modules`, `0` errors); `AttendanceTrendChart` split into async `0.81 kB` chunk referencing `charts-xXJIdj8n.js` (`395.22 kB` / `108.82 kB` gzip) strictly inside dynamic `__vite__mapDeps`.
- **Atlas Safety & Scope Boundary**: Live MongoDB Atlas `pr_vision_hrms` data and indexes remain untouched (`0` writes); Batch B/C optimizations (index sync, dashboard aggregations, pagination UI) remain deferred per scope.

---

## Phase 8 — Batch B: Database Query & Dashboard API Optimization (Completed)

> [!NOTE]
> Implemented **Phase 8 Batch B** strictly within backend query, schema index definitions, and migration planning boundaries: live MongoDB Atlas `pr_vision_hrms` data and indexes were **NOT** modified (`SYNC_INDEXES` remains `false`), no `tenantId` schema migration or `.env`/dependency changes were made, zero stale dashboard caching was introduced, and frontend UI migration to `/employees/options` stays deferred to Batch C. Complete audit, explain comparison, and benchmarks: [`server/docs/PHASE8_BATCH_B_REPORT.md`](server/docs/PHASE8_BATCH_B_REPORT.md).

### 1. Summary of Changes
- **Reversible Index Migration Plan & Non-Destructive Schema Sync ([`migrateIndexesBatchB.js`](server/src/scripts/migrateIndexesBatchB.js), `server/src/models/*.js`):** Defined `38` additive indexes (`{ background: true }`) across `15` models (`PayrollRun`, `JobOpening`, `Candidate`, `Announcement`, `Document`, `Designation`, `Branch`, `PerformanceReview`, `TrainingProgram`, `TrainingAssignment`, `ExpenseClaim`, `Grievance`, `Shift`, `PayrollAdjustment`, `Employee`) eliminating `COLLSCAN` + in-memory `SORT` across audited list/dashboard/options queries. Safe `--dry-run` default CLI (`up` / `down` reversible on the 38 Batch B indexes); `19` subsumed single-field/prefix indexes documented as optional manual DBA cleanup candidates (`REDUNDANT_INDEX_CANDIDATES`, never auto-dropped).
- **Dashboard API Aggregation & Parallelization ([`dashboardController.js`](server/src/modules/dashboard/dashboardController.js)):** Replaced full `Employee` and 7-day `Attendance` collection downloads into Node memory with server-side MongoDB `$facet` aggregations, merged Admin/HR sequential `Promise.all` phases into a single parallel batch, parallelized Manager non-dependent feeds alongside `teamEmployees` / indexed `$in` counts, and added strict `.select()` projections while maintaining exact numeric/structural parity across all 6 dashboard roles (`100%` deep equality verified before vs. after) and real-time freshness (Admin `-50.8%`, HR `-57.6%`, Payroll `-55.1%`, Employee ESS `-68.2%` local latency reduction).
- **Lightweight Employee Options Endpoint ([`employeeRoutes.js`](server/src/modules/employees/employeeRoutes.js), [`employeeController.js`](server/src/modules/employees/employeeController.js)):** Added `GET /api/v1/employees/options` (registered before `/:id`) returning strictly `_id`, `employeeId`, `firstName`, `lastName`, and `email` with zero `.populate()` calls and zero PII/bank/address exposure. Supports `search`, `departmentId`, `branchId`, `status`, `includeInactive`, and bounded pagination (`defaultLimit: 50`, `maxLimit: 200`); excludes soft-deleted and exited employees by default; mirrors `/employees` RBAC scope (`ADMIN`/`HR_MANAGER`/`PAYROLL_ADMIN` org-wide, `MANAGER` direct reports only, `EMPLOYEE`/`RECRUITER` blocked with `403`); cuts `limit=100` uncompressed payload by `87.6%` (`112,897 B -> 14,009 B`) and latency by `3.37x` (`36.93 ms -> 10.97 ms`), while preserving full backward compatibility for `GET /api/v1/employees`.

### 2. Batch B Verification Results
- **Backend Syntax Check (`server/src/**/*.js`, `server/tests/**/*.js`)**: `113` files checked, `0` errors.
- **Backend Test Suite (`cd server; npm test`)**: **8 files, 81 passed, 0 failed, 0 skipped** (includes new [`tests/phase8BatchB.test.js`](server/tests/phase8BatchB.test.js) covering dashboard parity/isolation/freshness, `/employees/options` RBAC/filters/projections, `/employees` backward compatibility, explain plan `IXSCAN` verification, and reversible index migration rollback/reapply).
- **Frontend Test Suite (`cd client; npm test`)**: **6 files, 40 passed, 0 failed, 0 skipped**.
- **Frontend Production Build (`cd client; npm run build`)**: Vite production build succeeded (`2110 modules`, `0` errors).
- **Live DB Safety**: `SYNC_INDEXES` confirmed `'false'`; live MongoDB Atlas `pr_vision_hrms` untouched; `server/uploads/` empty (`0` files).

---

## Phase 8 — Batch C: Frontend API Adoption & End-to-End Verification (Completed)

> [!NOTE]
> Implemented **Phase 8 Batch C** adopting `GET /api/v1/employees/options` safely across the 4 dropdown-only consumer modules while preserving RBAC, backward compatibility, request deduplication/cancellation, and zero production Atlas or configuration edits. Interactive Chrome DevTools verification remained **Pending** due to unavailable Chrome remote debugging (`DevToolsActivePort` `ENOENT`). Complete findings and measurements: [`server/docs/PHASE8_BATCH_C_REPORT.md`](server/docs/PHASE8_BATCH_C_REPORT.md).

### 1. Summary of Changes
- **Reusable Options Hook & Picker ([`useEmployeeOptions.js`](client/src/hooks/useEmployeeOptions.js), [`EmployeeOptionPicker.jsx`](client/src/components/common/EmployeeOptionPicker.jsx)):** Built shared hook & accessible single/multi selector with debounced server search (`250 ms`), `Load more` pagination (`limit: 20`), `AbortController` cancellation, sequence-number stale-response protection, loading/empty/error/retry states, `queryCache` `60s` caching/tag invalidation, and selection label preservation across search/pagination/reopen.
- **Migrated Dropdown Consumers:**
  - [`AssetsPage.jsx`](client/src/pages/assets/AssetsPage.jsx), [`DocumentsPage.jsx`](client/src/pages/documents/DocumentsPage.jsx), [`PerformancePage.jsx`](client/src/pages/performance/PerformancePage.jsx), [`TrainingPage.jsx`](client/src/pages/training/TrainingPage.jsx): Eliminated eager `GET /employees?limit=100` calls on mount (`0` employee requests while browsing tables/lists) and loaded lightweight options lazily only when opening Assign / Upload / Initiate / Enroll modals (`112,388 B -> 2,801 B` raw JSON, **`-97.5%`**; `3,700 B -> 499 B` gzip, **`-86.5%`**; `45.27 ms -> 11.36 ms`, **`3.99x faster`** on page 1).
- **Intentionally Retained on Full `/employees`:** [`EmployeesPage.jsx`](client/src/pages/employees/EmployeesPage.jsx) stays on `GET /api/v1/employees?limit=100` because its directory table and edit workflows require populated department/designation/branch/manager/shift/user metadata.

### 2. Batch C Verification Results
- **Backend Syntax Check (`server/src/**/*.js`, `server/tests/**/*.js`)**: `114` files checked, `0` errors.
- **Backend Test Suite (`cd server; npm test`)**: **9 files, 83 passed, 0 failed, 0 skipped** (includes new [`tests/phase8BatchC.test.js`](server/tests/phase8BatchC.test.js)).
- **Frontend Test Suite (`cd client; npm test`)**: **7 files, 46 passed, 0 failed, 0 skipped** (includes new [`src/__tests__/phase8BatchC.test.jsx`](client/src/__tests__/phase8BatchC.test.jsx) + lazy modal await in [`phase6WorkflowIntegration.test.jsx`](client/src/__tests__/phase6WorkflowIntegration.test.jsx)).
- **Frontend Production Build (`cd client; npm run build`)**: Vite production build succeeded (`2112` modules transformed, `0` errors).
- **Live DB & Environment Safety**: `SYNC_INDEXES` confirmed `'false'`, `autoIndex` disabled in non-test startup, Batch B index migration not executed, `.env` and `package.json` unmodified, live Atlas `pr_vision_hrms` untouched, and `server/uploads/` empty (`0` files).

---

## Phase 8 — Batch D & Final Consolidated System Audit, Hardening & Release Readiness (Completed)

> [!NOTE]
> Completed **Phase 8 Batch D & Final Consolidated Project Audit**: resolved the Manager training self-enrollment scope discrepancy, hardened request input sanitization against NoSQL `$`-operator and prototype-pollution payloads, validated ObjectId query filters and notification ownership, aligned frontend RBAC controls (`ShiftsPage`, `ReportsPage`, `GrievancesPage`, `DashboardPage`), verified streaming compression and Batch B 38-index reversible migration on isolated `MongoMemoryServer`, audited single-tenant vs. multi-tenant readiness across all `31` Mongoose models, and produced [`server/docs/PR_VISION_HRMS_FINAL_AUDIT_REPORT.md`](server/docs/PR_VISION_HRMS_FINAL_AUDIT_REPORT.md), [`server/docs/PR_VISION_HRMS_MANUAL_TESTING_CHECKLIST.md`](server/docs/PR_VISION_HRMS_MANUAL_TESTING_CHECKLIST.md), and [`server/docs/PHASE8_FINAL_RELEASE_READINESS_REPORT.md`](server/docs/PHASE8_FINAL_RELEASE_READINESS_REPORT.md).

### 1. Summary of Changes
- **Manager Training Self-Enrollment Compatibility ([`employeeController.js`](server/src/modules/employees/employeeController.js), [`trainingController.js`](server/src/modules/training/trainingController.js), [`useEmployeeOptions.js`](client/src/hooks/useEmployeeOptions.js), [`TrainingPage.jsx`](client/src/pages/training/TrainingPage.jsx)):** Added explicit opt-in `?includeSelf=true` support on `GET /api/v1/employees/options` for `ROLES.MANAGER` (`$or: [{ managerId: req.verifiedEmployeeId }, { _id: req.verifiedEmployeeId }]` intersected safely with `search` via `$and`), passed `includeSelf: true` exclusively in `TrainingPage.jsx` while keeping `AssetsPage.jsx`, `DocumentsPage.jsx`, `PerformancePage.jsx`, and `GET /api/v1/employees` strictly direct-reports-only, and hardened `assignTraining` to verify all submitted `employeeIds` correspond to active (`isDeleted: false`) employee records.
- **NoSQL Operator Stripping, Filter Validation & Notification Ownership ([`securityUtils.js`](server/src/utils/securityUtils.js), [`app.js`](server/src/app.js), [`departmentController.js`](server/src/modules/departments/departmentController.js), [`attendanceController.js`](server/src/modules/attendance/attendanceController.js), [`recruitmentController.js`](server/src/modules/recruitment/recruitmentController.js), [`reportController.js`](server/src/modules/reports/reportController.js), [`notificationController.js`](server/src/modules/notifications/notificationController.js)):** Added `sanitizeRequestInputs` (`stripUnsafeKeys`) middleware stripping `$`-prefixed and `__proto__`/`constructor`/`prototype` keys across `req.body`, `req.query`, and `req.params`, added explicit `isValidObjectId` checks on `departmentId` and `branchId` query filters, and hardened `PATCH /api/v1/notifications/:id/read` with `isValidObjectId(id)` (`400`) and ownership/existence (`404`) verification.
- **Frontend Role Visibility Alignment ([`ShiftsPage.jsx`](client/src/pages/shifts/ShiftsPage.jsx), [`ReportsPage.jsx`](client/src/pages/reports/ReportsPage.jsx), [`GrievancesPage.jsx`](client/src/pages/grievances/GrievancesPage.jsx), [`DashboardPage.jsx`](client/src/pages/dashboard/DashboardPage.jsx)):** Gated shift creation/edit/archive controls to `SUPER_ADMIN`/`ADMIN`/`HR_MANAGER`, hid the `Payroll` report tab for `MANAGER` on `ReportsPage`, and included `SUPER_ADMIN` (plus assigned non-confidential `MANAGER` on grievances) in `DashboardPage` and `GrievancesPage`.
- **Parallel Test Isolation Fix ([`compressionMiddleware.test.js`](server/tests/compressionMiddleware.test.js), [`phase8BatchA.test.js`](server/tests/phase8BatchA.test.js), [`phase8BatchA.test.jsx`](client/src/__tests__/phase8BatchA.test.jsx)):** Prevented cross-worker `UPLOAD_ROOT` cleanup races during parallel static download tests and increased lazy Recharts render timeout under multi-worker CPU load.

### 2. Final Verification & Release Readiness Status
- **Backend Syntax Check (`server/src/**/*.js`, `server/tests/**/*.js`)**: `115` files checked, `0` errors (**PASS**).
- **Backend Test Suite (`cd server; npm test`)**: **10 files, 88 passed, 0 failed, 0 skipped** — includes new [`tests/phase8BatchD.test.js`](server/tests/phase8BatchD.test.js) (**PASS**).
- **Frontend Test Suite (`cd client; npm test`)**: **8 files, 49 passed, 0 failed, 0 skipped** — includes new [`src/__tests__/phase8BatchD.test.jsx`](client/src/__tests__/phase8BatchD.test.jsx) (**PASS**).
- **Frontend Production Build (`cd client; npm run build`)**: `2112` modules transformed in `17.89s` (**PASS**).
- **Index Migration Dry-Run (`migrateIndexesBatchB.js` UP & DOWN)**: `38` planned additive indexes and `19` manual cleanup candidates verified in dry-run and isolated `MongoMemoryServer` `apply -> rollback -> reapply` cycle (**PASS**; production Atlas rollout **PENDING** DBA window).
- **Browser UI Verification & Manual Testing Checklist**: **PENDING** (`DevToolsActivePort` `ENOENT`, no local Playwright/Puppeteer/WebDriver installed; documented with 22-scenario checklist and verified 7-role x 18-endpoint live HTTP matrix in [`server/docs/PR_VISION_HRMS_MANUAL_TESTING_CHECKLIST.md`](server/docs/PR_VISION_HRMS_MANUAL_TESTING_CHECKLIST.md)).
- **Independent Payroll & Post-Lock Adjustment Verification**: **PASS** (`4` deterministic employee profiles + paid-run lock immutability + approved unpaid leave cancellation `CREDIT` adjustment settlement verified rupee-for-rupee in [`server/docs/PR_VISION_HRMS_FINAL_AUDIT_REPORT.md`](server/docs/PR_VISION_HRMS_FINAL_AUDIT_REPORT.md#L107-L135)).
- **Tenant Isolation Assessment**: **PASS WITH LIMITATIONS** for single-tenant `pr_vision_hrms`; **BLOCKED** for multi-tenant SaaS (`1/31` models [`UserSession`] has `tenantId`; `30/31` models require future tenant schema migration).
- **Final Release Decision**: **`READY FOR SINGLE-ORGANIZATION PRODUCTION AFTER EXPLICIT APPROVAL`** (immediately **`READY FOR SINGLE-ORGANIZATION STAGING`**; **`NOT READY`** for multi-organization shared-DB SaaS).

