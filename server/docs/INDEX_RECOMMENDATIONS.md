# PR VISION HRMS — MongoDB Index Analysis & Recommendation Report (Phase 2)

> [!IMPORTANT]
> **Read-Only Index Analysis Policy:** In accordance with Phase 2 safety guidelines, **no production indexes were created, dropped, or modified automatically**, and `syncDatabaseIndexes()` was **not** executed during Phase 2. All index additions or removals listed below require manual DBA/developer approval before applying to the MongoDB Atlas `pr_vision_hrms` cluster.

---

## 1. Executive Summary of `.explain('executionStats')` Audit

We executed read-only `.explain('executionStats')` plans against 30 high-frequency HRMS query patterns across all 24 MongoDB collections in `pr_vision_hrms`:

- **20 of 30 query patterns** currently use an `IXSCAN` (index scan) with `NO-SORT` (index-ordered sort).
- **3 of 30 query patterns** use an `IXSCAN` for filtering (`isDeleted: false`), followed by an in-memory `SORT` stage (`employees` filtered by `departmentId` + `employmentStatus`, `designations` sorted by `{ level: 1, title: 1 }`, and `branches` sorted by `{ isHeadquarters: -1, name: 1 }`).
- **7 of 30 query patterns** currently trigger a `COLLSCAN` + in-memory `SORT` because the sort key or compound filter+sort key is not covered by an existing index (`attendances` compound sort `{ date: -1, checkIn: -1 }`, `payrollruns` sort `{ year: -1, month: -1 }`, `jobopenings` sort `{ createdAt: -1 }`, `candidates` sort `{ createdAt: -1 }` / `{ appliedDate: -1 }` and filter by `stage`, `performancereviews` sort `{ createdAt: -1 }`, `expenseclaims` unfiltered sort `{ createdAt: -1 }`, `grievances` unfiltered sort `{ createdAt: -1 }`, `announcements` filter `isActive: true` + sort `{ isPinned: -1, createdAt: -1 }`, and `documents` unfiltered sort `{ createdAt: -1 }`).

---

## 2. Existing Indexes Verified in `pr_vision_hrms`

| Collection | Existing Indexes (`name`: `keyPattern`) |
| :--- | :--- |
| `employees` | `_id_`, `employeeId_1` (unique), `email_1` (unique), `departmentId_1`, `branchId_1`, `managerId_1`, `employmentStatus_1`, `isDeleted_1`, `designationId_1`, `userId_1`, `joiningDate_-1`, `createdAt_-1`, `isDeleted_1_employmentStatus_1`, `isDeleted_1_departmentId_1`, `isDeleted_1_managerId_1` |
| `departments` | `_id_`, `name_1` (unique), `isDeleted_1`, `isDeleted_1_name_1`, `branchId_1` |
| `designations` | `_id_`, `title_1_departmentId_1` (unique), `departmentId_1`, `isDeleted_1`, `isDeleted_1_departmentId_1_level_1` |
| `branches` | `_id_`, `code_1` (unique), `isDeleted_1` |
| `attendances` | `_id_`, `employeeId_1_date_1` (unique), `date_1`, `status_1`, `branchId_1`, `date_-1_status_1`, `createdAt_-1` |
| `leaverequests` | `_id_`, `employeeId_1_status_1`, `startDate_1_endDate_1`, `status_1_createdAt_-1`, `createdAt_-1` |
| `leavebalances` | `_id_`, `employeeId_1_year_1` (unique) |
| `payrollruns` | `_id_`, `month_1_year_1` (unique), `status_1` |
| `payslips` | `_id_`, `employeeId_1_month_1_year_1` (unique), `payrollRunId_1`, `year_-1_month_-1`, `paymentStatus_1` |
| `salarystructures` | `_id_`, `employeeId_1`, `employeeId_1_isActive_1` |
| `jobopenings` | `_id_`, `status_1`, `departmentId_1` |
| `candidates` | `_id_`, `jobOpeningId_1_status_1`, `email_1` |
| `notifications` | `_id_`, `recipientId_1`, `recipientId_1_isRead_1`, `recipientId_1_createdAt_-1` |
| `auditlogs` | `_id_`, `createdAt_-1`, `entity_1_entityId_1` |
| `performancereviews` | `_id_`, `employeeId_1_reviewCycle_1` (unique), `status_1` |
| `expenseclaims` | `_id_`, `employeeId_1_status_1`, `status_1_createdAt_-1`, `date_-1` |
| `assets` | `_id_`, `assetTag_1` (unique), `status_1`, `currentAssignedTo_1`, `createdAt_-1` |
| `grievances` | `_id_`, `ticketNumber_1` (unique), `employeeId_1_status_1`, `status_1_createdAt_-1` |
| `announcements` | `_id_`, `createdAt_-1` |
| `documents` | `_id_`, `employeeId_1`, `category_1` |
| `holidays` | `_id_`, `date_1_branchId_1` (unique) |

---

## 3. Recommended Index Changes (Requires Manual Approval)

| # | Collection | Query Pattern | Current Index Status (`.explain('executionStats')`) | Recommended Index | Reason / Expected Impact | Manual Review Required |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `employees` | `find({ isDeleted: false }).sort({ createdAt: -1 })` and `find({ isDeleted: false, departmentId, employmentStatus }).sort({ createdAt: -1 })` | Uses `createdAt_-1` (filters `isDeleted` in `FETCH`) or `isDeleted_1_departmentId_1` + in-memory `SORT` | `{ isDeleted: 1, createdAt: -1 }` and `{ isDeleted: 1, departmentId: 1, employmentStatus: 1, createdAt: -1 }` | Eliminates in-memory `SORT` and post-index `FETCH` filtering on paginated employee directory queries as headcount scales. | **Yes** |
| 2 | `designations` | `find({ isDeleted: false }).sort({ level: 1, title: 1 })` | `IXSCAN` on `isDeleted_1` + in-memory `SORT` (`docsExamined: 13`) | `{ isDeleted: 1, level: 1, title: 1 }` | Covers both soft-delete filter and compound sort order without an in-memory `SORT` stage. | **Yes** |
| 3 | `branches` | `find({ isDeleted: false }).sort({ isHeadquarters: -1, name: 1 })` | `IXSCAN` on `isDeleted_1` + in-memory `SORT` (`docsExamined: 3`) | `{ isDeleted: 1, isHeadquarters: -1, name: 1 }` | Covers branch list filter and headquarters-first sort order directly in the index. | **Yes** |
| 4 | `payrollruns` | `find({}).sort({ year: -1, month: -1 })` | `COLLSCAN` + in-memory `SORT` (existing unique index is `{ month: 1, year: 1 }`, where `month` is prefix) | `{ year: -1, month: -1 }` | Because `month` is leading in `month_1_year_1`, sorting by `{ year: -1, month: -1 }` cannot use the index. Adding `{ year: -1, month: -1 }` serves both `getPayrollRuns` and `dashboardController` `PayrollRun.findOne().sort({ year: -1, month: -1 })` via `IXSCAN`. | **Yes** |
| 5 | `jobopenings` | `find(query).sort({ createdAt: -1 })` | `COLLSCAN` + in-memory `SORT` | `{ createdAt: -1 }` and `{ status: 1, createdAt: -1 }` | Eliminates `COLLSCAN` on job opening listings and filtered open-job queries. | **Yes** |
| 6 | `candidates` | `find(query).sort({ appliedDate: -1 })` and `find({ jobOpeningId, status/stage })` | `COLLSCAN` + in-memory `SORT` | `{ appliedDate: -1, createdAt: -1 }` and `{ jobOpeningId: 1, stage: 1, status: 1 }` | Covers candidate pipeline sorting by `appliedDate` and stage/status filtering. | **Yes** |
| 7 | `announcements` | `find({ isActive: true }).sort({ isPinned: -1, createdAt: -1 })` | `COLLSCAN` + in-memory `SORT` | `{ isActive: 1, isPinned: -1, createdAt: -1 }` | Eliminates `COLLSCAN` and in-memory `SORT` on notice board and dashboard announcement queries. | **Yes** |
| 8 | `performancereviews` | `find(query).sort({ createdAt: -1 })` | `COLLSCAN` + in-memory `SORT` | `{ createdAt: -1 }` and `{ employeeId: 1, createdAt: -1 }` | Covers paginated performance review listings for both HR/Admin and Employee/Manager views. | **Yes** |
| 9 | `expenseclaims` | `find({}).sort({ createdAt: -1 })` (unfiltered HR/Admin view) | `COLLSCAN` + in-memory `SORT` (`status_1_createdAt_-1` only covers status-filtered queries) | `{ createdAt: -1 }` | Eliminates `COLLSCAN` when HR/Admin views all expense claims sorted by `createdAt: -1`. | **Yes** |
| 10 | `grievances` | `find({}).sort({ createdAt: -1 })` (unfiltered HR/Admin view) | `COLLSCAN` + in-memory `SORT` (`status_1_createdAt_-1` only covers status-filtered queries) | `{ createdAt: -1 }` | Eliminates `COLLSCAN` when HR/Admin views all grievance tickets sorted by `createdAt: -1`. | **Yes** |
| 11 | `documents` | `find(query).sort({ createdAt: -1 })` | `COLLSCAN` + in-memory `SORT` | `{ createdAt: -1 }` and `{ employeeId: 1, createdAt: -1 }` | Covers document repository sorting and employee document lookups. | **Yes** |
| 12 | `employees` / `attendances` / `departments` / `notifications` / `salarystructures` | Redundant single-field prefix indexes (`isDeleted_1` on `employees`, `departments`, `designations`; `employeeId_1` on `salarystructures`; `recipientId_1` on `notifications`) | Covered by left-prefix of existing compound indexes (`isDeleted_1_*`, `employeeId_1_isActive_1`, `recipientId_1_isRead_1`) | Candidate for future cleanup (drop redundant single-field prefix indexes after verifying no hint depends on them) | Reduces write amplification and index RAM footprint in MongoDB Atlas. | **Yes (Manual DBA Review Required)** |
