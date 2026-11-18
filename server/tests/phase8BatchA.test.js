import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import http from 'http';
import zlib from 'zlib';
import path from 'path';
import app from '../src/app.js';
import './setup.js';
import { api } from './setup.js';
import { LIFECYCLE_STAGES, PAYROLL_STATUS, ROLES } from '../src/config/constants.js';

import CompanySettings from '../src/models/CompanySettings.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Shift from '../src/models/Shift.js';
import Employee from '../src/models/Employee.js';
import User from '../src/models/User.js';
import Announcement from '../src/models/Announcement.js';
import Document from '../src/models/Document.js';
import PayrollRun from '../src/models/PayrollRun.js';
import Payslip from '../src/models/Payslip.js';
import { UPLOAD_ROOT } from '../src/utils/securityUtils.js';

describe('Phase 8 Batch A Backend — Auth Projections & HTTP Gzip Compression Safety', () => {
  let adminToken;
  let empToken;
  let branchA;
  let deptA;
  let payslipId;
  let docId;
  let uploadedFilePath;
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

  const loginTab = async (email, tabId) => {
    const res = await api
      .post('/api/v1/auth/login')
      .set('X-Tab-Id', tabId)
      .send({ email, password: 'Password@123' });
    expect(res.status).toBe(200);
    return res.body.data.tokens.accessToken;
  };

  beforeAll(async () => {
    await CompanySettings.create({
      companyName: 'PR VISION INNOVATIONS',
      contactEmail: 'contact@prvision.com',
    });

    branchA = await Branch.create({
      name: 'Bengaluru HQ',
      code: 'HQ-P8A',
      isHeadquarters: true,
      address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
    });
    const branchB = await Branch.create({
      name: 'Mumbai Hub',
      code: 'MUM-P8A',
      isHeadquarters: false,
      address: { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
    });

    deptA = await Department.create({ name: 'Engineering', code: 'ENG-P8A' });
    const desigA = await Designation.create({ title: 'Engineer', code: 'SWE-P8A', departmentId: deptA._id, level: 2 });
    const shiftA = await Shift.create({
      name: 'Morning Shift',
      code: 'MORN-P8A',
      startTime: '08:00',
      endTime: '17:00',
      isDefault: false,
    });
    await Shift.create({
      name: 'Default Shift',
      code: 'DEF-P8A',
      startTime: '09:00',
      endTime: '18:00',
      isDefault: true,
    });

    const empDocs = await Employee.insertMany(
      Array.from({ length: 30 }, (_, idx) => ({
        employeeId: `P8A-${String(idx + 1).padStart(4, '0')}`,
        firstName: idx === 0 ? 'AdminP8' : `Worker${idx}`,
        lastName: 'Sharma',
        email: idx === 0 ? 'admin.p8a@prvision.test' : `worker${idx}.p8a@prvision.test`,
        branchId: branchA._id,
        departmentId: deptA._id,
        designationId: desigA._id,
        shiftId: shiftA._id,
        joiningDate: new Date(2025, 0, 15, 12),
        employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
        address: { street: 'Outer Ring Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560103', country: 'India' },
        emergencyContact: { name: 'Parent', relationship: 'Parent', phone: '9999999999' },
        bankDetails: {
          accountHolderName: 'Confidential Name',
          accountNumber: '123456789012',
          bankName: 'HDFC Bank',
          ifscCode: 'HDFC0000123',
          branch: 'Bellandur',
        },
        education: [{ degree: 'B.Tech', institution: 'NIT', passingYear: 2020, gradeOrPercentage: '9.0' }],
        previousEmployment: [{ companyName: 'OldCorp', designation: 'Jr Eng' }],
        exitInterviewNotes: 'Internal secret note',
      }))
    );

    const adminUser = await User.create({
      name: 'Admin P8A',
      email: 'admin.p8a@prvision.test',
      password: 'Password@123',
      role: ROLES.ADMIN,
      employeeId: empDocs[0]._id,
      branchId: branchA._id,
      isActive: true,
    });
    const stdUser = await User.create({
      name: 'Worker 1',
      email: 'worker1.p8a@prvision.test',
      password: 'Password@123',
      role: ROLES.EMPLOYEE,
      employeeId: empDocs[1]._id,
      branchId: branchA._id,
      isActive: true,
    });
    await Employee.updateOne({ _id: empDocs[0]._id }, { $set: { userId: adminUser._id } });
    await Employee.updateOne({ _id: empDocs[1]._id }, { $set: { userId: stdUser._id } });

    await Announcement.insertMany([
      {
        title: 'Branch A Notice',
        message: 'Visible to HQ-P8A',
        isActive: true,
        targetBranchId: branchA._id,
        targetDepartmentId: deptA._id,
        publishedBy: adminUser._id,
      },
      {
        title: 'Branch B Restricted Notice',
        message: 'Not visible to HQ-P8A',
        isActive: true,
        targetBranchId: branchB._id,
        publishedBy: adminUser._id,
      },
    ]);

    const payRun = await PayrollRun.create({ month: 10, year: 2026, status: PAYROLL_STATUS.PAID, isLocked: true });
    const payslip = await Payslip.create({
      payrollRunId: payRun._id,
      employeeId: empDocs[1]._id,
      month: 10,
      year: 2026,
      payslipNumber: 'PS-P8A-0001',
      basicSalary: 40000,
      grossSalary: 60000,
      totalDeductions: 4000,
      netSalary: 56000,
      workingDays: 22,
      presentDays: 22,
      lopDays: 0,
      paymentStatus: 'Paid',
    });
    payslipId = payslip._id.toString();

    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
    const safeName = `p8a_doc_${Date.now()}.pdf`;
    uploadedFilePath = path.join(UPLOAD_ROOT, safeName);
    fs.writeFileSync(uploadedFilePath, pdfBytes);

    const doc = await Document.create({
      employeeId: empDocs[1]._id,
      title: 'Offer Letter P8A',
      category: 'Offer Letter',
      fileName: safeName,
      fileUrl: '/api/v1/documents/placeholder/download',
      fileSize: pdfBytes.length,
      mimeType: 'application/pdf',
      uploadedBy: adminUser._id,
    });
    docId = doc._id.toString();

    adminToken = await loginTab('admin.p8a@prvision.test', 'tab-adm-p8a');
    empToken = await loginTab('worker1.p8a@prvision.test', 'tab-emp-p8a');
  });

  afterAll(() => {
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
  });

  it('projects only safe identity/scope fields in authenticate() while stripping bankDetails, education & refreshTokenHash and preserving RBAC scope', async () => {
    const meRes = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Tab-Id', 'tab-emp-p8a');

    expect(meRes.status).toBe(200);
    const { user, employee, session } = meRes.body.data;

    expect(user.password).toBeUndefined();
    expect(user.refreshToken).toBeUndefined();
    expect(session.refreshTokenHash).toBeUndefined();
    expect(session.sessionId).toBeTruthy();

    // Essential operational/scope fields kept
    expect(employee._id).toBeTruthy();
    expect(employee.employeeId).toBe('P8A-0002');
    expect(employee.branchId.toString()).toBe(branchA._id.toString());
    expect(employee.departmentId.toString()).toBe(deptA._id.toString());
    expect(employee.shiftId).toBeTruthy();

    // Heavy/private subdocuments omitted from middleware auth context
    expect(employee.bankDetails).toBeUndefined();
    expect(employee.education).toBeUndefined();
    expect(employee.previousEmployment).toBeUndefined();
    expect(employee.address).toBeUndefined();
    expect(employee.emergencyContact).toBeUndefined();
    expect(employee.exitInterviewNotes).toBeUndefined();

    // Verify branch/dept announcement visibility & shift isolation still rely accurately on req.employee
    const [annRes, shiftRes] = await Promise.all([
      api.get('/api/v1/announcements').set('Authorization', `Bearer ${empToken}`).set('X-Tab-Id', 'tab-emp-p8a'),
      api.get('/api/v1/shifts').set('Authorization', `Bearer ${empToken}`).set('X-Tab-Id', 'tab-emp-p8a'),
    ]);

    expect(annRes.status).toBe(200);
    expect(annRes.body.data.announcements.map((a) => a.title)).toEqual(['Branch A Notice']);

    expect(shiftRes.status).toBe(200);
    expect(shiftRes.body.data.shifts).toHaveLength(1);
    expect(shiftRes.body.data.shifts[0].code).toBe('MORN-P8A');
  });

  it('compresses large JSON and CSV responses with gzip while bypassing small payloads, PDFs, static downloads, and x-no-compression', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    try {
      const fetchRaw = (urlPath, headers = {}) =>
        new Promise((resolve, reject) => {
          const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'GET', headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
          });
          req.on('error', reject);
          req.end();
        });

      // 1. Large JSON (>1 KB) -> gzipped via Express wire encoding & verifies exact gunzipped JSON
      const empWire = await fetchRaw('/api/v1/employees?limit=50', {
        Authorization: `Bearer ${adminToken}`,
        'X-Tab-Id': 'tab-adm-p8a',
        'Accept-Encoding': 'gzip',
      });
      expect(empWire.status).toBe(200);
      expect(empWire.headers['content-encoding']).toBe('gzip');
      expect(empWire.headers.vary).toMatch(/Accept-Encoding/i);
      const decompressedEmp = JSON.parse(zlib.gunzipSync(empWire.buf).toString('utf8'));
      expect(decompressedEmp.data.employees).toHaveLength(30);
      expect(empWire.buf.length).toBeLessThan(Buffer.byteLength(JSON.stringify(decompressedEmp), 'utf8') * 0.4);

      // 2. Large CSV export (>= 1 KB) -> gzipped safely & gunzips to exact CSV text
      const csvWire = await fetchRaw('/api/v1/reports/employees?format=csv', {
        Authorization: `Bearer ${adminToken}`,
        'X-Tab-Id': 'tab-adm-p8a',
        'Accept-Encoding': 'gzip',
      });
      expect(csvWire.status).toBe(200);
      expect(csvWire.headers['content-encoding']).toBe('gzip');
      const csvText = zlib.gunzipSync(csvWire.buf).toString('utf8');
      expect(csvText).toContain('P8A-0002');

      // 3. x-no-compression bypass & Accept-Encoding: identity bypass
      const noCompRes = await fetchRaw('/api/v1/employees?limit=50', {
        Authorization: `Bearer ${adminToken}`,
        'X-Tab-Id': 'tab-adm-p8a',
        'Accept-Encoding': 'gzip',
        'x-no-compression': '1',
      });
      expect(noCompRes.status).toBe(200);
      expect(noCompRes.headers['content-encoding']).toBeUndefined();

      const identityRes = await fetchRaw('/api/v1/employees?limit=50', {
        Authorization: `Bearer ${adminToken}`,
        'X-Tab-Id': 'tab-adm-p8a',
        'Accept-Encoding': 'identity',
      });
      expect(identityRes.status).toBe(200);
      expect(identityRes.headers['content-encoding']).toBeUndefined();

      // 4. Small JSON (<1024 bytes) -> skips compression
      const healthRes = await fetchRaw('/api/v1/health', { 'Accept-Encoding': 'gzip' });
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers['content-encoding']).toBeUndefined();
      expect(healthRes.buf.length).toBeLessThan(1024);

      // 5. Payslip PDF binary -> NOT gzipped & exact %PDF- binary intact
      const pdfRes = await fetchRaw(`/api/v1/payroll/payslips/${payslipId}/pdf`, {
        Authorization: `Bearer ${empToken}`,
        'X-Tab-Id': 'tab-emp-p8a',
        'Accept-Encoding': 'gzip',
      });
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toContain('application/pdf');
      expect(pdfRes.headers['content-encoding']).toBeUndefined();
      expect(pdfRes.buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');

      // 6. Private static file download via res.download -> untouched Accept-Ranges & exact bytes
      fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
      fs.writeFileSync(uploadedFilePath, pdfBytes);
      const docDlRes = await fetchRaw(`/api/v1/documents/${docId}/download`, {
        Authorization: `Bearer ${empToken}`,
        'X-Tab-Id': 'tab-emp-p8a',
        'Accept-Encoding': 'gzip',
      });
      expect(docDlRes.status).toBe(200);
      expect(docDlRes.headers['content-encoding']).toBeUndefined();
      expect(docDlRes.buf.equals(pdfBytes)).toBe(true);
    } finally {
      server.close();
    }
  });
});
