import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import http from 'http';

async function main() {
  await connectDB({ exitOnError: true });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5008, resolve));

  const loginRes = await fetch('http://localhost:5008/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@prvision.com', password: 'Password@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.tokens?.accessToken;

  const endpoints = [
    { name: 'Dashboard Stats', url: '/api/v1/dashboard/stats' },
    { name: 'Employees', url: '/api/v1/employees?limit=50' },
    { name: 'Departments', url: '/api/v1/departments' },
    { name: 'Designations', url: '/api/v1/designations' },
    { name: 'Attendance', url: '/api/v1/attendance?limit=50' },
    { name: 'Leave Requests', url: '/api/v1/leaves/requests?limit=50' },
    { name: 'Payroll Runs', url: '/api/v1/payroll/runs?limit=50' },
    { name: 'Recruitment Jobs', url: '/api/v1/recruitment/jobs?limit=50' },
    { name: 'Reports (Employees)', url: '/api/v1/reports/employees?limit=50' },
  ];

  console.log('| Endpoint | Run 1 (Server/Client) | Run 2 (Server/Client) | Run 3 (Server/Client) | Server Avg | Client Avg |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: |');

  for (const ep of endpoints) {
    const srvRuns = [];
    const cltRuns = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const res = await fetch('http://localhost:5008' + ep.url, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const t1 = performance.now();
      const srvTime = parseFloat(res.headers.get('x-response-time')) || 0;
      const cltTime = t1 - t0;
      srvRuns.push(srvTime);
      cltRuns.push(cltTime);
    }
    const srvAvg = (srvRuns.reduce((a, b) => a + b, 0) / srvRuns.length).toFixed(1);
    const cltAvg = (cltRuns.reduce((a, b) => a + b, 0) / cltRuns.length).toFixed(1);
    console.log(
      `| ${ep.name} | ${srvRuns[0].toFixed(1)}ms / ${cltRuns[0].toFixed(1)}ms | ${srvRuns[1].toFixed(1)}ms / ${cltRuns[1].toFixed(1)}ms | ${srvRuns[2].toFixed(1)}ms / ${cltRuns[2].toFixed(1)}ms | ${srvAvg}ms | ${cltAvg}ms |`
    );
  }

  server.close();
  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

