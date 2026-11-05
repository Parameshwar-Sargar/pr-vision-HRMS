import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../config/db.js';

// Models
import User from '../models/User.js';
import CompanySettings from '../models/CompanySettings.js';
import Branch from '../models/Branch.js';
import Department from '../models/Department.js';
import Designation from '../models/Designation.js';
import Shift from '../models/Shift.js';
import LeaveType from '../models/LeaveType.js';
import { ROLES, ROLE_DEFAULT_PERMISSIONS } from '../config/constants.js';

dotenv.config();

export const seedMasterData = async ({ disconnect = true } = {}) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    console.log('🌱 Idempotent Master Data Sync to MongoDB Atlas starting...');

    // 1. Company Settings
    let company = await CompanySettings.findOne({});
    if (!company) {
      company = await CompanySettings.create({
        companyName: 'PR VISION INNOVATIONS',
        tagline: 'People. Process. Performance.',
        logo: '/assets/logo.png',
        primaryColor: '#1E40AF',
        contactEmail: 'contact@prvision.com',
        contactPhone: '+91 80 4123 4567',
        website: 'https://prvision.com',
        address: {
          street: '7th Floor, Innovation Tech Tower, Outer Ring Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560103',
          country: 'India',
        },
        businessInfo: {
          registrationNumber: 'U72900KA2021PTC123456',
          taxId: '29AABCP1234F1Z8',
          panNumber: 'AAACP1234F',
          industry: 'Software & Technology',
        },
        settings: {
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          currencySymbol: '₹',
          dateFormat: 'DD/MM/YYYY',
          standardWorkHoursPerDay: 8,
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        },
      });
      console.log('✅ Company Settings initialized.');
    }

    // 2. Branches
    const branchesDef = [
      {
        name: 'Bengaluru Headquarters',
        code: 'HQ-BLR',
        isHeadquarters: true,
        address: { street: 'Outer Ring Road, Bellandur', city: 'Bengaluru', state: 'Karnataka', postalCode: '560103', country: 'India' },
        contactPhone: '+91 80 4123 4567',
        contactEmail: 'blr.ops@prvision.com',
        timezone: 'Asia/Kolkata',
      },
      {
        name: 'Mumbai Regional Office',
        code: 'BR-MUM',
        isHeadquarters: false,
        address: { street: 'Bandra Kurla Complex (BKC)', city: 'Mumbai', state: 'Maharashtra', postalCode: '400051', country: 'India' },
        contactPhone: '+91 22 6123 9876',
        contactEmail: 'mum.ops@prvision.com',
        timezone: 'Asia/Kolkata',
      },
      {
        name: 'Hyderabad Tech Center',
        code: 'BR-HYD',
        isHeadquarters: false,
        address: { street: 'HITEC City, Madhapur', city: 'Hyderabad', state: 'Telangana', postalCode: '500081', country: 'India' },
        contactPhone: '+91 40 4987 1234',
        contactEmail: 'hyd.ops@prvision.com',
        timezone: 'Asia/Kolkata',
      },
    ];

    const branchMap = {};
    for (const b of branchesDef) {
      let branch = await Branch.findOne({ code: b.code });
      if (!branch) {
        branch = await Branch.create(b);
      }
      branchMap[b.code] = branch;
    }
    const hqBranch = branchMap['HQ-BLR'];

    // 3. Departments (Phase 6 specific list)
    const departmentsDef = [
      { name: 'Human Resources', code: 'HR', description: 'People operations, recruitment, and lifecycle', branchId: hqBranch._id },
      { name: 'Information Technology', code: 'IT', description: 'Software engineering, platform architecture, and IT systems', branchId: hqBranch._id },
      { name: 'Finance', code: 'FIN', description: 'Financial accounting, payroll, and statutory tax compliance', branchId: hqBranch._id },
      { name: 'Marketing', code: 'MKT', description: 'Digital marketing, corporate communications, and brand growth', branchId: hqBranch._id },
      { name: 'Sales', code: 'SLS', description: 'Client acquisition, demonstrations, and business development', branchId: branchMap['BR-MUM']._id },
      { name: 'Operations', code: 'OPS', description: 'Client implementation, deployment support, and customer success', branchId: branchMap['BR-HYD']._id },
    ];

    const deptMap = {};
    for (const d of departmentsDef) {
      let dept = await Department.findOne({
        $or: [{ name: d.name }, { code: d.code }],
      });
      if (!dept) {
        dept = await Department.create(d);
        console.log(`✅ Created Department: ${d.name} (${d.code})`);
      } else {
        // Ensure active
        dept.isDeleted = false;
        dept.isActive = true;
        await dept.save();
      }
      deptMap[d.name] = dept;
    }

    // Also map any existing alternate names
    const existingDepts = await Department.find({ isDeleted: false });
    for (const d of existingDepts) {
      deptMap[d.name] = d;
      if (d.name === 'Engineering & Technology' && !deptMap['Information Technology']) {
        deptMap['Information Technology'] = d;
      }
      if (d.name === 'Finance & Payroll' && !deptMap['Finance']) {
        deptMap['Finance'] = d;
      }
    }

    // 4. Designations (Phase 6 specific list)
    const itDept = deptMap['Information Technology'] || deptMap['Engineering & Technology'] || Object.values(deptMap)[0];
    const hrDept = deptMap['Human Resources'] || Object.values(deptMap)[0];
    const finDept = deptMap['Finance'] || deptMap['Finance & Payroll'] || Object.values(deptMap)[0];
    const mktDept = deptMap['Marketing'] || Object.values(deptMap)[0];
    const salesDept = deptMap['Sales'] || Object.values(deptMap)[0];

    const designationsDef = [
      { title: 'HR Manager', departmentId: hrDept._id, code: 'HRM', level: 3, description: 'Leads HR operations and recruitment' },
      { title: 'HR Executive', departmentId: hrDept._id, code: 'HRE', level: 1, description: 'Handles onboarding, attendance, and employee queries' },
      { title: 'Software Developer', departmentId: itDept._id, code: 'SDE', level: 1, description: 'Full stack web development and features' },
      { title: 'Senior Developer', departmentId: itDept._id, code: 'SRDEV', level: 2, description: 'Architecture, module delivery, and code reviews' },
      { title: 'Team Leader', departmentId: itDept._id, code: 'LEAD', level: 3, description: 'Sprint planning and technical leadership' },
      { title: 'Accountant', departmentId: finDept._id, code: 'ACC', level: 2, description: 'Ledger management, accounts, and payroll support' },
      { title: 'Marketing Executive', departmentId: mktDept._id, code: 'MKT-EXE', level: 1, description: 'Campaigns, digital media, and brand outreach' },
      { title: 'Sales Executive', departmentId: salesDept._id, code: 'SLS-EXE', level: 1, description: 'Leads client demonstrations and deals' },
    ];

    for (const des of designationsDef) {
      let desig = await Designation.findOne({
        title: des.title,
        departmentId: des.departmentId,
      });
      if (!desig) {
        desig = await Designation.create(des);
        console.log(`✅ Created Designation: ${des.title} under ${des.departmentId}`);
      } else {
        desig.isDeleted = false;
        desig.isActive = true;
        await desig.save();
      }
    }

    // 5. Ensure All 6 Core Users Exist with Known Password
    console.log('👥 Verifying 6 Core Demo Users on MongoDB Atlas...');
    const usersDef = [
      { name: 'Rajiv Verma (Admin)', email: 'admin@prvision.com', role: ROLES.ADMIN, permissions: ROLE_DEFAULT_PERMISSIONS.ADMIN },
      { name: 'Priya Sharma (HR Manager)', email: 'hr@prvision.com', role: ROLES.HR_MANAGER, permissions: ROLE_DEFAULT_PERMISSIONS.HR_MANAGER },
      { name: 'Rajesh Nair (Manager)', email: 'manager@prvision.com', role: ROLES.MANAGER, permissions: ROLE_DEFAULT_PERMISSIONS.MANAGER },
      { name: 'Amit Patel (Employee)', email: 'employee@prvision.com', role: ROLES.EMPLOYEE, permissions: ROLE_DEFAULT_PERMISSIONS.EMPLOYEE },
      { name: 'Vikram Joshi (Recruiter)', email: 'recruiter@prvision.com', role: ROLES.RECRUITER, permissions: ROLE_DEFAULT_PERMISSIONS.RECRUITER },
      { name: 'Ananya Desai (Payroll Admin)', email: 'payroll@prvision.com', role: ROLES.PAYROLL_ADMIN, permissions: ROLE_DEFAULT_PERMISSIONS.PAYROLL_ADMIN },
    ];

    for (const u of usersDef) {
      let user = await User.findOne({ email: u.email });
      if (!user) {
        user = await User.create({
          name: u.name,
          email: u.email,
          password: 'Password@123',
          role: u.role,
          branchId: hqBranch._id,
          permissions: u.permissions,
          isActive: true,
        });
        console.log(`✅ Created Demo User: ${u.email} (${u.role})`);
      } else {
        // Reset password to known default if needed
        user.password = 'Password@123';
        user.isActive = true;
        user.role = u.role;
        user.permissions = u.permissions;
        await user.save();
      }
    }

    console.log('🎉 MongoDB Atlas Master Data Synchronization Complete!');
    if (disconnect) {
      await disconnectDB();
    }
  } catch (error) {
    console.error('❌ Error during master data seeding:', error);
    if (disconnect) {
      await disconnectDB();
    }
    throw error;
  }
};

// Execute if run directly
if (process.argv[1]?.endsWith('seedMasterData.js')) {
  seedMasterData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

