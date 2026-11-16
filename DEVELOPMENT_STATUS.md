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



