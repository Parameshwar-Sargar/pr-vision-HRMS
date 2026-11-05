import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { api } from './setup.js';

describe('Auth, Attendance, Leave and Payroll Workflow Tests', () => {
  let adminToken;
  let employeeToken;
  let employeeUserId;
  let employeeDocId;
  let deptId;
  let desigId;
  let shiftId;
  let leaveTypeId;

  beforeAll(async () => {
    // 1. Register Company
    const regRes = await api.post('/api/v1/auth/register-company').send({
      companyName: 'Zenith Software',
      adminName: 'Zenith Admin',
      email: 'admin@zenith.corp',
      password: 'Password@123',
    });
    expect(regRes.status).toBe(201);
    adminToken = regRes.body.data.tokens.accessToken;

    // Get setup entities
    const depts = await api.get('/api/v1/departments').set('Authorization', `Bearer ${adminToken}`);
    deptId = depts.body.data.departments[0]._id;

    const desigs = await api.get('/api/v1/designations').set('Authorization', `Bearer ${adminToken}`);
    desigId = desigs.body.data.designations[0]._id;

    const shifts = await api.get('/api/v1/shifts').set('Authorization', `Bearer ${adminToken}`);
    shiftId = shifts.body.data.shifts[0]._id;

    const lTypes = await api.get('/api/v1/leaves/types').set('Authorization', `Bearer ${adminToken}`);
    leaveTypeId = lTypes.body.data.leaveTypes[0]._id;

    // 2. Create an employee with linked user account
    const empRes = await api
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'David',
        lastName: 'Miller',
        email: 'david.miller@zenith.corp',
        departmentId: deptId,
        designationId: desigId,
        shiftId,
        createUserAccount: true,
        password: 'Password@123',
        role: 'EMPLOYEE',
      });
    expect(empRes.status).toBe(201);
    employeeDocId = empRes.body.data.employee._id;
    employeeUserId = empRes.body.data.user._id;

    // 3. Login as employee
    const loginRes = await api.post('/api/v1/auth/login').send({
      email: 'david.miller@zenith.corp',
      password: 'Password@123',
    });
    expect(loginRes.status).toBe(200);
    employeeToken = loginRes.body.data.tokens.accessToken;
  });

  describe('Authentication Module', () => {
    it('Rejects login with invalid password', async () => {
      const res = await api.post('/api/v1/auth/login').send({
        email: 'david.miller@zenith.corp',
        password: 'WrongPassword',
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Allows valid login and returns tokens with user profile', async () => {
      const res = await api.post('/api/v1/auth/login').send({
        email: 'david.miller@zenith.corp',
        password: 'Password@123',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('david.miller@zenith.corp');
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('Retrieves authenticated /me context', async () => {
      const res = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('david.miller@zenith.corp');
      expect(res.body.data.tenant.name).toBe('Zenith Software');
    });
  });

  describe('Attendance Workflow', () => {
    it('Employee successfully clocks in', async () => {
      const res = await api.post('/api/v1/attendance/check-in').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.record.checkInTime).toBeDefined();
    });

    it('Prevents duplicate check-in on the same day', async () => {
      const res = await api.post('/api/v1/attendance/check-in').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already checked in');
    });

    it('Employee successfully clocks out and calculates hours', async () => {
      const res = await api.post('/api/v1/attendance/check-out').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.record.checkOutTime).toBeDefined();
      expect(res.body.data.record.totalHours).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Leave Management Workflow', () => {
    it('Employee successfully applies for leave', async () => {
      const res = await api
        .post('/api/v1/leaves/apply')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId,
          startDate: '2026-12-10',
          endDate: '2026-12-12',
          totalDays: 2,
          reason: 'Personal leave for family trip',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.leaveRequest.status).toBe('Pending');
    });

    it('Prevents invalid overlapping leave request', async () => {
      const res = await api
        .post('/api/v1/leaves/apply')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId,
          startDate: '2026-12-11', // Overlaps with 10-12
          endDate: '2026-12-13',
          totalDays: 2,
          reason: 'Overlapping request attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('overlaps');
    });

    it('Admin reviews and approves leave request', async () => {
      // List requests as admin
      const listRes = await api.get('/api/v1/leaves/requests').set('Authorization', `Bearer ${adminToken}`);
      const leaveId = listRes.body.data.requests[0]._id;

      const approveRes = await api
        .patch(`/api/v1/leaves/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'Approved',
          remarks: 'Approved by management.',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.leaveRequest.status).toBe('Approved');
    });
  });

  describe('Payroll & Payslip Workflow', () => {
    it('Admin sets salary structure for employee', async () => {
      const res = await api
        .post('/api/v1/payroll/structures')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: employeeDocId,
          basicSalary: 60000,
          hra: 24000,
          specialAllowance: 10000,
          statutoryConfig: {
            pfEnabled: true,
            pfEmployeeRate: 12,
            professionalTax: 200,
            tdsDeduction: 2000,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.structure.basicSalary).toBe(60000);
    });

    it('Admin generates monthly payroll run', async () => {
      const res = await api
        .post('/api/v1/payroll/runs/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          month: 10,
          year: 2026,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.run.totalEmployees).toBe(1);
      // Gross = 60000 + 24000 + 10000 = 94000
      // Deductions = PF (7200) + PT (200) + TDS (2000) = 9400
      // Net = 94000 - 9400 = 84600
      expect(res.body.data.run.totalGrossSalary).toBe(94000);
      expect(res.body.data.run.totalDeductions).toBe(9400);
      expect(res.body.data.run.totalNetSalary).toBe(84600);
    });

    it('Employee can fetch their own payslip', async () => {
      const res = await api.get('/api/v1/payroll/payslips').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.payslips.length).toBe(1);
      expect(res.body.data.payslips[0].netSalary).toBe(84600);
    });
  });
});
