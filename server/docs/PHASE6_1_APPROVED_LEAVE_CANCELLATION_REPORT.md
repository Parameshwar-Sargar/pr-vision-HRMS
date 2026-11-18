# PR VISION HRMS — Phase 6.1 Approved Leave Cancellation Authorization Implementation Report

**Project**: PR VISION HRMS — *People. Process. Performance.* (`PR VISION INNOVATIONS`)  
**Phase**: Phase 6.1 — Approved Leave Cancellation Authorization & Safe Payroll Adjustment Workflow  
**Test Safety**: Backend tests executed exclusively against isolated `MongoMemoryServer` instances; frontend tests executed against mocked `api.defaults.adapter` + Redux stores. **Zero live MongoDB Atlas (`pr_vision_hrms`) records were modified or repaired.**

---

## 1. Objectives & Authorization Rules Implemented

| Scenario / Request Status | Allowed Actors | Forbidden Actors (`403`) | Mandatory Cancellation Reason | Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| **`Pending` Leave Request** | Applicant (`isOwner`) or `HR_MANAGER` / `ADMIN` / `SUPER_ADMIN` | Non-owner `EMPLOYEE`, `MANAGER`, `RECRUITER`, `PAYROLL_ADMIN` | Optional (stored if supplied) | Atomic CAS status `-> Cancelled`; atomic `LeaveBalance` decrement of `pending` + recalculate `remaining`; `AuditLog` (`LEAVE_CANCELLED`). |
| **`Approved` Leave Request** | **`HR_MANAGER`**, `ADMIN`, `SUPER_ADMIN` (`isAdminOrHR`) | Applicant `EMPLOYEE` (own leave blocked), peer `EMPLOYEE`, `MANAGER` (even reporting manager), `RECRUITER`, `PAYROLL_ADMIN` | **Mandatory** (`cancellationReason` trimmed length `>= 3`; `400` otherwise) | Atomic CAS status `-> Cancelled`; atomic `LeaveBalance` decrement of `used` + recalculate `remaining`; `Attendance` reversion; `AuditLog` (`LEAVE_CANCELLED`); locked-payroll detection & `PayrollAdjustment` queue. |
| **`Cancelled` / `Rejected`** | None (`400` Bad Request) | None (validation rejects `400`) | N/A | Zero mutation; prevents duplicate cancellation & duplicate balance restoration. |

---

## 2. Architecture & Data Model Changes

### Backend Models & Middleware
1. **[`LeaveRequest.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/src/models/LeaveRequest.js#L63-L80)**:
   - Added `cancellationReason`, `cancelledBy` (`ObjectId` ref `'User'`), `cancelledAt` (`Date`), and `cancelledFromStatus`.
2. **[`PayrollAdjustment.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/src/models/PayrollAdjustment.js)** *(new model)*:
   - Tracks safe future payroll adjustments triggered when an approved leave overlapping a **`Paid` / `isLocked`** `PayrollRun` is cancelled without altering historical payslips or runs.
   - Enforces a unique compound index `{ leaveRequestId: 1, sourceMonth: 1, sourceYear: 1 }` as defense-in-depth against duplicate adjustment creation.
   - Supports lifecycle `Pending -> Approved / Waived -> Applied` (`DEDUCTION` for unpaid absences replacing paid leave; `CREDIT` for previously penalized LWP reversals).
3. **[`auditMiddleware.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/src/middleware/auditMiddleware.js#L21-L35)**:
   - Returns the `AuditLog.create(...)` promise (while preserving its `.catch(...)` non-blocking behavior for fire-and-forget callers) so `await logAudit(...)` deterministically completes persistence before returning responses.

### Backend Controllers & Routes
1. **[`leaveController.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/src/modules/leaves/leaveController.js)**:
   - **`cancelLeaveRequest`**:
     - Enforces strict role split (`Pending`: owner or `isAdminOrHR`; `Approved`: `isAdminOrHR` only, explicitly rejecting employee self-cancellation with `403`).
     - Enforces mandatory `cancellationReason` (`>= 3` characters) on `'Approved'` cancellations.
     - Executes an atomic Compare-And-Set (`LeaveRequest.findOneAndUpdate({ _id, status: previousStatus }, ...)`) so concurrent cancellation attempts result in exactly one `200` winner and zero double restorations.
     - Executes an atomic MongoDB aggregation-pipeline `LeaveBalance.findOneAndUpdate` clamping `used`/`pending` `>= 0` and recalculating `remaining = max(0, round((allocated - used - pending) * 10) / 10)` in a single write.
     - **`syncCancelledApprovedLeaveToAttendance`**:
       - Skips any day covered by another active `'Approved'` leave.
       - Restores `'On Leave'` records that already have `checkInTime` back to `'Present'` (or `'Half-day'` if `totalHours > 0 && totalHours < 4`).
       - Deletes synthetic `'On Leave'` placeholders on future dates (`> endOfToday`), shift `weeklyOffDays`, or non-optional `Holiday` dates matching employee branch so off-days and upcoming days are never misclassified `'Absent'`.
       - Converts past/today unpunched scheduled workday `'On Leave'` records to `'Absent'` (re-enabling accurate LOP calculation on unlocked payroll runs).
     - **`handleLockedPayrollForCancelledLeave`**:
       - Checks distinct working-day `(month, year)` buckets touched by the cancelled leave.
       - Never mutates historical `PayrollRun` or `Payslip` records when `status === 'Paid' || isLocked === true`.
       - Computes daily rate from `SalaryStructure` / `Payslip` and queues an idempotent `Pending` `PayrollAdjustment` (`DEDUCTION` for unpunched paid leave days reverted to `Absent`; `CREDIT` for cancelled LWP days previously penalized as `lopDays`).
     - Logs comprehensive `LEAVE_CANCELLED` `AuditLog` including `actorId`, `actorEmail`, `actorRole`, `cancelledAt`, `cancellationReason`, `previousStatus`, `attendanceSync`, and `payrollImpact`.
   - Populated `cancelledBy` in `getLeaveRequests` and `getLeaveRequestById`.
2. **[`payrollController.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/src/modules/payroll/payrollController.js) & [`payrollRoutes.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/src/modules/payroll/payrollRoutes.js)**:
   - Added `GET /api/v1/payroll/adjustments` (`getPayrollAdjustments`, privileged see all / employees strictly own) and `PATCH /api/v1/payroll/adjustments/:id` (`reviewPayrollAdjustment`, restricted to `ADMIN`, `HR_MANAGER`, `PAYROLL_ADMIN` for `Approved` or `Waived`, blocking edits once `'Applied'`).
   - Updated `generatePayrollRun` to settle matching `'Approved'` adjustments as itemized `earnings` (`Leave Adjustment Credit`) or `deductions` (`Leave Adjustment Recovery`) on subsequent open payroll runs while marking settled adjustments `'Applied'` (and safely unbinding if an unlocked run is regenerated prior to payment).

### Frontend Integration
1. **[`queryCache.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/client/src/services/queryCache.js#L76-L83)**: Preserved `leaves` -> `dashboard`, `attendance`, `reports` invalidation and added `payroll` cache invalidation specifically when `/cancel` executes.
2. **[`LeavesPage.jsx`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/client/src/pages/leaves/LeavesPage.jsx)**:
   - Keeps 1-click `Cancel` for owners/HR on `'Pending'` requests.
   - Displays `Cancel Approved` **exclusively** for `ADMIN`, `SUPER_ADMIN`, and `HR_MANAGER` (`isAdminOrHR`) on `'Approved'` requests (hidden from Employees, Managers, Recruiters, Payroll Admins).
   - Opens a mandatory `Cancel Approved Leave Request` modal requiring a reason (`>= 3` chars), surfaces locked-payroll adjustment notice if queued, and displays `req.cancellationReason` on cancelled rows.
3. **[`PayrollPage.jsx`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/client/src/pages/payroll/PayrollPage.jsx)**:
   - Added a lazily loaded `Future Payroll Adjustments` tab for Admin/HR/Payroll Admin (zero extra initial-load network calls on `/payroll`) supporting `Approve for Next Run` and `Waive`.

---

## 3. Automated Test Suites Added & Updated

- **[`server/tests/phase61ApprovedLeaveCancel.test.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/tests/phase61ApprovedLeaveCancel.test.js)** (**4 / 4 scenarios passed**):
  1. HR cancellation of `Pending` & `Approved` requests, mandatory reason validation (`400`), blocks on `EMPLOYEE` (own leave `403`), `PEER`, `MANAGER`, `PAYROLL_ADMIN`, `RECRUITER`, and full `AuditLog` field verification.
  2. Concurrent twin cancellation race test (`Promise.all`) verifying strictly one `200`, one `400`, and single `LeaveBalance` restoration.
  3. Past `On Leave` attendance sync across `checkInTime -> Present`, unpunched workday `-> Absent`, weekend/holiday placeholder cleanup, and unlocked payroll recomputation.
  4. `Paid` / `isLocked` historical payroll immutability (byte-for-byte unchanged `PayrollRun` & `Payslip`), `PayrollAdjustment` (`DEDUCTION` + `CREDIT`) queueing, RBAC enforcement on adjustments, `Approve` -> `Waive` workflow, and exact settlement in the next month's `Payslip`.
- **[`server/tests/phase6WorkflowE2E.test.js`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/server/tests/phase6WorkflowE2E.test.js#L853-L855)**: Updated Employee Approved leave self-cancellation assertion from `400` to `403`.
- **[`client/src/__tests__/phase61ApprovedLeaveCancelUI.test.jsx`](file:///c:/Users/admin/OneDrive/Desktop/HRMS/client/src/__tests__/phase61ApprovedLeaveCancelUI.test.jsx)** (**3 / 3 scenarios passed**):
  1. Verifies `EMPLOYEE` and `MANAGER` never see `Cancel Approved` on `'Approved'` requests while keeping Pending `Cancel`.
  2. Verifies `HR_MANAGER` modal mandatory reason enforcement, submission payload, cancelled reason display, and cache tag invalidation (`leaves`, `dashboard`, `attendance`, `reports`, `payroll`).
  3. Verifies `PayrollPage` lazy `Future Payroll Adjustments` tab fetch and `Approve for Next Run` action without adding initial mount requests.

---

## 4. Final Repository Verification Snapshot

- **Backend Syntax Check (`server/src/**/*.js`)**: `94` files checked, `0` errors.
- **Backend Full Test Suite (`cd server; npm test`)**: **5 test files passed (5), 61 tests passed (61), 0 failed, 0 skipped**:
  - `tests/enterpriseHRMS.test.js`: `24 / 24 passed`
  - `tests/phase4Security.test.js`: `15 / 15 passed`
  - `tests/phase5Functional.test.js`: `8 / 8 passed`
  - `tests/phase6WorkflowE2E.test.js`: `10 / 10 passed`
  - `tests/phase61ApprovedLeaveCancel.test.js`: `4 / 4 passed`
- **Frontend Full Test Suite (`cd client; npm test`)**: **5 test files passed (5), 38 tests passed (38), 0 failed, 0 skipped**:
  - `src/__tests__/phase3Verification.test.js`: `18 / 18 passed`
  - `src/__tests__/phase3Integration.test.jsx`: `6 / 6 passed`
  - `src/__tests__/phase5Integration.test.jsx`: `5 / 5 passed`
  - `src/__tests__/phase6WorkflowIntegration.test.jsx`: `6 / 6 passed`
  - `src/__tests__/phase61ApprovedLeaveCancelUI.test.jsx`: `3 / 3 passed`
- **Frontend Production Build (`cd client; npm run build`)**: `✓ 2109 modules transformed`, built with `0` errors.
- **Database Safety**: Live MongoDB Atlas `pr_vision_hrms` verified untouched (`0` writes across all 29 collections).
