import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { api } from './setup.js';
import Employee from '../src/models/Employee.js';

describe('Multi-Tenant Data Isolation Tests', () => {
  let companyAToken;
  let companyBToken;
  let companyAId;
  let companyBId;
  let companyADeptId;
  let companyADesigId;
  let companyAEmployeeId;

  beforeAll(async () => {
    // 1. Onboard Company A
    const resA = await api.post('/api/v1/auth/register-company').send({
      companyName: 'Alpha Corporation',
      adminName: 'Alice Admin',
      email: 'alice@alpha.corp',
      password: 'Password@123',
    });
    expect(resA.status).toBe(201);
    companyAToken = resA.body.data.tokens.accessToken;
    companyAId = resA.body.data.tenant._id;

    // Get Company A's auto-created departments and designations
    const deptsA = await api
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${companyAToken}`);
    companyADeptId = deptsA.body.data.departments[0]._id;

    const desigsA = await api
      .get('/api/v1/designations')
      .set('Authorization', `Bearer ${companyAToken}`);
    companyADesigId = desigsA.body.data.designations[0]._id;

    // 2. Onboard Company B
    const resB = await api.post('/api/v1/auth/register-company').send({
      companyName: 'Beta Technologies',
      adminName: 'Bob Admin',
      email: 'bob@beta.tech',
      password: 'Password@123',
    });
    expect(resB.status).toBe(201);
    companyBToken = resB.body.data.tokens.accessToken;
    companyBId = resB.body.data.tenant._id;
  });

  it('Company A should be able to create an employee', async () => {
    const res = await api
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({
        firstName: 'Charlie',
        lastName: 'Engineer',
        email: 'charlie@alpha.corp',
        departmentId: companyADeptId,
        designationId: companyADesigId,
        employmentType: 'Full-Time',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employee.employeeId).toBe('EMP-001');
    companyAEmployeeId = res.body.data.employee._id;
  });

  it('Company B CANNOT see Company A employee in employee directory', async () => {
    const res = await api
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${companyBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employees.length).toBe(0); // Company B has 0 employees
  });

  it('Company B CANNOT retrieve Company A employee by ID (Must return 404)', async () => {
    const res = await api
      .get(`/api/v1/employees/${companyAEmployeeId}`)
      .set('Authorization', `Bearer ${companyBToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('Company B CANNOT update Company A employee', async () => {
    const res = await api
      .put(`/api/v1/employees/${companyAEmployeeId}`)
      .set('Authorization', `Bearer ${companyBToken}`)
      .send({ firstName: 'HackedName' });

    expect(res.status).toBe(404);
  });

  it('Company B CANNOT delete Company A employee', async () => {
    const res = await api
      .delete(`/api/v1/employees/${companyAEmployeeId}`)
      .set('Authorization', `Bearer ${companyBToken}`);

    expect(res.status).toBe(404);
  });

  it('Tenant spoofing prevention: Server overrides client-provided tenantId in body', async () => {
    // Company B sends request attempting to inject Company A's tenantId in body
    const deptsB = await api
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${companyBToken}`);
    const companyBDeptId = deptsB.body.data.departments[0]._id;

    const desigsB = await api
      .get('/api/v1/designations')
      .set('Authorization', `Bearer ${companyBToken}`);
    const companyBDesigId = desigsB.body.data.designations[0]._id;

    const res = await api
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${companyBToken}`)
      .send({
        tenantId: companyAId, // Attempted spoof!
        firstName: 'Malicious',
        lastName: 'Actor',
        email: 'malicious@beta.tech',
        departmentId: companyBDeptId,
        designationId: companyBDesigId,
      });

    expect(res.status).toBe(201);
    // Verified that created record is safely bound to Company B's tenantId in database
    const created = await Employee.findById(res.body.data.employee._id);
    expect(created.tenantId.toString()).toBe(companyBId.toString());
    expect(created.tenantId.toString()).not.toBe(companyAId.toString());
  });
});
