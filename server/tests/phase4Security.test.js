import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import './setup.js';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { seedDatabase } from '../src/scripts/seed.js';
import User from '../src/models/User.js';
import Employee from '../src/models/Employee.js';
import Attendance from '../src/models/Attendance.js';
import LeaveRequest from '../src/models/LeaveRequest.js';
import Payslip from '../src/models/Payslip.js';
import ExpenseClaim from '../src/models/ExpenseClaim.js';
import PerformanceReview from '../src/models/PerformanceReview.js';
import TrainingProgram from '../src/models/TrainingProgram.js';
import TrainingAssignment from '../src/models/TrainingAssignment.js';
import Grievance from '../src/models/Grievance.js';
import Asset from '../src/models/Asset.js';
import Document from '../src/models/Document.js';
import UserSession from '../src/models/UserSession.js';
import CompanySettings from '../src/models/CompanySettings.js';
import { UPLOAD_ROOT } from '../src/utils/securityUtils.js';

const api = request(app);

let adminSession;
let hrSession;
let managerSession;
let employeeSession;
let recruiterSession;
let payrollSession;

let adminEmp;
let hrEmp;
let managerEmp;
let devEmp;
let recruiterEmp;
let payrollEmp;
let snehaEmp;

let deptId;
let desigId;
let uploadedFilesBefore = new Set();

const snapshotUploads = () => {
  if (!fs.existsSync(UPLOAD_ROOT)) return new Set();
  const entries = [];
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else entries.push(full);
    }
  };
  walk(UPLOAD_ROOT);
  return new Set(entries);
};

const loginAs = async (email, tabId) => {
  const res = await api
    .post('/api/v1/auth/login')
    .set('X-Tab-Id', tabId)
    .send({ email, password: 'Password@123', tabId });
  expect(res.status).toBe(200);
  return {
    accessToken: res.body.data.tokens.accessToken,
    refreshToken: res.body.data.tokens.refreshToken,
    sessionId: res.body.data.session.sessionId,
    user: res.body.data.user,
  };
};

describe('PR VISION HRMS — Phase 4 Security, RBAC, IDOR & Session Isolation', () => {
  beforeAll(async () => {
    uploadedFilesBefore = snapshotUploads();
    await seedDatabase({ disconnect: false });

    // Update CompanySettings with secret biometricConfig to test non-admin sanitization
    await CompanySettings.updateOne(
      {},
      {
        $set: {
          biometricConfig: {
            enabled: true,
            deviceType: 'ZKTeco / eSSL',
            serverIp: '10.0.0.55',
            port: 4370,
            autoSyncIntervalMinutes: 15,
          },
        },
      }
    );

    [adminSession, hrSession, managerSession, employeeSession, recruiterSession, payrollSession] =
      await Promise.all([
        loginAs('admin@prvision.com', 'tab-admin'),
        loginAs('hr@prvision.com', 'tab-hr'),
        loginAs('manager@prvision.com', 'tab-mgr'),
        loginAs('employee@prvision.com', 'tab-emp'),
        loginAs('recruiter@prvision.com', 'tab-rec'),
        loginAs('payroll@prvision.com', 'tab-pay'),
      ]);

    const employees = await Employee.find({ isDeleted: false }).lean();
    adminEmp = employees.find((e) => e.email === 'admin@prvision.com');
    hrEmp = employees.find((e) => e.email === 'hr@prvision.com');
    managerEmp = employees.find((e) => e.email === 'manager@prvision.com');
    devEmp = employees.find((e) => e.email === 'employee@prvision.com');
    recruiterEmp = employees.find((e) => e.email === 'recruiter@prvision.com');
    payrollEmp = employees.find((e) => e.email === 'payroll@prvision.com');
    snehaEmp = employees.find((e) => e.email === 'sneha.rao@prvision.com');
    deptId = devEmp.departmentId;
    desigId = devEmp.designationId;
  });

  afterAll(() => {
    const after = snapshotUploads();
    for (const f of after) {
      if (!uploadedFilesBefore.has(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // ignore cleanup failure
        }
      }
    }
  });

  it('1. Rejects unauthenticated access across protected endpoints (401)', async () => {
    const endpoints = [
      ['get', '/api/v1/auth/me'],
      ['get', '/api/v1/employees'],
      ['get', '/api/v1/employees/me'],
      ['get', '/api/v1/leaves/requests'],
      ['get', '/api/v1/attendance'],
      ['get', '/api/v1/payroll/runs'],
      ['get', '/api/v1/payroll/payslips'],
      ['get', '/api/v1/documents'],
      ['get', '/api/v1/expenses'],
      ['get', '/api/v1/grievances'],
      ['get', '/api/v1/assets'],
      ['get', '/api/v1/reports/employees'],
      ['get', '/api/v1/system/diagnostics'],
    ];

    for (const [method, url] of endpoints) {
      const res = await api[method](url);
      expect(res.status, `${method.toUpperCase()} ${url} should require auth`).toBe(401);
    }
  });

  it('2. Blocks EMPLOYEE from Admin, HR, Payroll, Recruitment, Reports & System endpoints (403)', async () => {
    const forbiddenForEmployee = [
      ['get', '/api/v1/employees'],
      ['post', '/api/v1/employees', { firstName: 'X', lastName: 'Y', email: 'x@prvision.com', departmentId: deptId }],
      ['put', '/api/v1/organization/settings', { companyName: 'Hacked' }],
      ['get', '/api/v1/payroll/runs'],
      ['post', '/api/v1/payroll/runs/generate', { month: 1, year: 2026 }],
      ['get', `/api/v1/payroll/structures/${devEmp._id}`],
      ['get', '/api/v1/recruitment/candidates'],
      ['post', '/api/v1/recruitment/jobs', { title: 'Test', departmentId: deptId, description: 'Test job' }],
      ['get', '/api/v1/reports/employees'],
      ['get', '/api/v1/reports/attendance'],
      ['get', '/api/v1/reports/payroll'],
      ['get', '/api/v1/system/roles-permissions'],
      ['get', '/api/v1/system/audit-logs'],
      ['get', '/api/v1/system/diagnostics'],
    ];

    for (const [method, url, body] of forbiddenForEmployee) {
      const req = api[method](url).set('Authorization', `Bearer ${employeeSession.accessToken}`);
      const res = body ? await req.send(body) : await req;
      expect(res.status, `EMPLOYEE on ${method.toUpperCase()} ${url}`).toBe(403);
    }
  });

  it('3. Blocks HR_MANAGER privilege escalation into ADMIN/SUPER_ADMIN and protects Admin accounts (403)', async () => {
    const createAdminRes = await api
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${hrSession.accessToken}`)
      .send({
        firstName: 'Rogue',
        lastName: 'Admin',
        email: 'rogue.admin@prvision.com',
        departmentId: deptId,
        designationId: desigId,
        role: 'ADMIN',
      });
    expect(createAdminRes.status).toBe(403);

    const createSuperRes = await api
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${hrSession.accessToken}`)
      .send({
        firstName: 'Rogue',
        lastName: 'Super',
        email: 'rogue.super@prvision.com',
        departmentId: deptId,
        designationId: desigId,
        role: 'SUPER_ADMIN',
      });
    expect(createSuperRes.status).toBe(403);

    const editAdminRes = await api
      .patch(`/api/v1/employees/${adminEmp._id}`)
      .set('Authorization', `Bearer ${hrSession.accessToken}`)
      .send({ firstName: 'Tampered' });
    expect(editAdminRes.status).toBe(403);

    const deleteAdminRes = await api
      .delete(`/api/v1/employees/${adminEmp._id}`)
      .set('Authorization', `Bearer ${hrSession.accessToken}`);
    expect(deleteAdminRes.status).toBe(403);

    const diagnosticsRes = await api
      .get('/api/v1/system/diagnostics')
      .set('Authorization', `Bearer ${hrSession.accessToken}`);
    expect(diagnosticsRes.status).toBe(403);
  });

  it('4. Enforces strict EMPLOYEE IDOR boundaries on other employees resources (403)', async () => {
    const [otherLeave, otherPayslip, otherPerf] = await Promise.all([
      LeaveRequest.findOne({ employeeId: recruiterEmp._id }).lean(),
      Payslip.findOne({ employeeId: recruiterEmp._id }).lean(),
      PerformanceReview.findOne({ employeeId: devEmp._id }).lean(),
    ]);

    const empAuth = `Bearer ${employeeSession.accessToken}`;

    // Profile IDOR
    const otherProfile = await api.get(`/api/v1/employees/${recruiterEmp._id}`).set('Authorization', empAuth);
    expect(otherProfile.status).toBe(403);

    // Leave IDOR
    const otherBalances = await api
      .get(`/api/v1/leaves/balances?employeeId=${recruiterEmp._id}`)
      .set('Authorization', empAuth);
    expect(otherBalances.status).toBe(403);

    if (otherLeave) {
      const otherLeaveRes = await api
        .get(`/api/v1/leaves/requests/${otherLeave._id}`)
        .set('Authorization', empAuth);
      expect(otherLeaveRes.status).toBe(403);

      const cancelOtherLeave = await api
        .post(`/api/v1/leaves/requests/${otherLeave._id}/cancel`)
        .set('Authorization', empAuth);
      expect(cancelOtherLeave.status).toBe(403);
    }

    // Attendance query IDOR
    const otherAtt = await api
      .get(`/api/v1/attendance?employeeId=${recruiterEmp._id}`)
      .set('Authorization', empAuth);
    expect(otherAtt.status).toBe(403);

    // Payslip list & PDF IDOR
    const otherPayslipQuery = await api
      .get(`/api/v1/payroll/payslips?employeeId=${recruiterEmp._id}`)
      .set('Authorization', empAuth);
    expect(otherPayslipQuery.status).toBe(403);

    if (otherPayslip) {
      const pdfIdor = await api
        .get(`/api/v1/payroll/payslips/${otherPayslip._id}/pdf`)
        .set('Authorization', empAuth);
      expect(pdfIdor.status).toBe(403);
    }

    // Grievance, Expense, Asset query IDORs
    expect(
      (await api.get(`/api/v1/grievances?employeeId=${recruiterEmp._id}`).set('Authorization', empAuth)).status
    ).toBe(403);
    expect(
      (await api.get(`/api/v1/expenses?employeeId=${recruiterEmp._id}`).set('Authorization', empAuth)).status
    ).toBe(403);
    expect(
      (await api.get(`/api/v1/assets?employeeId=${recruiterEmp._id}`).set('Authorization', empAuth)).status
    ).toBe(403);

    // Performance self-review IDOR (test recruiter trying to submit devEmp's self review)
    if (otherPerf) {
      const selfRevIdor = await api
        .patch(`/api/v1/performance/${otherPerf._id}/self-review`)
        .set('Authorization', `Bearer ${recruiterSession.accessToken}`)
        .send({ selfRating: 5, comments: 'Unauthorized' });
      expect(selfRevIdor.status).toBe(403);
    }
  });

  it('5. Isolates RECRUITER from employee directory, payroll, reports, audit logs, and other employees PII', async () => {
    const recAuth = `Bearer ${recruiterSession.accessToken}`;

    expect((await api.get('/api/v1/employees').set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/employees/${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get('/api/v1/payroll/runs').set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/payroll/structures/${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/payroll/payslips?employeeId=${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get('/api/v1/reports/employees').set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get('/api/v1/reports/payroll').set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get('/api/v1/system/audit-logs').set('Authorization', recAuth)).status).toBe(403);

    // Dashboard for recruiter must omit audit activities, payroll, expenses, leaves, and birthdays
    const dashRes = await api.get('/api/v1/dashboard/stats').set('Authorization', recAuth);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.recentActivities).toEqual([]);
    expect(dashRes.body.data.upcomingBirthdays).toEqual([]);
    expect(dashRes.body.data.kpi.latestPayroll).toBeNull();
    expect(dashRes.body.data.kpi.pendingExpenses).toBe(0);

    // Cross-employee IDOR checks for RECRUITER (previously fell through)
    expect((await api.get(`/api/v1/leaves/requests?employeeId=${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/grievances?employeeId=${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/expenses?employeeId=${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/performance?employeeId=${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/training/assignments?employeeId=${devEmp._id}`).set('Authorization', recAuth)).status).toBe(403);
  });

  it('6. Restricts PAYROLL_ADMIN from recruitment pipelines and HR-only mutations (403)', async () => {
    const payAuth = `Bearer ${payrollSession.accessToken}`;

    expect((await api.get('/api/v1/recruitment/candidates').set('Authorization', payAuth)).status).toBe(403);
    expect(
      (await api
        .post('/api/v1/employees')
        .set('Authorization', payAuth)
        .send({ firstName: 'A', lastName: 'B', email: 'ab@prvision.com', departmentId: deptId })).status
    ).toBe(403);
    expect(
      (await api
        .patch(`/api/v1/employees/${devEmp._id}/promote`)
        .set('Authorization', payAuth)
        .send({})).status
    ).toBe(403);
    expect((await api.get('/api/v1/system/audit-logs').set('Authorization', payAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/grievances?employeeId=${devEmp._id}`).set('Authorization', payAuth)).status).toBe(403);

    // Dashboard for payroll admin must NOT leak audit logs or recruitment stats
    const dashRes = await api.get('/api/v1/dashboard/stats').set('Authorization', payAuth);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.recentActivities).toEqual([]);
    expect(dashRes.body.data.upcomingBirthdays).toEqual([]);
    expect(dashRes.body.data.kpi.openJobCount).toBe(0);
    expect(dashRes.body.data.kpi.activeCandidates).toBe(0);
  });

  it('7. Scopes MANAGER strictly to direct team and strips sensitive bank/address PII', async () => {
    const mgrAuth = `Bearer ${managerSession.accessToken}`;

    // Can read direct report (devEmp) but WITHOUT bankDetails/previousEmployment/address/emergencyContact
    const teamProfile = await api.get(`/api/v1/employees/${devEmp._id}`).set('Authorization', mgrAuth);
    expect(teamProfile.status).toBe(200);
    expect(teamProfile.body.data.employee.bankDetails).toBeUndefined();
    expect(teamProfile.body.data.employee.previousEmployment).toBeUndefined();
    expect(teamProfile.body.data.employee.address).toBeUndefined();
    expect(teamProfile.body.data.employee.emergencyContact).toBeUndefined();

    // Directory listing for manager returns only direct team + no bankDetails
    const dirRes = await api.get('/api/v1/employees').set('Authorization', mgrAuth);
    expect(dirRes.status).toBe(200);
    const listedIds = dirRes.body.data.employees.map((e) => e._id);
    expect(listedIds).toContain(String(devEmp._id));
    expect(listedIds).not.toContain(String(recruiterEmp._id));
    for (const emp of dirRes.body.data.employees) {
      expect(emp.bankDetails).toBeUndefined();
    }

    // Blocked on non-team employee (recruiterEmp reports to hrEmp)
    expect((await api.get(`/api/v1/employees/${recruiterEmp._id}`).set('Authorization', mgrAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/attendance?employeeId=${recruiterEmp._id}`).set('Authorization', mgrAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/expenses?employeeId=${recruiterEmp._id}`).set('Authorization', mgrAuth)).status).toBe(403);
    expect((await api.get(`/api/v1/assets?employeeId=${recruiterEmp._id}`).set('Authorization', mgrAuth)).status).toBe(403);
    expect(
      (await api
        .post('/api/v1/performance')
        .set('Authorization', mgrAuth)
        .send({ employeeId: recruiterEmp._id, reviewCycle: 'Q4 2026', goals: [] })).status
    ).toBe(403);

    // Non-team leave review blocked
    const recLeave = await LeaveRequest.findOne({ employeeId: recruiterEmp._id }).lean();
    if (recLeave) {
      const reviewRes = await api
        .patch(`/api/v1/leaves/requests/${recLeave._id}/review`)
        .set('Authorization', mgrAuth)
        .send({ status: 'Approved', remarks: 'Cross-team bypass attempt' });
      expect(reviewRes.status).toBe(403);
    }

    // Reports: allowed for team employee & attendance, BLOCKED for payroll report
    expect((await api.get('/api/v1/reports/employees').set('Authorization', mgrAuth)).status).toBe(200);
    expect((await api.get('/api/v1/reports/attendance').set('Authorization', mgrAuth)).status).toBe(200);
    expect((await api.get('/api/v1/reports/payroll').set('Authorization', mgrAuth)).status).toBe(403);

    // Candidate listing for manager omits CTC compensation fields
    const candRes = await api.get('/api/v1/recruitment/candidates').set('Authorization', mgrAuth);
    expect(candRes.status).toBe(200);
    for (const cand of candRes.body.data.candidates) {
      expect(cand.currentCtc).toBeUndefined();
      expect(cand.expectedCtc).toBeUndefined();
    }
  });

  it('8. Enforces training assignment and progress ownership (403 on unauthorized users)', async () => {
    const program = await TrainingProgram.findOne().lean();
    expect(program).toBeTruthy();

    // Manager cannot assign training to non-team employee
    const badAssign = await api
      .post(`/api/v1/training/programs/${program._id}/assign`)
      .set('Authorization', `Bearer ${managerSession.accessToken}`)
      .send({ employeeIds: [String(recruiterEmp._id)] });
    expect(badAssign.status).toBe(403);

    // Create/find assignment owned by devEmp
    let assignment = await TrainingAssignment.findOne({ employeeId: devEmp._id }).lean();
    if (!assignment) {
      assignment = await TrainingAssignment.create({
        programId: program._id,
        employeeId: devEmp._id,
        assignedBy: adminEmp.userId,
        status: 'Assigned',
      });
    }

    // Another user (recruiter) cannot modify devEmp's training progress
    const idorRes = await api
      .patch(`/api/v1/training/assignments/${assignment._id}/progress`)
      .set('Authorization', `Bearer ${recruiterSession.accessToken}`)
      .send({ status: 'Completed', score: 100 });
    expect(idorRes.status).toBe(403);
  });

  it('9. Enforces attendance correction ownership (403 on another employee attendance record)', async () => {
    const recruiterAtt = await Attendance.findOne({ employeeId: recruiterEmp._id }).lean();
    expect(recruiterAtt).toBeTruthy();

    const idorCorrection = await api
      .post(`/api/v1/attendance/${recruiterAtt._id}/correction`)
      .set('Authorization', `Bearer ${employeeSession.accessToken}`)
      .send({ reason: 'Trying to alter colleague attendance record' });
    expect(idorCorrection.status).toBe(403);
  });

  it('10. Enforces document upload magic-byte verification, ownership, and path traversal defense', async () => {
    const empAuth = `Bearer ${employeeSession.accessToken}`;
    const recAuth = `Bearer ${recruiterSession.accessToken}`;

    // A) Upload valid PDF for devEmp
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    const uploadRes = await api
      .post('/api/v1/documents/upload')
      .set('Authorization', empAuth)
      .field('title', 'Employee Valid PDF')
      .field('category', 'ID Proof')
      .attach('file', validPdfBuffer, { filename: 'passport-proof.pdf', contentType: 'application/pdf' });

    expect(uploadRes.status).toBe(201);
    const createdDoc = uploadRes.body.data.document;
    expect(createdDoc.fileUrl).toBe(`/api/v1/documents/${createdDoc._id}/download`);

    // Owner can download
    const ownerDl = await api.get(`/api/v1/documents/${createdDoc._id}/download`).set('Authorization', empAuth);
    expect(ownerDl.status).toBe(200);
    expect(ownerDl.headers['x-content-type-options']).toBe('nosniff');

    // Non-owner (recruiter) cannot download (403)
    const otherDl = await api.get(`/api/v1/documents/${createdDoc._id}/download`).set('Authorization', recAuth);
    expect(otherDl.status).toBe(403);

    // B) Invalid magic-byte executable spoofed as .pdf must return 400 and delete temp file
    const beforeSpoof = snapshotUploads();
    const spoofedExeBuffer = Buffer.from('MZ\x90\x00This is an executable pretending to be a PDF');
    const spoofRes = await api
      .post('/api/v1/documents/upload')
      .set('Authorization', empAuth)
      .field('title', 'Spoofed Binary')
      .field('category', 'Other')
      .attach('file', spoofedExeBuffer, { filename: 'malware.pdf', contentType: 'application/pdf' });
    expect(spoofRes.status).toBe(400);
    const afterSpoof = snapshotUploads();
    expect(afterSpoof.size).toBe(beforeSpoof.size);

    // C) Path traversal payload inside Document record must be blocked (403)
    const traversalDoc = await Document.create({
      title: 'Traversal Attempt',
      category: 'Other',
      employeeId: devEmp._id,
      fileName: '../../package.json',
      fileUrl: '/uploads/../../package.json',
      fileType: 'application/pdf',
      uploadedBy: employeeSession.user._id,
    });
    const traversalRes = await api
      .get(`/api/v1/documents/${traversalDoc._id}/download`)
      .set('Authorization', empAuth);
    expect(traversalRes.status).toBe(403);

    // D) Expense receipt authenticated download ownership
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const expRes = await api
      .post('/api/v1/expenses')
      .set('Authorization', empAuth)
      .field('title', 'Client Travel Cab')
      .field('category', 'Travel')
      .field('amount', '550')
      .attach('receipt', validPng, { filename: 'cab-receipt.png', contentType: 'image/png' });
    expect(expRes.status).toBe(201);
    const claimId = expRes.body.data.claim._id;
    expect(expRes.body.data.claim.receiptUrl).toMatch(/^receipt:/);
    expect(expRes.body.data.claim.receiptUrl).not.toContain('/uploads/');

    expect((await api.get(`/api/v1/expenses/${claimId}/receipt`).set('Authorization', empAuth)).status).toBe(200);
    expect((await api.get(`/api/v1/expenses/${claimId}/receipt`).set('Authorization', recAuth)).status).toBe(403);
  });

  it('11. Blocks all direct /uploads/* static access (401 unauthenticated, 403 authenticated)', async () => {
    const unauthDirect = await api.get('/uploads/anything.pdf');
    expect(unauthDirect.status).toBe(401);

    const authDirect = await api
      .get('/uploads/anything.pdf')
      .set('Authorization', `Bearer ${adminSession.accessToken}`);
    expect(authDirect.status).toBe(403);
  });

  it('12. Rejects expired, missing-sessionId, and revoked sessions (401)', async () => {
    // Sign an access token WITHOUT sessionId claim
    const legacyStyleToken = jwt.sign(
      {
        userId: String(employeeSession.user._id),
        role: employeeSession.user.role,
        tenantId: 'pr_vision_hrms',
        type: 'access',
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
    expect((await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${legacyStyleToken}`)).status).toBe(401);

    // Create a temporary login and mark session expired in DB
    const expLogin = await loginAs('employee@prvision.com', 'tab-expired-test');
    await UserSession.updateOne(
      { sessionId: expLogin.sessionId },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } }
    );
    expect((await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${expLogin.accessToken}`)).status).toBe(401);

    // Revoked session check
    const revLogin = await loginAs('employee@prvision.com', 'tab-revoked-test');
    const delRes = await api
      .delete(`/api/v1/auth/sessions/${revLogin.sessionId}`)
      .set('Authorization', `Bearer ${revLogin.accessToken}`);
    expect(delRes.status).toBe(200);
    expect((await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${revLogin.accessToken}`)).status).toBe(401);
  });

  it('13. Enforces refresh token rotation reuse detection & revokes sessions on deleteEmployee', async () => {
    const freshLogin = await loginAs('recruiter@prvision.com', 'tab-rotation-test');
    const originalRefresh = freshLogin.refreshToken;

    // First rotation succeeds
    const rotate1 = await api.post('/api/v1/auth/refresh-token').send({ refreshToken: originalRefresh });
    expect(rotate1.status).toBe(200);
    const rotatedRefresh = rotate1.body.data.tokens.refreshToken;
    expect(rotatedRefresh).not.toBe(originalRefresh);

    // Reusing old refresh token triggers reuse detection & revokes the session!
    const reuseAttempt = await api.post('/api/v1/auth/refresh-token').send({ refreshToken: originalRefresh });
    expect(reuseAttempt.status).toBe(401);

    // Even the newly rotated refresh token is now invalid because session was revoked
    const afterCompromise = await api.post('/api/v1/auth/refresh-token').send({ refreshToken: rotatedRefresh });
    expect(afterCompromise.status).toBe(401);

    // Create temp employee, log in, then deleteEmployee as Admin -> immediate session revocation
    const tempEmpRes = await api
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send({
        firstName: 'Offboard',
        lastName: 'User',
        email: 'offboard.sec@prvision.com',
        departmentId: deptId,
        designationId: desigId,
        password: 'Password@123',
      });
    expect(tempEmpRes.status).toBe(201);
    const tempEmpId = tempEmpRes.body.data.employee._id;

    const tempLogin = await loginAs('offboard.sec@prvision.com', 'tab-offboard');
    expect((await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${tempLogin.accessToken}`)).status).toBe(200);

    const offboardRes = await api
      .delete(`/api/v1/employees/${tempEmpId}`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`);
    expect(offboardRes.status).toBe(200);

    // Existing token & active UserSessions are immediately rejected/revoked
    const activeSessionsRemaining = await UserSession.countDocuments({
      userId: tempLogin.user._id,
      isRevoked: false,
    });
    expect(activeSessionsRemaining).toBe(0);

    const afterOffboardMe = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tempLogin.accessToken}`);
    expect([401, 403]).toContain(afterOffboardMe.status);
  });

  it('14. Preserves independent multi-tab sessions and rejects mismatched X-Session-Id headers', async () => {
    const tabA = await loginAs('admin@prvision.com', 'chrome-tab-a');
    const tabB = await loginAs('employee@prvision.com', 'chrome-tab-b');

    // Mismatched X-Session-Id header against Bearer JWT must be rejected
    const mismatchRes = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tabA.accessToken}`)
      .set('X-Session-Id', tabB.sessionId);
    expect(mismatchRes.status).toBe(401);

    // Logout Tab A must NOT affect Tab B
    const logoutTabA = await api
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tabA.accessToken}`)
      .set('X-Session-Id', tabA.sessionId);
    expect(logoutTabA.status).toBe(200);

    expect((await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${tabA.accessToken}`)).status).toBe(401);
    expect((await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${tabB.accessToken}`)).status).toBe(200);
  });

  it('15. Prevents password/secret leakage, neutralizes CSV formula injection, and blocks x-target-tenant override', async () => {
    // Password & refreshToken never returned in auth/me or employee creation
    const meAdmin = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminSession.accessToken}`);
    expect(meAdmin.status).toBe(200);
    expect(meAdmin.body.data.user.password).toBeUndefined();
    expect(meAdmin.body.data.user.refreshToken).toBeUndefined();
    expect(meAdmin.body.data.company.biometricConfig?.serverIp).toBe('10.0.0.55');

    // Non-Admin/HR auth/me and /organization/settings strip biometricConfig secret
    const meEmp = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${employeeSession.accessToken}`);
    expect(meEmp.status).toBe(200);
    expect(meEmp.body.data.company.biometricConfig).toBeUndefined();

    const orgEmp = await api
      .get('/api/v1/organization/settings')
      .set('Authorization', `Bearer ${employeeSession.accessToken}`);
    expect(orgEmp.status).toBe(200);
    expect(orgEmp.body.data.company.biometricConfig).toBeUndefined();

    // Cross-tenant x-target-tenant override rejected
    const tenantSpoof = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${employeeSession.accessToken}`)
      .set('x-target-tenant', 'evil_tenant');
    expect(tenantSpoof.status).toBe(403);

    // CSV formula injection neutralization
    const formulaEmp = await api
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send({
        firstName: '=cmd|"/C calc"!A0',
        lastName: '+SUM(A1:A2)',
        email: 'csv.formula@prvision.com',
        departmentId: deptId,
        designationId: desigId,
      });
    expect(formulaEmp.status).toBe(201);

    const csvRes = await api
      .get('/api/v1/reports/employees?format=csv')
      .set('Authorization', `Bearer ${adminSession.accessToken}`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain("'=cmd");
    expect(csvRes.text).toContain("'+SUM");
    expect(csvRes.text).not.toMatch(/^=cmd/m);

    // Clean up temporary CSV employee
    await api
      .delete(`/api/v1/employees/${formulaEmp.body.data.employee._id}`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`);
  });
});
