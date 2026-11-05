# PR VISION HRMS – Database Architecture & Schema Documentation

## 1. Multi-Tenant Strategy
PR VISION HRMS implements a shared-database, shared-collections multi-tenancy model. Every tenant-specific collection enforces tenant data isolation using a mandatory `tenantId` (ObjectId referencing the `Tenant` collection).

### Strict Tenant Isolation Rules:
1. Every tenant-scoped document includes `{ tenantId: ObjectId, index: true }`.
2. Compound indexes (`{ tenantId: 1, ... }`) enforce unique constraints and efficient querying per tenant.
3. Server-side context extracted from verified JWT tokens provides the authoritative `tenantId`; requests never trust client-supplied `tenantId` in the body or query params.
4. Soft deletion is supported via `isDeleted` flags where appropriate.
5. Passwords, refresh tokens, and sensitive salary details are guarded via Mongoose `toJSON` transforms and role-based projections.

---

## 2. Platform Collections

### `tenants`
Stores registered company accounts and operational configuration.
- `_id`: ObjectId
- `name`: String (Company Name)
- `slug`: String (Unique URL slug)
- `domain`: String (Optional custom domain)
- `logo`: String (URL or base64)
- `address`: Object (street, city, state, country, postalCode)
- `contactEmail`: String
- `contactPhone`: String
- `businessInfo`: Object (taxId, registrationNumber, industry, website)
- `settings`: Object (timezone, currency, dateFormat, workingDays, standardWorkHoursPerDay)
- `status`: Enum ('active', 'suspended', 'trial', 'expired')
- `planId`: Ref -> Plan
- `planName`: String
- `employeeLimit`: Number
- `trialEndsAt`: Date
- `isDeleted`: Boolean
- `createdAt`, `updatedAt`

### `plans`
SaaS subscription pricing tiers.
- `_id`: ObjectId
- `name`: String ('Starter', 'Growth', 'Business', 'Enterprise')
- `code`: Enum ('free_trial', 'starter', 'growth', 'business', 'enterprise')
- `priceMonthly`: Number
- `priceYearly`: Number
- `maxEmployees`: Number
- `features`: Array<String>
- `isActive`: Boolean

### `subscriptions`
Tenant billing status and invoicing records.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `planId`: Ref -> Plan
- `status`: Enum ('active', 'past_due', 'cancelled', 'trialing')
- `billingCycle`: Enum ('monthly', 'yearly')
- `amount`: Number
- `currency`: String
- `currentPeriodStart`, `currentPeriodEnd`: Date
- `invoices`: Array<{ invoiceId, amount, paidAt, status, pdfUrl }>

### `platformAuditLogs`
Super-admin level audit logs for tenant lifecycle events.
- `_id`: ObjectId
- `action`: String
- `actorId`: Ref -> User
- `actorEmail`: String
- `targetTenantId`: Ref -> Tenant
- `details`: Mixed
- `ipAddress`, `userAgent`: String
- `createdAt`: Date

---

## 3. Tenant Collections

### `users`
Authentication accounts for all user roles.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant (null for SUPER_ADMIN, required for others)
- `email`: String (Unique compound index with `tenantId`)
- `password`: String (Bcrypt hash)
- `name`: String
- `role`: Enum ('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE')
- `permissions`: Array<String>
- `employeeId`: Ref -> Employee
- `isActive`: Boolean
- `refreshToken`: String
- `lastLoginAt`: Date

### `employees`
Complete personnel profiles.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `userId`: Ref -> User
- `employeeId`: String (e.g., EMP-001, unique per tenant)
- `firstName`, `lastName`: String
- `fullName`: Virtual
- `email`, `phone`, `avatar`: String
- `dateOfBirth`, `gender`, `joiningDate`: Date / Enum
- `departmentId`: Ref -> Department
- `designationId`: Ref -> Designation
- `managerId`: Ref -> Employee
- `shiftId`: Ref -> Shift
- `employmentType`: Enum ('Full-Time', 'Part-Time', 'Contract', 'Intern')
- `employmentStatus`: Enum ('Active', 'On Leave', 'Probation', 'Terminated')
- `address`, `emergencyContact`, `bankDetails`: Objects
- `isDeleted`: Boolean

### `departments`
Company organizational departments.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `name`: String (Unique per tenant)
- `code`: String
- `description`: String
- `headId`: Ref -> Employee
- `isActive`, `isDeleted`: Boolean

### `designations`
Job titles mapped to departments.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `title`: String
- `code`: String
- `departmentId`: Ref -> Department
- `level`: Number
- `isActive`, `isDeleted`: Boolean

### `shifts`
Work schedules and office timings.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `name`: String
- `startTime`, `endTime`: String ("09:00", "18:00")
- `breakDurationMinutes`, `gracePeriodMinutes`: Number
- `weeklyOffDays`: Array<Number> (0 = Sunday, 6 = Saturday)
- `isDefault`, `isActive`: Boolean

### `attendance`
Daily attendance timestamps and computed work hours.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `employeeId`: Ref -> Employee
- `date`: Date (Normalized day)
- `checkInTime`, `checkOutTime`: Date
- `status`: Enum ('Present', 'Late', 'Half-day', 'Absent', 'On Leave')
- `totalHours`, `overtimeHours`: Number
- `correctionRequest`: Object (requested times, status, reviewer notes)
- Compound Index: `{ tenantId: 1, employeeId: 1, date: 1 }` (Strict uniqueness)

### `leaveTypes`
Tenant leave policy configurations.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `name`, `code`: String
- `defaultDaysPerYear`: Number
- `isPaid`, `requiresApproval`, `isActive`: Boolean

### `leaveBalances`
Annual quota tracking per employee.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `employeeId`: Ref -> Employee
- `year`: Number
- `balances`: Array<{ leaveTypeId, allocated, used, pending, remaining }>

### `leaveRequests`
Leave applications with manager review workflow.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `employeeId`: Ref -> Employee
- `leaveTypeId`: Ref -> LeaveType
- `startDate`, `endDate`: Date
- `totalDays`: Number
- `reason`: String
- `status`: Enum ('Pending', 'Approved', 'Rejected', 'Cancelled')
- `reviewedBy`: Ref -> User
- `reviewRemarks`: String

### `holidays`
Company and public holiday calendar.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `name`: String
- `date`: Date
- `year`: Number
- `description`: String
- `isOptional`: Boolean

### `salaryStructures`
Configurable compensation packages and statutory rule toggles.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `employeeId`: Ref -> Employee
- `basicSalary`, `hra`, `specialAllowance`: Number
- `customComponents`: Array<{ name, type, calculationType, value, isStatutory }>
- `statutoryConfig`: Object (pfEnabled, pfEmployeeRate, esiEnabled, esiEmployeeRate, professionalTax, tdsDeduction)
- `effectiveFrom`: Date
- `isActive`: Boolean

### `payrollRuns`
Monthly payroll processing batches.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `month`, `year`: Number
- `status`: Enum ('Draft', 'Processing', 'Approved', 'Paid')
- `totalEmployees`, `totalGrossSalary`, `totalDeductions`, `totalNetSalary`: Number
- `processedBy`, `approvedBy`: Ref -> User
- `paymentDate`: Date

### `payslips`
Itemized employee payslips for each payroll run.
- `_id`: ObjectId
- `tenantId`: Ref -> Tenant
- `payrollRunId`: Ref -> PayrollRun
- `employeeId`: Ref -> Employee
- `month`, `year`: Number
- `payslipNumber`: String
- `basicSalary`, `earnings`, `deductions`, `grossSalary`, `totalDeductions`, `netSalary`: Numbers/Arrays
- `workingDays`, `presentDays`, `lossOfPayDays`: Number
- `paymentStatus`: Enum ('Pending', 'Paid')

### `jobOpenings` & `candidates`
Recruitment job requisitions and candidate hiring pipeline.

### `performanceReviews`
Periodic employee goal tracking and manager appraisals.

### `documents`
Secure document storage metadata and category tagging.

### `notifications`
Targeted in-app alerts and system announcements.

### `auditLogs`
Tenant-scoped immutable audit log of sensitive HR, attendance, and payroll operations.

