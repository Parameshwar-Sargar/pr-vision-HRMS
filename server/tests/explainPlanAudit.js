import { connectDB, disconnectDB } from '../src/config/db.js';
import Employee from '../src/models/Employee.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Branch from '../src/models/Branch.js';
import Attendance from '../src/models/Attendance.js';
import LeaveRequest from '../src/models/LeaveRequest.js';
import PayrollRun from '../src/models/PayrollRun.js';
import Payslip from '../src/models/Payslip.js';
import JobOpening from '../src/models/JobOpening.js';
import Candidate from '../src/models/Candidate.js';
import Announcement from '../src/models/Announcement.js';

async function main() {
  await connectDB({ exitOnError: true });

  const queries = [
    { name: 'Employees List', p: Employee.find({ isDeleted: false }).sort({ createdAt: -1 }) },
    { name: 'Employees Filtered', p: Employee.find({ isDeleted: false, employmentStatus: 'Active' }).sort({ createdAt: -1 }) },
    { name: 'Departments List', p: Department.find({ isDeleted: false }).sort({ name: 1 }) },
    { name: 'Designations List', p: Designation.find({ isDeleted: false }).sort({ level: 1, title: 1 }) },
    { name: 'Branches List', p: Branch.find({ isDeleted: false }).sort({ isHeadquarters: -1, name: 1 }) },
    { name: 'Attendance List', p: Attendance.find({}).sort({ date: -1 }) },
    { name: 'Leave Requests', p: LeaveRequest.find({}).sort({ createdAt: -1 }) },
    { name: 'Payroll Runs', p: PayrollRun.find({}).sort({ year: -1, month: -1 }) },
    { name: 'Payslips List', p: Payslip.find({}).sort({ year: -1, month: -1 }) },
    { name: 'Job Openings', p: JobOpening.find({}).sort({ createdAt: -1 }) },
    { name: 'Candidates List', p: Candidate.find({}).sort({ appliedDate: -1 }) },
    { name: 'Announcements', p: Announcement.find({}).sort({ isPinned: -1, createdAt: -1 }) },
  ];

  console.log('| Query | Stage | Index Used | In-Memory Sort? | Docs Examined | Docs Returned |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: |');

  for (const q of queries) {
    const exp = await q.p.explain('executionStats');
    const stage = exp.queryPlanner?.winningPlan?.stage || 'UNKNOWN';
    const inputStage = exp.queryPlanner?.winningPlan?.inputStage?.stage || '';
    const indexName =
      exp.queryPlanner?.winningPlan?.inputStage?.indexName ||
      exp.queryPlanner?.winningPlan?.inputStage?.inputStage?.indexName ||
      exp.queryPlanner?.winningPlan?.inputStage?.inputStage?.inputStage?.indexName ||
      'NONE';
    const hasSort =
      stage === 'SORT' ||
      inputStage === 'SORT' ||
      (exp.executionStats?.totalDataLoadedInBytesForSort > 0);
    const docsExamined = exp.executionStats?.totalDocsExamined ?? 'N/A';
    const docsReturned = exp.executionStats?.nReturned ?? 'N/A';
    const displayStage =
      stage === 'SORT' ? `SORT -> ${inputStage}` : inputStage ? `${inputStage} -> ${stage}` : stage;

    console.log(
      `| ${q.name} | ${displayStage} | ${indexName} | ${hasSort ? 'YES' : 'NO'} | ${docsExamined} | ${docsReturned} |`
    );
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

