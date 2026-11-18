/**
 * Phase 8 Batch B — Reversible MongoDB Index Migration Plan
 *
 * SAFETY POLICY:
 * - Non-destructive additive index plan with explicit reversible rollback (`down`).
 * - Defaults strictly to `--dry-run` (prints planned operations without modifying any DB).
 * - Never drops pre-existing Atlas/unique/system indexes automatically; redundant single-field
 *   prefix cleanup candidates are documented separately for manual DBA review only.
 * - Never executes automatically at server startup (`SYNC_INDEXES` remains `false`).
 */

import { pathToFileURL } from 'url';

export const BATCH_B_INDEX_PLAN = [
  // PayrollRuns
  {
    collection: 'payrollruns',
    name: 'year_-1_month_-1',
    key: { year: -1, month: -1 },
    options: { background: true, name: 'year_-1_month_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on latest payroll run & paginated runs list',
    queryPattern: 'PayrollRun.find(query).sort({ year: -1, month: -1 })',
  },
  {
    collection: 'payrollruns',
    name: 'status_1_year_-1_month_-1',
    key: { status: 1, year: -1, month: -1 },
    options: { background: true, name: 'status_1_year_-1_month_-1' },
    purpose: 'Serve status-filtered payroll runs ordered by year/month without in-memory sort',
    queryPattern: 'PayrollRun.find({ status }).sort({ year: -1, month: -1 })',
  },

  // JobOpenings
  {
    collection: 'jobopenings',
    name: 'createdAt_-1',
    key: { createdAt: -1 },
    options: { background: true, name: 'createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on unfiltered job openings listing',
    queryPattern: 'JobOpening.find({}).sort({ createdAt: -1 })',
  },
  {
    collection: 'jobopenings',
    name: 'status_1_createdAt_-1',
    key: { status: 1, createdAt: -1 },
    options: { background: true, name: 'status_1_createdAt_-1' },
    purpose: 'Serve status-filtered job listings & open job count via IXSCAN',
    queryPattern: 'JobOpening.find({ status }).sort({ createdAt: -1 }) / countDocuments({ status })',
  },
  {
    collection: 'jobopenings',
    name: 'departmentId_1_createdAt_-1',
    key: { departmentId: 1, createdAt: -1 },
    options: { background: true, name: 'departmentId_1_createdAt_-1' },
    purpose: 'Serve department-filtered job openings sorted newest-first',
    queryPattern: 'JobOpening.find({ departmentId }).sort({ createdAt: -1 })',
  },

  // Candidates
  {
    collection: 'candidates',
    name: 'appliedDate_-1',
    key: { appliedDate: -1 },
    options: { background: true, name: 'appliedDate_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on unfiltered candidate pipeline listing',
    queryPattern: 'Candidate.find({}).sort({ appliedDate: -1 })',
  },
  {
    collection: 'candidates',
    name: 'status_1_appliedDate_-1',
    key: { status: 1, appliedDate: -1 },
    options: { background: true, name: 'status_1_appliedDate_-1' },
    purpose: 'Serve status/stage-filtered candidate pipeline & dashboard active candidate count',
    queryPattern: 'Candidate.find({ status }).sort({ appliedDate: -1 }) / countDocuments({ status: { $in } })',
  },
  {
    collection: 'candidates',
    name: 'jobOpeningId_1_appliedDate_-1',
    key: { jobOpeningId: 1, appliedDate: -1 },
    options: { background: true, name: 'jobOpeningId_1_appliedDate_-1' },
    purpose: 'Serve job-opening candidate lists sorted newest-first without in-memory sort',
    queryPattern: 'Candidate.find({ jobOpeningId }).sort({ appliedDate: -1 })',
  },
  {
    collection: 'candidates',
    name: 'jobOpeningId_1_status_1_appliedDate_-1',
    key: { jobOpeningId: 1, status: 1, appliedDate: -1 },
    options: { background: true, name: 'jobOpeningId_1_status_1_appliedDate_-1' },
    purpose: 'Serve job-opening & status filtered candidate views sorted by appliedDate',
    queryPattern: 'Candidate.find({ jobOpeningId, [status] }).sort({ appliedDate: -1 })',
  },

  // Announcements
  {
    collection: 'announcements',
    name: 'isActive_1_isPinned_-1_createdAt_-1',
    key: { isActive: 1, isPinned: -1, createdAt: -1 },
    options: { background: true, name: 'isActive_1_isPinned_-1_createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on dashboard & notice board active announcement queries',
    queryPattern: 'Announcement.find({ isActive: true, ... }).sort({ isPinned: -1, createdAt: -1 })',
  },
  {
    collection: 'announcements',
    name: 'isPinned_-1_createdAt_-1',
    key: { isPinned: -1, createdAt: -1 },
    options: { background: true, name: 'isPinned_-1_createdAt_-1' },
    purpose: 'Serve admin includeInactive=true announcement queries sorted pinned-first',
    queryPattern: 'Announcement.find({}).sort({ isPinned: -1, createdAt: -1 })',
  },

  // Documents
  {
    collection: 'documents',
    name: 'createdAt_-1',
    key: { createdAt: -1 },
    options: { background: true, name: 'createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on admin unfiltered document listing',
    queryPattern: 'Document.find({}).sort({ createdAt: -1 })',
  },
  {
    collection: 'documents',
    name: 'employeeId_1_createdAt_-1',
    key: { employeeId: 1, createdAt: -1 },
    options: { background: true, name: 'employeeId_1_createdAt_-1' },
    purpose: 'Serve employee/manager scoped document listings sorted newest-first',
    queryPattern: 'Document.find({ employeeId | $or }).sort({ createdAt: -1 })',
  },
  {
    collection: 'documents',
    name: 'category_1_createdAt_-1',
    key: { category: 1, createdAt: -1 },
    options: { background: true, name: 'category_1_createdAt_-1' },
    purpose: 'Serve category-filtered document listings sorted newest-first',
    queryPattern: 'Document.find({ category }).sort({ createdAt: -1 })',
  },

  // Designations
  {
    collection: 'designations',
    name: 'isDeleted_1_level_1_title_1',
    key: { isDeleted: 1, level: 1, title: 1 },
    options: { background: true, name: 'isDeleted_1_level_1_title_1' },
    purpose: 'Eliminate in-memory SORT on unfiltered designations listing',
    queryPattern: 'Designation.find({ isDeleted: false }).sort({ level: 1, title: 1 })',
  },
  {
    collection: 'designations',
    name: 'isDeleted_1_departmentId_1_level_1_title_1',
    key: { isDeleted: 1, departmentId: 1, level: 1, title: 1 },
    options: { background: true, name: 'isDeleted_1_departmentId_1_level_1_title_1' },
    purpose: 'Serve department-filtered designations ordered by level then title without SORT',
    queryPattern: 'Designation.find({ isDeleted: false, departmentId }).sort({ level: 1, title: 1 })',
  },

  // Branches
  {
    collection: 'branches',
    name: 'isDeleted_1_isHeadquarters_-1_name_1',
    key: { isDeleted: 1, isHeadquarters: -1, name: 1 },
    options: { background: true, name: 'isDeleted_1_isHeadquarters_-1_name_1' },
    purpose: 'Eliminate in-memory SORT on headquarters-first branches directory',
    queryPattern: 'Branch.find({ isDeleted: false }).sort({ isHeadquarters: -1, name: 1 })',
  },

  // PerformanceReviews
  {
    collection: 'performancereviews',
    name: 'createdAt_-1',
    key: { createdAt: -1 },
    options: { background: true, name: 'createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on HR/Admin performance review listing',
    queryPattern: 'PerformanceReview.find({}).sort({ createdAt: -1 })',
  },
  {
    collection: 'performancereviews',
    name: 'employeeId_1_createdAt_-1',
    key: { employeeId: 1, createdAt: -1 },
    options: { background: true, name: 'employeeId_1_createdAt_-1' },
    purpose: 'Serve employee/manager scoped review listings sorted newest-first',
    queryPattern: 'PerformanceReview.find({ employeeId | $in }).sort({ createdAt: -1 })',
  },
  {
    collection: 'performancereviews',
    name: 'status_1_createdAt_-1',
    key: { status: 1, createdAt: -1 },
    options: { background: true, name: 'status_1_createdAt_-1' },
    purpose: 'Serve status-filtered performance reviews sorted newest-first',
    queryPattern: 'PerformanceReview.find({ status }).sort({ createdAt: -1 })',
  },

  // TrainingPrograms
  {
    collection: 'trainingprograms',
    name: 'startDate_1',
    key: { startDate: 1 },
    options: { background: true, name: 'startDate_1' },
    purpose: 'Eliminate COLLSCAN + SORT on training programs listing',
    queryPattern: 'TrainingProgram.find({}).sort({ startDate: 1 })',
  },
  {
    collection: 'trainingprograms',
    name: 'status_1_startDate_1',
    key: { status: 1, startDate: 1 },
    options: { background: true, name: 'status_1_startDate_1' },
    purpose: 'Serve status-filtered training programs ordered by startDate',
    queryPattern: 'TrainingProgram.find({ status }).sort({ startDate: 1 })',
  },
  {
    collection: 'trainingprograms',
    name: 'category_1_startDate_1',
    key: { category: 1, startDate: 1 },
    options: { background: true, name: 'category_1_startDate_1' },
    purpose: 'Serve category-filtered training programs ordered by startDate',
    queryPattern: 'TrainingProgram.find({ category }).sort({ startDate: 1 })',
  },

  // TrainingAssignments
  {
    collection: 'trainingassignments',
    name: 'createdAt_-1',
    key: { createdAt: -1 },
    options: { background: true, name: 'createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on unfiltered training assignments list',
    queryPattern: 'TrainingAssignment.find({}).sort({ createdAt: -1 })',
  },
  {
    collection: 'trainingassignments',
    name: 'employeeId_1_createdAt_-1',
    key: { employeeId: 1, createdAt: -1 },
    options: { background: true, name: 'employeeId_1_createdAt_-1' },
    purpose: 'Serve employee/manager scoped training assignments ordered newest-first',
    queryPattern: 'TrainingAssignment.find({ employeeId | $in }).sort({ createdAt: -1 })',
  },
  {
    collection: 'trainingassignments',
    name: 'programId_1_createdAt_-1',
    key: { programId: 1, createdAt: -1 },
    options: { background: true, name: 'programId_1_createdAt_-1' },
    purpose: 'Serve program-filtered training assignments ordered newest-first',
    queryPattern: 'TrainingAssignment.find({ programId }).sort({ createdAt: -1 })',
  },

  // ExpenseClaims
  {
    collection: 'expenseclaims',
    name: 'createdAt_-1',
    key: { createdAt: -1 },
    options: { background: true, name: 'createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on unfiltered HR/Payroll expense claim listing',
    queryPattern: 'ExpenseClaim.find({}).sort({ createdAt: -1 })',
  },
  {
    collection: 'expenseclaims',
    name: 'employeeId_1_createdAt_-1',
    key: { employeeId: 1, createdAt: -1 },
    options: { background: true, name: 'employeeId_1_createdAt_-1' },
    purpose: 'Serve employee/manager scoped expense claims ordered newest-first',
    queryPattern: 'ExpenseClaim.find({ employeeId | $in }).sort({ createdAt: -1 })',
  },

  // Grievances
  {
    collection: 'grievances',
    name: 'createdAt_-1',
    key: { createdAt: -1 },
    options: { background: true, name: 'createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on unfiltered HR/Admin grievance listing',
    queryPattern: 'Grievance.find({}).sort({ createdAt: -1 })',
  },
  {
    collection: 'grievances',
    name: 'employeeId_1_createdAt_-1',
    key: { employeeId: 1, createdAt: -1 },
    options: { background: true, name: 'employeeId_1_createdAt_-1' },
    purpose: 'Serve employee-scoped grievance tickets ordered newest-first',
    queryPattern: 'Grievance.find({ employeeId }).sort({ createdAt: -1 })',
  },

  // Shifts
  {
    collection: 'shifts',
    name: 'isActive_1_createdAt_-1',
    key: { isActive: 1, createdAt: -1 },
    options: { background: true, name: 'isActive_1_createdAt_-1' },
    purpose: 'Eliminate COLLSCAN + SORT on active shift lookup',
    queryPattern: 'Shift.find({ isActive: true }).sort({ createdAt: -1 })',
  },

  // PayrollAdjustments
  {
    collection: 'payrolladjustments',
    name: 'createdAt_-1',
    key: { createdAt: -1 },
    options: { background: true, name: 'createdAt_-1' },
    purpose: 'Cover unfiltered payroll adjustments list sorted newest-first',
    queryPattern: 'PayrollAdjustment.find({}).sort({ createdAt: -1 })',
  },
  {
    collection: 'payrolladjustments',
    name: 'employeeId_1_createdAt_-1',
    key: { employeeId: 1, createdAt: -1 },
    options: { background: true, name: 'employeeId_1_createdAt_-1' },
    purpose: 'Serve employee-scoped payroll adjustments sorted newest-first',
    queryPattern: 'PayrollAdjustment.find({ employeeId }).sort({ createdAt: -1 })',
  },
  {
    collection: 'payrolladjustments',
    name: 'status_1_createdAt_-1',
    key: { status: 1, createdAt: -1 },
    options: { background: true, name: 'status_1_createdAt_-1' },
    purpose: 'Serve status-filtered payroll adjustments sorted newest-first',
    queryPattern: 'PayrollAdjustment.find({ status }).sort({ createdAt: -1 })',
  },

  // Employees
  {
    collection: 'employees',
    name: 'isDeleted_1_createdAt_-1',
    key: { isDeleted: 1, createdAt: -1 },
    options: { background: true, name: 'isDeleted_1_createdAt_-1' },
    purpose: 'Cover default directory filter+sort without post-index FETCH drops',
    queryPattern: 'Employee.find({ isDeleted: false }).sort({ createdAt: -1 })',
  },
  {
    collection: 'employees',
    name: 'isDeleted_1_departmentId_1_createdAt_-1',
    key: { isDeleted: 1, departmentId: 1, createdAt: -1 },
    options: { background: true, name: 'isDeleted_1_departmentId_1_createdAt_-1' },
    purpose: 'Eliminate in-memory SORT on department-filtered employee listing',
    queryPattern: 'Employee.find({ isDeleted: false, departmentId }).sort({ createdAt: -1 })',
  },
  {
    collection: 'employees',
    name: 'isDeleted_1_employmentStatus_1_createdAt_-1',
    key: { isDeleted: 1, employmentStatus: 1, createdAt: -1 },
    options: { background: true, name: 'isDeleted_1_employmentStatus_1_createdAt_-1' },
    purpose: 'Eliminate in-memory SORT on employmentStatus-filtered employee listing',
    queryPattern: 'Employee.find({ isDeleted: false, employmentStatus }).sort({ createdAt: -1 })',
  },
  {
    collection: 'employees',
    name: 'isDeleted_1_firstName_1_lastName_1_employeeId_1',
    key: { isDeleted: 1, firstName: 1, lastName: 1, employeeId: 1 },
    options: { background: true, name: 'isDeleted_1_firstName_1_lastName_1_employeeId_1' },
    purpose: 'Serve /api/v1/employees/options alphabetical listing without in-memory SORT',
    queryPattern: 'Employee.find({ isDeleted: false, ... }).sort({ firstName: 1, lastName: 1, employeeId: 1 })',
  },
];

/**
 * Redundant left-prefix indexes identified for OPTIONAL manual DBA cleanup AFTER
 * verifying Batch B indexes are healthy in production.
 * NEVER dropped automatically by applyBatchBIndexes or rollbackBatchBIndexes.
 */
export const REDUNDANT_INDEX_CANDIDATES = [
  { collection: 'employees', redundantIndex: 'isDeleted_1', coveredBy: 'isDeleted_1_createdAt_-1 / isDeleted_1_departmentId_1_createdAt_-1' },
  { collection: 'employees', redundantIndex: 'isDeleted_1_departmentId_1', coveredBy: 'isDeleted_1_departmentId_1_createdAt_-1' },
  { collection: 'employees', redundantIndex: 'isDeleted_1_employmentStatus_1', coveredBy: 'isDeleted_1_employmentStatus_1_createdAt_-1' },
  { collection: 'departments', redundantIndex: 'isDeleted_1', coveredBy: 'isDeleted_1_name_1' },
  { collection: 'designations', redundantIndex: 'isDeleted_1', coveredBy: 'isDeleted_1_level_1_title_1' },
  { collection: 'designations', redundantIndex: 'isDeleted_1_departmentId_1_level_1', coveredBy: 'isDeleted_1_departmentId_1_level_1_title_1' },
  { collection: 'branches', redundantIndex: 'isDeleted_1', coveredBy: 'isDeleted_1_isHeadquarters_-1_name_1' },
  { collection: 'salarystructures', redundantIndex: 'employeeId_1', coveredBy: 'employeeId_1_isActive_1' },
  { collection: 'notifications', redundantIndex: 'recipientId_1', coveredBy: 'recipientId_1_isRead_1 / recipientId_1_createdAt_-1' },
  { collection: 'payrollruns', redundantIndex: 'status_1', coveredBy: 'status_1_year_-1_month_-1' },
  { collection: 'jobopenings', redundantIndex: 'status_1', coveredBy: 'status_1_createdAt_-1' },
  { collection: 'jobopenings', redundantIndex: 'departmentId_1', coveredBy: 'departmentId_1_createdAt_-1' },
  { collection: 'candidates', redundantIndex: 'jobOpeningId_1_status_1', coveredBy: 'jobOpeningId_1_status_1_appliedDate_-1' },
  { collection: 'documents', redundantIndex: 'employeeId_1', coveredBy: 'employeeId_1_createdAt_-1' },
  { collection: 'documents', redundantIndex: 'category_1', coveredBy: 'category_1_createdAt_-1' },
  { collection: 'performancereviews', redundantIndex: 'status_1', coveredBy: 'status_1_createdAt_-1' },
  { collection: 'payrolladjustments', redundantIndex: 'employeeId_1', coveredBy: 'employeeId_1_createdAt_-1 / employeeId_1_status_1' },
  { collection: 'payrolladjustments', redundantIndex: 'leaveRequestId_1', coveredBy: 'leaveRequestId_1_sourceMonth_1_sourceYear_1' },
  { collection: 'payrolladjustments', redundantIndex: 'status_1', coveredBy: 'status_1_createdAt_-1' },
];

export async function applyBatchBIndexes(db, { dryRun = true } = {}) {
  const results = [];
  const existingByCollection = new Map();

  for (const spec of BATCH_B_INDEX_PLAN) {
    if (!existingByCollection.has(spec.collection)) {
      let existing = [];
      try {
        existing = await db.collection(spec.collection).indexes();
      } catch {
        existing = [];
      }
      existingByCollection.set(spec.collection, new Set(existing.map((i) => i.name)));
    }

    const existingNames = existingByCollection.get(spec.collection);
    if (existingNames.has(spec.name)) {
      results.push({ collection: spec.collection, name: spec.name, action: 'skipped_exists' });
      continue;
    }

    if (dryRun) {
      results.push({ collection: spec.collection, name: spec.name, action: 'would_create', key: spec.key });
      continue;
    }

    await db.collection(spec.collection).createIndex(spec.key, spec.options);
    existingNames.add(spec.name);
    results.push({ collection: spec.collection, name: spec.name, action: 'created', key: spec.key });
  }

  return results;
}

export async function rollbackBatchBIndexes(db, { dryRun = true } = {}) {
  const results = [];
  const existingByCollection = new Map();

  for (const spec of BATCH_B_INDEX_PLAN) {
    if (!existingByCollection.has(spec.collection)) {
      let existing = [];
      try {
        existing = await db.collection(spec.collection).indexes();
      } catch {
        existing = [];
      }
      existingByCollection.set(
        spec.collection,
        new Map(existing.map((i) => [i.name, i]))
      );
    }

    const idxMap = existingByCollection.get(spec.collection);
    const match = idxMap.get(spec.name);

    // Extra safety guard: never drop _id_ or unique constraints
    if (!match || match.name === '_id_' || match.unique === true) {
      results.push({ collection: spec.collection, name: spec.name, action: 'skipped_absent_or_protected' });
      continue;
    }

    if (dryRun) {
      results.push({ collection: spec.collection, name: spec.name, action: 'would_drop' });
      continue;
    }

    await db.collection(spec.collection).dropIndex(spec.name);
    idxMap.delete(spec.name);
    results.push({ collection: spec.collection, name: spec.name, action: 'dropped' });
  }

  return results;
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const args = new Set(process.argv.slice(2));
  const mode = args.has('--down') ? 'down' : 'up';
  const confirmed = args.has('--confirm-apply');
  const dryRun = !confirmed;

  console.log(`=== Phase 8 Batch B Index Migration (${mode.toUpperCase()}) | dryRun=${dryRun} ===`);
  if (!confirmed) {
    console.log('Running in SAFE DRY-RUN mode. No database connection opened or modified.');
    console.log(`Planned Batch B indexes: ${BATCH_B_INDEX_PLAN.length}`);
    for (const item of BATCH_B_INDEX_PLAN) {
      console.log(`  [${mode === 'up' ? '+' : '-'}] ${item.collection}.${item.name} -> ${JSON.stringify(item.key)}`);
    }
    console.log(`Manual cleanup candidates (NOT auto-dropped): ${REDUNDANT_INDEX_CANDIDATES.length}`);
    process.exit(0);
  }

  const { default: mongoose } = await import('mongoose');
  const { env } = await import('../config/env.js');
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  try {
    const db = mongoose.connection.db;
    const summary =
      mode === 'down'
        ? await rollbackBatchBIndexes(db, { dryRun: false })
        : await applyBatchBIndexes(db, { dryRun: false });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
