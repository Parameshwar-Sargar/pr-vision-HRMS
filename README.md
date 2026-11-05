# PR VISION HRMS

> **People. Process. Performance.**  
> *Developed by PR VISION INNOVATIONS*

PR VISION HRMS is a modern, enterprise-grade Human Resource Management System designed for small, medium, and large businesses. Built with a robust MERN stack architecture, it serves as a reusable, customizable master software asset that PR VISION INNOVATIONS demonstrates to clients, customizes to specific workflows, and delivers as independent, standalone installations.

---

## 🚀 Independent Client & Server Execution (Namaste Dharashiv Live Standard)

The frontend and backend run **completely independently** in two separate terminals with their own environment configurations and scripts.

### Terminal 1: Backend Server (Node.js & Express)
```bash
cd server
npm install
npm run dev
```
- **Port:** `http://localhost:5000`
- **Health Check:** `http://localhost:5000/api/v1/health`
- **Embedded Database:** Automatic in-memory MongoDB fallback in development, or connected to MongoDB Atlas via `MONGODB_URI`.
- **Auto-Seeding:** Auto-seeds initial master enterprise data if database is empty.

### Terminal 2: Frontend Client (React & Vite)
```bash
cd client
npm install
npm run dev
```
- **Port:** `http://localhost:5173`
- **Network Proxy:** Configured to proxy `/api/v1` requests directly to `http://localhost:5000`.

---

## 👥 6 Core Enterprise Role Personas & Demo Credentials

Each role possesses tailored dashboard widgets, action permissions, and access controls:

| Role | Email | Password | Scope & Responsibilities |
|---|---|---|---|
| **Director / System Admin** | `admin@prvision.com` | `Password@123` | Full administrative control, organization settings, multi-branch management, audit logs, system diagnostics. |
| **HR Manager** | `hr@prvision.com` | `Password@123` | Employee lifecycle management (probation, confirmation, promotion, resignation, relieving letters), leaves, shifts, recruitment. |
| **Team Manager** | `manager@prvision.com` | `Password@123` | Team attendance review, leave approval queue, KPI/KRA appraisals, expense claim approvals. |
| **Employee** | `employee@prvision.com` | `Password@123` | Self-service portal, live ticking web clock-in/out, leave applications, expense claims, personal payslips PDF download. |
| **Recruiter** | `recruiter@prvision.com` | `Password@123` | Job requisitions, applicant tracking pipeline (Applied → Screening → Interviewing → Offered → Hired), one-click candidate onboarding. |
| **Payroll Administrator** | `payroll@prvision.com` | `Password@123` | Salary structure configuration, monthly batch payroll runs, statutory deductions (PF, ESI, PT, TDS), PDF payslips. |

> **Tip:** You can also click any of the **6 One-Click Demo Login** buttons on the Login page (`/login`) for instantaneous access without typing credentials!

---

## 🏢 Multi-Branch Architecture

PR VISION HRMS comes pre-configured with 3 operational branch centers:
1. **Bengaluru Headquarters** (`HQ-BLR`): 7th Floor, Innovation Tech Tower, Outer Ring Road, Bellandur, Bengaluru.
2. **Mumbai Regional Office** (`BR-MUM`): Bandra Kurla Complex (BKC), G Block, Mumbai.
3. **Hyderabad Tech Center** (`BR-HYD`): HITEC City, Madhapur, Hyderabad.

---

## 📦 Complete 20-Module Enterprise Feature Suite

1. **Organization & Multi-Branch Management**: Central branding, logo, timezone, currency, address, and physical branch locations.
2. **Role-Based Access Control (RBAC)**: 6 roles with 35+ granular, cryptographically-enforced permission bits.
3. **Complete Employee Lifecycle**: Onboarding, probation tracking, confirmation, promotion, resignation, notice period, exit interview, and relieving/experience letter generation.
4. **Department & Designation Hierarchy**: Real-time employee distribution aggregation and organizational tree.
5. **Attendance Management**: Live ticking clock, web clock-in/out, late arrival grace periods, manual adjustments, and biometric hardware API integration (`POST /api/v1/attendance/biometric-sync`).
6. **Shift & Schedule Management**: Rotational, morning, general, and night shifts with automated break calculations.
7. **Leave Management & Workflows**: Configurable leave policies (Casual, Sick, Earned/Privilege), balance tracking, and multi-level manager/HR approval pipelines.
8. **Holiday Calendar**: Annual calendar with national and regional public holidays per branch.
9. **Payroll & Statutory Compliance**: CTC breakdowns, basic, HRA, special allowances, PF (12%), ESI (0.75%), Professional Tax (₹200), TDS withholding, and vector PDF payslip downloads.
10. **Recruitment & ATS**: Job requisitions, applicant tracking pipeline, candidate rating, and one-click conversion of hired candidates to employees.
11. **Performance Management (PMS)**: KPI and KRA weightage, self-appraisal ratings, manager evaluations, and Performance Improvement Plans (PIP).
12. **Training & Development**: Upskilling catalog, compliance/POSH modules, employee enrollment, and completion certificates.
13. **Expense Claims & Reimbursements**: Travel, meal, and operational claims, receipt uploads, and manager/payroll approval queues.
14. **Asset Management**: Tagging of laptops, monitors, mobile devices, condition logging, and employee allocation/return lifecycles.
15. **Internal Communications & Announcements**: Priority broadcasts (Normal, High, Critical) with top-of-dashboard pinning.
16. **Grievance Redressal & HR Helpdesk**: Confidential dispute resolution, POSH ticketing, priority matrix, and resolution notes.
17. **Document Management Vault**: Category-based file vault (Identity proofs, contracts, certifications) with secure downloads.
18. **Audit Logging & System Diagnostics**: Tamper-evident activity logs tracking user IP, browser user-agent, entity mutations, and server memory telemetry.
19. **Reports & Analytics Engine**: One-click CSV and structured exports for employee master data, attendance timesheets, and monthly payroll registers.
20. **Client Customization Framework**: Detailed step-by-step documentation for cloning, customizing, white-labeling, and deploying independent copies for clients (`docs/client-customization-guide.md`).

---

## 🛠️ Technology Stack

- **Frontend:** React 18, Vite 6, Tailwind CSS v3, React Router v7, Redux Toolkit, Axios, Lucide React, Recharts, React Hot Toast.
- **Backend:** Node.js (ES Modules), Express.js, MongoDB (Mongoose 8), JWT Authentication, bcryptjs, Zod, Helmet, CORS, Cookie Parser, PDFKit, Multer, mongodb-memory-server.
- **Testing:** Vitest, Supertest.

---

## 🧪 Automated Verification & Testing

### Run Backend Integration Tests
```bash
cd server
npm test
```

### Run Frontend Production Build
```bash
cd client
npm run build
```

---

## 📖 Additional Documentation
- [Client Customization & Deployment Guide](docs/client-customization-guide.md)
- [Database Schema & Architecture](docs/database-schema.md)

