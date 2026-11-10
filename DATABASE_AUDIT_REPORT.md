# PR VISION HRMS – Full Project Database Audit Report

**Date**: 2026-11-09  
**Application**: PR VISION HRMS  
**Organization**: PR VISION INNOVATIONS  
**Target Database**: MongoDB Atlas (`PR-VISION-HRMS` / `pr_vision_hrms`)  

---

## 1. Executive Summary

This audit evaluates all data layers, models, controllers, storage mechanisms, and dependencies across `client/` and `server/` to transition PR VISION HRMS to a permanent cloud database on **MongoDB Atlas**.

---

## 2. Audit Findings by Category

### A. Database Connection & Runtime Environments
* **Current Primary Connection**: `server/src/config/db.js` connects via `MONGODB_URI` environment variable to MongoDB Atlas database `pr_vision_hrms`.
* **In-Memory Database (`mongodb-memory-server`)**:
  * Found in `server/package.json` (`devDependencies`).
  * Used in `server/tests/setup.js` for fast, isolated test execution (`vitest run`).
  * In `server/src/config/db.js`, in-memory fallback was previously allowed. This must be completely severed for development and production, ensuring it only initializes when `NODE_ENV === 'test'`.
* **Local In-Memory / Ephemeral Flags**:
  * `USE_MEMORY_DB` variable in `server/.env` is now obsolete and removed.
  * No local JSON database files (`.json`) or mock DB engines were found in the codebase.

### B. Legacy Multi-Tenant SaaS Remnants (Marked for Safe Removal)
The following files were created for the discontinued multi-tenant subscription model and are unmounted from `server/src/routes/index.js`:
1. `server/src/models/Plan.js` (Monthly subscription tiers)
2. `server/src/models/Subscription.js` (Tenant billing state)
3. `server/src/models/Tenant.js` (SaaS tenant registration)
4. `server/src/models/PlatformAuditLog.js` (SuperAdmin platform logs)
5. `server/src/middleware/tenantMiddleware.js` (Legacy `enforceTenant` middleware)
6. `server/src/modules/subscriptions/` (`subscriptionController.js`, `subscriptionRoutes.js`)
7. `server/src/modules/superAdmin/` (`superAdminController.js`, `superAdminRoutes.js`)
8. `server/src/modules/tenants/` (`tenantController.js`, `tenantRoutes.js`)

*Verification*: None of these files are referenced in `server/src/routes/index.js` or in any of the 20 active client pages. They can be safely retired.

### C. Client-Side Persistence Audit (`localStorage` / `sessionStorage`)
* **Business Data Persistence**: Zero business entities (employees, departments, attendance, payroll) are persisted in `localStorage` or `sessionStorage`. All business data is fetched dynamically via Axios REST calls.
* **Authentication State**:
  * `pr_access_token` (JWT Access Token)
  * `pr_refresh_token` (JWT Refresh Token)
  * `pr_user` (Authenticated user profile object)
  * `pr_company` (Current company branding metadata)
* **Storage Interception**: [`client/src/services/api.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/client/src/services/api.js) automatically attaches `Bearer ${token}` and clears `localStorage` upon 401 expiration.

### D. Active Enterprise Mongoose Models (24 Core Models)
All 24 active business models are backed by Mongoose schemas with indexes, timestamps, and validation:
1. `CompanySettings.js` – Central branding, work hours, modules, localization
2. `Branch.js` – Multi-branch locations (Bengaluru HQ, Mumbai, Hyderabad)
3. `Department.js` – Business divisions with `createdBy` attribution
4. `Designation.js` – Job titles with hierarchy levels and department links
5. `Employee.js` – Complete personnel record with lifecycle tracking
6. `User.js` – System login credentials, bcrypt password hashes, RBAC roles
7. `Shift.js` – Work schedules, timings, grace periods
8. `Attendance.js` – Daily punches, overtime, web clock timestamps
9. `LeaveType.js` – Leave classifications (Casual, Sick, Earned)
10. `LeaveBalance.js` – Per-employee annual leave ledgers
11. `LeaveRequest.js` – Leave applications and multi-tier review workflow
12. `Holiday.js` – Corporate holiday calendar
13. `SalaryStructure.js` – Compensation components and statutory deductions
14. `SalaryRevision.js` – Historical salary hike/increment audit trail
15. `PayrollRun.js` – Monthly payroll batch records
16. `Payslip.js` – Individual payslip vouchers and breakdown
17. `JobOpening.js` – Requisitions and ATS postings
18. `Candidate.js` – Applicant pipeline and candidate-to-employee conversion
19. `PerformanceReview.js` – Appraisals, KRAs, ratings
20. `TrainingProgram.js` – Corporate learning curriculum
21. `TrainingAssignment.js` – Employee learning progress
22. `Asset.js` & `AssetAssignment.js` – Hardware inventory & custody tracking
23. `ExpenseClaim.js` – Reimbursement claims and receipts
24. `Grievance.js` – POSH and confidential support desk tickets
25. `Announcement.js` – Priority broadcasts
26. `Document.js` – Corporate document repository
27. `Notification.js` – Real-time user alert stream
28. `AuditLog.js` – Immutable enterprise audit log

---

## 3. Migration Action Plan

1. **Remove Obsolete SaaS Files**: Delete orphaned modules (`subscriptions`, `superAdmin`, `tenants`), legacy models (`Plan.js`, `Subscription.js`, `Tenant.js`, `PlatformAuditLog.js`), and `tenantMiddleware.js`.
2. **Harden Centralized Atlas Connection**: Ensure `server/src/config/db.js` and `server/src/server.js` reject startup if `MONGODB_URI` is missing or contains placeholder passwords, and prevent any server listener from starting prior to database connection.
3. **Execute Field-by-Field Testing Utility**: Systematically verify every schema and relationship on the live Atlas cluster using temporary test records.
4. **Validate Authentication & Persistence**: Verify all 6 roles and test data persistence across simulated restarts.
5. **Update Documentation**: Produce `DATABASE_SETUP.md` and update `DEVELOPMENT_STATUS.md`.

