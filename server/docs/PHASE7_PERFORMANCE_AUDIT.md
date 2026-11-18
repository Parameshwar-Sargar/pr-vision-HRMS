# PR VISION HRMS — Phase 7 Enterprise Performance Profiling & Load Testing Audit

**Audit Date:** 2026-11-16  
**Project:** PR VISION HRMS (`client/` React 18 + Vite 6 + Redux Toolkit + Recharts + TailwindCSS | `server/` Node.js + Express 4 + Mongoose 8 + MongoDB Atlas `pr_vision_hrms`)  
**Audit Mode:** **STRICT READ-ONLY** — zero modifications to application source code (`client/src/*`, `server/src/*`), `package.json`, `.env`, or live MongoDB Atlas (`pr_vision_hrms`) records or indexes.  
**Live DB Protection:** Live MongoDB Atlas (`pr_vision_hrms`) was queried strictly read-only for network ping RTT (`listCollections` / `ping`) and index inventory (`indexes()`). All explain benchmarks and load tests executed against isolated local `MongoMemoryServer` staging environments.

---

## 1. Executive Summary & Environment Baseline

### 1.1 Why the Application Feels Heavy & Slow (Core Diagnosis)
Empirical profiling isolated five primary compounding latency sources rather than a single failure:
1. **WAN RTT Amplification (`42.62 ms` average Atlas ping RTT) × Unindexed / Multi-Hop Queries:** While local in-memory loopback queries execute in `3–31 ms`, live Atlas introduces `~43 ms` per sequential network hop (`connectMs: 666.98 ms`). Sequential `.populate()` chains (e.g., `employeeController.js` `getEmployees` issuing `6` populates per call, `authMiddleware.js` `authenticate` issuing `2` sequential hops via `.populate('branchId').populate('employeeId')` on every cache miss), unindexed collection sorts (`announcements`, `payrollruns`, `jobopenings`, `candidates`, `documents`), and `dashboardController.js` `getDashboardStats` (`2` sequential `Promise.all` phases across `11` DB calls + in-memory loops) multiply WAN roundtrips directly into UI wait time.
2. **Backend CPU / Event-Loop Saturation Under Admin Concurrency:** Under `50` simultaneous Admin API workers (`RATE_LIMIT_MAX` relaxed for throughput measurement), single-threaded Node.js + in-memory driver CPU saturated at `131.7%`, collapsing `p95` response latency from `202.21 ms` (`10` users) → `601.02 ms` (`25` users) → `1409.32 ms` (`50` users), with `/dashboard/stats` degrading to **`1329.07 ms` avg / `1753.25 ms` max** and `p99` event loop delay reaching **`192.02 ms`**.
3. **Uncompressed Payloads (`~111.75 KB` JSON on `/employees?limit=100`):** `server/src/app.js` registers zero `compression()` middleware. Five separate frontend management pages (`EmployeesPage`, `AssetsPage`, `DocumentsPage`, `PerformancePage`, `TrainingPage`) automatically request `/employees?limit=100` on mount, transferring `~111.75 KB` uncompressed JSON even when only a name/ID dropdown is needed.
4. **Heavy Initial Frontend Chart Bundle (`395.22 kB` / `108.82 kB` gzip) & Unpaginated Tables:** `DashboardPage.jsx` statically imports `recharts`, causing all roles—including `EMPLOYEE`, `MANAGER`, `RECRUITER`, and `PAYROLL_ADMIN` whose dashboards never render `<BarChart>`—to trigger/depend on the `395.22 kB` `charts` chunk. Meanwhile, `EmployeesPage` (`100` rows), `ReportsPage`, `LeavesPage`, and `PayrollPage` render tables without UI pagination controls and rely on client-side `.filter()` (`EmployeesPage`).
5. **1-Second Root Component Re-Renders on Attendance Page:** `AttendancePage.jsx` stores `currentTime` at the root component with a `1000 ms` `setInterval`, forcing full Virtual DOM reconciliation of the entire attendance table and all action modals `60` times per minute (unlike `DashboardPage.jsx`, which already isolates its clock inside `React.memo` `LiveClockDisplay`).

### 1.2 Baseline Environment & Infrastructure Snapshot
| Component | Observed Configuration / Measurement | Source Verified |
| :--- | :--- | :--- |
| Live MongoDB Atlas Ping RTT | Connect: **`666.98 ms`** \| 5 warm pings: `[53.65, 45.44, 34.01, 40.1, 39.9] ms` \| Avg: **`42.62 ms`** | Read-only Atlas probe (`29` collections) |
| DB Connection Pool | `minPoolSize: 5`, `maxPoolSize: 20`, `SYNC_INDEXES: false`, `bufferCommands: false` | [`server/src/config/db.js`](../src/config/db.js#L5-L61), [`env.js`](../src/config/env.js#L18-L30) |
| Rate Limiter Default | `RATE_LIMIT_WINDOW_MS: 900000` (`15m`), `RATE_LIMIT_MAX: 1000` keyed by `req.ip` across `/api` | [`server/src/app.js`](../src/app.js#L47-L58), [`env.js`](../src/config/env.js#L39-L40) |
| HTTP Compression | None (`compression` package not installed in `server/package.json` or `app.js`) | [`server/package.json`](../package.json#L15-L29), [`app.js`](../src/app.js#L1-L64) |
| Password Hashing | `bcryptjs` cost factor `10` (`POST /auth/login` `avg 101.61 ms` / `p95 109.81 ms` per login) | [`server/src/models/User.js`](../src/models/User.js#L69) |
| Staging Synthetic Dataset | `300` Employees, `3,000` Attendances, `600` LeaveRequests, `300` Payslips, `200` Candidates, `200` Documents, `100` Announcements, `300` AuditLogs (Seed: `1515 ms`) | Isolated `MongoMemoryServer` staging harness |

---

## 2. Frontend Performance Audit

### 2.1 Production Bundle Analysis (`vite build`, `2109 modules` in `9.50 s`)
Built into an isolated temporary output directory (`vite 6.0.11` / `6.4.5`) with zero repository edits:

| Built Asset Chunk | Raw Size | Gzip Size | Primary Contents / Concern |
| :--- | ---: | ---: | :--- |
| `charts-xXJIdj8n.js` | **`395.22 kB`** | **`108.82 kB`** | **`recharts` (`2.15.0`) + `d3` transitive modules** — statically imported on `DashboardPage` even for 4 roles with no chart UI |
| `vendor-BBE_dZcV.js` | **`207.78 kB`** | **`69.43 kB`** | `react`, `react-dom`, `react-router-dom`, `@reduxjs/toolkit`, `react-redux` |
| `index-BSvICJk4.js` | **`117.20 kB`** | **`39.87 kB`** | App shell, `LoginPage`, Redux store, Axios `api.js` + `queryCache`, `Navbar`, `DashboardLayout` |
| `index-BeiV-SYA.css` | **`38.97 kB`** | **`6.83 kB`** | Compiled Tailwind CSS |
| `EmployeesPage-*.js` | `32.17 kB` | `6.18 kB` | Lazy route chunk (Employee directory + modals) |
| `CompanySettingsPage-*.js` | `31.18 kB` | `6.78 kB` | Lazy route chunk |
| `icons-B2mJ_dep.js` | `27.23 kB` | `5.80 kB` | Shared `lucide-react` icon bundle (`0.474.0`) |
| `RecruitmentPage-*.js` | `26.51 kB` | `5.35 kB` | Lazy route chunk |
| `DashboardPage-*.js` | `22.86 kB` | `4.82 kB` | Lazy route chunk (statically pulls `charts-*.js`) |
| `DepartmentsPage-*.js` | `21.58 kB` | `3.99 kB` | Lazy route chunk |
| `LeavesPage-*.js` | `19.32 kB` | `4.84 kB` | Lazy route chunk |
| `TrainingPage-*.js` | `16.53 kB` | `3.90 kB` | Lazy route chunk |
| `AttendancePage-*.js` | `15.32 kB` | `3.87 kB` | Lazy route chunk (root `1s` interval re-render) |
| `PerformancePage-*.js` | `15.04 kB` | `3.54 kB` | Lazy route chunk |
| `PayrollPage-*.js` | `13.74 kB` | `3.48 kB` | Lazy route chunk |
| Remaining 7 lazy route chunks (`Assets` down to `ForgotPassword`) | `4.51 – 12.45 kB` | `1.61 – 3.18 kB` | Lazy route chunks |
| `index.html` | `1.94 kB` | `0.77 kB` | External blocking font stylesheet `fonts.googleapis.com` (`Inter: 7 weights 300–900`) |

- **Code-Splitting Effectiveness:** Route-level lazy loading is properly configured in [`client/src/App.jsx`](../../client/src/App.jsx#L14-L33) (`18` lazy routes; only `LoginPage` + shell eager). However, [`DashboardPage.jsx`](../../client/src/pages/dashboard/DashboardPage.jsx#L30-L39) top-imports `ResponsiveContainer, BarChart, ... from 'recharts'`, forcing the browser to download and parse `395.22 kB` (`108.82 kB` gzip) whenever **any** logged-in role visits `/dashboard` (`EMPLOYEE`, `MANAGER`, `RECRUITER`, `PAYROLL_ADMIN` never mount `<BarChart>` per lines `475–600`).

### 2.2 React Rendering, API Fan-Out & UI Patterns Observed
1. **Unisolated 1-Second Root Re-Render ([`AttendancePage.jsx`](../../client/src/pages/attendance/AttendancePage.jsx#L22-L52)):**
   - Line `27`: `const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());`
   - Lines `47–52`: `useEffect(() => { const timer = setInterval(() => { setCurrentTime(...); }, 1000); ... }, []);`
   - Result: Every `1,000 ms`, the entire `AttendancePage` component re-executes, recreating closure handlers (`onClick={() => { setSelectedRecord(rec); ... }}`) and diffing every `<tr>` in `attendance.map(...)` (lines `256–360`) on both desktop and mobile viewports.
2. **Repeated Unprojected `/employees?limit=100` Fetches Across 5 Pages:**
   - [`EmployeesPage.jsx`](../../client/src/pages/employees/EmployeesPage.jsx#L82): `params = { limit: 100 }` (`cacheTtl: 10000`), then client-side filter `employees.filter(...)` at lines `291–297`, with zero UI pagination buttons even though backend `getEmployees` supports `page` & `limit`.
   - [`AssetsPage.jsx`](../../client/src/pages/assets/AssetsPage.jsx#L49), [`DocumentsPage.jsx`](../../client/src/pages/documents/DocumentsPage.jsx#L65), [`PerformancePage.jsx`](../../client/src/pages/performance/PerformancePage.jsx#L49), and `TrainingPage.jsx:59` each fire `/employees?limit=100` (`111.75 KB` uncompressed payload, 6 populates) purely to populate employee `<select>` dropdowns. (Even with Phase 3 `cacheTtl: 60000`, navigating across modules or after 60s re-fetches full populated employee objects instead of a lightweight `{ _id, firstName, lastName, employeeId }` lookup endpoint.)
3. **Unpaginated Management Tables & Mixed Page Defaults:**
   - [`LeavesPage.jsx`](../../client/src/pages/leaves/LeavesPage.jsx#L100-L103) fires 3 parallel calls (`/leaves/balances`, `/leaves/requests`, `/leaves/types`) with `cacheTtl: 10000` (`300000` for types), relying silently on backend `defaultLimit: 20` with no Next/Previous page controls in UI.
   - [`PayrollPage.jsx`](../../client/src/pages/payroll/PayrollPage.jsx#L70-L73) fires `/payroll/runs` + `/payroll/payslips` without page navigation controls.
   - [`RecruitmentPage.jsx`](../../client/src/pages/recruitment/RecruitmentPage.jsx#L85-L98) dispatches `fetchMasterData(false)` plus `/recruitment/jobs` and `/recruitment/candidates` (up to `50` rows) without pagination UI.
   - [`ReportsPage.jsx`](../../client/src/pages/reports/ReportsPage.jsx#L21-L37) fetches up to `100` rows per tab and hardcodes `import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'` on CSV download.
4. **Blocking External Google Fonts CSS ([`client/index.html`](../../client/index.html#L25-L30)):**
   - External `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />` triggers external DNS + TLS + CSS + `woff2` fetches for 7 font weights on initial cold load and introduces render/FOUT delay on restricted corporate networks or throttled mobile connections.
5. **Navbar Notifications Fetch ([`Navbar.jsx`](../../client/src/components/layout/Navbar.jsx#L21-L48)):**
   - Fetches `/notifications` (`cacheTtl: 15000`) once on layout mount and via event listener `hrms:data-mutated` (zero aggressive timer polling—positive from Phase 3).
   - [`App.jsx`](../../client/src/App.jsx#L60-L67) calls `fetchMe()` only when an existing `sessionStorage` tab token is present on reload (avoiding redundant `/auth/me` on fresh login—positive from Phase 3).

### 2.3 Live Browser Instrumentation Status (Chrome DevTools)
- **Status:** **BLOCKED (Environment Remote Debugging Inactive)** — Automated Chrome DevTools profiling against our isolated staging SPA (`http://localhost:4173` backed by isolated staging server `http://127.0.0.1:5009`) could not attach and stopped immediately:
  ```text
  Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled
  Cause: Could not find DevToolsActivePort for chrome at C:\Users\admin\AppData\Local\Google\Chrome\User Data\DevToolsActivePort (ENOENT)
  ```
- Consequently, live browser FCP/LCP, desktop/mobile viewport DOM element counts (`1440x900`, `390x844`), and live JS heap snapshots remain unmeasured in-browser until Chrome remote debugging is enabled on the workstation. (Staging test ports `5009`/`4173` were torn down immediately; user dev ports `5000`/`5173` were untouched.)

---

## 3. Backend Performance Audit

### 3.1 Single-User Sequential Endpoint Baseline (`MongoMemoryServer` Local Loopback)
Measured over `15` warm sequential requests per endpoint against `300` Employees, `3,000` Attendances, `600` LeaveRequests, `300` Payslips, `200` Candidates, `200` Documents, `100` Announcements, `300` AuditLogs (`RATE_LIMIT_MAX=100000`, uncompressed HTTP):

| Endpoint | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Avg Payload |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **`POST /auth/login` (`bcryptjs` cost=10)** | **101.61** | **101.24** | **109.81** | **109.81** | **109.81** | `3.84 KB` |
| **`GET /dashboard/stats` (Admin — 300 emps)** | **30.41** | **30.82** | **34.91** | **34.91** | **34.91** | `6.16 KB` |
| **`GET /employees?limit=100` (6 populates)** | **20.78** | **19.81** | **31.07** | **31.07** | **31.07** | **`111.75 KB`** |
| `GET /reports/attendance` | 12.69 | 11.73 | 18.69 | 18.69 | 18.69 | `29.13 KB` |
| `GET /leaves/requests?limit=50` | 11.70 | 10.91 | 16.50 | 16.50 | 16.50 | `35.91 KB` |
| `GET /reports/employees` | 11.39 | 11.13 | 14.66 | 14.66 | 14.66 | `46.39 KB` |
| `GET /attendance?limit=50` (3k docs) | 10.88 | 10.84 | 13.12 | 13.12 | 13.12 | `31.61 KB` |
| `GET /recruitment/candidates?limit=50` | 10.05 | 10.18 | 12.52 | 12.52 | 12.52 | `30.91 KB` |
| `GET /employees?search=Emp15` | 9.96 | 9.28 | 12.63 | 12.63 | 12.63 | `12.47 KB` |
| `GET /reports/payroll` | 9.93 | 9.96 | 12.40 | 12.40 | 12.40 | **`50.21 KB`** |
| `GET /employees/:id` | 9.38 | 9.25 | 11.85 | 11.85 | 11.85 | `3.98 KB` |
| `GET /documents?limit=50` | 9.05 | 9.26 | 10.35 | 10.35 | 10.35 | `23.17 KB` |
| `GET /payroll/payslips?limit=50` | 8.32 | 8.26 | 9.36 | 9.36 | 9.36 | `29.31 KB` |
| `GET /recruitment/jobs` | 7.14 | 6.71 | 11.70 | 11.70 | 11.70 | `6.43 KB` |
| `GET /dashboard/stats` (Employee ESS) | 5.23 | 5.27 | 6.12 | 6.12 | 6.12 | `2.15 KB` |
| `GET /leaves/balances` (Employee) | 4.54 | 4.33 | 5.82 | 5.82 | 5.82 | `0.81 KB` |
| `GET /payroll/runs` | 3.74 | 3.66 | 5.01 | 5.01 | 5.01 | `0.40 KB` |

### 3.2 Heavy Synchronous Batch Operations (`MongoMemoryServer`)
| Operation | HTTP Status | Latency (ms) | Output Size | Implementation Pattern |
| :--- | ---: | ---: | ---: | :--- |
| `GET /reports/attendance?format=csv` (3,000 rows) | `200` | **`121.32 ms`** | **`239.36 KB`** | [`reportController.js`](../src/modules/reports/reportController.js#L101-L132): unpaginated `.find().populate().lean()` accumulated into one full string in RAM via `csv += ...` before `res.send(csv)` (no streaming cursor). |
| `POST /payroll/runs/generate` (300 employees) | `200` | **`274.40 ms`** | JSON summary | [`payrollController.js`](../src/modules/payroll/payrollController.js#L166-L365): batch-fetches salaries/attendances/leaves/holidays & uses `Payslip.insertMany`, but runs nested `monthHolidays.filter(...)` + `toLocalDateKey()` inside outer employee loop and parses `new Date(lr.startDate)` inside inner working-day loop. |

### 3.3 Cold vs. Warm Auth Middleware Impact
Measured across `10` distinct Employee ESS `/dashboard/stats` requests triggering cache misses vs `10` warm cache hits on local `MongoMemoryServer`:
- **Cold `authIdentityCache` miss (distinct sessions):** **`14.58 ms`** average
- **Warm `authIdentityCache` hit (`15s` GET TTL):** **`3.49 ms`** average (**`4.18×` difference** locally)
- **Root Cause in [`authMiddleware.js`](../src/middleware/authMiddleware.js#L99-L106):**
  ```js
  User.findById(decoded.userId)
    .select('-password -refreshToken')
    .populate('branchId', 'name code')
    .populate('employeeId') // <-- NO .select() projection: loads entire Employee document (bankDetails, education, emergencyContact, etc.)
    .lean()
  ```
  Because Mongoose `.populate()` executes secondary queries sequentially *after* `User.findById`, every cache miss (or any non-`GET` request, which calls `invalidateAuthCache` on lines `85–87`) incurs at least **two sequential DB roundtrips** plus full unprojected `Employee` BSON serialization. Against live Atlas (`42.62 ms` avg RTT), two sequential hops add `~85 ms` of baseline network latency before controller logic begins.

---

## 4. Database Performance Audit (Live Atlas + Atlas-Mirrored Explain Plans)

### 4.1 Live MongoDB Atlas (`pr_vision_hrms`) Index Inventory Findings (Read-Only)
Live inspection enumerated **`29` collections**. Because `SYNC_INDEXES` defaults to `false` ([`env.js`](../src/config/env.js#L26-L30)), Phase 2/5/6 schema indexes were never built in Atlas unless created manually, leaving significant gaps plus over-indexing on `employees`:

1. **Missing Sort/Filter Indexes Confirmed Live on Atlas (`indexes()` output):**
   - `payrollruns`: only `_id_`, `month_1_year_1`, `status_1` — **missing `{ year: -1, month: -1 }`** used by [`dashboardController.js`](../src/modules/dashboard/dashboardController.js#L133) and `getPayrollRuns`.
   - `announcements`: only `_id_`, `createdAt_-1` — **missing `{ isActive: 1, isPinned: -1, createdAt: -1 }`** used by [`dashboardController.js`](../src/modules/dashboard/dashboardController.js#L141-L143).
   - `jobopenings`: only `_id_`, `status_1`, `departmentId_1` — **missing `{ createdAt: -1 }` / `{ status: 1, createdAt: -1 }`** used by [`recruitmentController.js`](../src/modules/recruitment/recruitmentController.js#L72).
   - `candidates`: only `_id_`, `jobOpeningId_1_status_1`, `email_1` — **missing `{ appliedDate: -1 }` / `{ status: 1, appliedDate: -1 }`** used by [`recruitmentController.js`](../src/modules/recruitment/recruitmentController.js#L206).
   - `documents`: only `_id_`, `employeeId_1`, `category_1` — **missing `{ createdAt: -1 }`, `{ employeeId: 1, createdAt: -1 }`**.
   - `designations` (`{ level: 1, title: 1 }` / `{ createdAt: -1 }`), `branches` (`{ isHeadquarters: -1, name: 1 }`), `performancereviews` (`{ createdAt: -1 }`), `trainingprograms` (no secondary indexes at all!), `companysettings` (no secondary indexes), and `payrolladjustments` (collection not yet created on Atlas).
2. **`employees` Over-Indexing (`15` Total Indexes = `_id_` + `14` Secondary Indexes):**
   - Atlas `employees` carries both `{ isDeleted: 1 }`, `{ employmentStatus: 1 }`, `{ departmentId: 1 }`, `{ managerId: 1 }` **AND** compound prefixes `{ isDeleted: 1, employmentStatus: 1 }`, `{ isDeleted: 1, departmentId: 1 }`, `{ isDeleted: 1, managerId: 1 }` — `isDeleted_1` plus single-field indexes increase write/insert maintenance cost, while **still lacking `{ isDeleted: 1, departmentId: 1, createdAt: -1 }`**.

### 4.2 Atlas-Mirrored Explain Plans (`300` Emps / `3k` Att / `600` Leaves / `200` Cands & Docs / `100` Ann.)
*Methodology:* Replicated the exact Atlas index definitions observed on `pr_vision_hrms` inside isolated `MongoMemoryServer` (`autoIndex: false`) and ran `.explain('executionStats')`:

| Query Pattern | Collection | Winning Index | Keys Examined | Docs Examined | Returned | Scan / In-Mem Sort |
| :--- | :--- | :--- | ---: | ---: | ---: | :--- |
| `PayrollRun.find().sort({ year: -1, month: -1 })` | `payrollruns` | **`null`** | `0` | `1` | `1` | **`COLLSCAN` + `SORT`** |
| `JobOpening.find().sort({ createdAt: -1 })` | `jobopenings` | **`null`** | `0` | `10` | `10` | **`COLLSCAN` + `SORT`** |
| `Candidate.find().sort({ appliedDate: -1 })` | `candidates` | **`null`** | `0` | `200` | `200` | **`COLLSCAN` + `SORT`** |
| `Announcement.find({ isActive: true }).sort({ isPinned: -1, createdAt: -1 })` | `announcements` | **`null`** | `0` | `100` | `80` | **`COLLSCAN` + `SORT`** |
| `Document.find().sort({ createdAt: -1 })` | `documents` | **`null`** | `0` | `200` | `200` | **`COLLSCAN` + `SORT`** |
| `Employee.find({ isDeleted: false, departmentId }).sort({ createdAt: -1 })` | `employees` | `isDeleted_1_departmentId_1` | `42` | `42` | `42` | `IXSCAN` + **`inMem SORT`** |
| `Employee.find({ isDeleted: false, $or: [$regex 'Emp15'] }).sort({ createdAt: -1 })` | `employees` | `createdAt_-1` | **`300`** | **`300`** | `11` | **Full index + doc scan (`11/300` selectivity)** |
| `Employee.find({ isDeleted: false }).sort({ createdAt: -1 })` | `employees` | `createdAt_-1` | `300` | `300` | `300` | Indexed sort (`paginate limit=100` in runtime) |
| `Attendance.find({ employeeId }).sort({ date: -1 })` | `attendances` | `employeeId_1_date_1` | `10` | `10` | `10` | Clean backward `IXSCAN` |
| `Attendance.find().sort({ date: -1 })` | `attendances` | `date_1` | `3000` | `3000` | `3000` | Indexed sort (`limit=50` in runtime) |
| `LeaveRequest.find().sort({ createdAt: -1 })` | `leaverequests` | `createdAt_-1` | `600` | `600` | `600` | Indexed sort |
| `Payslip.find().sort({ year: -1, month: -1 })` | `payslips` | `year_-1_month_-1` | `300` | `300` | `300` | Indexed sort |
| `AuditLog.find().sort({ createdAt: -1 })` | `auditlogs` | `createdAt_-1` | `300` | `300` | `300` | Indexed sort |

*(Note: On a pre-index cold run prior to `atlas_mirrored_explain.mjs`, unindexed `attendances` `{ employeeId }` scan examined `3000` docs vs `10` docs once `employeeId_1_date_1` is present—confirming how critical keeping Atlas indexes in sync is.)*

---

## 5. Controlled Load Test Results (`10 / 25 / 50` Concurrent Users)

All load runs ran cleanly against isolated `MongoMemoryServer` with `RATE_LIMIT_MAX=100000` and `0` application errors (`0%` error rate). **Note:** Single-core Node CPU % reflects both Express request handling and local `MongoMemoryServer` driver/JSON overhead sharing the same OS runtime.

### 5.1 Admin / HR Heavy Endpoint Mix (7 Endpoints Equal Share)
Mix: `/dashboard/stats`, `/employees?limit=100`, `/attendance?limit=50`, `/leaves/requests?limit=50`, `/payroll/payslips?limit=50`, `/recruitment/candidates?limit=50`, `/reports/employees?limit=100` (~`6s` sustained per tier):

| Concurrency | Reqs | Errors | RPS | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | EL Lag Mean / p99 / Max (ms) | CPU % | RSS / Heap (MB) |
| :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | ---: | :---: |
| **10 Users** | 456 | `0` (`0%`) | **74.94** | 132.58 | 125.41 | 202.21 | 242.80 | 268.39 | `25.30` / `50.82` / `52.40` | 122.2% | `392.8 / 101.8` |
| **25 Users** | 426 | `0` (`0%`) | **67.66** | 363.55 | 333.28 | 601.02 | 697.21 | 765.72 | `58.22` / `108.40` / `119.87` | 133.5% | `435.3 / 93.4` |
| **50 Users** | 410 | `0` (`0%`) | **62.73** | **773.16** | **669.38** | **1409.32** | **1701.41** | **1753.25** | **`63.89` / `192.02` / `215.88`** | 131.7% | `462.7 / 112.9` |

**Latency Breakdown at `50` Concurrent Heavy Users (Top 4 Slowest Endpoints):**
- **`GET /dashboard/stats`:** Avg `1329.07 ms` | p50 `1315.87 ms` | p95 `1749.11 ms` | p99 `1753.25 ms` (`60` reqs)
- **`GET /recruitment/candidates?limit=50`:** Avg `861.81 ms` | p50 `801.62 ms` | p95 `1252.42 ms` | p99 `1276.85 ms` (`58` reqs)
- **`GET /payroll/payslips?limit=50`:** Avg `657.46 ms` | p50 `647.05 ms` | p95 `895.09 ms` | p99 `961.89 ms` (`59` reqs)
- **`GET /leaves/requests?limit=50`:** Avg `656.57 ms` | p50 `618.11 ms` | p95 `892.07 ms` | p99 `898.20 ms` (`60` reqs)

### 5.2 Realistic Org Split at `50` Concurrent Distinct Users (Atlas-Mirrored Indexes)
`5` Admin/HR workers + `45` distinct Employee ESS sessions (`50` unique JWT `sessionId`s forcing cold first-hit auth lookups), running `5.10s`:
- **Throughput & Reliability:** `1,397` requests, **`0` errors**, **`274.14 RPS`**
- **Latency:** Avg `180.67 ms`, p50 `176.98 ms`, p95 `293.03 ms`, p99 `404.15 ms`, Max `553.36 ms`
- **Node Event Loop & CPU:** Event loop lag mean `19.01 ms`, p99 `37.39 ms`, max `43.16 ms`; single-core CPU `128.5%`
- **Interpretation:** Under typical employee self-service traffic, throughput is `4.37×` higher than Admin-heavy traffic (`274.14 RPS` vs `62.73 RPS`) because ESS dashboard skips full-company JS loops. However, even a small burst of concurrent Admin dashboard refreshes (`~15%` traffic) stalls the single Node event loop and pushes `p95 > 1.4 s` locally—and considerably higher over `42.62 ms` Atlas WAN RTT.

---

## 6. Root Cause Analysis & Prioritized Bottleneck Ranking

### Priority Legend
- **Critical:** Directly saturates Node CPU/event loop, multiplies Atlas WAN latency on core screens, or breaks throughput/usability at `25–50` concurrent users.
- **High:** Causes noticeable UI stalls (`>300–600 ms` render/transfer/query waste) or degrades Atlas scalability above `1,000+` employees.
- **Medium:** Causes avoidable bandwidth, write overhead, unindexed sorting at moderate growth, or mobile/filter jank.
- **Low:** Minor optimization or future-scale hardening (`5,000+` employees).

| Rank | Severity | Layer | File(s) & Function(s) | Measured / Observed Evidence | Root Cause | Expected Optimization Impact | Recommended Fix (Phase 8) | Risk |
| :---: | :---: | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | **Critical** | Backend / DB | [`dashboardController.js`](../src/modules/dashboard/dashboardController.js#L61-L234) (`getDashboardStats`) | Slowest API in all tiers: `30.41 ms` warm solo; **`1329.07 ms` avg / `1753.25 ms` max** at `50` users; `2` sequential `Promise.all` batches = `11` queries over `42.62 ms` Atlas RTT. | Pulls all `Employee` docs + 7-day `Attendance` docs into Node RAM and aggregates KPIs, dept counts, and 7-day trends in JS loops sequentially after phase 1 finishes. | **`~60–75%` drop in Admin dashboard CPU & latency**, cutting `50`-user tail latency and collapsing 2 sequential DB phases into 1 parallel `$facet`/`$group` batch + 10–15s cache. | Replace raw `Employee.find`/`Attendance.find` JS loops with MongoDB `$group` / `$facet` pipelines; execute single parallel batch; add short-TTL (`10–15s`) role-scoped response cache. | Medium |
| **2** | **Critical** | DB / Atlas | Atlas Index Gaps ([`payrollruns`, `jobopenings`, `candidates`, `announcements`, `documents`, `employees`, `performancereviews`, `designations`, `branches`, `trainingprograms`]) & [`db.js`](../src/config/db.js#L5) | `avgPingMs: 42.62 ms`; explain confirms `COLLSCAN + SORT` on `5` collections + `inMem SORT` on dept-filtered `employees` (`SYNC_INDEXES: false`). | Schema indexes added in Phases 2–6 were never synced to Atlas; queries sort descending or filter-then-sort without matching compound prefixes. | Eliminates `COLLSCAN` and `inMem SORT` blocking `32MB` memory limit as collections pass `1,000–50,000` docs; stabilizes Atlas CPU/IOPS. | Run controlled index creation script against Atlas (`background` build) for all missing compound indexes; remove redundant single-field `employees` indexes. | Low |
| **3** | **Critical** | Backend / Auth | [`authMiddleware.js`](../src/middleware/authMiddleware.js#L85-L106) (`authenticate`) | Cold vs warm auth gap: **`14.58 ms` vs `3.49 ms`** (`4.18×`) locally; `~85 ms` minimum Atlas WAN hop cost per miss across `User` + nested `.populate()`. | Every cache miss or post-mutation call fetches `User`, sequentially fires `.populate('branchId')` **and unprojected `.populate('employeeId')`** (pulling PII/bank/history subdocs), plus `UserSession.findOne`. | **`~40–50%` faster auth misses** & eliminates excess BSON transfer of `bankDetails` / `education` / `previousEmployment` on every authenticated API miss. | Replace unprojected `.populate('employeeId')` with `.populate('employeeId', 'employeeId firstName lastName departmentId branchId managerId employmentStatus isDeleted')`; cache immutable branch lookup alongside user identity. | Low–Medium |
| **4** | **High** | Frontend Bundle | [`DashboardPage.jsx`](../../client/src/pages/dashboard/DashboardPage.jsx#L30-L39), [`vite.config.js`](../../client/vite.config.js#L26-L30) | Built `charts-xXJIdj8n.js` is **`395.22 kB`** (**`108.82 kB` gzip**) — largest bundle in the app (`33%` larger than `vendor` + `index` combined!). | Static top-level import of `recharts` loads the entire charting library even when `EMPLOYEE`, `MANAGER`, `RECRUITER`, or `PAYROLL_ADMIN` views render (`<BarChart>` unused). | Removes **`395.22 kB` (`108.82 kB` gzip)** JS download/parse/compile for all non-HR/Admin dashboards; faster TTI on mid-tier mobile CPUs. | Extract `<BarChart>` into `AttendanceTrendChart.jsx` loaded via `React.lazy()` only inside the `(isAdmin || isHR)` dashboard branch. | Low |
| **5** | **High** | Backend / API | [`employeeController.js`](../src/modules/employees/employeeController.js#L139-L169) (`getEmployees`), [`app.js`](../src/app.js#L46-L65) | `/employees?limit=100` averages **`111.75 KB`** uncompressed JSON (`6` `.populate()` queries + `countDocuments`), climbing to `447.55 ms` (`p95`, 25 users). | Missing Express `compression()` (`gzip`/`br`) middleware + 6 separate `.populate()` roundtrips + `$or` 4-field `$regex` search scanning `300/300` docs (`11/300` selectivity). | **`~70–80%` wire payload reduction** (`~111 KB` -> `~18–25 KB` gzipped) and eliminates 6-collection populate fan-out latency over Atlas WAN. | Add `compression()` middleware in `app.js`; add lightweight `/employees/options` (`_id, employeeId, firstName, lastName, departmentId`) for dropdowns; optimize directory projection/aggregation & anchor/index search. | Low–Medium |
| **6** | **High** | Frontend Render | [`AttendancePage.jsx`](../../client/src/pages/attendance/AttendancePage.jsx#L27-L52,L256-L360) (`AttendancePage`) | `setCurrentTime` `setInterval(..., 1000)` triggers **60 full-page re-renders/min**, re-diffing the entire table rows and modal forms every second. | Mutable per-second clock state sits inside the top-level `AttendancePage` component rather than an isolated leaf component. | Drops main-thread React reconciliation overhead on `/attendance` to near-zero idle CPU & eliminates frame drops during scrolling/typing. | Extract `<LiveAttendanceClock />` wrapped in `React.memo()` matching [`DashboardPage.jsx`](../../client/src/pages/dashboard/DashboardPage.jsx#L60-L77). | Low |
| **7** | **High** | Backend / DB | [`recruitmentController.js`](../src/modules/recruitment/recruitmentController.js#L77-L79,L199-L216), [`payrollController.js`](../src/modules/payroll/payrollController.js#L700-L705), [`leaveController.js`](../src/modules/leaves/leaveController.js#L656-L667) | At `50` heavy users: `candidates` `p95 = 1252.42 ms`, `payslips` `p95 = 895.09 ms`, `leaves` `p95 = 892.07 ms`; `getJobOpenings` aggregates **all** candidates globally without `$match`. | Multi-level `.populate()` (including nested `jobOpeningId.departmentId`) + unindexed sort (`candidates`) + unfiltered `Candidate.aggregate` across all jobs. | Cuts recruitment/payroll/leave list latency and prevents unbounded candidate table scans as hiring history grows. | Filter `Candidate.aggregate([{ $match: { jobOpeningId: { $in: jobIds } } }, ...])`; add `{ appliedDate: -1 }` & nested lookup projections. | Low–Medium |
| **8** | **High** | Frontend API | [`EmployeesPage.jsx`](../../client/src/pages/employees/EmployeesPage.jsx#L82,L291), `AssetsPage`, `DocumentsPage`, `PerformancePage`, `TrainingPage`, `ReportsPage`, `LeavesPage`, `PayrollPage` | Every directory dropdown fetches `100` full populated Employee records (`111.75 KB`); zero pagination UI (`limit`/`page` controls) on list pages; `EmployeesPage` searches only first `100` records client-side. | Pages request `limit: 100` unconditionally or hardcode unpaginated initial slices instead of server search + paginated list controls & slim option endpoints. | Cuts directory/dropdown JSON by `>90%`, makes search accurate past `100` employees, and caps DOM table row counts cleanly. | Introduce slim `/employees/lookup` option endpoint, server-debounced search (`300 ms`), and reusable `<Pagination />` UI (`limit: 20/25`). | Medium |
| **9** | **Medium** | Security / Scale Ops | [`env.js`](../src/config/env.js#L39-L40), [`app.js`](../src/app.js#L47-L58) (`rateLimit`) | Default `RATE_LIMIT_MAX: 1000` / `900000 ms` (`15 min`) keyed solely by `req.ip` without `trust proxy` or user key separation. | Behind a shared corporate office NAT IP or reverse proxy, `50` active employees refreshing pages and polling/mutating can hit the shared `1000`-request IP cap (`~20` requests/user/`15m`!). | Prevents false `429 Too Many Requests` lockouts during office peak hours (9–10 AM check-in spike) without loosening brute-force login limits. | Set `app.set('trust proxy', 1)` when proxied, tighten per-IP limit specifically on `/auth/login` + `/auth/forgot-password`, and key authenticated API rate limit by `req.user?._id || req.ip`. | Low |
| **10** | **Medium** | Frontend Assets | [`client/index.html`](../../client/index.html#L25-L30) | External render/font stylesheet `fonts.googleapis.com` requesting 7 font weights (`300–900`). | External CDN dependency adds DNS + TLS + CSS + `woff2` roundtrips during initial boot and fails/stalls on offline/airgapped corporate intranets. | Eliminates external font stylesheet roundtrip & stabilizes cold First Contentful Paint. | Self-host `@fontsource/inter` subset (`400, 500, 600, 700, 800`) locally or fall back gracefully to system UI font stack with `font-display: swap`. | Low |
| **11** | **Medium** | Backend / Exports | [`reportController.js`](../src/modules/reports/reportController.js#L44-L62,L116-L132,L167-L185) (`get*Report` CSV mode) | `3,000`-row attendance CSV took `121.32 ms` / `239.36 KB` buffered fully in Node string `csv += ...` via `.populate().lean()`. | Unpaginated query materializes all matched Mongoose docs in RAM + concatenates CSV rows synchronously on event loop before writing HTTP response. | Eliminates V8 heap spikes and event-loop pauses when exporting `20,000–100,000+` annual attendance or payroll rows. | Stream MongoDB `.cursor()` through chunked CSV transform (`res.write(...)`) with `batchSize(250)`. | Medium |
| **12** | **Medium** | Auth / Login Concurrency | [`User.js`](../src/models/User.js#L69,L79) (`comparePassword`), [`authController.js`](../src/modules/auth/authController.js#L62-L120) | `POST /auth/login` takes **`101.61 ms` avg / `109.81 ms` p95** locally (`bcryptjs` pure-JS cost 10). | `bcryptjs` runs pure JS on libuv (`async`) or main thread pressure during 9:00 AM login stampedes; `login` also issues unprojected `Employee.findOne` + `User.populate('branchId')`. | Keeps login spikes under control (`<120 ms`) at morning shift starts while preserving bcrypt security cost `10`. | Retain cost `>=10` security; evaluate native `bcrypt` C++ addon vs `bcryptjs` if login concurrency spikes (`>20` simultaneous logins/sec) + project `login` `Employee.findOne` fields. | Low–Medium |
| **13** | **Low** | Backend / Batch | [`payrollController.js`](../src/modules/payroll/payrollController.js#L288-L350) (`generatePayrollRun`), [`Employee.js`](../src/models/Employee.js#L165-L188) | `300`-employee payroll batch took **`274.40 ms`** locally (well within budget today); `employees` maintains `15` total indexes. | Inner loop filters `monthHolidays` (`O(E×H)`) and re-parses leave date objects (`O(E×22×L)`), while redundant single-field indexes slightly slow bulk employee inserts. | Improves future `2,000–5,000`-employee payroll compute time by `~25–40%` and trims redundant index write amplification. | Pre-index `monthHolidays` by `branchId` Map and pre-normalize `empLeaves` timestamps once outside loops; prune redundant single-field indexes (`isDeleted_1`, `departmentId_1` covered by compounds). | Low |

---

## 7. Phased Optimization Roadmap (For Phase 8 Implementation Approval)

Do **not** alter business logic, RBAC permissions, or payroll math; execute optimizations strictly behind existing Phase 4/5/6/6.1 automated regression suites:

### Batch A — Zero-Risk Quick Wins (Immediate Highest ROI)
1. **Sync Missing Atlas Indexes & Prune Redundant Employee Single-Field Indexes** (`payrollruns`, `jobopenings`, `candidates`, `announcements`, `documents`, `designations`, `branches`, `performancereviews`, `trainingprograms`, `employees { isDeleted: 1, departmentId: 1, createdAt: -1 }`). Verify Atlas explain plans turn `COLLSCAN` / `inMem SORT` → `IXSCAN`.
2. **Enable HTTP `compression()` (`gzip`) in `server/src/app.js`** (instant `~70–80%` transfer reduction on JSON endpoints like `/employees?limit=100` `111.75 KB` & reports).
3. **Isolate 1-Second Clock inside `React.memo` in `AttendancePage.jsx`** (zero risk; stops `60/min` table re-renders).
4. **Fix `authMiddleware.js` `.populate('employeeId')` Projection** to explicitly `.select(...)` only safe identity/scope fields (zero risk to RBAC checks; keeps full dossier fetch inside `/employees/:id`).

### Batch B — Backend Query, Caching & Rate-Limit Hardening
5. **Refactor `dashboardController.js` (`getDashboardStats`)** to replace full `Employee`/`Attendance` Node RAM loops with MongoDB `$group`/`$facet` aggregations + single parallel batch + short `10–15s` role-keyed TTL cache.
6. **Add Slim `/employees/options` Lookup Endpoint** + optimize `recruitmentController.js` `getJobOpenings` `$match` scoping + `$lookup`/lean projection cleanup on `getEmployees`.
7. **Stream CSV Exports (`reportController.js`)** via Mongoose `.cursor()` so large attendance/payroll exports stay constant-memory.
8. **Scope `express-rate-limit` Per User / Sensitive Route (`authController` vs `/api`)** with `trust proxy` support so office NAT IPs don't falsely throttle active employees.

### Batch C — Frontend Bundle Splitting & True Server Pagination
9. **Lazy-Load `Recharts` Chart Component (`AttendanceTrendChart.jsx`)** so non-Admin/HR roles avoid the `395.22 kB` (`108.82 kB` gzip) `charts` bundle completely.
10. **Migrate 5 Employee-Dropdown Pages (`Assets`, `Documents`, `Performance`, `Training`, etc.) to `/employees/options`** and add server-debounced search + `<Pagination />` (`20–25/page`) across `EmployeesPage`, `LeavesPage`, `PayrollPage`, `DocumentsPage`, and `ReportsPage`.
11. **Self-Host Inter Font Subset (`400–800`)** replacing external `fonts.googleapis.com` render dependency.

### Batch D — Post-Optimization Verification Gate
12. Re-run Phase 4/5/6/6.1 Vitest suites (`server` + `client`), re-run this exact Phase 7 `10 / 25 / 50` load test & Atlas-mirrored `.explain()` suite to document concrete Before/After improvements, and conduct Chrome DevTools desktop/mobile verification once remote debugging is enabled.
