# PR VISION HRMS – Client Customization & Delivery Guide

## Executive Overview
**PR VISION HRMS** (by **PR VISION INNOVATIONS** — *People. Process. Performance.*) is built as an enterprise-grade, reusable, single-tenant deployable master software asset. Rather than locking clients into rigid multi-tenant SaaS tiers, PR VISION INNOVATIONS delivers tailored, standalone software instances with customized workflows, branding, and isolated databases.

This guide provides engineering teams with the exact step-by-step procedure to demonstrate the master project, gather requirements, customize components, provision dedicated infrastructure, and hand over production deliverables.

---

## 1. Master Demonstration Phase
Before making any customer-specific modifications:
1. Run the master platform locally or on a staging demo environment:
   ```bash
   # Terminal 1: Backend API Gateway
   cd server
   npm run dev

   # Terminal 2: Vite Frontend Client
   cd client
   npm run dev
   ```
2. Present the working software using the 6 pre-configured role personas:
   - **Director / System Admin** (`admin@prvision.com` / `Password@123`): Executive dashboard, multi-branch setup, audit logs, system diagnostics.
   - **HR Manager** (`hr@prvision.com` / `Password@123`): Complete employee lifecycle (Probation confirmation, promotions, resignations, relieving letters), leave allocations, shift schedules.
   - **Team Manager** (`manager@prvision.com` / `Password@123`): Team roster, leave reviews, KPI appraisal scoring, expense approvals.
   - **Employee** (`employee@prvision.com` / `Password@123`): Self-service portal, ticking web clock-in/out, leave applications, payslip PDF download.
   - **Recruiter** (`recruiter@prvision.com` / `Password@123`): Job requisitions, applicant pipeline stages, one-click candidate-to-employee onboarding.
   - **Payroll Admin** (`payroll@prvision.com` / `Password@123`): Statutory configurations (PF, ESI, Professional Tax, TDS), monthly payroll batch runs, PDF payslips.

---

## 2. Requirement Gathering Matrix
Record customer specifications using this checklist:

| Dimension | Default Master Setting | Customer Specification |
|---|---|---|
| **Company Legal Name** | PR VISION INNOVATIONS | `[Client Legal Name]` |
| **Product Tagline** | People. Process. Performance. | `[Client Tagline]` |
| **Brand Colors** | Deep Navy (`#1E40AF`) | `[Primary / Accent Hex]` |
| **Branch Locations** | Bengaluru, Mumbai, Hyderabad | `[Client Office Locations]` |
| **Biometric Hardware** | eSSL / ZKTeco Web API Sync | `[Device IP / Cloud Bridge]` |
| **Fiscal Year** | April to March (India) | `[Target Calendar]` |
| **Statutory Rules** | EPF (12%), ESI (0.75%), PT (₹200) | `[State / Region Rules]` |
| **Active Modules** | All 20 Modules Enabled | `[Selected Module Subset]` |

---

## 3. Cloning & Customization Steps

### Step 3.1: Create Independent Project Repository
```bash
# Duplicate master code for client (e.g. Acme Corp)
git clone <PR-VISION-HRMS-MASTER-REPO> acme-hrms
cd acme-hrms
git remote remove origin
git remote add origin <CLIENT-PRIVATE-GIT-REPO>
```

### Step 3.2: Configure Dedicated Environment Variables
Create isolated `.env` configurations:

**Server (`server/.env`):**
```env
PORT=5000
NODE_ENV=production
CLIENT_URL=https://hrms.clientdomain.com
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/hrms_client_prod?retryWrites=true&w=majority
JWT_ACCESS_SECRET=<generated_high_entropy_secret_256bit>
JWT_REFRESH_SECRET=<generated_high_entropy_secret_256bit>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

**Client (`client/.env`):**
```env
VITE_API_URL=https://api-hrms.clientdomain.com/api/v1
```

### Step 3.3: Customize Company Branding & Assets
1. **Logo & Favicon**: Replace `client/public/logo.png` and `client/public/favicon.ico`.
2. **Theme Colors**: Update `primaryColor` in `server/src/models/CompanySettings.js` or adjust Tailwind CSS tokens in `client/tailwind.config.js`.
3. **Company Profile**: Update `server/src/scripts/seed.js` with client registration info, tax ID, and address.

### Step 3.4: Toggle Modules
If the client does not require specific modules (e.g., Training or Grievances), toggle them in `CompanySettings`:
```json
{
  "modules": {
    "attendance": true,
    "leaves": true,
    "payroll": true,
    "recruitment": false,
    "training": false,
    "assets": true,
    "expenses": true,
    "grievances": false
  }
}
```
The dynamic frontend navigation honors these module flags automatically.

---

## 4. Hardware Biometric Device Integration
For clients with physical biometric punch terminals (eSSL, ZKTeco, Matrix):
1. Configure the local biometric server/bridge service to push punches via HTTP POST to:
   ```http
   POST https://api-hrms.clientdomain.com/api/v1/attendance/biometric-sync
   Authorization: Bearer <HR_OR_ADMIN_API_TOKEN>
   Content-Type: application/json

   {
     "logs": [
       {
         "employeeCode": "PRV-0004",
         "timestamp": "2026-11-05T09:12:00Z",
         "deviceId": "DEVICE-BLR-01"
       }
     ]
   }
   ```
2. The server converts raw device punches into verified attendance records without manual intervention.

---

## 5. Deployment Options

### Option A: Cloud PaaS Deployment (Recommended)
- **Frontend**: Deploy `client/` to Vercel or Netlify with root directory set to `client` and build command `npm run build`.
- **Backend**: Deploy `server/` to Render, Railway, AWS App Runner, or DigitalOcean App Platform.
- **Database**: Dedicated MongoDB Atlas Dedicated Cluster (M10+ with automated daily snapshots).

### Option B: On-Premise Docker / VM Deployment
Use PM2 process manager on the client's internal Ubuntu Linux VM:
```bash
# Install PM2
npm install -g pm2

# Start Backend
cd server
npm install --production
pm2 start src/server.js --name "client-hrms-api"

# Serve Frontend via Nginx
cd ../client
npm run build
# Configure Nginx to serve client/dist on port 80/443 and proxy /api/v1 to localhost:5000
```

---

## 6. Client Handover Deliverables Checklist
- [x] Complete standalone source code repository
- [x] Dedicated MongoDB Atlas database provisioned with initial master data seeded
- [x] 6 configured role login credentials
- [x] SSL certificate and custom domain mapping (`https://hrms.client.com`)
- [x] Client administrator training session
- [x] System documentation and database ERD (`docs/database-schema.md`)

