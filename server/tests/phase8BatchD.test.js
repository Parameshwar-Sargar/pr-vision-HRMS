import { describe, it, expect, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import './setup.js';
import { api } from './setup.js';
import { LIFECYCLE_STAGES, ROLES } from '../src/config/constants.js';
import {
  BATCH_B_INDEX_PLAN,
  REDUNDANT_INDEX_CANDIDATES,
  applyBatchBIndexes,
  rollbackBatchBIndexes,
} from '../src/scripts/migrateIndexesBatchB.js';

import CompanySettings from '../src/models/CompanySettings.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Shift from '../src/models/Shift.js';
import Employee from '../src/models/Employee.js';
import User from '../src/models/User.js';
import TrainingProgram from '../src/models/TrainingProgram.js';
import TrainingAssignment from '../src/models/TrainingAssignment.js';

describe('Phase 8 Batch D — Manager Training Self-Enrollment, Security Hardening & Release Readiness', () => {
  let branches;
  let departments;
  let designation;
  let shift;
  let trainingProgram;

  const tokens = {};
  const emps = {};
  const password = 'Password@123';

  const login = async (email, tabId) => {
    const res = await api
      .post('/api/v1/auth/login')
      .set('X-Tab-Id', tabId)
      .send({ email, password });
    expect(res.status).toBe(200);
    return res.body.data.tokens.accessToken;
  };

  beforeAll(async () => {
    await CompanySettings.create({
      companyName: 'PR VISION INNOVATIONS',
      contactEmail: 'hr@prvision.com',
    });

    branches = await Branch.insertMany([
      {
        name: 'Bengaluru HQ',
        code: 'D-BLR',
        isHeadquarters: true,
        address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
      },
      {
        name: 'Hyderabad Hub',
        code: 'D-HYD',
        isHeadquarters: false,
        address: { city: 'Hyderabad', state: 'Telangana', country: 'India' },
      },
    ]);

    departments = await Department.insertMany([
      { name: 'Engineering', code: 'D-ENG', branchId: branches[0]._id },
      { name: 'Finance', code: 'D-FIN', branchId: branches[1]._id },
    ]);

    designation = await Designation.create({
      title: 'Staff Engineer',
      code: 'D-SWE',
      departmentId: departments[0]._id,
      level: 3,
    });

    shift = await Shift.create({
      name: 'Day Shift',
      code: 'D-DAY',
      startTime: '09:30',
      endTime: '18:30',
      isDefault: true,
    });

    const [adminUser, hrUser, mgrUser, rep1User, rep2User, peerUser, recUser, delUser] =
      await Promise.all([
        User.create({
          name: 'Admin User',
          email: 'admin.d@prvision.com',
          password,
          role: ROLES.ADMIN,
          branchId: branches[0]._id,
        }),
        User.create({
          name: 'HR Lead',
          email: 'hr.d@prvision.com',
          password,
          role: ROLES.HR_MANAGER,
          branchId: branches[0]._id,
        }),
        User.create({
          name: 'Vikram Manager',
          email: 'mgr.d@prvision.com',
          password,
          role: ROLES.MANAGER,
          branchId: branches[0]._id,
        }),
        User.create({
          name: 'Aarav Report',
          email: 'rep1.d@prvision.com',
          password,
          role: ROLES.EMPLOYEE,
          branchId: branches[0]._id,
        }),
        User.create({
          name: 'Neha Report',
          email: 'rep2.d@prvision.com',
          password,
          role: ROLES.EMPLOYEE,
          branchId: branches[0]._id,
        }),
        User.create({
          name: 'Rohan Unrelated',
          email: 'peer.d@prvision.com',
          password,
          role: ROLES.EMPLOYEE,
          branchId: branches[1]._id,
        }),
        User.create({
          name: 'Sonia Recruiter',
          email: 'rec.d@prvision.com',
          password,
          role: ROLES.RECRUITER,
          branchId: branches[0]._id,
        }),
        User.create({
          name: 'Ghost Deleted',
          email: 'del.d@prvision.com',
          password,
          role: ROLES.EMPLOYEE,
          branchId: branches[0]._id,
        }),
      ]);

    emps.admin = await Employee.create({
      userId: adminUser._id,
      employeeId: 'PRV-D001',
      firstName: 'Rajesh',
      lastName: 'Admin',
      email: 'admin.d@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      joiningDate: new Date('2023-01-10'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
    });

    emps.hr = await Employee.create({
      userId: hrUser._id,
      employeeId: 'PRV-D002',
      firstName: 'Priya',
      lastName: 'HR',
      email: 'hr.d@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      joiningDate: new Date('2023-02-10'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
    });

    emps.mgr = await Employee.create({
      userId: mgrUser._id,
      employeeId: 'PRV-D003',
      firstName: 'Vikram',
      lastName: 'Manager',
      email: 'mgr.d@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      joiningDate: new Date('2023-03-10'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
    });

    emps.rep1 = await Employee.create({
      userId: rep1User._id,
      employeeId: 'PRV-D004',
      firstName: 'Aarav',
      lastName: 'Report',
      email: 'rep1.d@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      managerId: emps.mgr._id,
      joiningDate: new Date('2024-01-15'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
    });

    emps.rep2 = await Employee.create({
      userId: rep2User._id,
      employeeId: 'PRV-D005',
      firstName: 'Neha',
      lastName: 'Report',
      email: 'rep2.d@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      managerId: emps.mgr._id,
      joiningDate: new Date('2024-02-15'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
    });

    // Unrelated employee who happens to share firstName "Vikram" to test search + scope intersection
    emps.peer = await Employee.create({
      userId: peerUser._id,
      employeeId: 'PRV-D006',
      firstName: 'Vikram',
      lastName: 'Unrelated',
      email: 'peer.d@prvision.com',
      branchId: branches[1]._id,
      departmentId: departments[1]._id,
      designationId: designation._id,
      shiftId: shift._id,
      joiningDate: new Date('2024-03-15'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
    });

    emps.rec = await Employee.create({
      userId: recUser._id,
      employeeId: 'PRV-D007',
      firstName: 'Sonia',
      lastName: 'Recruiter',
      email: 'rec.d@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      joiningDate: new Date('2024-04-15'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
    });

    emps.deletedReport = await Employee.create({
      userId: delUser._id,
      employeeId: 'PRV-D008',
      firstName: 'Ghost',
      lastName: 'Deleted',
      email: 'del.d@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designation._id,
      shiftId: shift._id,
      managerId: emps.mgr._id,
      joiningDate: new Date('2024-05-15'),
      employmentStatus: LIFECYCLE_STAGES.ACTIVE,
      isDeleted: true,
    });

    await Promise.all([
      User.findByIdAndUpdate(adminUser._id, { employeeId: emps.admin._id }),
      User.findByIdAndUpdate(hrUser._id, { employeeId: emps.hr._id }),
      User.findByIdAndUpdate(mgrUser._id, { employeeId: emps.mgr._id }),
      User.findByIdAndUpdate(rep1User._id, { employeeId: emps.rep1._id }),
      User.findByIdAndUpdate(rep2User._id, { employeeId: emps.rep2._id }),
      User.findByIdAndUpdate(peerUser._id, { employeeId: emps.peer._id }),
      User.findByIdAndUpdate(recUser._id, { employeeId: emps.rec._id }),
      User.findByIdAndUpdate(delUser._id, { employeeId: emps.deletedReport._id }),
    ]);

    trainingProgram = await TrainingProgram.create({
      title: 'Cloud Architecture & Zero Trust',
      category: 'Technical',
      trainerName: 'Principal Guild',
      description: 'Enterprise security and scalable system design.',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-05'),
      durationHours: 16,
      mode: 'Online',
      status: 'Scheduled',
    });

    tokens.ADMIN = await login('admin.d@prvision.com', 'tab-d-admin');
    tokens.HR_MANAGER = await login('hr.d@prvision.com', 'tab-d-hr');
    tokens.MANAGER = await login('mgr.d@prvision.com', 'tab-d-mgr');
    tokens.EMPLOYEE = await login('rep1.d@prvision.com', 'tab-d-emp');
    tokens.RECRUITER = await login('rec.d@prvision.com', 'tab-d-rec');
  });

  it('1. Enforces strict default direct-report scope on /employees/options and /employees while supporting opt-in includeSelf=true ONLY for MANAGER on /employees/options', async () => {
    // Default options without includeSelf -> only direct reports (rep1, rep2); excludes manager self & unrelated
    const defaultOptRes = await api
      .get('/api/v1/employees/options')
      .set('Authorization', `Bearer ${tokens.MANAGER}`);
    expect(defaultOptRes.status).toBe(200);
    const defaultIds = defaultOptRes.body.data.employees.map((e) => String(e._id));
    expect(defaultIds).toContain(String(emps.rep1._id));
    expect(defaultIds).toContain(String(emps.rep2._id));
    expect(defaultIds).not.toContain(String(emps.mgr._id));
    expect(defaultIds).not.toContain(String(emps.peer._id));
    expect(defaultIds).not.toContain(String(emps.deletedReport._id));

    // Opt-in includeSelf=true -> includes manager self + direct reports; still excludes unrelated & deleted
    const selfOptRes = await api
      .get('/api/v1/employees/options?includeSelf=true')
      .set('Authorization', `Bearer ${tokens.MANAGER}`);
    expect(selfOptRes.status).toBe(200);
    const selfIds = selfOptRes.body.data.employees.map((e) => String(e._id));
    expect(selfIds).toContain(String(emps.mgr._id));
    expect(selfIds).toContain(String(emps.rep1._id));
    expect(selfIds).toContain(String(emps.rep2._id));
    expect(selfIds).not.toContain(String(emps.peer._id));
    expect(selfIds).not.toContain(String(emps.hr._id));
    expect(selfIds).not.toContain(String(emps.deletedReport._id));

    // Search + includeSelf=true intersection: searching "Vikram" returns Vikram Manager (self), NOT Vikram Unrelated (peer)
    const searchSelfRes = await api
      .get('/api/v1/employees/options?includeSelf=true&search=Vikram')
      .set('Authorization', `Bearer ${tokens.MANAGER}`);
    expect(searchSelfRes.status).toBe(200);
    const searchIds = searchSelfRes.body.data.employees.map((e) => String(e._id));
    expect(searchIds).toEqual([String(emps.mgr._id)]);

    // Parameter pollution ?includeSelf=true&includeSelf=false does NOT enable includeSelf
    const pollutedRes = await api
      .get('/api/v1/employees/options?includeSelf=true&includeSelf=false')
      .set('Authorization', `Bearer ${tokens.MANAGER}`);
    expect(pollutedRes.status).toBe(200);
    expect(pollutedRes.body.data.employees.map((e) => String(e._id))).not.toContain(
      String(emps.mgr._id)
    );

    // Main /employees directory ignores includeSelf=true and remains strictly direct reports
    const dirRes = await api
      .get('/api/v1/employees?includeSelf=true')
      .set('Authorization', `Bearer ${tokens.MANAGER}`);
    expect(dirRes.status).toBe(200);
    const dirIds = dirRes.body.data.employees.map((e) => String(e._id));
    expect(dirIds).not.toContain(String(emps.mgr._id));
    expect(dirIds).toContain(String(emps.rep1._id));
  });

  it('2. Allows MANAGER to enroll self and direct reports in training, prevents duplicates, and blocks unrelated/deleted employees while preserving ADMIN & HR workflows', async () => {
    // 2a. Manager enrolls self + direct report Aarav
    const selfAndTeamEnroll = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.MANAGER}`)
      .send({ employeeIds: [String(emps.mgr._id), String(emps.rep1._id)] });
    expect(selfAndTeamEnroll.status).toBe(201);
    expect(selfAndTeamEnroll.body.data.assignments).toHaveLength(2);

    // 2b. Duplicate enrollment is idempotent and creates 0 duplicate records
    const dupEnroll = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.MANAGER}`)
      .send({ employeeIds: [String(emps.mgr._id), String(emps.rep1._id)] });
    expect(dupEnroll.status).toBe(201);
    expect(dupEnroll.body.data.assignments).toHaveLength(0);

    const dbCount = await TrainingAssignment.countDocuments({
      programId: trainingProgram._id,
      employeeId: { $in: [emps.mgr._id, emps.rep1._id] },
    });
    expect(dbCount).toBe(2);

    // 2c. Manager CANNOT enroll unrelated employee (even when bundled with valid self ID)
    const unrelatedAttempt = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.MANAGER}`)
      .send({ employeeIds: [String(emps.mgr._id), String(emps.peer._id)] });
    expect(unrelatedAttempt.status).toBe(403);

    // 2d. Manager CANNOT enroll soft-deleted direct report
    const deletedAttempt = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.MANAGER}`)
      .send({ employeeIds: [String(emps.deletedReport._id)] });
    expect(deletedAttempt.status).toBe(403);

    // 2e. HR_MANAGER & ADMIN can enroll any active employee across org, but deleted/missing employee returns 404
    const hrEnroll = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.HR_MANAGER}`)
      .send({ employeeIds: [String(emps.peer._id)] });
    expect(hrEnroll.status).toBe(201);
    expect(hrEnroll.body.data.assignments).toHaveLength(1);

    const adminEnroll = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .send({ employeeIds: [String(emps.rep2._id)] });
    expect(adminEnroll.status).toBe(201);
    expect(adminEnroll.body.data.assignments).toHaveLength(1);

    const hrGhostAttempt = await api
      .post(`/api/v1/training/programs/${trainingProgram._id}/assign`)
      .set('Authorization', `Bearer ${tokens.HR_MANAGER}`)
      .send({ employeeIds: [String(emps.deletedReport._id)] });
    expect(hrGhostAttempt.status).toBe(404);

    // 2f. Manager GET /training/assignments sees both self and direct team assignments
    const mgrAssignList = await api
      .get(`/api/v1/training/assignments?programId=${trainingProgram._id}`)
      .set('Authorization', `Bearer ${tokens.MANAGER}`);
    expect(mgrAssignList.status).toBe(200);
    const assignedEmpIds = mgrAssignList.body.data.assignments.map((a) =>
      String(a.employeeId?._id || a.employeeId)
    );
    expect(assignedEmpIds).toContain(String(emps.mgr._id));
    expect(assignedEmpIds).toContain(String(emps.rep1._id));
    expect(assignedEmpIds).toContain(String(emps.rep2._id));
    expect(assignedEmpIds).not.toContain(String(emps.peer._id));
  });

  it('3. Blocks forged self-review initiation on Performance and blocks EMPLOYEE/RECRUITER on /employees/options?includeSelf=true', async () => {
    // EMPLOYEE and RECRUITER remain strictly 403 on /employees/options even with ?includeSelf=true
    for (const role of ['EMPLOYEE', 'RECRUITER']) {
      const optRes = await api
        .get('/api/v1/employees/options?includeSelf=true')
        .set('Authorization', `Bearer ${tokens[role]}`);
      expect(optRes.status).toBe(403);
    }

    // MANAGER cannot initiate a performance review cycle for themselves (403)
    const mgrSelfPerf = await api
      .post('/api/v1/performance')
      .set('Authorization', `Bearer ${tokens.MANAGER}`)
      .send({
        employeeId: String(emps.mgr._id),
        reviewCycle: 'Q4-2026',
        goals: [{ title: 'Self goal', weightage: 100 }],
      });
    expect(mgrSelfPerf.status).toBe(403);

    // MANAGER CAN initiate a performance review cycle for direct report Aarav (201)
    const mgrTeamPerf = await api
      .post('/api/v1/performance')
      .set('Authorization', `Bearer ${tokens.MANAGER}`)
      .send({
        employeeId: String(emps.rep1._id),
        reviewCycle: 'Q4-2026',
        goals: [{ title: 'Deliver Batch D', weightage: 100 }],
      });
    expect(mgrTeamPerf.status).toBe(201);

    // EMPLOYEE and RECRUITER cannot initiate performance reviews (403)
    for (const role of ['EMPLOYEE', 'RECRUITER']) {
      const res = await api
        .post('/api/v1/performance')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send({
          employeeId: String(emps.rep1._id),
          reviewCycle: 'Q4-2026-FORGED',
          goals: [{ title: 'Forged', weightage: 100 }],
        });
      expect(res.status).toBe(403);
    }
  });

  it('4. Sanitizes NoSQL $-operator query payloads and validates ObjectId query filters with 400 Bad Request', async () => {
    // Operator injection in query string (?status[$ne]=Available) is stripped and rejected cleanly
    const operatorQuery = await api
      .get('/api/v1/assets?status[$ne]=Available')
      .set('Authorization', `Bearer ${tokens.HR_MANAGER}`);
    expect(operatorQuery.status).toBe(400);

    // Invalid ObjectId query filters return 400 across hardened controllers
    const checks = [
      '/api/v1/employees?departmentId=invalid-id',
      '/api/v1/employees?branchId=invalid-id',
      '/api/v1/departments?branchId=invalid-id',
      '/api/v1/attendance?branchId=invalid-id',
      '/api/v1/recruitment/jobs?departmentId=invalid-id',
      '/api/v1/reports/employees?branchId=invalid-id',
      '/api/v1/reports/employees?departmentId=invalid-id',
    ];

    for (const url of checks) {
      const res = await api.get(url).set('Authorization', `Bearer ${tokens.HR_MANAGER}`);
      expect(res.status).toBe(400);
    }

    // Notification markAsRead validates ObjectId (400) and ownership/existence (404)
    const badNotifId = await api
      .patch('/api/v1/notifications/not-an-id/read')
      .set('Authorization', `Bearer ${tokens.EMPLOYEE}`);
    expect(badNotifId.status).toBe(400);

    const missingNotif = await api
      .patch(`/api/v1/notifications/${new mongoose.Types.ObjectId()}/read`)
      .set('Authorization', `Bearer ${tokens.EMPLOYEE}`);
    expect(missingNotif.status).toBe(404);
  });

  it('5. Verifies Batch B 38-index migration dry-run/apply/rollback idempotency and single-tenant schema state across all models', async () => {
    expect(BATCH_B_INDEX_PLAN).toHaveLength(38);
    expect(REDUNDANT_INDEX_CANDIDATES).toHaveLength(19);

    const db = mongoose.connection.db;

    // Ensure all 38 Batch B indexes are applied first
    await applyBatchBIndexes(db, { dryRun: false });

    // Dry-run rollback previews all 38 drops without dropping any index
    const dryDown = await rollbackBatchBIndexes(db, { dryRun: true });
    expect(dryDown.filter((r) => r.action === 'would_drop')).toHaveLength(38);

    // Actual rollback + dry-run apply + actual re-apply
    const downRes = await rollbackBatchBIndexes(db, { dryRun: false });
    expect(downRes.filter((r) => r.action === 'dropped')).toHaveLength(38);

    const dryUp = await applyBatchBIndexes(db, { dryRun: true });
    expect(dryUp.filter((r) => r.action === 'would_create')).toHaveLength(38);

    const upRes = await applyBatchBIndexes(db, { dryRun: false });
    expect(upRes.filter((r) => r.action === 'created')).toHaveLength(38);

    // Second apply is a pure no-op
    const upAgain = await applyBatchBIndexes(db, { dryRun: false });
    expect(upAgain.every((r) => r.action === 'skipped_exists')).toBe(true);

    // Tenant schema check across registered models
    const modelNames = mongoose.modelNames();
    const modelsWithTenantId = modelNames.filter((name) =>
      Boolean(mongoose.model(name).schema.path('tenantId'))
    );
    expect(modelsWithTenantId).toEqual(['UserSession']);
  });
});
