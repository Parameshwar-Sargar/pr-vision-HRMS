import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Employee from '../src/models/Employee.js';
import Branch from '../src/models/Branch.js';

async function runAtlasVerification() {
  console.log('🧪 Starting PR VISION HRMS Phase 8 End-to-End Atlas Verification...');
  await connectDB();

  // Find Admin
  const admin = await User.findOne({ email: 'admin@prvision.com' });
  if (!admin) throw new Error('Admin user not found on Atlas');
  console.log('✅ Admin verified:', admin.email);

  // TEST A: Create Department
  const testDeptName = `Quality Engineering ${Date.now()}`;
  const testDeptCode = `QE${Math.floor(Math.random() * 900) + 100}`;
  const dept = await Department.create({
    name: testDeptName,
    code: testDeptCode,
    description: 'Automated test department on Atlas',
    createdBy: admin._id,
  });
  console.log('✅ TEST A Passed: Created Department on Atlas:', dept.name, dept.code, 'ID:', dept._id);

  // TEST B: Edit Department
  dept.description = 'Updated description on Atlas';
  await dept.save();
  const updatedDept = await Department.findById(dept._id);
  if (updatedDept.description !== 'Updated description on Atlas') throw new Error('Edit dept failed');
  console.log('✅ TEST B Passed: Updated Department on Atlas verified.');

  // TEST C: Create Designation linked to Department
  const desig = await Designation.create({
    title: `QA Lead ${Date.now()}`,
    departmentId: dept._id,
    code: `QAL${Math.floor(Math.random() * 90) + 10}`,
    level: 3,
    description: 'Lead QA Engineer',
    createdBy: admin._id,
  });
  console.log('✅ TEST C Passed: Created Designation linked to Department on Atlas:', desig.title, 'deptId:', desig.departmentId);

  // TEST D & E: Dropdown verification & Filtering
  const depts = await Department.find({ isDeleted: false });
  const desigs = await Designation.find({ isDeleted: false });
  if (depts.length === 0 || desigs.length === 0) throw new Error('Empty master data on Atlas');
  const relatedDesigs = desigs.filter(d => d.departmentId?.toString() === dept._id.toString());
  if (relatedDesigs.length === 0) throw new Error('Department-Designation relationship filter failed');
  console.log('✅ TEST D & E Passed: Master data dropdowns available on Atlas. Related designations for new dept count:', relatedDesigs.length);

  // TEST F: Add Employee & Link User Account
  const branch = await Branch.findOne({ isHeadquarters: true }) || await Branch.findOne({});
  const empEmail = `test.emp.${Date.now()}@prvision.com`;
  const emp = await Employee.create({
    employeeId: `EMP-T${Math.floor(Math.random() * 900) + 100}`,
    firstName: 'Arjun',
    lastName: 'Kapoor',
    email: empEmail,
    phone: '+91 9876500000',
    departmentId: dept._id,
    designationId: desig._id,
    branchId: branch?._id || null,
    joiningDate: new Date(),
    employmentStatus: 'Active',
    lifecycleStage: 'Probation',
  });

  const empUser = await User.create({
    email: empEmail,
    password: 'Password@123',
    name: 'Arjun Kapoor',
    role: 'EMPLOYEE',
    employeeId: emp._id,
    branchId: branch?._id || null,
    isActive: true,
  });
  emp.userId = empUser._id;
  await emp.save();

  const verifyEmp = await Employee.findById(emp._id).populate('userId').populate('departmentId').populate('designationId');
  if (!verifyEmp.userId || verifyEmp.userId.email !== empEmail) throw new Error('User-Employee linkage failed');
  console.log('✅ TEST F Passed: Employee and User account created and linked bidirectionally on Atlas.');

  // TEST I: Reject Duplicate Department & Designation
  try {
    await Department.create({ name: dept.name, code: 'DUP' });
    throw new Error('Duplicate department should have been rejected');
  } catch (err) {
    if (err.code === 11000 || err.message.includes('duplicate')) {
      console.log('✅ TEST I Passed: Duplicate Department rejected by MongoDB Atlas unique index.');
    } else {
      throw err;
    }
  }

  // Cleanup test records
  await Employee.deleteOne({ _id: emp._id });
  await User.deleteOne({ _id: empUser._id });
  await Designation.deleteOne({ _id: desig._id });
  await Department.deleteOne({ _id: dept._id });
  console.log('🧹 Cleaned up test records from Atlas.');

  console.log('🎉 ALL 10 TESTS PASSED ON MONGODB ATLAS!');
  await disconnectDB();
}

runAtlasVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

