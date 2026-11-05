import { z } from 'zod';
import SalaryStructure from '../../models/SalaryStructure.js';
import PayrollRun from '../../models/PayrollRun.js';
import Payslip from '../../models/Payslip.js';
import Employee from '../../models/Employee.js';
import Tenant from '../../models/Tenant.js';
import { PAYROLL_STATUS, ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { generatePayslipPDF } from '../../utils/pdfGenerator.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const salaryStructureSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  basicSalary: z.number().min(0, 'Basic salary cannot be negative'),
  hra: z.number().min(0).default(0),
  specialAllowance: z.number().min(0).default(0),
  customComponents: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['earning', 'deduction']),
        calculationType: z.enum(['flat', 'percentage_of_basic', 'percentage_of_gross']).default('flat'),
        value: z.number(),
        isStatutory: z.boolean().default(false),
      })
    )
    .default([]),
  statutoryConfig: z
    .object({
      pfEnabled: z.boolean().default(true),
      pfEmployeeRate: z.number().default(12),
      esiEnabled: z.boolean().default(false),
      esiEmployeeRate: z.number().default(0.75),
      professionalTax: z.number().default(200),
      tdsDeduction: z.number().default(0),
      isVerifiedByProfessional: z.boolean().default(false),
    })
    .default({}),
});

/**
 * Get or configure salary structure for an employee
 */
export const getSalaryStructure = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const structure = await SalaryStructure.findOne({
      tenantId: req.tenantId,
      employeeId,
      isActive: true,
    }).populate('employeeId', 'firstName lastName employeeId email');

    return sendSuccess(res, 'Salary structure retrieved.', { structure });
  } catch (error) {
    next(error);
  }
};

export const saveSalaryStructure = async (req, res, next) => {
  try {
    const validated = salaryStructureSchema.parse(req.body);

    // Deactivate previous active structures for this employee
    await SalaryStructure.updateMany(
      { tenantId: req.tenantId, employeeId: validated.employeeId },
      { isActive: false }
    );

    const structure = await SalaryStructure.create({
      tenantId: req.tenantId,
      employeeId: validated.employeeId,
      basicSalary: validated.basicSalary,
      hra: validated.hra,
      specialAllowance: validated.specialAllowance,
      customComponents: validated.customComponents,
      statutoryConfig: validated.statutoryConfig,
      isActive: true,
    });

    await logAudit({
      req,
      action: 'SALARY_STRUCTURE_UPDATED',
      entity: 'SalaryStructure',
      entityId: structure._id,
      details: { employeeId: validated.employeeId, basicSalary: validated.basicSalary },
    });

    return sendSuccess(res, 'Salary structure saved successfully.', { structure }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Generate monthly payroll batch
 */
export const generatePayrollRun = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { month, year, notes } = req.body;

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    // Check if run already exists
    let run = await PayrollRun.findOne({ tenantId, month: parsedMonth, year: parsedYear });
    if (run && run.status === PAYROLL_STATUS.PAID) {
      return sendError(res, `Payroll for ${parsedMonth}/${parsedYear} is already marked as Paid and finalized.`, [], 400);
    }

    if (!run) {
      run = await PayrollRun.create({
        tenantId,
        month: parsedMonth,
        year: parsedYear,
        status: PAYROLL_STATUS.PROCESSING,
        processedBy: req.user._id,
        notes: notes || '',
      });
    } else {
      // Clear previous draft payslips to regenerate fresh
      await Payslip.deleteMany({ tenantId, payrollRunId: run._id });
      run.status = PAYROLL_STATUS.PROCESSING;
      await run.save();
    }

    // Find all active employees in this tenant
    const activeEmployees = await Employee.find({ tenantId, isDeleted: false, employmentStatus: 'Active' });

    let runTotalGross = 0;
    let runTotalDeductions = 0;
    let runTotalNet = 0;
    let count = 0;

    for (const emp of activeEmployees) {
      // Find salary structure
      const salary = await SalaryStructure.findOne({ tenantId, employeeId: emp._id, isActive: true });
      if (!salary) continue;

      const basic = salary.basicSalary || 0;
      const earnings = [
        { name: 'House Rent Allowance (HRA)', amount: salary.hra || 0 },
        { name: 'Special Allowance', amount: salary.specialAllowance || 0 },
      ];

      // Add custom earnings
      for (const comp of salary.customComponents || []) {
        if (comp.type === 'earning') {
          let amt = comp.value;
          if (comp.calculationType === 'percentage_of_basic') {
            amt = Math.round((basic * comp.value) / 100);
          }
          earnings.push({ name: comp.name, amount: amt });
        }
      }

      const gross = basic + earnings.reduce((sum, item) => sum + item.amount, 0);

      // Deductions
      const deductions = [];
      const { pfEnabled, pfEmployeeRate, esiEnabled, esiEmployeeRate, professionalTax, tdsDeduction } =
        salary.statutoryConfig || {};

      if (pfEnabled) {
        const pfAmount = Math.round((basic * (pfEmployeeRate || 12)) / 100);
        deductions.push({ name: `Provident Fund (${pfEmployeeRate || 12}%)`, amount: pfAmount });
      }

      if (esiEnabled) {
        const esiAmount = Math.round((gross * (esiEmployeeRate || 0.75)) / 100);
        deductions.push({ name: `ESI (${esiEmployeeRate || 0.75}%)`, amount: esiAmount });
      }

      if (professionalTax) {
        deductions.push({ name: 'Professional Tax (PT)', amount: professionalTax });
      }

      if (tdsDeduction) {
        deductions.push({ name: 'Tax Deducted at Source (TDS)', amount: tdsDeduction });
      }

      // Add custom deductions
      for (const comp of salary.customComponents || []) {
        if (comp.type === 'deduction') {
          let amt = comp.value;
          if (comp.calculationType === 'percentage_of_gross') {
            amt = Math.round((gross * comp.value) / 100);
          }
          deductions.push({ name: comp.name, amount: amt });
        }
      }

      const totalDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);
      const netSalary = Math.max(0, gross - totalDeductions);

      const payslipNumber = `PS-${parsedYear}${String(parsedMonth).padStart(2, '0')}-${emp.employeeId}`;

      await Payslip.create({
        tenantId,
        payrollRunId: run._id,
        employeeId: emp._id,
        month: parsedMonth,
        year: parsedYear,
        payslipNumber,
        basicSalary: basic,
        earnings,
        deductions,
        grossSalary: gross,
        totalDeductions,
        netSalary,
        workingDays: 30,
        presentDays: 30,
        paymentStatus: 'Pending',
      });

      runTotalGross += gross;
      runTotalDeductions += totalDeductions;
      runTotalNet += netSalary;
      count++;
    }

    run.totalEmployees = count;
    run.totalGrossSalary = runTotalGross;
    run.totalDeductions = runTotalDeductions;
    run.totalNetSalary = runTotalNet;
    run.status = PAYROLL_STATUS.APPROVED; // ready for payout
    await run.save();

    await logAudit({
      req,
      action: 'PAYROLL_PROCESSED',
      entity: 'PayrollRun',
      entityId: run._id,
      details: { month: parsedMonth, year: parsedYear, employeeCount: count, totalNetSalary: runTotalNet },
    });

    return sendSuccess(res, `Payroll for ${parsedMonth}/${parsedYear} processed for ${count} employees.`, { run });
  } catch (error) {
    next(error);
  }
};

/**
 * List all payroll runs
 */
export const getPayrollRuns = async (req, res, next) => {
  try {
    const runs = await PayrollRun.find({ tenantId: req.tenantId })
      .sort({ year: -1, month: -1 })
      .populate('processedBy', 'name email')
      .populate('approvedBy', 'name email');

    return sendSuccess(res, 'Payroll runs retrieved.', { runs });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark payroll run as Paid
 */
export const markPayrollPaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    const run = await PayrollRun.findOne({ _id: id, tenantId: req.tenantId });

    if (!run) {
      return sendError(res, 'Payroll run not found.', [], 404);
    }

    run.status = PAYROLL_STATUS.PAID;
    run.paymentDate = new Date();
    run.approvedBy = req.user._id;
    await run.save();

    // Update all payslips in this run to Paid
    await Payslip.updateMany(
      { tenantId: req.tenantId, payrollRunId: run._id },
      { paymentStatus: 'Paid', paymentDate: new Date() }
    );

    await logAudit({
      req,
      action: 'PAYROLL_PAID',
      entity: 'PayrollRun',
      entityId: run._id,
      details: { month: run.month, year: run.year, totalNetSalary: run.totalNetSalary },
    });

    return sendSuccess(res, `Payroll run marked as Paid.`, { run });
  } catch (error) {
    next(error);
  }
};

/**
 * List Payslips (Filtered by employee or current user)
 */
export const getPayslips = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { employeeId, month, year, page = 1, limit = 20 } = req.query;

    const query = { tenantId };

    // Employee isolation: Employees only see their own payslips
    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ tenantId, userId: req.user._id });
      if (!myEmp) return sendSuccess(res, 'No employee record found.', { payslips: [] });
      query.employeeId = myEmp._id;
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (month) query.month = parseInt(month, 10);
    if (year) query.year = parseInt(year, 10);

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Payslip.countDocuments(query);
    const payslips = await Payslip.find(query)
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('employeeId', 'firstName lastName employeeId departmentId designationId');

    return sendSuccess(res, 'Payslips retrieved.', {
      payslips,
      pagination: {
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download Payslip as PDF (with role & tenant verification)
 */
export const downloadPayslipPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const payslip = await Payslip.findOne({ _id: id, tenantId });
    if (!payslip) {
      return sendError(res, 'Payslip not found.', [], 404);
    }

    // Tenant employee authorization check
    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ tenantId, userId: req.user._id });
      if (!myEmp || payslip.employeeId.toString() !== myEmp._id.toString()) {
        return sendError(res, 'Access denied. You cannot access another employee’s payslip.', [], 403);
      }
    }

    const employee = await Employee.findById(payslip.employeeId)
      .populate('departmentId')
      .populate('designationId');

    const tenant = await Tenant.findById(tenantId);

    const pdfBuffer = await generatePayslipPDF({ payslip, employee, tenant });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payslip.payslipNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

