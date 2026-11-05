import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Models
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
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
import Notification from '../models/Notification.js';

import { ROLES, TENANT_STATUS, ATTENDANCE_STATUS, LEAVE_STATUS, PAYROLL_STATUS } from '../config/constants.js';
import { connectDB, disconnectDB } from '../config/db.js';

dotenv.config();

export const seedDatabase = async ({ disconnect = true } = {}) => {
  try {
    console.log('🌱 Starting PR VISION HRMS Database Seeding...');
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    // Clear previous development demo data
    console.log('🧹 Purging development collections...');
    await Promise.all([
      User.deleteMany({}),
      Tenant.deleteMany({}),
      Plan.deleteMany({}),
      Subscription.deleteMany({}),
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
      Notification.deleteMany({}),
    ]);

    // 1. Seed SaaS Subscription Plans
    console.log('📦 Seeding Subscription Plans...');
    const plans = await Plan.create([
      {
        name: 'Free Trial',
        code: 'free_trial',
        description: 'Full feature trial for 30 days',
        priceMonthly: 0,
        priceYearly: 0,
        maxEmployees: 10,
        features: ['Up to 10 Employees', 'Attendance Tracking', 'Leave Management', 'Standard Reports'],
      },
      {
        name: 'Starter Plan',
        code: 'starter',
        description: 'For small businesses & growing startups',
        priceMonthly: 1499,
        priceYearly: 14990,
        maxEmployees: 25,
        features: ['Up to 25 Employees', 'Attendance & Shifts', 'Leave Workflows', 'Basic Payroll', 'CSV Exports'],
      },
      {
        name: 'Growth Plan',
        code: 'growth',
        description: 'Popular choice for expanding mid-size organizations',
        priceMonthly: 3999,
        priceYearly: 39990,
        maxEmployees: 100,
        features: [
          'Up to 100 Employees',
          'Full Payroll & Payslip PDF',
          'Recruitment Pipeline',
          'Performance Appraisals',
          'Document Vault',
          'Role Permissions',
        ],
      },
      {
        name: 'Enterprise Plan',
        code: 'enterprise',
        description: 'Unlimited capacity with dedicated SLAs and custom workflows',
        priceMonthly: 9999,
        priceYearly: 99990,
        maxEmployees: 1000,
        features: [
          'Unlimited Employees',
          'Priority 24/7 Support',
          'Custom Workflows',
          'Audit Compliance Logs',
          'Dedicated Success Manager',
        ],
      },
    ]);

    const growthPlan = plans.find((p) => p.code === 'growth');

    // 2. Seed Super Admin
    console.log('👑 Seeding Platform Super Admin...');
    const superAdmin = await User.create({
      tenantId: null,
      name: 'PR Vision Super Admin',
      email: 'superadmin@prvision.com',
      password: 'AdminPassword@123',
      role: ROLES.SUPER_ADMIN,
      isActive: true,
    });

    // 3. Seed Three Demo Companies (Tenants)
    console.log('🏢 Seeding 3 Demo Companies (Multi-Tenant Isolation Demo)...');
    const demoCompaniesData = [
      {
        name: 'PR VISION INNOVATIONS',
        slug: 'pr-vision-innovations',
        contactEmail: 'admin@prvision.com',
        contactPhone: '+91 9876543210',
        city: 'Bengaluru',
        state: 'Karnataka',
        adminName: 'Rajesh Sharma',
        adminEmail: 'rajesh.admin@prvision.com',
        hrName: 'Priya Iyer',
        hrEmail: 'priya.hr@prvision.com',
        mgrName: 'Vikram Malhotra',
        mgrEmail: 'vikram.mgr@prvision.com',
        empName: 'Ananya Roy',
        empEmail: 'ananya.emp@prvision.com',
      },
      {
        name: 'ABC Technologies',
        slug: 'abc-technologies',
        contactEmail: 'admin@abctech.com',
        contactPhone: '+91 9811122233',
        city: 'Hyderabad',
        state: 'Telangana',
        adminName: 'Arun Kumar',
        adminEmail: 'arun.admin@abctech.com',
        hrName: 'Neha Verma',
        hrEmail: 'neha.hr@abctech.com',
        mgrName: 'Karthik Rao',
        mgrEmail: 'karthik.mgr@abctech.com',
        empName: 'Suresh Raina',
        empEmail: 'suresh.emp@abctech.com',
      },
      {
        name: 'XYZ Solutions',
        slug: 'xyz-solutions',
        contactEmail: 'admin@xyzsolutions.com',
        contactPhone: '+91 9822233344',
        city: 'Mumbai',
        state: 'Maharashtra',
        adminName: 'Sunil Mehta',
        adminEmail: 'sunil.admin@xyzsolutions.com',
        hrName: 'Kavita Patel',
        hrEmail: 'kavita.hr@xyzsolutions.com',
        mgrName: 'Rohan Deshmukh',
        mgrEmail: 'rohan.mgr@xyzsolutions.com',
        empName: 'Deepak Joshi',
        empEmail: 'deepak.emp@xyzsolutions.com',
      },
    ];

    for (const comp of demoCompaniesData) {
      console.log(`  -> Initializing Tenant: ${comp.name}`);

      // Create Tenant
      const tenant = await Tenant.create({
        name: comp.name,
        slug: comp.slug,
        contactEmail: comp.contactEmail,
        contactPhone: comp.contactPhone,
        address: {
          street: 'Tech Park Blvd, Suite 400',
          city: comp.city,
          state: comp.state,
          country: 'India',
          postalCode: '560001',
        },
        businessInfo: {
          taxId: 'GSTIN29AAACP1234F1Z5',
          registrationNumber: 'CIN-U72200KA2024PTC189000',
          industry: 'Software & Technology',
        },
        planId: growthPlan._id,
        planName: growthPlan.name,
        employeeLimit: growthPlan.maxEmployees,
        status: TENANT_STATUS.ACTIVE,
      });

      // Create Subscription
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);

      await Subscription.create({
        tenantId: tenant._id,
        planId: growthPlan._id,
        status: 'active',
        billingCycle: 'yearly',
        amount: growthPlan.priceYearly,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        invoices: [
          {
            invoiceId: `INV-${Date.now().toString().slice(-6)}`,
            amount: growthPlan.priceYearly,
            paidAt: now,
            status: 'Paid',
          },
        ],
      });

      // Create Departments
      const hrDept = await Department.create({
        tenantId: tenant._id,
        name: 'Human Resources',
        code: 'HR',
        description: 'People Operations',
      });
      const engDept = await Department.create({
        tenantId: tenant._id,
        name: 'Engineering',
        code: 'ENG',
        description: 'Software & Cloud Engineering',
      });
      const mktDept = await Department.create({
        tenantId: tenant._id,
        name: 'Marketing & Sales',
        code: 'MKT',
        description: 'Growth and Revenue Operations',
      });

      // Create Designations
      const hrHeadDesig = await Designation.create({
        tenantId: tenant._id,
        departmentId: hrDept._id,
        title: 'HR Director',
        code: 'HR-DIR',
        level: 1,
      });
      const leadEngDesig = await Designation.create({
        tenantId: tenant._id,
        departmentId: engDept._id,
        title: 'Engineering Lead',
        code: 'ENG-LEAD',
        level: 2,
      });
      const srEngDesig = await Designation.create({
        tenantId: tenant._id,
        departmentId: engDept._id,
        title: 'Senior Software Engineer',
        code: 'ENG-SR',
        level: 3,
      });

      // Create Shift
      const shift = await Shift.create({
        tenantId: tenant._id,
        name: 'Regular Day Shift',
        startTime: '09:00',
        endTime: '18:00',
        breakDurationMinutes: 60,
        gracePeriodMinutes: 15,
        weeklyOffDays: [0, 6],
        isDefault: true,
      });

      // Create Leave Types
      const leaveTypes = await LeaveType.create([
        { tenantId: tenant._id, name: 'Paid / Annual Leave', code: 'AL', defaultDaysPerYear: 18, isPaid: true },
        { tenantId: tenant._id, name: 'Sick Leave', code: 'SL', defaultDaysPerYear: 10, isPaid: true },
        { tenantId: tenant._id, name: 'Casual Leave', code: 'CL', defaultDaysPerYear: 8, isPaid: true },
      ]);

      // Create Company Admin User
      const adminUser = await User.create({
        tenantId: tenant._id,
        name: comp.adminName,
        email: comp.adminEmail,
        password: 'Password@123',
        role: ROLES.COMPANY_ADMIN,
        isActive: true,
      });

      // Create HR Manager User & Employee
      const hrEmp = await Employee.create({
        tenantId: tenant._id,
        employeeId: 'EMP-001',
        firstName: comp.hrName.split(' ')[0],
        lastName: comp.hrName.split(' ')[1] || 'HR',
        email: comp.hrEmail,
        phone: '+91 9123456780',
        departmentId: hrDept._id,
        designationId: hrHeadDesig._id,
        shiftId: shift._id,
        joiningDate: new Date('2024-01-15'),
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
      });

      const hrUser = await User.create({
        tenantId: tenant._id,
        name: comp.hrName,
        email: comp.hrEmail,
        password: 'Password@123',
        role: ROLES.HR_MANAGER,
        employeeId: hrEmp._id,
        isActive: true,
      });
      hrEmp.userId = hrUser._id;
      await hrEmp.save();

      // Create Engineering Manager User & Employee
      const mgrEmp = await Employee.create({
        tenantId: tenant._id,
        employeeId: 'EMP-002',
        firstName: comp.mgrName.split(' ')[0],
        lastName: comp.mgrName.split(' ')[1] || 'Manager',
        email: comp.mgrEmail,
        phone: '+91 9123456781',
        departmentId: engDept._id,
        designationId: leadEngDesig._id,
        shiftId: shift._id,
        joiningDate: new Date('2024-02-01'),
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
      });

      const mgrUser = await User.create({
        tenantId: tenant._id,
        name: comp.mgrName,
        email: comp.mgrEmail,
        password: 'Password@123',
        role: ROLES.MANAGER,
        employeeId: mgrEmp._id,
        isActive: true,
      });
      mgrEmp.userId = mgrUser._id;
      await mgrEmp.save();

      // Create Employee reporting to Manager
      const devEmp = await Employee.create({
        tenantId: tenant._id,
        employeeId: 'EMP-003',
        firstName: comp.empName.split(' ')[0],
        lastName: comp.empName.split(' ')[1] || 'Engineer',
        email: comp.empEmail,
        phone: '+91 9123456782',
        departmentId: engDept._id,
        designationId: srEngDesig._id,
        managerId: mgrEmp._id,
        shiftId: shift._id,
        joiningDate: new Date('2024-03-10'),
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        bankDetails: {
          accountHolderName: comp.empName,
          accountNumber: '123456789012',
          bankName: 'HDFC Bank',
          ifscCode: 'HDFC0001234',
        },
      });

      const devUser = await User.create({
        tenantId: tenant._id,
        name: comp.empName,
        email: comp.empEmail,
        password: 'Password@123',
        role: ROLES.EMPLOYEE,
        employeeId: devEmp._id,
        isActive: true,
      });
      devEmp.userId = devUser._id;
      await devEmp.save();

      // Seed Leave Balances for Employees
      const currentYear = new Date().getFullYear();
      for (const emp of [hrEmp, mgrEmp, devEmp]) {
        await LeaveBalance.create({
          tenantId: tenant._id,
          employeeId: emp._id,
          year: currentYear,
          balances: leaveTypes.map((lt) => ({
            leaveTypeId: lt._id,
            allocated: lt.defaultDaysPerYear,
            used: 2,
            pending: 1,
            remaining: lt.defaultDaysPerYear - 3,
          })),
        });
      }

      // Sample Leave Request
      await LeaveRequest.create({
        tenantId: tenant._id,
        employeeId: devEmp._id,
        leaveTypeId: leaveTypes[0]._id,
        startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        totalDays: 2,
        reason: 'Attending family celebration and personal travel',
        status: LEAVE_STATUS.PENDING,
      });

      // Sample Attendance Records for today & past 3 days
      const today = new Date();
      for (let i = 0; i < 4; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const checkIn = new Date(d);
        checkIn.setHours(9, 10 + i * 2, 0);
        const checkOut = new Date(d);
        checkOut.setHours(18, 15, 0);

        for (const emp of [hrEmp, mgrEmp, devEmp]) {
          await Attendance.create({
            tenantId: tenant._id,
            employeeId: emp._id,
            date: new Date(d.setHours(0, 0, 0, 0)),
            checkInTime: checkIn,
            checkOutTime: checkOut,
            status: ATTENDANCE_STATUS.PRESENT,
            totalHours: 8.5,
            overtimeHours: 0.5,
          });
        }
      }

      // Sample Holidays
      await Holiday.create([
        {
          tenantId: tenant._id,
          name: 'New Year Day',
          date: new Date(`${currentYear}-01-01`),
          year: currentYear,
          description: 'Official Public Holiday',
        },
        {
          tenantId: tenant._id,
          name: 'Independence Day',
          date: new Date(`${currentYear}-08-15`),
          year: currentYear,
          description: 'National Holiday',
        },
        {
          tenantId: tenant._id,
          name: 'Festival of Lights (Diwali)',
          date: new Date(`${currentYear}-11-01`),
          year: currentYear,
          description: 'Company Observed Holiday',
        },
      ]);

      // Sample Salary Structures
      const salaryConfigs = [
        { emp: hrEmp, basic: 60000, hra: 24000, special: 16000 },
        { emp: mgrEmp, basic: 85000, hra: 34000, special: 21000 },
        { emp: devEmp, basic: 50000, hra: 20000, special: 15000 },
      ];

      for (const sc of salaryConfigs) {
        await SalaryStructure.create({
          tenantId: tenant._id,
          employeeId: sc.emp._id,
          basicSalary: sc.basic,
          hra: sc.hra,
          specialAllowance: sc.special,
          statutoryConfig: {
            pfEnabled: true,
            pfEmployeeRate: 12,
            esiEnabled: false,
            esiEmployeeRate: 0.75,
            professionalTax: 200,
            tdsDeduction: 2500,
            isVerifiedByProfessional: true,
          },
          isActive: true,
        });
      }

      // Sample Payroll Run & Payslips for Previous Month
      const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth();
      const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

      const run = await PayrollRun.create({
        tenantId: tenant._id,
        month: prevMonth,
        year: prevYear,
        status: PAYROLL_STATUS.PAID,
        totalEmployees: 3,
        totalGrossSalary: 290000,
        totalDeductions: 28700,
        totalNetSalary: 261300,
        processedBy: hrUser._id,
        approvedBy: adminUser._id,
        paymentDate: new Date(),
      });

      for (const sc of salaryConfigs) {
        const gross = sc.basic + sc.hra + sc.special;
        const pf = Math.round(sc.basic * 0.12);
        const pt = 200;
        const tds = 2500;
        const totDed = pf + pt + tds;
        const net = gross - totDed;

        await Payslip.create({
          tenantId: tenant._id,
          payrollRunId: run._id,
          employeeId: sc.emp._id,
          month: prevMonth,
          year: prevYear,
          payslipNumber: `PS-${prevYear}${String(prevMonth).padStart(2, '0')}-${sc.emp.employeeId}`,
          basicSalary: sc.basic,
          earnings: [
            { name: 'House Rent Allowance (HRA)', amount: sc.hra },
            { name: 'Special Allowance', amount: sc.special },
          ],
          deductions: [
            { name: 'Provident Fund (12%)', amount: pf },
            { name: 'Professional Tax', amount: pt },
            { name: 'TDS (Income Tax)', amount: tds },
          ],
          grossSalary: gross,
          totalDeductions: totDed,
          netSalary: net,
          workingDays: 30,
          presentDays: 30,
          paymentStatus: 'Paid',
          paymentDate: new Date(),
        });
      }

      // Sample Job Opening & Candidate
      const job = await JobOpening.create({
        tenantId: tenant._id,
        title: 'Full Stack MERN Developer',
        departmentId: engDept._id,
        designationId: srEngDesig._id,
        openingsCount: 2,
        location: 'Bengaluru / Hybrid',
        type: 'Full-Time',
        experienceRequired: '3-5 years',
        description: 'Looking for talented React and Node.js software engineers to scale our SaaS product.',
        requirements: ['3+ years with Node.js & React', 'MongoDB database indexing & aggregations', 'REST APIs & JWT'],
        status: 'Open',
      });

      await Candidate.create({
        tenantId: tenant._id,
        jobOpeningId: job._id,
        fullName: 'Sameer Sen',
        email: 'sameer.sen@candidate.dev',
        phone: '+91 9988776655',
        currentCompany: 'Infotech Ltd',
        currentCtc: 900000,
        expectedCtc: 1200000,
        noticePeriodDays: 30,
        status: 'Interviewing',
        rating: 4,
        notes: 'Strong in React hooks, Redux and Express architecture. Technical interview passed.',
      });

      // Sample Notification
      await Notification.create({
        tenantId: tenant._id,
        recipientId: devUser._id,
        title: 'Payslip Released',
        message: `Your payslip for ${prevMonth}/${prevYear} is now available for download.`,
        type: 'payroll',
        link: '/payroll',
      });
    }

    console.log('✅ Seeding completed successfully!');
    console.log('========================================================');
    console.log('📋 DEMO CREDENTIALS:');
    console.log('1. Platform Super Admin:');
    console.log('   Email: superadmin@prvision.com | Password: AdminPassword@123');
    console.log('2. Company 1 (PR VISION INNOVATIONS):');
    console.log('   Admin:    rajesh.admin@prvision.com  | Password: Password@123');
    console.log('   HR Mgr:   priya.hr@prvision.com      | Password: Password@123');
    console.log('   Manager:  vikram.mgr@prvision.com    | Password: Password@123');
    console.log('   Employee: ananya.emp@prvision.com    | Password: Password@123');
    console.log('3. Company 2 (ABC Technologies):');
    console.log('   Admin:    arun.admin@abctech.com     | Password: Password@123');
    console.log('4. Company 3 (XYZ Solutions):');
    console.log('   Admin:    sunil.admin@xyzsolutions.com | Password: Password@123');
    console.log('========================================================');
  } catch (error) {
    console.error('❌ Seeding failed with error:', error);
    process.exit(1);
  } finally {
    if (disconnect) {
      await disconnectDB();
    }
  }
};

// Auto-run if executed directly
if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase();
}

