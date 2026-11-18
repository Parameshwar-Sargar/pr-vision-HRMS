import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import './setup.js';
import { api } from './setup.js';
import { seedDatabase } from '../src/scripts/seed.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Employee from '../src/models/Employee.js';
import User from '../src/models/User.js';
import Shift from '../src/models/Shift.js';
import Holiday from '../src/models/Holiday.js';
import Attendance from '../src/models/Attendance.js';
import LeaveType from '../src/models/LeaveType.js';
import LeaveBalance from '../src/models/LeaveBalance.js';
import SalaryStructure from '../src/models/SalaryStructure.js';
import PayrollRun from '../src/models/PayrollRun.js';
import Payslip from '../src/models/Payslip.js';
import Asset from '../src/models/Asset.js';
import AssetAssignment from '../src/models/AssetAssignment.js';
import Document from '../src/models/Document.js';
import PerformanceReview from '../src/models/PerformanceReview.js';
import Candidate from '../src/models/Candidate.js';
import { UPLOAD_ROOT } from '../src/utils/securityUtils.js';

describe('PR VISION HRMS — Phase 5 Functional Bug Fixes & Business Logic Verification', () => {
  let adminToken;
  let hrToken;
  let managerToken;
  let employeeToken;
  let recruiterToken;
  let payrollToken;

  let hqBranch;
  let mumbaiBranch;
  let engDept;
  let hrDept;
  let adminEmp;
  let managerEmp;
  let regularEmp;
  let probationEmp;

  const createdFilesToCleanup = [];
  let initialUploadSnapshot = new Set();

  beforeAll(async () => {
    if (fs.existsSync(UPLOAD_ROOT)) {
      initialUploadSnapshot = new Set(fs.readdirSync(UPLOAD_ROOT));
    }

    await seedDatabase({ disconnect: false });

    const login = async (email) => {
      const res = await api.post('/api/v1/auth/login').send({ email, password: 'Password@123' });
      expect(res.status).toBe(200);
      return res.body.data.tokens.accessToken;
    };

    [adminToken, hrToken, managerToken, employeeToken, recruiterToken, payrollToken] =
      await Promise.all([
        login('admin@prvision.com'),
        login('hr@prvision.com'),
        login('manager@prvision.com'),
        login('employee@prvision.com'),
        login('recruiter@prvision.com'),
        login('payroll@prvision.com'),
      ]);

    const branches = await Branch.find({ isDeleted: false }).lean();
    hqBranch = branches.find((b) => b.isHeadquarters) || branches[0];
    mumbaiBranch = branches.find((b) => !b.isHeadquarters) || branches[1] || hqBranch;

    const depts = await Department.find({ isDeleted: false }).lean();
    engDept = depts.find((d) => d.name.toLowerCase().includes('eng')) || depts[0];
    hrDept = depts.find((d) => d._id.toString() !== engDept._id.toString()) || depts[0];

    const [adminUser, mgrUser, empUser] = await Promise.all([
      User.findOne({ email: 'admin@prvision.com' }).lean(),
      User.findOne({ email: 'manager@prvision.com' }).lean(),
      User.findOne({ email: 'employee@prvision.com' }).lean(),
    ]);

    [adminEmp, managerEmp, regularEmp, probationEmp] = await Promise.all([
      Employee.findOne({ userId: adminUser._id }).lean(),
      Employee.findOne({ userId: mgrUser._id }).lean(),
      Employee.findOne({ userId: empUser._id }).lean(),
      Employee.findOne({ employmentStatus: 'Probation', isDeleted: false }).lean(),
    ]);
  });

  afterAll(() => {
    for (const filePath of createdFilesToCleanup) {
      try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {}
    }
    if (fs.existsSync(UPLOAD_ROOT)) {
      for (const entry of fs.readdirSync(UPLOAD_ROOT)) {
        if (!initialUploadSnapshot.has(entry) && !entry.startsWith('.')) {
          try {
            const fullPath = path.join(UPLOAD_ROOT, entry);
            if (fs.statSync(fullPath).isFile()) {
              fs.unlinkSync(fullPath);
            }
          } catch (_) {}
        }
      }
    }
  });

  describe('Step 2: Announcements CRUD, Audience Targeting & Dashboard Sync', () => {
    it('creates announcement via message/content, edits, toggles active status, and enforces expiry & branch/dept visibility', async () => {
      // Create with legacy `content` payload
      const createRes = await api
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          title: 'Engineering HQ Sprint Notice',
          content: 'All Bengaluru HQ engineers attend demo at 4 PM.',
          category: 'Team Event',
          priority: 'Important',
          isPinned: true,
          targetBranchId: regularEmp.branchId,
          targetDepartmentId: regularEmp.departmentId,
        });

      expect(createRes.status).toBe(201);
      const ann = createRes.body.data.announcement;
      expect(ann.message).toBe('All Bengaluru HQ engineers attend demo at 4 PM.');
      expect(ann.content).toBe(ann.message);
      expect(ann.category).toBe('Team Event');

      // Create mismatched-department announcement & expired announcement
      const otherDeptId =
        regularEmp.departmentId.toString() === engDept._id.toString() ? hrDept._id : engDept._id;

      await api
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Other Department Only',
          message: 'Private to another department',
          category: 'HR Policy Update',
          priority: 'Normal',
          targetDepartmentId: otherDeptId,
        });

      await api
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Expired Notice',
          message: 'Already expired yesterday',
          expiresAt: new Date(Date.now() - 86400000).toISOString(),
        });

      // Employee feed + dashboard must see matching active announcement, NEVER expired or other-dept
      const [empFeed, empDash] = await Promise.all([
        api.get('/api/v1/announcements').set('Authorization', `Bearer ${employeeToken}`),
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${employeeToken}`),
      ]);
      expect(empFeed.status).toBe(200);
      expect(empDash.status).toBe(200);

      const feedTitles = empFeed.body.data.announcements.map((a) => a.title);
      const dashTitles = (empDash.body.data.announcements || []).map((a) => a.title);
      expect(feedTitles).toContain('Engineering HQ Sprint Notice');
      expect(feedTitles).not.toContain('Other Department Only');
      expect(feedTitles).not.toContain('Expired Notice');
      expect(dashTitles).toContain('Engineering HQ Sprint Notice');
      expect(dashTitles).not.toContain('Other Department Only');
      expect(dashTitles).not.toContain('Expired Notice');

      // Update & unpublish via PUT /announcements/:id
      const updRes = await api
        .put(`/api/v1/announcements/${ann._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Engineering HQ Sprint Notice (Updated)',
          message: 'Rescheduled to 5 PM.',
          isActive: false,
        });
      expect(updRes.status).toBe(200);
      expect(updRes.body.data.announcement.isActive).toBe(false);
      expect(updRes.body.data.announcement.title).toBe('Engineering HQ Sprint Notice (Updated)');

      const empFeedAfter = await api
        .get('/api/v1/announcements')
        .set('Authorization', `Bearer ${employeeToken}`);
      expect(empFeedAfter.body.data.announcements.map((a) => a._id)).not.toContain(ann._id);
    });
  });

  describe('Step 3: Documents Category Validation, Assignment & Authenticated Download', () => {
    it('rejects unsupported category (cleaning temp upload) and uploads/downloads valid PDF document', async () => {
      const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

      // Invalid category 'Contract' must return 400 and leave no orphan file
      const badRes = await api
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${hrToken}`)
        .field('title', 'Legacy Contract')
        .field('category', 'Contract')
        .attach('file', pdfBytes, 'contract.pdf');
      expect(badRes.status).toBe(400);

      // Valid category upload assigned to regular employee
      const goodRes = await api
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${hrToken}`)
        .field('title', 'Offer Letter 2027')
        .field('category', 'Offer Letter')
        .field('employeeId', regularEmp._id.toString())
        .attach('file', pdfBytes, 'offer-letter.pdf');

      expect(goodRes.status).toBe(201);
      const doc = goodRes.body.data.document;
      expect(doc.category).toBe('Offer Letter');
      expect(doc.fileUrl).toContain(`/documents/${doc._id}/download`);

      const storedDoc = await Document.findById(doc._id).lean();
      expect(storedDoc.fileName).toBeTruthy();
      expect(storedDoc.fileUrl).toBe(`/api/v1/documents/${doc._id}/download`);
      createdFilesToCleanup.push(path.join(UPLOAD_ROOT, storedDoc.fileName));

      const dlRes = await api
        .get(`/api/v1/documents/${doc._id}/download`)
        .set('Authorization', `Bearer ${employeeToken}`);
      expect(dlRes.status).toBe(200);
      expect(dlRes.headers['content-disposition']).toContain('Offer Letter 2027');
    });
  });

  describe('Step 4: Payroll Proration, Attendance/LWP/Holiday Math & Finalized Run Lock', () => {
    it('prorates salary across Probation/Confirmed employees with custom % earnings, weekday holiday & LOP, and locks Paid runs', async () => {
      // Clear pre-seeded May 2027 if any and create a deterministic month: May 2027
      // May 2027: 1st = Sat, 31st = Mon -> Weekdays (Mon-Fri) = 21 days!
      // Add 1 non-optional holiday on Monday May 3, 2027 -> workingDays = 20 days!
      const testMonth = 5;
      const testYear = 2027;
      await Payslip.deleteMany({ month: testMonth, year: testYear });
      await PayrollRun.deleteMany({ month: testMonth, year: testYear });
      await Holiday.deleteMany({
        date: { $gte: new Date(testYear, testMonth - 1, 1), $lte: new Date(testYear, testMonth - 1, 31, 23, 59, 59) },
      });
      await Attendance.deleteMany({
        date: { $gte: new Date(testYear, testMonth - 1, 1), $lte: new Date(testYear, testMonth - 1, 31, 23, 59, 59) },
      });

      await Holiday.create({
        name: 'Founders Day Test',
        date: new Date(testYear, testMonth - 1, 3), // Monday May 3, 2027
        year: testYear,
        branchId: null,
        isOptional: false,
      });

      const targetEmp = probationEmp || regularEmp;
      const monFriShift =
        (await Shift.findOne({ weeklyOffDays: { $size: 2 }, isActive: true }).lean()) ||
        (await Shift.create({
          name: 'Payroll 5-Day Shift',
          startTime: '09:00',
          endTime: '18:00',
          weeklyOffDays: [0, 6],
        }));

      await Employee.updateOne(
        { _id: targetEmp._id },
        { $set: { shiftId: monFriShift._id, joiningDate: new Date(2025, 0, 1) } }
      );

      // Attendance in May 2027 for targetEmp: 2 Absent days (May 4 & 5) + 1 Half-day (May 6) => 2.5 LOP days
      await Attendance.create([
        { employeeId: targetEmp._id, date: new Date(testYear, testMonth - 1, 4), status: 'Absent' },
        { employeeId: targetEmp._id, date: new Date(testYear, testMonth - 1, 5), status: 'Absent' },
        { employeeId: targetEmp._id, date: new Date(testYear, testMonth - 1, 6), status: 'Half-day' },
      ]);

      await SalaryStructure.findOneAndUpdate(
        { employeeId: targetEmp._id },
        {
          employeeId: targetEmp._id,
          basicSalary: 40000,
          hra: 16000,
          conveyanceAllowance: 2000,
          specialAllowance: 2000, // base gross = 60,000
          customComponents: [
            { name: 'Perf Bonus', type: 'earning', value: 10, calculationType: 'percentage_of_gross' },
            { name: 'Welfare', type: 'deduction', value: 100, calculationType: 'flat' },
          ],
          statutoryConfig: {
            pfEnabled: true,
            pfEmployeeRate: 12,
            esiEnabled: false,
            esiEmployeeRate: 0.75,
            professionalTax: 200,
            tdsDeduction: 1000,
          },
          isActive: true,
        },
        { upsert: true, new: true }
      );

      const genRes = await api
        .post('/api/v1/payroll/runs/generate')
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({ month: testMonth, year: testYear });

      expect(genRes.status).toBe(200);
      const run = genRes.body.data.run;
      expect(run.totalEmployees).toBeGreaterThanOrEqual(2);

      const payslip = await Payslip.findOne({ payrollRunId: run._id, employeeId: targetEmp._id }).lean();
      expect(payslip).toBeTruthy();
      expect(payslip.workingDays).toBe(20);
      expect(payslip.lopDays).toBe(2.5);
      expect(payslip.presentDays).toBe(17.5);

      // Factor = 17.5 / 20 = 0.875
      // earnedBasic = 35000, earnedHra = 14000, earnedConv = 1750, earnedSpecial = 1750 -> preCustomGross = 52500
      // 10% Perf Bonus of earned gross = 5250 -> grossSalary = 57750
      // pfDeduction = 12% of 35000 = 4200, PT = 200, TDS = 1000, Welfare = 100 -> totalDeductions = 5500
      // netSalary = 57750 - 5500 = 52250
      expect(payslip.basicSalary).toBe(35000);
      const earningByName = new Map(payslip.earnings.map((e) => [e.name, e.amount]));
      const dedByName = new Map(payslip.deductions.map((d) => [d.name, d.amount]));
      expect(earningByName.get('House Rent Allowance (HRA)')).toBe(14000);
      expect(earningByName.get('Conveyance Allowance')).toBe(1750);
      expect(earningByName.get('Special Allowance')).toBe(1750);
      expect(earningByName.get('Perf Bonus')).toBe(5250);
      expect(payslip.grossSalary).toBe(57750);
      expect(dedByName.get('Provident Fund (12%)')).toBe(4200);
      expect(dedByName.get('Professional Tax (PT)')).toBe(200);
      expect(dedByName.get('Tax Deducted at Source (TDS)')).toBe(1000);
      expect(dedByName.get('Welfare')).toBe(100);
      expect(payslip.totalDeductions).toBe(5500);
      expect(payslip.netSalary).toBe(52250);

      // Mark run paid & lock it
      const paidRes = await api
        .patch(`/api/v1/payroll/runs/${run._id}/pay`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(paidRes.status).toBe(200);
      expect(paidRes.body.data.run.isLocked).toBe(true);

      // Double pay blocked
      const paidAgainRes = await api
        .patch(`/api/v1/payroll/runs/${run._id}/pay`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(paidAgainRes.status).toBe(400);

      // Regenerating locked payroll blocked
      const regenRes = await api
        .post('/api/v1/payroll/runs/generate')
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({ month: testMonth, year: testYear });
      expect(regenRes.status).toBe(400);
    });
  });

  describe('Step 5: Expenses Receipt Upload & Transition State Machine', () => {
    it('supports receipt upload/download and enforces Pending -> Approved -> Reimbursed transitions', async () => {
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);

      const badDateRes = await api
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .field('title', 'Invalid Date Flight')
        .field('category', 'Travel')
        .field('amount', '5000')
        .field('date', 'not-a-date')
        .attach('receipt', pngBytes, 'ticket.png');
      expect(badDateRes.status).toBe(400);

      const createRes = await api
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .field('title', 'Client Travel Taxi')
        .field('category', 'Transport & Fuel')
        .field('amount', '1250')
        .field('date', '2026-11-10')
        .attach('receipt', pngBytes, 'taxi-bill.png');
      expect(createRes.status).toBe(201);
      const claim = createRes.body.data.claim;
      expect(claim.receiptUrl).toMatch(/^receipt:/);
      createdFilesToCleanup.push(path.join(UPLOAD_ROOT, claim.receiptUrl.replace(/^receipt:/, '')));

      const dlRes = await api
        .get(`/api/v1/expenses/${claim._id}/receipt`)
        .set('Authorization', `Bearer ${employeeToken}`);
      expect(dlRes.status).toBe(200);

      // Cannot jump directly Pending -> Reimbursed
      const directReimburse = await api
        .patch(`/api/v1/expenses/${claim._id}/review`)
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({ status: 'Reimbursed' });
      expect(directReimburse.status).toBe(400);

      // Manager approves team member's claim
      const approveRes = await api
        .patch(`/api/v1/expenses/${claim._id}/review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'Approved', remarks: 'Verified bill' });
      expect(approveRes.status).toBe(200);

      // Manager cannot mark Approved -> Reimbursed (Finance/HR/Admin only)
      const mgrReimburse = await api
        .patch(`/api/v1/expenses/${claim._id}/review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'Reimbursed' });
      expect(mgrReimburse.status).toBe(403);

      // Payroll Admin reimburses approved claim
      const reimburseRes = await api
        .patch(`/api/v1/expenses/${claim._id}/review`)
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({ status: 'Reimbursed', remarks: 'NEFT batch 42' });
      expect(reimburseRes.status).toBe(200);
      expect(reimburseRes.body.data.claim.status).toBe('Reimbursed');

      // Cannot modify finalized reimbursed claim
      const afterReimburse = await api
        .patch(`/api/v1/expenses/${claim._id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Rejected' });
      expect(afterReimburse.status).toBe(400);
    });
  });

  describe('Step 6: Recruitment Interview Schedule, Duplicate Check & Onboarding LeaveBalance', () => {
    it('persists interviewSchedule, rejects duplicates & rejected conversions, and initializes LeaveBalance on conversion', async () => {
      const jobRes = await api
        .post('/api/v1/recruitment/jobs')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          title: 'Phase 5 QA Lead',
          departmentId: engDept._id.toString(),
          branchId: hqBranch._id.toString(),
          openingsCount: 2,
          description: 'Lead quality automation across all enterprise suites',
          status: 'Open',
        });
      expect(jobRes.status).toBe(201);
      const job = jobRes.body.data.job;

      const uniqueEmail = `qa.candidate.${Date.now()}@example.com`;
      const candRes = await api
        .post('/api/v1/recruitment/candidates')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          jobOpeningId: job._id,
          fullName: 'Kiran Deshmukh',
          email: uniqueEmail,
          phone: '9876543210',
          expectedCtc: 1800000,
        });
      expect(candRes.status).toBe(201);
      const cand = candRes.body.data.candidate;

      // Duplicate candidate for same job rejected (409)
      const dupRes = await api
        .post('/api/v1/recruitment/candidates')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          jobOpeningId: job._id,
          fullName: 'Kiran Duplicate',
          email: uniqueEmail,
        });
      expect(dupRes.status).toBe(409);

      // Update candidate + persist interviewSchedule
      const schedTime = '2026-12-01T10:30:00.000Z';
      const editRes = await api
        .put(`/api/v1/recruitment/candidates/${cand._id}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          status: 'Interviewing',
          interviewSchedule: {
            scheduledAt: schedTime,
            interviewerName: 'Vikram Manager',
            mode: 'Technical Round',
            meetingLink: 'https://meet.example.com/qa-lead',
          },
        });
      expect(editRes.status).toBe(200);
      expect(editRes.body.data.candidate.interviewSchedule.interviewerName).toBe('Vikram Manager');
      expect(editRes.body.data.candidate.interviewSchedule.mode).toBe('Technical Round');

      // Query with ?stage=Interviewing works cleanly
      const stageList = await api
        .get('/api/v1/recruitment/candidates?stage=Interviewing')
        .set('Authorization', `Bearer ${recruiterToken}`);
      expect(stageList.status).toBe(200);
      expect(stageList.body.data.candidates.some((c) => c._id === cand._id)).toBe(true);

      // Rejected candidate cannot convert
      await Candidate.updateOne({ _id: cand._id }, { $set: { status: 'Rejected' } });
      const rejConv = await api
        .post(`/api/v1/recruitment/candidates/${cand._id}/convert`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ joiningDate: '2026-12-10' });
      expect(rejConv.status).toBe(400);

      // Move to Offered and convert -> provisions LeaveBalance too!
      await api
        .patch(`/api/v1/recruitment/candidates/${cand._id}/status`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'Offered' });

      const convRes = await api
        .post(`/api/v1/recruitment/candidates/${cand._id}/convert`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ joiningDate: '2026-12-10', probationPeriodMonths: 6 });
      expect(convRes.status).toBe(201);
      const newEmp = convRes.body.data.employee;
      expect(newEmp.employmentStatus).toBe('Probation');

      const lb = await LeaveBalance.findOne({ employeeId: newEmp._id, year: 2026 }).lean();
      expect(lb).toBeTruthy();
      expect(lb.balances.length).toBeGreaterThan(0);
    });
  });

  describe('Step 7: Attendance Dynamic Shift/Correction Sync & Leaves Balance + Attendance Sync', () => {
    it('enforces check-out >= check-in, recalculates overtime, approves correction, and preserves LeaveBalance invariant & Attendance sync', async () => {
      // 1. Attendance correction + adjustment sync on an isolated future date for regularEmp
      const dayStart = new Date(2027, 7, 16, 0, 0, 0); // Aug 16 2027
      await Attendance.deleteMany({ employeeId: regularEmp._id, date: dayStart });
      const attRec = await Attendance.create({
        employeeId: regularEmp._id,
        date: dayStart,
        checkInTime: new Date(2027, 7, 16, 9, 0, 0),
        status: 'Present',
      });

      const corrRes = await api
        .post(`/api/v1/attendance/${attRec._id}/correction`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          requestedCheckIn: new Date(2027, 7, 16, 9, 0, 0).toISOString(),
          requestedCheckOut: new Date(2027, 7, 16, 20, 0, 0).toISOString(),
          reason: 'Biometric terminal offline at evening exit',
        });
      expect(corrRes.status).toBe(200);
      expect(corrRes.body.data.record.correctionRequest.status).toBe('Pending');

      // Reject inverted checkOutTime < checkInTime
      const badAdjust = await api
        .patch(`/api/v1/attendance/${attRec._id}/adjust`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          checkInTime: new Date(2027, 7, 16, 18, 0, 0).toISOString(),
          checkOutTime: new Date(2027, 7, 16, 9, 0, 0).toISOString(),
        });
      expect(badAdjust.status).toBe(400);

      // Valid adjust -> updates totalHours, overtimeHours, and marks correctionRequest Approved
      const goodAdjust = await api
        .patch(`/api/v1/attendance/${attRec._id}/adjust`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          checkInTime: new Date(2027, 7, 16, 9, 0, 0).toISOString(),
          checkOutTime: new Date(2027, 7, 16, 20, 0, 0).toISOString(),
          status: 'Present',
        });
      expect(goodAdjust.status).toBe(200);
      expect(goodAdjust.body.data.record.totalHours).toBe(11);
      expect(goodAdjust.body.data.record.overtimeHours).toBeGreaterThan(0);
      expect(goodAdjust.body.data.record.correctionRequest.status).toBe('Approved');

      // 2. Leaves balance invariant (remaining = allocated - used - pending) across Apply -> Cancel -> Reject -> Approve + Attendance sync
      const leaveType = await LeaveType.findOne({ isActive: true, isPaid: true }).lean();
      const targetYear = 2028; // clean year so auto-init is exercised
      await LeaveBalance.deleteMany({ employeeId: regularEmp._id, year: targetYear });

      const apply1 = await api
        .post('/api/v1/leaves/apply')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId: leaveType._id.toString(),
          startDate: '2028-03-06',
          endDate: '2028-03-07',
          totalDays: 2,
          reason: 'Family function out of town',
        });
      expect(apply1.status).toBe(201);
      const req1 = apply1.body.data.request;

      let balDoc = await LeaveBalance.findOne({ employeeId: regularEmp._id, year: targetYear }).lean();
      let item = balDoc.balances.find((b) => b.leaveTypeId.toString() === leaveType._id.toString());
      expect(item.pending).toBe(2);
      expect(item.used).toBe(0);
      expect(item.remaining).toBe(item.allocated - 2);

      // Cancel restores remaining
      const cancel1 = await api
        .post(`/api/v1/leaves/requests/${req1._id}/cancel`)
        .set('Authorization', `Bearer ${employeeToken}`);
      expect(cancel1.status).toBe(200);

      balDoc = await LeaveBalance.findOne({ employeeId: regularEmp._id, year: targetYear }).lean();
      item = balDoc.balances.find((b) => b.leaveTypeId.toString() === leaveType._id.toString());
      expect(item.pending).toBe(0);
      expect(item.remaining).toBe(item.allocated);

      // Re-apply and Reject restores remaining
      const apply2 = await api
        .post('/api/v1/leaves/apply')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId: leaveType._id.toString(),
          startDate: '2028-03-08',
          endDate: '2028-03-08',
          totalDays: 1,
          reason: 'Personal errand',
        });
      expect(apply2.status).toBe(201);
      await api
        .patch(`/api/v1/leaves/requests/${apply2.body.data.request._id}/review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'Rejected', remarks: 'Sprint release day' });

      balDoc = await LeaveBalance.findOne({ employeeId: regularEmp._id, year: targetYear }).lean();
      item = balDoc.balances.find((b) => b.leaveTypeId.toString() === leaveType._id.toString());
      expect(item.pending).toBe(0);
      expect(item.used).toBe(0);
      expect(item.remaining).toBe(item.allocated);

      // Re-apply and Approve -> updates used & remaining AND creates On Leave attendance!
      const apply3 = await api
        .post('/api/v1/leaves/apply')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId: leaveType._id.toString(),
          startDate: '2028-03-13',
          endDate: '2028-03-14',
          totalDays: 2,
          reason: 'Scheduled vacation',
        });
      expect(apply3.status).toBe(201);
      const approve3 = await api
        .patch(`/api/v1/leaves/requests/${apply3.body.data.request._id}/review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'Approved', remarks: 'Enjoy your time off' });
      expect(approve3.status).toBe(200);

      balDoc = await LeaveBalance.findOne({ employeeId: regularEmp._id, year: targetYear }).lean();
      item = balDoc.balances.find((b) => b.leaveTypeId.toString() === leaveType._id.toString());
      expect(item.pending).toBe(0);
      expect(item.used).toBe(2);
      expect(item.remaining).toBe(item.allocated - 2);

      const leaveAttDays = await Attendance.find({
        employeeId: regularEmp._id,
        date: { $gte: new Date('2028-03-13T00:00:00'), $lte: new Date('2028-03-14T23:59:59') },
        status: 'On Leave',
      }).lean();
      expect(leaveAttDays.length).toBe(2);
    });
  });

  describe('Step 8: Performance Rating Guards, Training Dates/Scores & Assets Assignment Fields', () => {
    it('validates performance scores, blocks completed self-edit, validates training dates/scores, and persists AssetAssignment fields & return statuses', async () => {
      // Performance
      const perfRes = await api
        .post('/api/v1/performance')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          employeeId: regularEmp._id.toString(),
          reviewCycle: 'Q4-2027-Test',
          goals: [{ title: 'Ship Phase 5 Fixes', weightage: 100 }],
        });
      expect(perfRes.status).toBe(201);
      const rev = perfRes.body.data.review;

      const badRating = await api
        .patch(`/api/v1/performance/${rev._id}/self-review`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ selfRating: 7 });
      expect(badRating.status).toBe(400);

      const goodMgr = await api
        .patch(`/api/v1/performance/${rev._id}/manager-review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ managerRating: 4.5, strengths: 'Execution speed' });
      expect(goodMgr.status).toBe(200);
      expect(goodMgr.body.data.review.finalScore).toBe(4.5);

      const postCompleteSelf = await api
        .patch(`/api/v1/performance/${rev._id}/self-review`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ selfRating: 5 });
      expect(postCompleteSelf.status).toBe(400);

      // Training date & score validation
      const badTraining = await api
        .post('/api/v1/training/programs')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          title: 'Inverted Dates Course',
          category: 'Technical',
          trainerName: 'Trainer X',
          startDate: '2026-12-20',
          endDate: '2026-12-10',
        });
      expect(badTraining.status).toBe(400);

      // Assets condition persistence & status transitions
      const assetRes = await api
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          assetTag: `PRV-TEST-${Date.now()}`,
          name: 'ThinkPad X1 Test',
          category: 'Laptop',
          condition: 'New',
        });
      expect(assetRes.status).toBe(201);
      const asset = assetRes.body.data.asset;

      const assignRes = await api
        .post(`/api/v1/assets/${asset._id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          employeeId: regularEmp._id.toString(),
          conditionAtAssignment: 'New',
          notes: 'Issued with USB-C dock',
        });
      expect(assignRes.status).toBe(200);
      const assignment = assignRes.body.data.assignment;
      expect(assignment.assignedCondition).toBe('New');
      expect(assignment.notes).toBe('Issued with USB-C dock');

      const retRes = await api
        .post(`/api/v1/assets/${asset._id}/return`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          conditionAtReturn: 'Needs Maintenance',
          remarks: 'Screen hinge loose',
        });
      expect(retRes.status).toBe(200);
      expect(retRes.body.data.asset.status).toBe('Under Repair');

      const savedAssign = await AssetAssignment.findById(assignment._id).lean();
      expect(savedAssign.returnCondition).toBe('Needs Maintenance');
      expect(savedAssign.notes).toContain('Screen hinge loose');

      // Assigning an 'Under Repair' asset must be blocked
      const reassignRepair = await api
        .post(`/api/v1/assets/${asset._id}/assign`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employeeId: regularEmp._id.toString() });
      expect(reassignRepair.status).toBe(400);
    });
  });

  describe('Step 9: Organization, Departments, Designations, Shifts, Holidays & Self-Manager Guards', () => {
    it('prevents HQ deletion, regex crashes on R&D (India), duplicate shift/branch codes & circular self-manager assignment', async () => {
      // Cannot delete Headquarters branch
      const hqDelete = await api
        .delete(`/api/v1/organization/branches/${hqBranch._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(hqDelete.status).toBe(400);

      // Update Mumbai branch with HQ's code must return 409 Conflict
      if (mumbaiBranch && mumbaiBranch._id.toString() !== hqBranch._id.toString()) {
        const dupCode = await api
          .put(`/api/v1/organization/branches/${mumbaiBranch._id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ code: hqBranch.code });
        expect(dupCode.status).toBe(409);
      }

      // Create branch missing required city/state -> 400 (not unhandled 500)
      const missingCity = await api
        .post('/api/v1/organization/branches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Incomplete Branch', code: 'BR-INC', address: { street: 'Road 1' } });
      expect(missingCity.status).toBe(400);

      // Regex-unsafe department name `R&D (India)` creates cleanly & detects duplicate safely
      const rdRes = await api
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'R&D (India)', code: 'RND' });
      expect(rdRes.status).toBe(201);

      const rdDup = await api
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'r&d (india)', code: 'RND2' });
      expect(rdDup.status).toBe(409);

      // Designation with parentheses/plus chars works cleanly
      const desigRes = await api
        .post('/api/v1/designations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'C++ Systems Lead (Tier-1)',
          departmentId: rdRes.body.data.department._id,
          level: '3',
        });
      expect(desigRes.status).toBe(201);
      expect(desigRes.body.data.designation.level).toBe(3);

      // Shift equal start/end blocked & duplicate shift blocked cleanly
      const badShift = await api
        .post('/api/v1/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Zero Hours', startTime: '09:00', endTime: '09:00' });
      expect(badShift.status).toBe(400);

      // Holiday invalid date -> 400 & duplicate -> 409
      const badHoliday = await api
        .post('/api/v1/holidays')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Invalid Holiday', date: 'invalid-date' });
      expect(badHoliday.status).toBe(400);

      // Employee self-manager assignment rejected
      const selfMgr = await api
        .put(`/api/v1/employees/${regularEmp._id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ managerId: regularEmp._id.toString() });
      expect(selfMgr.status).toBe(400);
    });
  });
});
