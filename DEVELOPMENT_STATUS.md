# PR VISION HRMS – Enterprise Master Development Status

**Product**: PR VISION HRMS (People. Process. Performance.)  
**Organization**: PR VISION INNOVATIONS  
**Architecture**: Master Enterprise HRMS (Client-Customizable, Independently Deployable, Single-Tenant per Client Deployment)  
**Status Updated**: 2026-11-05  

---

## 🚦 Phase Execution Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Enterprise Re-Architecture & SaaS/SuperAdmin Decoupling | 🔄 In Progress |
| **Phase 2** | Authentication, 6 Enterprise Roles & Granular Permission RBAC | ⏳ Pending |
| **Phase 3** | Organization Hierarchy (Branches, Locations) & Employee Lifecycle | ⏳ Pending |
| **Phase 4** | Attendance Engine, Biometric Architecture, Shifts & Scheduling | ⏳ Pending |
| **Phase 5** | Leave Management, Accruals, Multi-Level Approvals & Holidays | ⏳ Pending |
| **Phase 6** | Configurable Payroll Engine, Statutory Compliance & PDF Payslips | ⏳ Pending |
| **Phase 7** | Recruitment & Applicant Tracking System (ATS) | ⏳ Pending |
| **Phase 8** | Performance Appraisals (KPIs/KRAs) & Training Programs | ⏳ Pending |
| **Phase 9** | Expense Reimbursements, Asset Tracking & Document Vault | ⏳ Pending |
| **Phase 10** | Employee Self-Service (ESS), Grievance Desk & Announcements | ⏳ Pending |
| **Phase 11** | Comprehensive Reporting, Data Exports & System Administration | ⏳ Pending |
| **Phase 12** | Client Customization Guide, Automated Testing & Documentation | ⏳ Pending |

---

## 👥 Enterprise Roles & Access Matrix
1. **ADMIN** (Master Company Administrator): Full access to configuration, roles, all modules, and security audit logs.
2. **HR_MANAGER**: Employee lifecycle, onboarding/offboarding, departments, designations, leaves, documents, announcements.
3. **MANAGER**: Assigned team attendance, team leave approvals, shift scheduling, performance appraisals, team grievances.
4. **EMPLOYEE**: Employee Self-Service (ESS) - personal profile, clock in/out, leave apply, payslip view/download, expense claims, documents, grievance submission.
5. **RECRUITER**: Talent acquisition, job requisitions, candidate pipeline, interview scheduling, offers, candidate conversion.
6. **PAYROLL_ADMIN**: Salary structure configuration, statutory PF/ESI/PT/TDS rules, monthly payroll processing, payslip issuance.

---

## 🏢 Independent Execution Model
- **Frontend**:
  ```bash
  cd client
  npm run dev
  # Accessible at http://localhost:5173
  ```
- **Backend**:
  ```bash
  cd server
  npm run dev
  # Accessible at http://localhost:5000
  ```
