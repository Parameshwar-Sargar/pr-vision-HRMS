import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import './setup.js';
import { api } from './setup.js';
import { LIFECYCLE_STAGES, ROLES } from '../src/config/constants.js';
import { UPLOAD_ROOT } from '../src/utils/securityUtils.js';

import CompanySettings from '../src/models/CompanySettings.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Shift from '../src/models/Shift.js';
import Employee from '../src/models/Employee.js';
import User from '../src/models/User.js';
import Asset from '../src/models/Asset.js';
import TrainingProgram from '../src/models/TrainingProgram.js';

describe('Phase 8 Batch C Backend — Options API Workflow E2E, RBAC, Payload & Compatibility', () => {
  let branches;
  let departments;
  let designation;
  let shift;
  let asset;
  let trainingProgram;

  let tokens = {};
  let emps = {};
  const password = 'Password@123';
  const createdUploadFiles = [];

  const login = async (email, tabId) => {
    const res = await api
      .post('/api/v1/auth/login')
      .set('X-Tab-Id', tabId)
      .send({ email, password });
    expect(res.status).toBe(200);
    return res.body.data.tokens.accessToken;
  };

  beforeAll(async () => {
    await CompanySettings.create({ companyName: 'PR VISION INNOVATIONS', contactEmail: 'hr@prvision.com' });

    branches = await Branch.insertMany([
      {
        name: 'Bengaluru HQ',
        code: 'C-BLR',
        isHeadquarters: true,
        address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
      },
      {
        name: 'Mumbai Hub',
        code: 'C-MUM',
        isHeadquarters: false,
        address: { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
      },
    ]);

    departments = await Department.insertMany([
      { name: 'Engineering', code: 'ENG', branchId: branches[0]._id },
      { name: 'Finance', code: 'FIN', branchId: branches[1]._id },
    ]);

    designation = await Designation.create({
      title: 'Software Engineer',
      code: 'ENG-SWE',
      departmentId: departments[0]._id,
      level: 2,
    });

    shift = await Shift.create({ name: 'Day Shift', code: 'C-DAY', startTime: '09:30', endTime: '18:30', isDefault: true });

    const [hrUser, mgrUser, empUser, recUser, payUser] = await Promise.all([
      User.create({ name: 'HR Lead', email: 'hr.c@prvision.com', password, role: ROLES.HR_MANAGER, branchId: branches[0]._id }),
      User.create({ name: 'Eng Manager', email: 'mgr.c@prvision.com', password, role: ROLES.MANAGER, branchId: branches[0]._id }),
      User.create({ name: 'Staff Member', email: 'emp.c@prvision.com', password, role: ROLES.EMPLOYEE, branchId: branches[0]._id }),
      User.create({ name: 'Talent Recruiter', email: 'rec.c@prvision.com', password, role: ROLES.RECRUITER, branchId: branches[0]._id }),
      User.create({ name: 'Payroll Admin', email: 'pay.c@prvision.com', password, role: ROLES.PAYROLL_ADMIN, branchId: branches[1]._id }),
    ]);

    emps.mgr = await Employee.create({
      userId: mgrUser._id,
      employeeId: 'PRV-2001',
      firstName: 'Vikram',
      lastName: 'Manager',
      email: 'mgr.c@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
    });
    await User.updateOne({ _id: mgrUser._id }, { $set: { employeeId: emps.mgr._id } });

    emps.hr = await Employee.create({
      userId: hrUser._id,
      employeeId: 'PRV-2002',
      firstName: 'Sonia',
      lastName: 'HR',
      email: 'hr.c@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
    });
    await User.updateOne({ _id: hrUser._id }, { $set: { employeeId: emps.hr._id } });

    emps.direct = await Employee.create({
      userId: empUser._id,
      employeeId: 'PRV-2003',
      firstName: 'Aarav',
      lastName: 'Direct',
      email: 'emp.c@prvision.com',
      phone: '9998887776',
      bankDetails: { accountNumber: 'SECRET123456', bankName: 'HDFC', ifscCode: 'HDFC0001111' },
      address: { street: 'Private Lane 1', city: 'Bengaluru', country: 'India' },
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      managerId: emps.mgr._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
    });
    await User.updateOne({ _id: empUser._id }, { $set: { employeeId: emps.direct._id } });

    emps.other = await Employee.create({
      employeeId: 'PRV-2004',
      firstName: 'Zoya',
      lastName: 'OtherTeam',
      email: 'zoya.c@prvision.com',
      branchId: branches[1]._id,
      departmentId: departments[1]._id,
      designationId: designation._id,
      managerId: null,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
    });

    emps.resigned = await Employee.create({
      employeeId: 'PRV-2005',
      firstName: 'Former',
      lastName: 'Staff',
      email: 'former.c@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      managerId: emps.mgr._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.RESIGNED,
    });

    // Seed 30 more active employees so paginated /options (limit=20) returns multiple pages
    const extraEmps = Array.from({ length: 30 }, (_, i) => ({
      employeeId: `PRV-21${String(i + 1).padStart(2, '0')}`,
      firstName: `Member${String(i + 1).padStart(2, '0')}`,
      lastName: `Test`,
      email: `member${i + 1}.c@prvision.com`,
      branchId: branches[i % 2]._id,
      departmentId: departments[i % 2]._id,
      designationId: designation._id,
      managerId: i < 5 ? emps.mgr._id : null,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
    }));
    await Employee.insertMany(extraEmps);

    asset = await Asset.create({
      assetTag: 'AST-C-001',
      name: 'MacBook Pro M3',
      category: 'Laptop',
      condition: 'Good',
    });

    trainingProgram = await TrainingProgram.create({
      title: 'Batch C Security Certification',
      category: 'Technical',
      trainerName: 'Security Lead',
      startDate: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 2 * 86400000),
    });

    tokens.hr = await login('hr.c@prvision.com', 'c-hr');
    tokens.mgr = await login('mgr.c@prvision.com', 'c-mgr');
    tokens.emp = await login('emp.c@prvision.com', 'c-emp');
    tokens.rec = await login('rec.c@prvision.com', 'c-rec');
    tokens.pay = await login('pay.c@prvision.com', 'c-pay');
  });

  afterAll(() => {
    for (const filePath of createdUploadFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
  });

  it('completes real E2E Asset assignment, Document upload, Performance review, and Training enrollment using IDs from /employees/options', async () => {
    // 1. Fetch slim options as HR_MANAGER with limit=20
    const optRes = await api
      .get('/api/v1/employees/options?limit=20&search=Aarav')
      .set('Authorization', `Bearer ${tokens.hr}`);
    expect(optRes.status).toBe(200);
    expect(optRes.body.data.employees).toHaveLength(1);

    const targetOpt = optRes.body.data.employees[0];
    expect(Object.keys(targetOpt).sort()).toEqual(['_id', 'email', 'employeeId', 'firstName', 'lastName']);
    expect(targetOpt.bankDetails).toBeUndefined();
    expect(targetOpt.address).toBeUndefined();
    expect(targetOpt.phone).toBeUndefined();

    // 2. Assign Asset using option _id
    const assignAssetRes = await api
      .post(`/api/v1/assets/${asset._id}/assign`)
      .set('Authorization', `Bearer ${tokens.hr}`)
      .send({ employeeId: targetOpt._id, conditionAtAssignment: 'Good', notes: 'Batch C E2E' });
    expect(assignAssetRes.status).toBe(200);
    expect(assignAssetRes.body.data.asset.currentAssignedTo._id || assignAssetRes.body.data.asset.currentAssignedTo).toBeTruthy();

    // 3. Upload Document targeting option _id (clean up disk file afterwards)
    const pdfPayload = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
    const docUploadRes = await api
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokens.hr}`)
      .field('title', 'Offer Letter C')
      .field('category', 'Offer Letter')
      .field('employeeId', targetOpt._id)
      .attach('file', pdfPayload, { filename: 'offer-c.pdf', contentType: 'application/pdf' });
    expect(docUploadRes.status).toBe(201);
    const savedDoc = docUploadRes.body.data.document;
    expect((savedDoc.employeeId?._id || savedDoc.employeeId).toString()).toBe(targetOpt._id);
    if (savedDoc.fileName) {
      createdUploadFiles.push(path.join(UPLOAD_ROOT, savedDoc.fileName));
    }
    const delDocRes = await api
      .delete(`/api/v1/documents/${savedDoc._id}`)
      .set('Authorization', `Bearer ${tokens.hr}`);
    expect(delDocRes.status).toBe(200);

    // 4. Manager fetches /employees/options (strictly direct reports) and initiates Performance review
    const mgrOptRes = await api
      .get('/api/v1/employees/options?limit=20')
      .set('Authorization', `Bearer ${tokens.mgr}`);
    expect(mgrOptRes.status).toBe(200);
    const mgrOptIds = mgrOptRes.body.data.employees.map((e) => e.employeeId);
    expect(mgrOptIds).toContain('PRV-2003');
    expect(mgrOptIds).not.toContain('PRV-2004'); // Unrelated employee excluded
    expect(mgrOptIds).not.toContain('PRV-2005'); // Resigned excluded

    const revRes = await api
      .post('/api/v1/performance')
      .set('Authorization', `Bearer ${tokens.mgr}`)
      .send({
        employeeId: targetOpt._id,
        reviewCycle: 'Q4-2026-C',
        goals: [{ title: 'Reliability', weightage: 100 }],
      });
    expect(revRes.status).toBe(201);

    // 5. Manager enrolls employees from /employees/options into TrainingProgram
    const enrollRes = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.mgr}`)
      .send({ employeeIds: [targetOpt._id] });
    expect(enrollRes.status).toBe(201);
  });

  it('enforces RBAC, department/branch scoping, and backward compatibility with /employees', async () => {
    const [empDeny, recDeny, payOk, scopedOpts, fullDir] = await Promise.all([
      api.get('/api/v1/employees/options').set('Authorization', `Bearer ${tokens.emp}`),
      api.get('/api/v1/employees/options').set('Authorization', `Bearer ${tokens.rec}`),
      api.get('/api/v1/employees/options?limit=20').set('Authorization', `Bearer ${tokens.pay}`),
      api
        .get(`/api/v1/employees/options?departmentId=${departments[1]._id}&branchId=${branches[1]._id}&limit=50`)
        .set('Authorization', `Bearer ${tokens.hr}`),
      api.get('/api/v1/employees?limit=50').set('Authorization', `Bearer ${tokens.hr}`),
    ]);

    expect(empDeny.status).toBe(403);
    expect(recDeny.status).toBe(403);
    expect(payOk.status).toBe(200);
    expect(payOk.body.data.pagination.pages).toBeGreaterThanOrEqual(2);

    expect(scopedOpts.status).toBe(200);
    expect(scopedOpts.body.data.employees.some((e) => e.employeeId === 'PRV-2004')).toBe(true);
    expect(scopedOpts.body.data.employees.some((e) => e.employeeId === 'PRV-2003')).toBe(false);

    // /employees full directory compatibility preserved
    expect(fullDir.status).toBe(200);
    expect(fullDir.body.data.employees[0].departmentId).toHaveProperty('name');
    expect(fullDir.body.data.employees[0].designationId).toHaveProperty('title');
  });
});
