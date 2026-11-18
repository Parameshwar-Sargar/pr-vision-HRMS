import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Readable, Transform } from 'stream';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import http from 'http';
import path from 'path';
import zlib from 'zlib';
import './setup.js';
import { api } from './setup.js';
import app from '../src/app.js';
import { createCompressionMiddleware } from '../src/middleware/compressionMiddleware.js';
import { LIFECYCLE_STAGES, PAYROLL_STATUS, ROLES } from '../src/config/constants.js';
import { UPLOAD_ROOT } from '../src/utils/securityUtils.js';

import CompanySettings from '../src/models/CompanySettings.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Shift from '../src/models/Shift.js';
import Employee from '../src/models/Employee.js';
import User from '../src/models/User.js';
import Document from '../src/models/Document.js';
import PayrollRun from '../src/models/PayrollRun.js';
import Payslip from '../src/models/Payslip.js';

const requestWire = (port, method, urlPath, headers = {}, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout after ${timeoutMs}ms on ${method} ${urlPath}`)));
    req.on('error', reject);
    req.end();
  });

const buildHighEntropyBuffer = (totalBytes, chunkSize = 8192) => {
  // Repeating semi-compressible pseudo-random ASCII blocks (yields ~55-75% gzip ratio so compressed output is also huge!)
  const parts = [];
  let generated = 0;
  let state = 0x12345678;
  while (generated < totalBytes) {
    const len = Math.min(chunkSize, totalBytes - generated);
    const buf = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i += 1) {
      // Mix structured prefix with PRNG nibble to stay text-valid yet create multi-hundred-KB compressed stream
      if (i % 64 === 0) {
        buf[i] = 10; // '\n'
      } else if (i % 64 < 16) {
        buf[i] = 65 + (i % 8); // structured ASCII pattern
      } else {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        buf[i] = 48 + (state % 42);
      }
    }
    parts.push(buf);
    generated += len;
  }
  return Buffer.concat(parts);
};

describe('Phase 8 Batch A.2 — Compression Middleware Streaming Backpressure, Errors & Vary Regression Tests', () => {
  let edgeServer;
  let edgePort;
  let hrmsServer;
  let hrmsPort;
  let adminToken;
  let empToken;
  let payslipId;
  let docId;
  let uploadedFilePath;
  const pdfSample = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

  let activeSlowControl = { aborted: false, closedByRes: false };
  let upstreamWriteResults = [];

  beforeAll(async () => {
    // 1. Standalone Express app specifically testing streaming, slow consumers, disconnects, errors, and status codes
    const edgeApp = express();
    edgeApp.use('/cors-enabled', cors({ origin: 'http://localhost:5173' }));
    edgeApp.use(createCompressionMiddleware({ threshold: 1024 }));

    edgeApp.get('/stream-512kb', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      let count = 0;
      const chunk = Buffer.from('S'.repeat(8192));
      const src = new Readable({
        read() {
          if (count >= 64) {
            this.push(null);
            return;
          }
          count += 1;
          this.push(Buffer.from(chunk));
        },
      });
      src.pipe(res);
    });

    edgeApp.get('/stream-1536kb', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      const fullPayload = buildHighEntropyBuffer(1536 * 1024, 16384);
      let offset = 0;
      const src = new Readable({
        read() {
          if (offset >= fullPayload.length) {
            this.push(null);
            return;
          }
          const slice = fullPayload.subarray(offset, offset + 16384);
          offset += slice.length;
          this.push(slice);
        },
      });
      src.pipe(res);
    });

    edgeApp.get('/stream-mixed-chunks', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      const sizes = [17, 0, 512, 1024, 8192, 65536, 0, 2048];
      const retValues = [];
      let chunkIdx = 0;
      const pushNext = () => {
        while (chunkIdx < sizes.length) {
          const sz = sizes[chunkIdx++];
          const buf = Buffer.alloc(sz, 65 + (chunkIdx % 26));
          const ok = res.write(buf);
          retValues.push(typeof ok === 'boolean');
          if (!ok) {
            res.once('drain', pushNext);
            return;
          }
        }
        const ended = res.end(Buffer.from('__TAIL__'));
        if (ended !== res) {
          throw new Error('res.end did not return res');
        }
      };
      res.setHeader('X-Write-Returns-Bool', 'true');
      pushNext();
    });

    edgeApp.get('/stream-slow-consumer', (req, res) => {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      upstreamWriteResults = [];
      // Generate 2 MB high-entropy payload where compressed stream (~1.4 MB) exceeds TCP buffers and triggers socket backpressure
      const payload = buildHighEntropyBuffer(2 * 1024 * 1024, 16384);
      let offset = 0;
      const pump = () => {
        while (offset < payload.length) {
          const slice = payload.subarray(offset, offset + 16384);
          offset += slice.length;
          const ok = res.write(slice);
          upstreamWriteResults.push(ok);
          if (!ok) {
            res.once('drain', pump);
            return;
          }
        }
        res.end();
      };
      pump();
    });

    edgeApp.get('/stream-disconnect', (req, res) => {
      activeSlowControl = { aborted: false, closedByRes: false };
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      let ticks = 0;
      const iv = setInterval(() => {
        if (activeSlowControl.aborted || res.destroyed) {
          clearInterval(iv);
          return;
        }
        ticks += 1;
        res.write(Buffer.from(`DISCONNECT-CHUNK-${ticks}-${'Z'.repeat(4096)}\n`));
        if (ticks >= 200) {
          clearInterval(iv);
          res.end();
        }
      }, 15);
      res.once('close', () => {
        activeSlowControl.aborted = true;
        activeSlowControl.closedByRes = !res.writableFinished;
        clearInterval(iv);
      });
    });

    edgeApp.get('/stream-upstream-error', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      const src = new Readable({
        read() {
          this.push(Buffer.from('First chunk\n'.repeat(200)));
          process.nextTick(() => this.destroy(new Error('Upstream source read failure')));
        },
      });
      src.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Upstream failure handled cleanly' });
        } else {
          res.destroy();
        }
      });
      src.pipe(res);
    });
    edgeApp.get('/stream-upstream-error-abort', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      const src = new Readable({
        read() {
          this.push(Buffer.from('Partial\n'.repeat(200)));
          process.nextTick(() => this.destroy(new Error('Mid-stream abort')));
        },
      });
      src.on('error', () => {
        src.unpipe(res);
        res.destroy();
      });
      src.pipe(res);
    });

    edgeApp.get('/vary-json', (req, res) => {
      res.json({ success: true, payload: 'V'.repeat(2048) });
    });
    edgeApp.get('/cors-enabled/vary-json', (req, res) => {
      res.json({ success: true, payload: 'C'.repeat(2048) });
    });
    edgeApp.get('/status-204', (req, res) => res.status(204).end());
    edgeApp.get('/status-304', (req, res) => res.status(304).end());

    edgeServer = edgeApp.listen(0, '127.0.0.1');
    await new Promise((resolve) => edgeServer.once('listening', resolve));
    edgePort = edgeServer.address().port;

    // 2. Real HRMS Express app setup for JSON, CSV, PDF, download, CORS Vary, and ETag 304 tests
    await CompanySettings.create({ companyName: 'PR VISION INNOVATIONS', contactEmail: 'contact@prvision.com' });
    const branch = await Branch.create({
      name: 'Bengaluru HQ',
      code: 'HQ-CM2',
      isHeadquarters: true,
      address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
    });
    const dept = await Department.create({ name: 'Platform', code: 'PLT-CM2' });
    const desig = await Designation.create({ title: 'SRE', code: 'SRE-CM2', departmentId: dept._id, level: 2 });
    await Shift.create({ name: 'Day Shift', code: 'DAY-CM2', startTime: '09:00', endTime: '18:00', isDefault: true });

    const emps = await Employee.insertMany(
      Array.from({ length: 25 }, (_, i) => ({
        employeeId: `CM2-${String(i + 1).padStart(4, '0')}`,
        firstName: `CompEmp${i + 1}`,
        lastName: 'Tester',
        email: i === 0 ? 'admin.cm2@prvision.test' : i === 1 ? 'emp.cm2@prvision.test' : `cm2_${i}@prvision.test`,
        branchId: branch._id,
        departmentId: dept._id,
        designationId: desig._id,
        joiningDate: new Date(2025, 0, 10, 12),
        employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      }))
    );

    await User.create({
      name: 'Admin CM2',
      email: 'admin.cm2@prvision.test',
      password: 'Password@123',
      role: ROLES.ADMIN,
      employeeId: emps[0]._id,
      branchId: branch._id,
      isActive: true,
    });
    await User.create({
      name: 'Emp CM2',
      email: 'emp.cm2@prvision.test',
      password: 'Password@123',
      role: ROLES.EMPLOYEE,
      employeeId: emps[1]._id,
      branchId: branch._id,
      isActive: true,
    });

    const payRun = await PayrollRun.create({ month: 10, year: 2026, status: PAYROLL_STATUS.PAID, isLocked: true });
    const payslip = await Payslip.create({
      payrollRunId: payRun._id,
      employeeId: emps[1]._id,
      month: 10,
      year: 2026,
      payslipNumber: 'PS-CM2-0001',
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
    const fileName = `cm2_file_${Date.now()}.pdf`;
    uploadedFilePath = path.join(UPLOAD_ROOT, fileName);
    fs.writeFileSync(uploadedFilePath, pdfSample);
    const doc = await Document.create({
      employeeId: emps[1]._id,
      title: 'Policy PDF CM2',
      category: 'Other',
      fileName,
      fileUrl: '/api/v1/documents/placeholder/download',
      fileSize: pdfSample.length,
      mimeType: 'application/pdf',
      uploadedBy: emps[0]._id,
    });
    docId = doc._id.toString();

    const admLogin = await api.post('/api/v1/auth/login').set('X-Tab-Id', 'tab-cm2-a').send({ email: 'admin.cm2@prvision.test', password: 'Password@123' });
    const empLogin = await api.post('/api/v1/auth/login').set('X-Tab-Id', 'tab-cm2-e').send({ email: 'emp.cm2@prvision.test', password: 'Password@123' });
    adminToken = admLogin.body.data.tokens.accessToken;
    empToken = empLogin.body.data.tokens.accessToken;

    hrmsServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => hrmsServer.once('listening', resolve));
    hrmsPort = hrmsServer.address().port;
  });

  afterAll(() => {
    vi.restoreAllMocks();
    if (edgeServer) edgeServer.close();
    if (hrmsServer) hrmsServer.close();
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath);
  });

  it('1. Compresses 512 KB (64 x 8 KB) piped stream cleanly with exact byte-for-byte identity', async () => {
    const res = await requestWire(edgePort, 'GET', '/stream-512kb', { 'Accept-Encoding': 'gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers.vary).toMatch(/Accept-Encoding/i);

    const decoded = zlib.gunzipSync(res.buf);
    const expected = Buffer.alloc(64 * 8192, 'S');
    expect(decoded.length).toBe(expected.length);
    expect(decoded.equals(expected)).toBe(true);
    expect(res.buf.length).toBeLessThan(expected.length * 0.1);
  });

  it('2. Compresses stream > 1 MB (1.5 MB varied content) with exact byte-for-byte identity', async () => {
    const res = await requestWire(edgePort, 'GET', '/stream-1536kb', { 'Accept-Encoding': 'gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');

    const decoded = zlib.gunzipSync(res.buf);
    const expected = buildHighEntropyBuffer(1536 * 1024, 16384);
    expect(decoded.length).toBe(1536 * 1024);
    expect(decoded.equals(expected)).toBe(true);
    expect(res.buf.length).toBeLessThan(expected.length);
  });

  it('3. Handles multiple chunk sizes including empty chunks and preserves res.write/res.end contracts', async () => {
    const res = await requestWire(edgePort, 'GET', '/stream-mixed-chunks', { 'Accept-Encoding': 'gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');

    const sizes = [17, 0, 512, 1024, 8192, 65536, 0, 2048];
    const expected = Buffer.concat([
      ...sizes.map((sz, i) => Buffer.alloc(sz, 65 + ((i + 1) % 26))),
      Buffer.from('__TAIL__'),
    ]);
    const decoded = zlib.gunzipSync(res.buf);
    expect(decoded.equals(expected)).toBe(true);
  });

  it('4. Applies downstream backpressure under slow consumer on 2 MB stream and preserves byte-for-byte integrity', async () => {
    const { status, headers, decoded } = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = http.request(
        { host: '127.0.0.1', port: edgePort, path: '/stream-slow-consumer', method: 'GET', headers: { 'Accept-Encoding': 'gzip' } },
        (res) => {
          res.on('data', (chunk) => {
            chunks.push(chunk);
            // Throttle downstream socket consumption cleanly so server TCP buffer backpressures
            res.pause();
            setTimeout(() => {
              if (!res.destroyed) res.resume();
            }, 5);
          });
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks);
              resolve({ status: res.statusCode, headers: res.headers, decoded: zlib.gunzipSync(raw) });
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.setTimeout(12000, () => req.destroy(new Error('Slow consumer stream exceeded safety timeout')));
      req.on('error', reject);
      req.end();
    });

    expect(status).toBe(200);
    expect(headers['content-encoding']).toBe('gzip');
    expect(upstreamWriteResults.length).toBe(128);
    expect(upstreamWriteResults.some((ok) => ok === false)).toBe(true);

    const expected = buildHighEntropyBuffer(2 * 1024 * 1024, 16384);
    expect(decoded.length).toBe(expected.length);
    expect(decoded.equals(expected)).toBe(true);
  });

  it('5. Cleans up gzip & upstream streams cleanly on premature client disconnect without crashing server', async () => {
    await new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port: edgePort, path: '/stream-disconnect', method: 'GET', headers: { 'Accept-Encoding': 'gzip' } },
        (res) => {
          res.once('data', () => {
            req.destroy();
            resolve();
          });
        }
      );
      req.on('error', () => resolve());
      req.end();
    });

    // Give TCP socket close event a brief tick to propagate on loopback
    await new Promise((r) => setTimeout(r, 60));
    expect(activeSlowControl.aborted).toBe(true);
    expect(activeSlowControl.closedByRes).toBe(true);

    // Server remains healthy for subsequent compressed requests
    const followUp = await requestWire(edgePort, 'GET', '/vary-json', { 'Accept-Encoding': 'gzip' });
    expect(followUp.status).toBe(200);
    expect(JSON.parse(zlib.gunzipSync(followUp.buf).toString('utf8')).success).toBe(true);
  });

  it('6. Propagates stream errors safely without unhandled process crash (both transform & upstream errors)', async () => {
    // 6a. Upstream Readable stream error handled cleanly without Parse Error / Content-Length mismatch
    const upErrRes = await requestWire(edgePort, 'GET', '/stream-upstream-error', { 'Accept-Encoding': 'gzip' });
    expect(upErrRes.status).toBe(500);
    expect(upErrRes.headers['content-encoding']).toBe('gzip');
    const decodedUpText = zlib.gunzipSync(upErrRes.buf).toString('utf8');
    expect(decodedUpText).toContain('Upstream failure handled cleanly');

    // Mid-stream abort via res.destroy() tears down pipeline cleanly without crashing server
    await expect(
      requestWire(edgePort, 'GET', '/stream-upstream-error-abort', { 'Accept-Encoding': 'gzip' })
    ).rejects.toThrow();

    // 6b. Forced zlib transform stream error mid-pipeline returns clean 500 JSON without crash
    const spy = vi.spyOn(zlib, 'createGzip').mockImplementationOnce(() => {
      return new Transform({
        transform(_chunk, _enc, cb) {
          cb(new Error('Simulated gzip transform failure'));
        },
      });
    });

    const gzErrRes = await requestWire(edgePort, 'GET', '/stream-512kb', { 'Accept-Encoding': 'gzip' });
    spy.mockRestore();
    expect(gzErrRes.status).toBe(500);
    expect(gzErrRes.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(gzErrRes.buf.toString('utf8')).message).toBe('Compression stream failed.');

    // Verify normal createGzip works immediately afterward
    const healthyRes = await requestWire(edgePort, 'GET', '/stream-512kb', { 'Accept-Encoding': 'gzip' });
    expect(healthyRes.status).toBe(200);
    expect(zlib.gunzipSync(healthyRes.buf).length).toBe(64 * 8192);
  });

  it('7. Preserves Vary: Accept-Encoding cleanly under Accept-Encoding: gzip;q=0 alongside existing Vary headers without duplicates', async () => {
    const plainVary = await requestWire(edgePort, 'GET', '/vary-json', { 'Accept-Encoding': 'gzip;q=0' });
    expect(plainVary.status).toBe(200);
    expect(plainVary.headers['content-encoding']).toBeUndefined();
    expect(plainVary.headers.vary).toBe('Accept-Encoding');
    expect(JSON.parse(plainVary.buf.toString('utf8')).success).toBe(true);

    const corsVary = await requestWire(edgePort, 'GET', '/cors-enabled/vary-json', {
      Origin: 'http://localhost:5173',
      'Accept-Encoding': 'gzip;q=0',
    });
    expect(corsVary.status).toBe(200);
    expect(corsVary.headers['content-encoding']).toBeUndefined();
    const varyTokens = String(corsVary.headers.vary || '')
      .split(',')
      .map((s) => s.trim().toLowerCase());
    expect(varyTokens).toContain('origin');
    expect(varyTokens.filter((v) => v === 'accept-encoding')).toHaveLength(1);

    // Verify real HRMS app.js with CORS also returns Vary: Origin, Accept-Encoding on gzip;q=0
    const hrmsQ0 = await requestWire(hrmsPort, 'GET', '/api/v1/employees?limit=25', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tab-Id': 'tab-cm2-a',
      Origin: 'http://localhost:5173',
      'Accept-Encoding': 'gzip;q=0',
    });
    expect(hrmsQ0.status).toBe(200);
    expect(hrmsQ0.headers['content-encoding']).toBeUndefined();
    const hrmsTokens = String(hrmsQ0.headers.vary || '')
      .split(',')
      .map((s) => s.trim().toLowerCase());
    expect(hrmsTokens).toContain('origin');
    expect(hrmsTokens.filter((v) => v === 'accept-encoding')).toHaveLength(1);
  });

  it('8 & 9. Compresses real HRMS JSON & CSV exports >= 1 KB cleanly with valid gzip headers and intact decompressed output', async () => {
    const empRes = await requestWire(hrmsPort, 'GET', '/api/v1/employees?limit=25', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tab-Id': 'tab-cm2-a',
      'Accept-Encoding': 'gzip',
    });
    expect(empRes.status).toBe(200);
    expect(empRes.headers['content-encoding']).toBe('gzip');
    expect(Number(empRes.headers['content-length'])).toBe(empRes.buf.length);
    const decodedEmp = JSON.parse(zlib.gunzipSync(empRes.buf).toString('utf8'));
    expect(decodedEmp.success).toBe(true);
    expect(decodedEmp.data.employees).toHaveLength(25);

    const csvRes = await requestWire(hrmsPort, 'GET', '/api/v1/reports/employees?format=csv', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tab-Id': 'tab-cm2-a',
      'Accept-Encoding': 'gzip',
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.headers['content-encoding']).toBe('gzip');
    expect(csvRes.headers.vary).toMatch(/Accept-Encoding/i);
    const csvText = zlib.gunzipSync(csvRes.buf).toString('utf8');
    expect(csvText).toContain('Employee ID,First Name');
    expect(csvText).toContain('CM2-0001');
  });

  it('10 & 11. Bypasses PDFs, static downloads, HEAD, 204, and 304 (both explicit and conditional ETag) cleanly', async () => {
    // PDF bypass
    const pdfRes = await requestWire(hrmsPort, 'GET', `/api/v1/payroll/payslips/${payslipId}/pdf`, {
      Authorization: `Bearer ${empToken}`,
      'X-Tab-Id': 'tab-cm2-e',
      'Accept-Encoding': 'gzip',
    });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(pdfRes.headers['content-encoding']).toBeUndefined();
    expect(Number(pdfRes.headers['content-length'])).toBe(pdfRes.buf.length);
    expect(pdfRes.buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // Static download bypass (ensure file exists in case a parallel worker swept UPLOAD_ROOT)
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
    fs.writeFileSync(uploadedFilePath, pdfSample);
    const docRes = await requestWire(hrmsPort, 'GET', `/api/v1/documents/${docId}/download`, {
      Authorization: `Bearer ${empToken}`,
      'X-Tab-Id': 'tab-cm2-e',
      'Accept-Encoding': 'gzip',
    });
    expect(docRes.status).toBe(200);
    expect(docRes.headers['content-encoding']).toBeUndefined();
    expect(docRes.buf.equals(pdfSample)).toBe(true);

    // HEAD bypass
    const headRes = await requestWire(hrmsPort, 'HEAD', '/api/v1/employees?limit=25', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tab-Id': 'tab-cm2-a',
      'Accept-Encoding': 'gzip',
    });
    expect(headRes.status).toBe(200);
    expect(headRes.headers['content-encoding']).toBeUndefined();
    expect(headRes.buf.length).toBe(0);

    // 204 & explicit 304
    const r204 = await requestWire(edgePort, 'GET', '/status-204', { 'Accept-Encoding': 'gzip' });
    expect(r204.status).toBe(204);
    expect(r204.headers['content-encoding']).toBeUndefined();
    expect(r204.buf.length).toBe(0);

    const r304 = await requestWire(edgePort, 'GET', '/status-304', { 'Accept-Encoding': 'gzip' });
    expect(r304.status).toBe(304);
    expect(r304.headers['content-encoding']).toBeUndefined();
    expect(r304.buf.length).toBe(0);

    // Real HRMS Express ETag -> If-None-Match conditional 304
    const firstGet = await requestWire(hrmsPort, 'GET', '/api/v1/employees?limit=25', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tab-Id': 'tab-cm2-a',
      'Accept-Encoding': 'gzip',
    });
    expect(firstGet.headers.etag).toBeTruthy();

    const cond304 = await requestWire(hrmsPort, 'GET', '/api/v1/employees?limit=25', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tab-Id': 'tab-cm2-a',
      'Accept-Encoding': 'gzip',
      'If-None-Match': firstGet.headers.etag,
    });
    expect(cond304.status).toBe(304);
    expect(cond304.headers['content-encoding']).toBeUndefined();
    expect(cond304.buf.length).toBe(0);
  });
});
