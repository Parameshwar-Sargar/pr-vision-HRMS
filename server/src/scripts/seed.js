import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Models
import User from '../models/User.js';
import CompanySettings from '../models/CompanySettings.js';
import Branch from '../models/Branch.js';
import Department from '../models/Department.js';
import Designation from '../models/Designation.js';
import Shift from '../models/Shift.js';
import Employee from '../models/Employee.js';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import SalaryStructure from '../models/SalaryStructure.js';
import PayrollRun from '../models/PayrollRun.js';
import Payslip from '../models/Payslip.js';
import JobOpening from '../models/JobOpening.js';
import Candidate from '../models/Candidate.js';
import TrainingProgram from '../models/TrainingProgram.js';
import TrainingAssignment from '../models/TrainingAssignment.js';
import Asset from '../models/Asset.js';
import AssetAssignment from '../models/AssetAssignment.js';
import ExpenseClaim from '../models/ExpenseClaim.js';
import Grievance from '../models/Grievance.js';
import Announcement from '../models/Announcement.js';
import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';

import {
  ROLES,
  ROLE_DEFAULT_PERMISSIONS,
  ATTENDANCE_STATUS,
  LEAVE_STATUS,
  PAYROLL_STATUS,
  LIFECYCLE_STAGES,
} from '../config/constants.js';
import { connectDB, disconnectDB } from '../config/db.js';

dotenv.config();

export const seedDatabase = async ({ disconnect = true } = {}) => {
  try {
    console.log('🌱 Starting PR VISION HRMS Enterprise Database Seeding...');
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    // Clear previous data
    console.log('🧹 Purging existing collections...');
    await Promise.all([
      User.deleteMany({}),
      CompanySettings.deleteMany({}),
      Branch.deleteMany({}),
      Department.deleteMany({}),
      Designation.deleteMany({}),
      Shift.deleteMany({}),
      Employee.deleteMany({}),
      LeaveType.deleteMany({}),
      LeaveBalance.deleteMany({}),
      LeaveRequest.deleteMany({}),
      Attendance.deleteMany({}),
      Holiday.deleteMany({}),
      SalaryStructure.deleteMany({}),
      PayrollRun.deleteMany({}),
      Payslip.deleteMany({}),
      JobOpening.deleteMany({}),
      Candidate.deleteMany({}),
      TrainingProgram.deleteMany({}),
      TrainingAssignment.deleteMany({}),
      Asset.deleteMany({}),
      AssetAssignment.deleteMany({}),
      ExpenseClaim.deleteMany({}),
      Grievance.deleteMany({}),
      Announcement.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // 1. Seed Company Settings (Central Branding)
    console.log('🏢 Seeding PR VISION INNOVATIONS Company Profile & Branding...');
    const company = await CompanySettings.create({
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
        pfRegistration: 'KN/BNG/0012345/000',
        esiRegistration: '53000123450000001',
      },
      settings: {
        timezone: 'Asia/Kolkata',
        dateFormat: 'DD/MM/YYYY',
        currency: 'INR',
        fiscalYearStartMonth: 4, // April
      },
      modules: {
        attendance: true,
        leaves: true,
        payroll: true,
        recruitment: true,
        performance: true,
        training: true,
        expenses: true,
        assets: true,
        grievances: true,
        biometricIntegration: true,
      },
    });

    // 2. Seed Branches
    console.log('📍 Seeding Enterprise Branches...');
    const [hqBranch, mumbaiBranch, hydBranch] = await Branch.create([
      {
        name: 'Bengaluru Headquarters',
        code: 'HQ-BLR',
        isHeadquarters: true,
        address: {
          street: 'Outer Ring Road, Bellandur',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560103',
          country: 'India',
        },
        contactPhone: '+91 80 4123 4567',
        contactEmail: 'blr.ops@prvision.com',
        timezone: 'Asia/Kolkata',
      },
      {
        name: 'Mumbai Regional Office',
        code: 'BR-MUM',
        isHeadquarters: false,
        address: {
          street: 'Bandra Kurla Complex (BKC), G Block',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400051',
          country: 'India',
        },
        contactPhone: '+91 22 6123 9876',
        contactEmail: 'mum.ops@prvision.com',
        timezone: 'Asia/Kolkata',
      },
      {
        name: 'Hyderabad Tech Center',
        code: 'BR-HYD',
        isHeadquarters: false,
        address: {
          street: 'HITEC City, Madhapur',
          city: 'Hyderabad',
          state: 'Telangana',
          postalCode: '500081',
          country: 'India',
        },
        contactPhone: '+91 40 4987 1234',
        contactEmail: 'hyd.ops@prvision.com',
        timezone: 'Asia/Kolkata',
      },
    ]);

    // 3. Seed Shifts
    console.log('⏰ Seeding Work Shifts...');
    const [generalShift, morningShift, nightShift] = await Shift.create([
      {
        name: 'General Day Shift',
        code: 'SFT-GEN',
        startTime: '09:00',
        endTime: '18:00',
        breakDurationMinutes: 60,
        gracePeriodMinutes: 15,
        weeklyOffDays: [0, 6], // Sunday, Saturday
        isDefault: true,
      },
      {
        name: 'Morning Operations Shift',
        code: 'SFT-MORN',
        startTime: '07:00',
        endTime: '16:00',
        breakDurationMinutes: 60,
        gracePeriodMinutes: 10,
        weeklyOffDays: [0, 6],
        isDefault: false,
      },
      {
        name: 'Night Engineering Shift',
        code: 'SFT-NIGHT',
        startTime: '21:00',
        endTime: '06:00',
        breakDurationMinutes: 60,
        gracePeriodMinutes: 15,
        weeklyOffDays: [0, 6],
        isNightShift: true,
        isDefault: false,
      },
    ]);

    // 4. Seed Departments
    console.log('🏛️ Seeding Departments...');
    const [engDept, hrDept, finDept, salesDept, opsDept] = await Department.create([
      { name: 'Engineering & Technology', code: 'ENG', description: 'Core software development and platform engineering', branchId: hqBranch._id },
      { name: 'Human Resources', code: 'HR', description: 'People operations, talent acquisition, and compliance', branchId: hqBranch._id },
      { name: 'Finance & Payroll', code: 'FIN', description: 'Financial accounting, payroll processing, and statutory compliance', branchId: hqBranch._id },
      { name: 'Sales & Marketing', code: 'SLS', description: 'Client acquisition, demonstrations, and growth', branchId: mumbaiBranch._id },
      { name: 'Customer Operations', code: 'OPS', description: 'Client implementation, deployment support, and technical services', branchId: hydBranch._id },
    ]);

    // 5. Seed Designations
    console.log('💼 Seeding Designations...');
    const [engMgrDesig, srDevDesig, devDesig, hrMgrDesig, recruiterDesig, payrollDesig] = await Designation.create([
      { title: 'Engineering Manager', departmentId: engDept._id, code: 'ENG-MGR', level: 4, description: 'Directs engineering teams and delivery' },
      { title: 'Senior Software Engineer', departmentId: engDept._id, code: 'SR-DEV', level: 3, description: 'Leads architecture and core modules' },
      { title: 'Software Engineer', departmentId: engDept._id, code: 'SW-DEV', level: 2, description: 'Full stack development' },
      { title: 'HR Manager', departmentId: hrDept._id, code: 'HR-MGR', level: 4, description: 'Head of People Operations' },
      { title: 'Talent Acquisition Specialist', departmentId: hrDept._id, code: 'REC-SPEC', level: 2, description: 'Recruiter and interviewer' },
      { title: 'Payroll Administrator', departmentId: finDept._id, code: 'PAY-ADMIN', level: 3, description: 'Manages salary structures and payouts' },
    ]);

    // 6. Seed Holidays
    console.log('🎉 Seeding Holiday Calendar...');
    const currentYear = new Date().getFullYear();
    await Holiday.create([
      { name: 'New Year Day', date: new Date(currentYear, 0, 1), year: currentYear, description: 'Public Holiday' },
      { name: 'Republic Day', date: new Date(currentYear, 0, 26), year: currentYear, description: 'National Holiday' },
      { name: 'May Day', date: new Date(currentYear, 4, 1), year: currentYear, description: 'Labour Day' },
      { name: 'Independence Day', date: new Date(currentYear, 7, 15), year: currentYear, description: 'National Holiday' },
      { name: 'Gandhi Jayanti', date: new Date(currentYear, 9, 2), year: currentYear, description: 'National Holiday' },
      { name: 'Diwali', date: new Date(currentYear, 10, 12), year: currentYear, description: 'Festival of Lights' },
      { name: 'Christmas Day', date: new Date(currentYear, 11, 25), year: currentYear, description: 'Public Holiday' },
    ]);

    // 7. Seed Leave Types
    console.log('🌴 Seeding Leave Types...');
    const [clType, slType, elType] = await LeaveType.create([
      { name: 'Casual Leave (CL)', code: 'CL', defaultDaysPerYear: 12, isPaid: true, requiresApproval: true, accrualFrequency: 'Monthly' },
      { name: 'Sick Leave (SL)', code: 'SL', defaultDaysPerYear: 12, isPaid: true, requiresApproval: true, accrualFrequency: 'Monthly' },
      { name: 'Earned / Privilege Leave (EL)', code: 'EL', defaultDaysPerYear: 15, isPaid: true, isEncashable: true, requiresApproval: true, accrualFrequency: 'Yearly' },
    ]);

    // 8. Seed 6 Core Roles with Exact Demo Credentials
    console.log('👥 Seeding 6 Core Enterprise Users...');

    const adminUser = await User.create({
      name: 'Rajiv Verma (Admin)',
      email: 'admin@prvision.com',
      password: 'Password@123',
      role: ROLES.ADMIN,
      branchId: hqBranch._id,
      permissions: ROLE_DEFAULT_PERMISSIONS.ADMIN,
      isActive: true,
    });

    const hrUser = await User.create({
      name: 'Priya Sharma (HR Manager)',
      email: 'hr@prvision.com',
      password: 'Password@123',
      role: ROLES.HR_MANAGER,
      branchId: hqBranch._id,
      permissions: ROLE_DEFAULT_PERMISSIONS.HR_MANAGER,
      isActive: true,
    });

    const managerUser = await User.create({
      name: 'Rajesh Nair (Manager)',
      email: 'manager@prvision.com',
      password: 'Password@123',
      role: ROLES.MANAGER,
      branchId: hqBranch._id,
      permissions: ROLE_DEFAULT_PERMISSIONS.MANAGER,
      isActive: true,
    });

    const empUser = await User.create({
      name: 'Amit Patel (Employee)',
      email: 'employee@prvision.com',
      password: 'Password@123',
      role: ROLES.EMPLOYEE,
      branchId: hqBranch._id,
      permissions: ROLE_DEFAULT_PERMISSIONS.EMPLOYEE,
      isActive: true,
    });

    const recruiterUser = await User.create({
      name: 'Vikram Joshi (Recruiter)',
      email: 'recruiter@prvision.com',
      password: 'Password@123',
      role: ROLES.RECRUITER,
      branchId: mumbaiBranch._id,
      permissions: ROLE_DEFAULT_PERMISSIONS.RECRUITER,
      isActive: true,
    });

    const payrollUser = await User.create({
      name: 'Ananya Desai (Payroll Admin)',
      email: 'payroll@prvision.com',
      password: 'Password@123',
      role: ROLES.PAYROLL_ADMIN,
      branchId: hqBranch._id,
      permissions: ROLE_DEFAULT_PERMISSIONS.PAYROLL_ADMIN,
      isActive: true,
    });

    // 9. Seed Employees Linked to Users
    console.log('👤 Seeding Employee Profiles with Lifecycles...');
    const adminEmp = await Employee.create({
      employeeId: 'PRV-0001',
      firstName: 'Rajiv',
      lastName: 'Verma',
      email: 'admin@prvision.com',
      phone: '+91 9876543210',
      branchId: hqBranch._id,
      departmentId: engDept._id,
      designationId: engMgrDesig._id,
      shiftId: generalShift._id,
      userId: adminUser._id,
      joiningDate: new Date(2021, 0, 15),
      lifecycleStage: LIFECYCLE_STAGES.CONFIRMED,
      employmentStatus: 'Active',
      probationPeriodMonths: 3,
      bankDetails: {
        accountHolderName: 'Rajiv Verma',
        accountNumber: '918237465012',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0001234',
        branch: 'Koramangala, Bengaluru',
      },
    });

    const hrEmp = await Employee.create({
      employeeId: 'PRV-0002',
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'hr@prvision.com',
      phone: '+91 9876543211',
      branchId: hqBranch._id,
      departmentId: hrDept._id,
      designationId: hrMgrDesig._id,
      managerId: adminEmp._id,
      shiftId: generalShift._id,
      userId: hrUser._id,
      joiningDate: new Date(2022, 2, 1),
      lifecycleStage: LIFECYCLE_STAGES.CONFIRMED,
      employmentStatus: 'Active',
      probationPeriodMonths: 3,
      bankDetails: {
        accountHolderName: 'Priya Sharma',
        accountNumber: '918237465013',
        bankName: 'ICICI Bank',
        ifscCode: 'ICIC0002345',
        branch: 'Indiranagar, Bengaluru',
      },
    });

    const managerEmp = await Employee.create({
      employeeId: 'PRV-0003',
      firstName: 'Rajesh',
      lastName: 'Nair',
      email: 'manager@prvision.com',
      phone: '+91 9876543212',
      branchId: hqBranch._id,
      departmentId: engDept._id,
      designationId: engMgrDesig._id,
      managerId: adminEmp._id,
      shiftId: generalShift._id,
      userId: managerUser._id,
      joiningDate: new Date(2022, 5, 10),
      lifecycleStage: LIFECYCLE_STAGES.PROMOTED,
      employmentStatus: 'Active',
      probationPeriodMonths: 3,
      bankDetails: {
        accountHolderName: 'Rajesh Nair',
        accountNumber: '918237465014',
        bankName: 'State Bank of India',
        ifscCode: 'SBIN0003456',
        branch: 'MG Road, Bengaluru',
      },
    });

    const devEmp = await Employee.create({
      employeeId: 'PRV-0004',
      firstName: 'Amit',
      lastName: 'Patel',
      email: 'employee@prvision.com',
      phone: '+91 9876543213',
      branchId: hqBranch._id,
      departmentId: engDept._id,
      designationId: srDevDesig._id,
      managerId: managerEmp._id,
      shiftId: generalShift._id,
      userId: empUser._id,
      joiningDate: new Date(2023, 1, 15),
      lifecycleStage: LIFECYCLE_STAGES.CONFIRMED,
      employmentStatus: 'Active',
      probationPeriodMonths: 3,
      bankDetails: {
        accountHolderName: 'Amit Patel',
        accountNumber: '918237465015',
        bankName: 'Axis Bank',
        ifscCode: 'UTIB0004567',
        branch: 'Whitefield, Bengaluru',
      },
    });

    const recruiterEmp = await Employee.create({
      employeeId: 'PRV-0005',
      firstName: 'Vikram',
      lastName: 'Joshi',
      email: 'recruiter@prvision.com',
      phone: '+91 9876543214',
      branchId: mumbaiBranch._id,
      departmentId: hrDept._id,
      designationId: recruiterDesig._id,
      managerId: hrEmp._id,
      shiftId: generalShift._id,
      userId: recruiterUser._id,
      joiningDate: new Date(2023, 6, 1),
      lifecycleStage: LIFECYCLE_STAGES.CONFIRMED,
      employmentStatus: 'Active',
      probationPeriodMonths: 3,
      bankDetails: {
        accountHolderName: 'Vikram Joshi',
        accountNumber: '918237465016',
        bankName: 'Kotak Mahindra Bank',
        ifscCode: 'KKBK0005678',
        branch: 'BKC, Mumbai',
      },
    });

    const payrollEmp = await Employee.create({
      employeeId: 'PRV-0006',
      firstName: 'Ananya',
      lastName: 'Desai',
      email: 'payroll@prvision.com',
      phone: '+91 9876543215',
      branchId: hqBranch._id,
      departmentId: finDept._id,
      designationId: payrollDesig._id,
      managerId: hrEmp._id,
      shiftId: generalShift._id,
      userId: payrollUser._id,
      joiningDate: new Date(2023, 8, 1),
      lifecycleStage: LIFECYCLE_STAGES.CONFIRMED,
      employmentStatus: 'Active',
      probationPeriodMonths: 3,
      bankDetails: {
        accountHolderName: 'Ananya Desai',
        accountNumber: '918237465017',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0001234',
        branch: 'Koramangala, Bengaluru',
      },
    });

    // An employee currently on Probation
    const probationEmp = await Employee.create({
      employeeId: 'PRV-0007',
      firstName: 'Sneha',
      lastName: 'Rao',
      email: 'sneha.rao@prvision.com',
      phone: '+91 9876543216',
      branchId: hydBranch._id,
      departmentId: engDept._id,
      designationId: devDesig._id,
      managerId: managerEmp._id,
      shiftId: generalShift._id,
      joiningDate: new Date(2026, 0, 10),
      lifecycleStage: LIFECYCLE_STAGES.PROBATION,
      employmentStatus: 'Active',
      probationPeriodMonths: 6,
      bankDetails: {
        accountHolderName: 'Sneha Rao',
        accountNumber: '918237465018',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0001234',
        branch: 'Madhapur, Hyderabad',
      },
    });

    // Update department heads
    engDept.headId = adminEmp._id;
    await engDept.save();
    hrDept.headId = hrEmp._id;
    await hrDept.save();
    finDept.headId = payrollEmp._id;
    await finDept.save();

    // 10. Seed Leave Balances & Sample Requests
    console.log('📊 Seeding Leave Balances & Requests...');
    const allEmployees = [adminEmp, hrEmp, managerEmp, devEmp, recruiterEmp, payrollEmp, probationEmp];
    for (const emp of allEmployees) {
      await LeaveBalance.create({
        employeeId: emp._id,
        year: currentYear,
        balances: [
          { leaveTypeId: clType._id, allocated: 12, used: 2, pending: 1, remaining: 9 },
          { leaveTypeId: slType._id, allocated: 12, used: 1, pending: 0, remaining: 11 },
          { leaveTypeId: elType._id, allocated: 15, used: 3, pending: 0, remaining: 12 },
        ],
      });
    }

    // Leave request for Amit Patel (Employee)
    const pendingLeave = await LeaveRequest.create({
      employeeId: devEmp._id,
      leaveTypeId: clType._id,
      startDate: new Date(currentYear, 10, 20),
      endDate: new Date(currentYear, 10, 21),
      totalDays: 2,
      reason: 'Attending family wedding ceremony',
      status: LEAVE_STATUS.PENDING,
    });

    const approvedLeave = await LeaveRequest.create({
      employeeId: recruiterEmp._id,
      leaveTypeId: slType._id,
      startDate: new Date(currentYear, 9, 10),
      endDate: new Date(currentYear, 9, 11),
      totalDays: 2,
      reason: 'Seasonal viral fever',
      status: LEAVE_STATUS.APPROVED,
      reviewedBy: hrUser._id,
      reviewedAt: new Date(currentYear, 9, 9),
      reviewRemarks: 'Approved. Take care and rest.',
    });

    // 11. Seed Attendance for the past 7 days
    console.log('📅 Seeding 7-Day Attendance Logs...');
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (isWeekend) continue;

      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);

      for (const emp of allEmployees) {
        const checkIn = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, Math.floor(Math.random() * 20), 0);
        const checkOut = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, Math.floor(Math.random() * 30), 0);
        const isLate = checkIn.getMinutes() > 15;

        await Attendance.create({
          employeeId: emp._id,
          branchId: emp.branchId,
          shiftId: emp.shiftId,
          date: dateOnly,
          checkInTime: checkIn,
          checkOutTime: checkOut,
          totalHours: 8.5,
          status: isLate ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT,
          clockMethod: 'Web',
          ipAddress: '127.0.0.1',
        });
      }
    }

    // 12. Seed Salary Structures
    console.log('💰 Seeding Salary Structures...');
    const salaries = [
      { emp: adminEmp, basic: 150000, hra: 60000, special: 40000 },
      { emp: hrEmp, basic: 90000, hra: 36000, special: 24000 },
      { emp: managerEmp, basic: 120000, hra: 48000, special: 32000 },
      { emp: devEmp, basic: 80000, hra: 32000, special: 18000 },
      { emp: recruiterEmp, basic: 60000, hra: 24000, special: 16000 },
      { emp: payrollEmp, basic: 70000, hra: 28000, special: 17000 },
      { emp: probationEmp, basic: 45000, hra: 18000, special: 12000 },
    ];

    for (const item of salaries) {
      await SalaryStructure.create({
        employeeId: item.emp._id,
        basicSalary: item.basic,
        hra: item.hra,
        specialAllowance: item.special,
        customComponents: [
          { name: 'Medical Allowance', type: 'earning', calculationType: 'flat', value: 2500 },
          { name: 'Internet & Remote Work', type: 'earning', calculationType: 'flat', value: 2000 },
        ],
        statutoryConfig: {
          pfEnabled: true,
          pfEmployeeRate: 12,
          esiEnabled: item.basic <= 21000,
          esiEmployeeRate: 0.75,
          professionalTax: 200,
          tdsDeduction: Math.round(item.basic * 0.05),
          isVerifiedByProfessional: true,
        },
        isActive: true,
      });
    }

    // 13. Seed Payroll Run & Payslips for Previous Month
    console.log('🧾 Seeding Payroll Run & Payslips...');
    const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth();
    const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

    const payrollRun = await PayrollRun.create({
      month: prevMonth,
      year: prevYear,
      status: PAYROLL_STATUS.PAID,
      totalEmployees: allEmployees.length,
      totalGrossSalary: 924500,
      totalDeductions: 112400,
      totalNetSalary: 812100,
      processedBy: payrollUser._id,
      approvedBy: adminUser._id,
      paymentDate: new Date(),
      isLocked: true,
      notes: `Finalized monthly payroll for ${prevMonth}/${prevYear}`,
    });

    for (const s of salaries) {
      const gross = s.basic + s.hra + s.special + 4500;
      const pf = Math.round(s.basic * 0.12);
      const pt = 200;
      const tds = Math.round(s.basic * 0.05);
      const totalDed = pf + pt + tds;
      const net = gross - totalDed;

      await Payslip.create({
        payrollRunId: payrollRun._id,
        employeeId: s.emp._id,
        month: prevMonth,
        year: prevYear,
        payslipNumber: `PS-${prevYear}${String(prevMonth).padStart(2, '0')}-${s.emp.employeeId}`,
        basicSalary: s.basic,
        earnings: [
          { name: 'House Rent Allowance (HRA)', amount: s.hra },
          { name: 'Special Allowance', amount: s.special },
          { name: 'Medical Allowance', amount: 2500 },
          { name: 'Internet & Remote Work', amount: 2000 },
        ],
        deductions: [
          { name: 'Provident Fund (12%)', amount: pf },
          { name: 'Professional Tax (PT)', amount: pt },
          { name: 'Tax Deducted at Source (TDS)', amount: tds },
        ],
        grossSalary: gross,
        totalDeductions: totalDed,
        netSalary: net,
        workingDays: 30,
        presentDays: 30,
        paymentStatus: 'Paid',
        paymentDate: new Date(),
      });
    }

    // 14. Seed Recruitment Requisitions & Candidates
    console.log('📢 Seeding Recruitment Pipeline...');
    const [jobReact, jobDevops] = await JobOpening.create([
      {
        title: 'Senior Full Stack React / Node Developer',
        departmentId: engDept._id,
        designationId: srDevDesig._id,
        branchId: hqBranch._id,
        openingsCount: 2,
        location: 'Bengaluru (Hybrid)',
        type: 'Full-Time',
        experienceRequired: '4-7 years',
        description: 'Join our core platform engineering team building next-generation enterprise SaaS and software solutions.',
        requirements: ['React 18+', 'Node.js Express', 'MongoDB / Postgres', 'Enterprise RBAC architectures'],
        status: 'Open',
        deadline: new Date(currentYear, 11, 31),
      },
      {
        title: 'Cloud DevOps & Security Engineer',
        departmentId: engDept._id,
        branchId: hqBranch._id,
        openingsCount: 1,
        location: 'Remote / Bengaluru',
        type: 'Full-Time',
        experienceRequired: '3-6 years',
        description: 'Manage production container infrastructure, CI/CD pipelines, and cloud security compliance.',
        requirements: ['Docker', 'Kubernetes', 'AWS/GCP', 'Terraform', 'SOC2 / ISO 27001 hardening'],
        status: 'Open',
        deadline: new Date(currentYear, 11, 15),
      },
    ]);

    await Candidate.create([
      {
        jobOpeningId: jobReact._id,
        fullName: 'Karthik Raman',
        email: 'karthik.raman@example.com',
        phone: '+91 9811223344',
        currentCompany: 'Infosys',
        currentCtc: 1400000,
        expectedCtc: 1800000,
        noticePeriodDays: 30,
        status: 'Interviewing',
        rating: 4,
        notes: 'Passed technical coding round with distinction. Strong in MERN architecture.',
      },
      {
        jobOpeningId: jobReact._id,
        fullName: 'Meera Nambiar',
        email: 'meera.nambiar@example.com',
        phone: '+91 9822334455',
        currentCompany: 'TCS',
        currentCtc: 1100000,
        expectedCtc: 1500000,
        noticePeriodDays: 45,
        status: 'Offered',
        rating: 5,
        notes: 'Offer letter extended. Joining expected next month.',
      },
      {
        jobOpeningId: jobDevops._id,
        fullName: 'Sameer Kulkarni',
        email: 'sameer.k@example.com',
        phone: '+91 9833445566',
        currentCompany: 'Wipro',
        currentCtc: 1300000,
        expectedCtc: 1700000,
        noticePeriodDays: 15,
        status: 'Screening',
        rating: 4,
        notes: 'Great hands-on Kubernetes and Terraform experience.',
      },
    ]);

    // 15. Seed Training & Development Programs
    console.log('🎓 Seeding Training Programs & Assignments...');
    const [poshProgram, archProgram] = await TrainingProgram.create([
      {
        title: 'POSH & Workplace Ethics Compliance 2026',
        category: 'Compliance & POSH',
        trainerName: 'Advocate Radhika Swaminathan',
        description: 'Mandatory annual enterprise training on prevention of sexual harassment and workplace inclusion.',
        startDate: new Date(currentYear, 1, 1),
        endDate: new Date(currentYear, 11, 31),
        durationHours: 4,
        mode: 'Online',
        status: 'In Progress',
      },
      {
        title: 'Advanced Microservices & Distributed Caching',
        category: 'Technical',
        trainerName: 'Dr. Alok Sen (Cloud Architect)',
        description: 'Deep dive into high-throughput Redis clustering, event messaging, and idempotent APIs.',
        startDate: new Date(currentYear, 3, 10),
        endDate: new Date(currentYear, 3, 25),
        durationHours: 16,
        mode: 'Hybrid',
        status: 'Scheduled',
      },
    ]);

    await TrainingAssignment.create([
      {
        programId: poshProgram._id,
        employeeId: devEmp._id,
        status: 'Completed',
        score: 95,
        feedback: 'Very thorough and informative compliance module.',
        completedDate: new Date(),
      },
      {
        programId: poshProgram._id,
        employeeId: probationEmp._id,
        status: 'In Progress',
      },
      {
        programId: archProgram._id,
        employeeId: devEmp._id,
        status: 'Enrolled',
      },
    ]);

    // 16. Seed Assets Inventory
    console.log('💻 Seeding Asset Management...');
    const [laptop1, laptop2, monitor1] = await Asset.create([
      {
        assetTag: 'PRV-AST-0101',
        name: 'Apple MacBook Pro M3 (16GB/512GB)',
        category: 'Laptop',
        serialNumber: 'C02G1234MD6R',
        purchaseCost: 189900,
        condition: 'Good',
        status: 'Assigned',
        currentAssignedTo: devEmp._id,
      },
      {
        assetTag: 'PRV-AST-0102',
        name: 'Lenovo ThinkPad T14 Gen 4 (32GB/1TB)',
        category: 'Laptop',
        serialNumber: 'PF4X9876',
        purchaseCost: 115000,
        condition: 'Good',
        status: 'Assigned',
        currentAssignedTo: managerEmp._id,
      },
      {
        assetTag: 'PRV-AST-0201',
        name: 'Dell UltraSharp 27-inch 4K Monitor (U2723QE)',
        category: 'Monitor',
        serialNumber: 'CN-0M7890',
        purchaseCost: 48000,
        condition: 'New',
        status: 'Available',
      },
    ]);

    await AssetAssignment.create([
      {
        assetId: laptop1._id,
        employeeId: devEmp._id,
        assignedBy: adminUser._id,
        conditionAtAssignment: 'Good',
        notes: 'Handed over on engineering onboarding',
        status: 'Active',
      },
      {
        assetId: laptop2._id,
        employeeId: managerEmp._id,
        assignedBy: adminUser._id,
        conditionAtAssignment: 'Good',
        notes: 'Allocated for technical leadership duties',
        status: 'Active',
      },
    ]);

    // 17. Seed Expense Claims
    console.log('💳 Seeding Expense Claims...');
    await ExpenseClaim.create([
      {
        employeeId: devEmp._id,
        title: 'High-Speed Broadband Reimbursement',
        category: 'Transport & Fuel',
        amount: 2360,
        date: new Date(currentYear, today.getMonth(), 1),
        description: 'Monthly fiber internet connection bill for remote sprint delivery.',
        status: 'Approved',
        approvedBy: managerUser._id,
        reviewedAt: new Date(),
        reviewRemarks: 'Approved according to WFH policy.',
      },
      {
        employeeId: recruiterEmp._id,
        title: 'Client Campus Drive Catering & Lunch',
        category: 'Food & Dining',
        amount: 4500,
        date: new Date(currentYear, today.getMonth(), 5),
        description: 'Lunch with university placement cell officers for campus hires.',
        status: 'Pending',
      },
    ]);

    // 18. Seed Grievances & HR Helpdesk
    console.log('📬 Seeding Grievance Tickets...');
    await Grievance.create([
      {
        ticketNumber: 'GRV-2026-0001',
        employeeId: devEmp._id,
        category: 'Facility & Work Environment',
        priority: 'Medium',
        subject: 'Air Conditioning balance on 7th floor east wing',
        description: 'The AC cooling vents near workstations 40-48 are extremely cold during morning hours.',
        status: 'Resolved',
        assignedTo: hrUser._id,
        resolvedDate: new Date(),
        resolutionNotes: 'Facilities team adjusted damper settings and temperature set to 24C.',
      },
      {
        ticketNumber: 'GRV-2026-0002',
        employeeId: probationEmp._id,
        category: 'Policy Clarification',
        priority: 'Low',
        subject: 'Clarification on probation confirmation timeline and appraisal',
        description: 'Requesting guidance on the 6-month probation review milestones.',
        status: 'Open',
        assignedTo: hrUser._id,
      },
    ]);

    // 19. Seed Announcements
    console.log('📢 Seeding Announcements...');
    await Announcement.create([
      {
        title: 'Welcome to PR VISION HRMS Master Platform',
        message: 'PR VISION INNOVATIONS has rolled out our unified enterprise Human Resource Management System. Manage attendance, leaves, payroll, assets, and performance in one place.',
        priority: 'High',
        category: 'Company Update',
        publishedBy: adminUser._id,
        isPinned: true,
      },
      {
        title: 'Annual Health Check-up Camp Scheduled for Next Week',
        message: 'Comprehensive annual medical checkups will be conducted at Bengaluru HQ and Mumbai branch in partnership with Apollo Clinics. Booking slots open on HR portal.',
        priority: 'Normal',
        category: 'Events',
        publishedBy: hrUser._id,
        isPinned: false,
      },
    ]);

    // 20. Seed Audit Logs
    console.log('📜 Seeding Audit Logs...');
    await AuditLog.create([
      {
        actorId: adminUser._id,
        actorEmail: adminUser.email,
        actorRole: adminUser.role,
        action: 'SYSTEM_INITIALIZED',
        entity: 'CompanySettings',
        entityId: company._id,
        details: { companyName: 'PR VISION INNOVATIONS', setupBy: 'Rajiv Verma' },
        ipAddress: '127.0.0.1',
      },
      {
        actorId: hrUser._id,
        actorEmail: hrUser.email,
        actorRole: hrUser.role,
        action: 'EMPLOYEE_CREATED',
        entity: 'Employee',
        entityId: probationEmp._id,
        details: { employeeId: 'PRV-0007', name: 'Sneha Rao', stage: 'Probation' },
        ipAddress: '127.0.0.1',
      },
    ]);

    console.log('\n======================================================');
    console.log('✅ PR VISION HRMS ENTERPRISE SEEDING COMPLETED!');
    console.log('======================================================');
    console.log('Master Company: PR VISION INNOVATIONS (Tagline: People. Process. Performance.)');
    console.log('Demo Credentials for All 6 Core Roles (Password for all: Password@123)');
    console.log('  1. ADMIN         : admin@prvision.com');
    console.log('  2. HR_MANAGER    : hr@prvision.com');
    console.log('  3. MANAGER       : manager@prvision.com');
    console.log('  4. EMPLOYEE      : employee@prvision.com');
    console.log('  5. RECRUITER     : recruiter@prvision.com');
    console.log('  6. PAYROLL_ADMIN : payroll@prvision.com');
    console.log('======================================================\n');

    if (disconnect) {
      await disconnectDB();
    }
  } catch (error) {
    console.error('❌ Seeding failed with error:', error);
    if (disconnect) {
      await disconnectDB();
    }
    throw error;
  }
};

// Execute directly if run as a script
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
