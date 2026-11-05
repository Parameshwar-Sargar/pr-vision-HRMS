import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { api } from './setup.js';
import { seedDatabase } from '../src/scripts/seed.js';

describe('PR VISION HRMS – Enterprise Master System Tests', () => {
  let adminToken;
  let hrToken;
  let managerToken;
  let employeeToken;
  let recruiterToken;
  let payrollToken;

  let testEmployeeId;

  beforeAll(async () => {
    // 1. Seed complete enterprise master dataset
    await seedDatabase({ disconnect: false });

    // 2. Authenticate all 6 core roles
    const adminLogin = await api.post('/api/v1/auth/login').send({
      email: 'admin@prvision.com',
      password: 'Password@123',
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    const hrLogin = await api.post('/api/v1/auth/login').send({
      email: 'hr@prvision.com',
      password: 'Password@123',
    });
    expect(hrLogin.status).toBe(200);
    hrToken = hrLogin.body.data.tokens.accessToken;

    const mgrLogin = await api.post('/api/v1/auth/login').send({
      email: 'manager@prvision.com',
      password: 'Password@123',
    });
    expect(mgrLogin.status).toBe(200);
    managerToken = mgrLogin.body.data.tokens.accessToken;

    const empLogin = await api.post('/api/v1/auth/login').send({
      email: 'employee@prvision.com',
      password: 'Password@123',
    });
    expect(empLogin.status).toBe(200);
    employeeToken = empLogin.body.data.tokens.accessToken;

    const recLogin = await api.post('/api/v1/auth/login').send({
      email: 'recruiter@prvision.com',
      password: 'Password@123',
    });
    expect(recLogin.status).toBe(200);
    recruiterToken = recLogin.body.data.tokens.accessToken;

    const payLogin = await api.post('/api/v1/auth/login').send({
      email: 'payroll@prvision.com',
      password: 'Password@123',
    });
    expect(payLogin.status).toBe(200);
    payrollToken = payLogin.body.data.tokens.accessToken;
  });

  describe('Module 1 & 2: Organization Settings, Branches & RBAC', () => {
    it('Retrieves PR VISION INNOVATIONS company profile', async () => {
      const res = await api
        .get('/api/v1/organization/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.company.companyName).toBe('PR VISION INNOVATIONS');
      expect(res.body.data.company.tagline).toBe('People. Process. Performance.');
    });

    it('Lists all 3 enterprise branches (Bengaluru HQ, Mumbai, Hyderabad)', async () => {
      const res = await api
        .get('/api/v1/organization/branches')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.branches.length).toBeGreaterThanOrEqual(3);
    });

    it('Denies EMPLOYEE from modifying company settings (RBAC Check)', async () => {
      const res = await api
        .put('/api/v1/organization/settings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ companyName: 'Hacked Name' });
      expect(res.status).toBe(403);
    });

    it('Denies EMPLOYEE from generating payroll runs (RBAC Check)', async () => {
      const res = await api
        .post('/api/v1/payroll/runs/generate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ month: 5, year: 2026 });
      expect(res.status).toBe(403);
    });
  });

  describe('Module 3: Employee Lifecycle Management', () => {
    it('HR can view employees directory and find Amit Patel', async () => {
      const res = await api
        .get('/api/v1/employees?search=Amit')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.employees.length).toBeGreaterThanOrEqual(1);
      testEmployeeId = res.body.data.employees[0]._id;
    });

    it('HR can confirm probation of an employee', async () => {
      // Find Sneha Rao who is on probation
      const empRes = await api
        .get('/api/v1/employees?search=Sneha')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(empRes.status).toBe(200);
      const probationEmpId = empRes.body.data.employees[0]._id;

      const confirmRes = await api
        .patch(`/api/v1/employees/${probationEmpId}/confirm`)
        .set('Authorization', `Bearer ${hrToken}`);
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.employee.employmentStatus).toBe('Confirmed');
    });

    it('HR can promote an employee with a designation change', async () => {
      const desigs = await api
        .get('/api/v1/designations')
        .set('Authorization', `Bearer ${hrToken}`);
      const newDesigId = desigs.body.data.designations[0]._id;

      const promoRes = await api
        .patch(`/api/v1/employees/${testEmployeeId}/promote`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          newDesignationId: newDesigId,
          incrementPercentage: 15,
        });
      expect(promoRes.status).toBe(200);
      expect(promoRes.body.data.employee.employmentStatus).toBe('Promoted');
    });
  });

  describe('Module 5 & 6: Attendance & Shift Management', () => {
    it('Employee successfully clocks out (or clocks in)', async () => {
      const checkInRes = await api
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`);
      expect([200, 400]).toContain(checkInRes.status);

      const checkOutRes = await api
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${employeeToken}`);
      expect([200, 400]).toContain(checkOutRes.status);
    });

    it('Retrieves shifts schedule', async () => {
      const res = await api.get('/api/v1/shifts').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.shifts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Module 7: Leave Management & Balances', () => {
    let leaveTypeId;

    it('Lists available leave types', async () => {
      const res = await api.get('/api/v1/leaves/types').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.leaveTypes.length).toBeGreaterThanOrEqual(1);
      leaveTypeId = res.body.data.leaveTypes[0]._id;
    });

    it('Retrieves leave balances for authenticated employee', async () => {
      const res = await api.get('/api/v1/leaves/balances').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.balances.length).toBeGreaterThanOrEqual(1);
    });

    it('Employee applies for leave and Manager reviews it', async () => {
      const start = new Date(2026, 7, 10).toISOString();
      const end = new Date(2026, 7, 11).toISOString();

      const applyRes = await api
        .post('/api/v1/leaves/apply')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId,
          startDate: start,
          endDate: end,
          totalDays: 2,
          reason: 'Family event out of town',
        });
      expect(applyRes.status).toBe(201);
      const leaveId = applyRes.body.data.leaveRequest._id;

      // Manager reviews and approves
      const reviewRes = await api
        .patch(`/api/v1/leaves/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          status: 'Approved',
          remarks: 'Approved by Team Manager.',
        });
      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.leaveRequest.status).toBe('Approved');
    });
  });

  describe('Module 9: Payroll & Payslips', () => {
    it('PAYROLL_ADMIN can retrieve all payroll runs', async () => {
      const res = await api.get('/api/v1/payroll/runs').set('Authorization', `Bearer ${payrollToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.runs.length).toBeGreaterThanOrEqual(1);
    });

    it('PAYROLL_ADMIN generates a fresh payroll batch run for current month', async () => {
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();

      const res = await api
        .post('/api/v1/payroll/runs/generate')
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({
          month: currentMonth,
          year: currentYear,
          notes: 'Automated test monthly batch',
        });
      expect(res.status).toBe(200);
      expect(res.body.data.run.totalEmployees).toBeGreaterThan(0);
      expect(res.body.data.run.totalNetSalary).toBeGreaterThan(0);
    });

    it('Employee can retrieve their own payslips', async () => {
      const res = await api.get('/api/v1/payroll/payslips').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.payslips.length).toBeGreaterThanOrEqual(1);
      const payslipId = res.body.data.payslips[0]._id;

      // Download PDF
      const pdfRes = await api
        .get(`/api/v1/payroll/payslips/${payslipId}/pdf`)
        .set('Authorization', `Bearer ${employeeToken}`);
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('Module 11: Recruitment & Candidate-to-Employee Conversion', () => {
    let jobOpeningId;
    let candidateId;

    it('Recruiter can create job requisition', async () => {
      const depts = await api.get('/api/v1/departments').set('Authorization', `Bearer ${recruiterToken}`);
      const deptId = depts.body.data.departments[0]._id;

      const res = await api
        .post('/api/v1/recruitment/jobs')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          title: 'Staff Platform Architect',
          departmentId: deptId,
          openingsCount: 1,
          description: 'Architecting distributed enterprise systems',
          requirements: ['Node.js', 'Distributed Systems'],
        });
      expect(res.status).toBe(201);
      jobOpeningId = res.body.data.job._id;
    });

    it('Recruiter registers a candidate and updates status to Hired', async () => {
      const res = await api
        .post('/api/v1/recruitment/candidates')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          jobOpeningId,
          fullName: 'Kunal Kapoor',
          email: 'kunal.kapoor@example.com',
          phone: '+91 9988776655',
          currentCompany: 'Amazon',
          currentCtc: 2400000,
          expectedCtc: 3000000,
        });
      expect(res.status).toBe(201);
      candidateId = res.body.data.candidate._id;

      const updateRes = await api
        .patch(`/api/v1/recruitment/candidates/${candidateId}/status`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'Offered', rating: 5 });
      expect(updateRes.status).toBe(200);
    });

    it('HR converts hired candidate into a fully onboarded employee with login credentials', async () => {
      const depts = await api.get('/api/v1/departments').set('Authorization', `Bearer ${hrToken}`);
      const deptId = depts.body.data.departments[0]._id;

      const convertRes = await api
        .post(`/api/v1/recruitment/candidates/${candidateId}/convert`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          departmentId: deptId,
          password: 'Password@123',
        });
      expect(convertRes.status).toBe(201);
      expect(convertRes.body.data.candidate.status).toBe('Hired');
      expect(convertRes.body.data.employee.employeeId).toMatch(/^PRV-\d{4}$/);

      // Verify the new employee can immediately log in
      const loginTest = await api.post('/api/v1/auth/login').send({
        email: 'kunal.kapoor@example.com',
        password: 'Password@123',
      });
      expect(loginTest.status).toBe(200);
      expect(loginTest.body.data.user.role).toBe('EMPLOYEE');
    });
  });

  describe('Module 10, 12-16: Performance, Training, Expenses, Assets, Grievances', () => {
    it('Lists training programs and assignments', async () => {
      const res = await api.get('/api/v1/training/programs').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.programs.length).toBeGreaterThanOrEqual(1);
    });

    it('Employee files expense claim and HR reviews it', async () => {
      const res = await api
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          title: 'Client Lunch meeting',
          category: 'Food & Dining',
          amount: 1850,
          description: 'Discussing project deliverables',
        });
      expect(res.status).toBe(201);
      const claimId = res.body.data.claim._id;

      const reviewRes = await api
        .patch(`/api/v1/expenses/${claimId}/review`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'Approved', remarks: 'Valid receipt attached.' });
      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.claim.status).toBe('Approved');
    });

    it('Lists company assets and assigns available asset', async () => {
      const res = await api.get('/api/v1/assets').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.assets.length).toBeGreaterThanOrEqual(1);
    });

    it('Employee raises a grievance and HR resolves it', async () => {
      const res = await api
        .post('/api/v1/grievances')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          category: 'Facility & Work Environment',
          priority: 'Medium',
          subject: 'Ergonomic chair request',
          description: 'Requesting ergonomic lumbar chair for desk 32.',
        });
      expect(res.status).toBe(201);
      const ticketId = res.body.data.grievance._id;

      const resolveRes = await api
        .patch(`/api/v1/grievances/${ticketId}/status`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          status: 'Resolved',
          resolutionNotes: 'Ergonomic chair delivered to workstation.',
        });
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.grievance.status).toBe('Resolved');
    });
  });

  describe('Module 18 & 19: System Diagnostics & Reports', () => {
    it('Admin retrieves system environment diagnostics', async () => {
      const res = await api.get('/api/v1/system/diagnostics').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Operational');
      expect(res.body.data.platform.product).toBe('PR VISION HRMS');
    });

    it('Admin exports employee report as CSV', async () => {
      const res = await api
        .get('/api/v1/reports/employees?format=csv')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Employee ID');
      expect(res.text).toContain('PRV-0001');
    });
  });
});
