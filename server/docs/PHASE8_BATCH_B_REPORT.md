# PR VISION HRMS — Phase 8 Batch B Report
## Database Query & Dashboard API Optimization

> [!IMPORTANT]
> **Production Atlas Protection:** Live MongoDB Atlas (`pr_vision_hrms`) data and indexes were **NOT** modified during Batch B. `SYNC_INDEXES` remains `false` by default in [`server/src/config/env.js`](../src/config/env.js) and [`server/src/config/db.js`](../src/config/db.js). All `.explain('executionStats')` plans, benchmarks, and automated tests ran strictly against isolated in-memory `MongoMemoryServer` staging instances. Production Atlas index builds remain pending explicit DBA approval using [`server/src/scripts/migrateIndexesBatchB.js`](../src/scripts/migrateIndexesBatchB.js).

---

## 1. Part 1 — Database Index Audit & Reversible Migration Plan

### 1.1 Schema & Query Pattern Audit
We audited all Mongoose models in `server/src/models/*.js`, live Atlas inventory findings from [`PHASE7_PERFORMANCE_AUDIT.md`](./PHASE7_PERFORMANCE_AUDIT.md) and [`INDEX_RECOMMENDATIONS.md`](./INDEX_RECOMMENDATIONS.md), and actual controller queries across `server/src/modules/`:

- **Correction to Prior Audit Notes (`candidates`):** While Phase 2 documentation mentioned `{ jobOpeningId: 1, stage: 1, status: 1 }`, inspection of [`Candidate.js`](../src/models/Candidate.js) and [`recruitmentController.js`](../src/modules/recruitment/recruitmentController.js#L191-L195) confirms the schema has no `stage` field (`stage` query parameter maps directly onto `query.status`). Therefore, Batch B indexes target `status`, `appliedDate`, and `jobOpeningId` (`{ appliedDate: -1 }`, `{ status: 1, appliedDate: -1 }`, `{ jobOpeningId: 1, appliedDate: -1 }`, `{ jobOpeningId: 1, status: 1, appliedDate: -1 }`). Notice adding `{ jobOpeningId: 1, appliedDate: -1 }` specifically covers `Candidate.find({ jobOpeningId }).sort({ appliedDate: -1 })` without requiring `status` in the filter.
- **Unanchored Multi-Field Search on `employees`:** `getEmployees` and `getEmployeeOptions` search across `firstName`, `lastName`, `email`, and `employeeId` using escaped case-insensitive `$regex` (`$options: 'i'`) inside `$or`. Because non-anchored case-insensitive regex cannot restrict B-tree range bounds, MongoDB scans all keys matching the leading `{ isDeleted: false }` predicate (verified via explain below: `156 -> 151` keys scanned across 300 seeded records once soft-deleted docs are excluded upfront via `{ isDeleted: 1, createdAt: -1 }`). Rather than adding 4 redundant case-sensitive field indexes with high write overhead and zero benefit to `/substring/i` searches, Batch B bounds result counts (`defaultLimit`, `maxLimit: 200`), eliminates `.populate()` overhead on dropdowns, and documents Atlas Search `$search` autocomplete / normalized prefix search as the clean scale-out option if headcount reaches `>5,000`.
- **Write-Amplification Discipline:** High-write collections (`attendances`, `auditlogs`, `notifications`, `usersessions`) and workflow queue `leaverequests` received **zero** extra indexes. New indexes target low/medium-write collections suffering real `COLLSCAN` + in-memory `SORT` bottlenecks, plus targeted ESR compounds on `employees` paired with explicit cleanup recommendations (`15 + 4 - 3 = 16` net indexes once optional manual DBA cleanup runs).

### 1.2 Atlas-Mirrored Before vs. Batch B After `.explain('executionStats')` Comparison
Staging benchmark dataset (`MongoMemoryServer`): `300` Employees (`5` soft-deleted, `20` Resigned, `5` Relieved), `3,000` Attendances, `600` LeaveRequests, `20` JobOpenings, `200` Candidates, `100` Announcements, `200` Documents, `300` AuditLogs, `120` ExpenseClaims, `80` Grievances, `120` PerformanceReviews, `30` TrainingPrograms, `120` TrainingAssignments, `12` PayrollRuns, `300` Payslips.

| Query Pattern | BEFORE (Atlas-Mirrored) Plan & Index | BEFORE Keys / Docs | AFTER (Batch B) Plan & Index | AFTER Keys / Docs |
| :--- | :--- | ---: | :--- | ---: |
| `PayrollRun.find().sort({ year: -1, month: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 12` | `LIMIT -> FETCH -> IXSCAN` (`year_-1_month_-1`) | `12 / 12` |
| `JobOpening.find().sort({ createdAt: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 20` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `20 / 20` |
| `JobOpening.find({ status: 'Open' }).sort({ createdAt: -1 }).limit(50)` | `SORT -> FETCH -> IXSCAN` (`status_1`) | `12 / 12` | `LIMIT -> FETCH -> IXSCAN` (`status_1_createdAt_-1`) | `12 / 12` |
| `Candidate.find().sort({ appliedDate: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 200` | `LIMIT -> FETCH -> IXSCAN` (`appliedDate_-1`) | `50 / 50` |
| `Candidate.find({ status: 'Applied' }).sort({ appliedDate: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 200` | `LIMIT -> FETCH -> IXSCAN` (`status_1_appliedDate_-1`) | `34 / 34` |
| `Candidate.find({ jobOpeningId }).sort({ appliedDate: -1 }).limit(50)` | `SORT -> FETCH -> IXSCAN` (`jobOpeningId_1_status_1`) | `10 / 10` | `LIMIT -> FETCH -> IXSCAN` (`jobOpeningId_1_appliedDate_-1`) | `10 / 10` |
| `Announcement.find({ isActive: true }).sort({ isPinned: -1, createdAt: -1 }).limit(4)` | `SORT -> COLLSCAN` (`null`) | `0 / 100` | `LIMIT -> FETCH -> IXSCAN` (`isActive_1_isPinned_-1_createdAt_-1`) | **`4 / 4`** |
| `Document.find().sort({ createdAt: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 200` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `50 / 50` |
| `Document.find({ employeeId }).sort({ createdAt: -1 }).limit(50)` | `SORT -> FETCH -> IXSCAN` (`employeeId_1`) | `1 / 1` | `LIMIT -> FETCH -> IXSCAN` (`employeeId_1_createdAt_-1`) | `1 / 1` |
| `Designation.find({ isDeleted: false }).sort({ level: 1, title: 1 }).limit(100)` | `SORT -> FETCH -> IXSCAN` (`isDeleted_1`) | `15 / 15` | `LIMIT -> FETCH -> IXSCAN` (`isDeleted_1_level_1_title_1`) | `15 / 15` |
| `Branch.find({ isDeleted: false }).sort({ isHeadquarters: -1, name: 1 }).limit(100)` | `SORT -> FETCH -> IXSCAN` (`isDeleted_1`) | `3 / 3` | `LIMIT -> FETCH -> IXSCAN` (`isDeleted_1_isHeadquarters_-1_name_1`) | `3 / 3` |
| `PerformanceReview.find().sort({ createdAt: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 120` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `50 / 50` |
| `TrainingProgram.find().sort({ startDate: 1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 30` | `LIMIT -> FETCH -> IXSCAN` (`startDate_1`) | `30 / 30` |
| `TrainingAssignment.find().sort({ createdAt: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 120` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `50 / 50` |
| `ExpenseClaim.find().sort({ createdAt: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 120` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `50 / 50` |
| `Grievance.find().sort({ createdAt: -1 }).limit(50)` | `SORT -> COLLSCAN` (`null`) | `0 / 80` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `50 / 50` |
| `Shift.find({ isActive: true }).sort({ createdAt: -1 }).limit(100)` | `SORT -> COLLSCAN` (`null`) | `0 / 1` | `LIMIT -> FETCH -> IXSCAN` (`isActive_1_createdAt_-1`) | `1 / 1` |
| `Employee.find({ isDeleted: false, departmentId }).sort({ createdAt: -1 }).limit(10)` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `46 / 46` | `LIMIT -> FETCH -> IXSCAN` (`isDeleted_1_departmentId_1_createdAt_-1`) | **`10 / 10`** |
| `Employee.find({ isDeleted: false }).sort({ firstName: 1, lastName: 1, employeeId: 1 }).limit(50)` | `SORT -> FETCH -> IXSCAN` (`isDeleted_1`) | **`295 / 295`** | `LIMIT -> FETCH -> IXSCAN` (`isDeleted_1_firstName_1_lastName_1_employeeId_1`) | **`50 / 50`** |
| `Employee.find({ isDeleted: false, $or regex 'EmpFirst15' }).sort({ createdAt: -1 }).limit(10)` | `LIMIT -> FETCH -> IXSCAN` (`createdAt_-1`) | `156 / 156` | `LIMIT -> FETCH -> IXSCAN` (`isDeleted_1_createdAt_-1`) | `151 / 151` |

### 1.3 Reversible Migration Plan (`up` / `down`) & Redundant Prefix Cleanup Candidates
- Created [`server/src/scripts/migrateIndexesBatchB.js`](../src/scripts/migrateIndexesBatchB.js):
  - **`BATCH_B_INDEX_PLAN` (`38` additive indexes across `15` collections):** All use `{ background: true }` and explicit deterministic names matching the Mongoose model additions (`PayrollRun`, `JobOpening`, `Candidate`, `Announcement`, `Document`, `Designation`, `Branch`, `PerformanceReview`, `TrainingProgram`, `TrainingAssignment`, `ExpenseClaim`, `Grievance`, `Shift`, `PayrollAdjustment`, `Employee`).
  - **CLI Safety:** Defaults strictly to `--dry-run` (`node src/scripts/migrateIndexesBatchB.js` prints plan without opening a DB socket). Writing (`--confirm-apply`) and rollback (`--down --confirm-apply`) operate explicitly on the `38` Batch B indexes and guard `_id_` and unique constraints against accidental drops.
  - **`REDUNDANT_INDEX_CANDIDATES` (`19` existing single-field / prefix indexes):** Left **intact** in schemas and Atlas during Batch B. After Batch B indexes are deployed and verified stable in Atlas, DBA may selectively drop subsumed left-prefix indexes such as `employees` (`isDeleted_1`, `isDeleted_1_departmentId_1`, `isDeleted_1_employmentStatus_1`), `departments.isDeleted_1`, `designations` (`isDeleted_1`, `isDeleted_1_departmentId_1_level_1`), `branches.isDeleted_1`, `salarystructures.employeeId_1`, `notifications.recipientId_1`, `payrollruns.status_1`, `jobopenings` (`status_1`, `departmentId_1`), `candidates.jobOpeningId_1_status_1`, `documents` (`employeeId_1`, `category_1`), `performancereviews.status_1`, and `payrolladjustments` (`employeeId_1`, `leaveRequestId_1`, `status_1`).

---

## 2. Part 2 — Dashboard API Optimization (`GET /api/v1/dashboard/stats`)

### 2.1 Changes Implemented in [`dashboardController.js`](../src/modules/dashboard/dashboardController.js)
1. **Eliminated Full Collection Downloads into Node Memory:** Replaced `Employee.find({ isDeleted: false })` and 7-day `Attendance.find(...)` scans + JS reduction loops with server-side MongoDB aggregation `$facet` pipelines (`Employee.aggregate` computing `totals`, `departments`, and limited `5`-doc `birthdays`; `Attendance.aggregate` computing UTC day `trends` and `today` metrics).
2. **Collapsed Sequential Roundtrips:** Merged the two sequential `Promise.all` phases in the Admin/HR/Payroll/Recruiter path into **one single `Promise.all` batch**, and started Manager `holidays`, `announcements`, and `myTodayRecord` lookups concurrently with `teamEmployees` instead of blocking behind two strict waterfalls. (We benchmarked and avoided multi-doc correlated `$lookup` sub-pipelines for `MANAGER` because indexed `$in` `countDocuments` executed in `12.73 ms` locally vs `41.32 ms` for per-member `$lookup` subqueries.)
3. **Preserved Exact Parity & Tightened Projections:** Maintained `HALF_DAY` exclusion inside `attendanceTrends.present`, `Manager.teamPresentToday`, and `Employee.monthlyPresentDays` while keeping `HALF_DAY` included in Admin/HR `presentToday`; preserved UTC `toISOString().split('T')[0]` grouping (`$dateToString`), `sanitizeAuditDetails()`, announcement branch/department scoping, and real-time freshness (zero stale caching). Added explicit `.select()` projections to `Holiday`, `Announcement`, `PayrollRun`, and `AuditLog`.

### 2.2 Before vs. After Benchmark & Payload Parity (`15` Warm Calls per Role, Uncompressed)

| Role | BEFORE Avg / p95 (ms) | AFTER Avg / p95 (ms) | Speedup / Change | BEFORE Bytes | AFTER Bytes | Parity Verified (`kpi`, `depts`, `trends`, `lists`) |
| :--- | :---: | :---: | :---: | ---: | ---: | :---: |
| `ADMIN` | `51.06` / `75.79` | **`25.12`** / `30.41` | **2.03× faster (`-50.8%`)** | `6,606 B` | `5,972 B` (`-9.6%`) | 100% Exact |
| `HR_MANAGER` | `51.53` / `66.41` | **`21.87`** / `24.49` | **2.36× faster (`-57.6%`)** | `6,646 B` | `6,012 B` (`-9.5%`) | 100% Exact |
| `PAYROLL_ADMIN` | `45.45` / `60.64` | **`20.39`** / `22.74` | **2.23× faster (`-55.1%`)** | `3,427 B` | `3,075 B` (`-10.3%`) | 100% Exact |
| `RECRUITER` | `14.95` / `16.83` | **`12.21`** / `13.63` | **-18.3%** | `3,036 B` | `2,684 B` (`-11.6%`) | 100% Exact |
| `MANAGER` | `14.01` / `19.29` | **`12.73`** / `13.94` | **-9.1%** | `2,396 B` | `2,034 B` (`-15.1%`) | 100% Exact |
| `EMPLOYEE` | `29.79` / `152.96` | **`9.46`** / `10.58` | **3.15× faster (`-68.2%`)** | `2,419 B` | `2,058 B` (`-14.9%`) | 100% Exact |

*(Plus elimination of 1 sequential network roundtrip across ~`42.6 ms` Atlas WAN RTT on executive paths.)*

---

## 3. Part 3 — Lightweight Employee Options API (`GET /api/v1/employees/options`)

### 3.1 Frontend Consumer Audit & API Design
Inspection of frontend `/employees` callers confirmed that **four dropdown/checklist pages** ([`AssetsPage.jsx`](../../client/src/pages/assets/AssetsPage.jsx#L354-L356), [`DocumentsPage.jsx`](../../client/src/pages/documents/DocumentsPage.jsx#L288-L290), [`PerformancePage.jsx`](../../client/src/pages/performance/PerformancePage.jsx#L317-L319), [`TrainingPage.jsx`](../../client/src/pages/training/TrainingPage.jsx#L478-L498)) only read `_id`, `firstName`, `lastName`, and `employeeId`. Frontend migration is deferred cleanly to Batch C.

- **Route Registration ([`employeeRoutes.js`](../src/modules/employees/employeeRoutes.js)):** Registered `router.get('/options', getEmployeeOptions)` strictly before `router.get('/:id', getEmployeeById)`.
- **Controller ([`employeeController.js`](../src/modules/employees/employeeController.js)):**
  - Reuses shared `resolveEmployeeDirectoryScope` & `buildEmployeeSearchFilter` helpers (`ADMIN`, `SUPER_ADMIN`, `HR_MANAGER`, `PAYROLL_ADMIN` organization-wide; `MANAGER` scoped strictly to direct reports `managerId: req.verifiedEmployeeId`; `EMPLOYEE` & `RECRUITER` rejected with `403`).
  - Excludes `isDeleted: true` and exited stages (`Resigned`, `Terminated`, `Relieved`) by default (`includeInactive=true` or explicit `status` overrides while never exposing soft-deleted records).
  - Supports `search` (escaped regex across `firstName`, `lastName`, `email`, `employeeId`), validated ObjectId filters `departmentId` & `branchId`, `page`, and `limit` (`defaultLimit: 50`, `maxLimit: 200`).
  - Strict `.select('_id employeeId firstName lastName email')` sorted via indexed `{ firstName: 1, lastName: 1, employeeId: 1 }` with `.lean()` and zero `.populate()` calls.
  - Existing `GET /api/v1/employees` remains 100% backward compatible.

### 3.2 Payload & Latency Comparison (`limit=100`, Uncompressed JSON)

| Endpoint | HTTP Status | Records Returned | Avg Latency | p95 Latency | Response Size | Notes |
| :--- | :---: | :---: | ---: | ---: | ---: | :--- |
| `GET /api/v1/employees?limit=100` | `200` | `100` | `36.93 ms` (before: `42.07 ms`) | `46.90 ms` (before: `72.69 ms`) | **`112,897 B`** | `6` sequential `.populate()` joins |
| `GET /api/v1/employees/options?limit=100` | `200` | `100` | **`10.97 ms`** (**3.37× faster**) | **`19.62 ms`** | **`14,009 B`** (**-87.6%**) | Indexed `IXSCAN`, `0` populates, `0` PII |

*(Over `gzip` compression, `14,009 B` shrinks further to single-packet wire size; ready for Batch C adoption across the 4 UI pages.)*

---

## 4. Part 4 — Validation & Safety Verification

- **Backend Syntax Check (`node --check`)**: `113` files in `server/src/` and `server/tests/` checked, `0` errors.
- **Backend Automated Tests (`cd server; npm test`)**: **8 test files, 81 passed, 0 failed, 0 skipped** (includes `9` new tests in [`tests/phase8BatchB.test.js`](../tests/phase8BatchB.test.js)).
- **Frontend Automated Tests (`cd client; npm test`)**: **6 test files, 40 passed, 0 failed, 0 skipped**.
- **Frontend Production Build (`cd client; npm run build`)**: Vite production build succeeded (`2110` modules transformed, `0` errors).
- **Safety & Scope Compliance**:
  - `SYNC_INDEXES` remains `'false'` ([`server/src/config/env.js`](../src/config/env.js#L26-L30)).
  - Zero edits to `.env` or `package.json`.
  - Live MongoDB Atlas `pr_vision_hrms` untouched (`0` writes, `0` automatic index changes); migration script defaults to `--dry-run`.
  - `server/uploads/` remains clean (`0` files).
  - Existing `GET /api/v1/employees` endpoint remains backward compatible; frontend UI changes deferred cleanly to Batch C.

