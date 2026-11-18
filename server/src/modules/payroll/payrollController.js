import { z } from 'zod';
import SalaryStructure from '../../models/SalaryStructure.js';
import PayrollRun from '../../models/PayrollRun.js';
import Payslip from '../../models/Payslip.js';
import Employee from '../../models/Employee.js';
import Shift from '../../models/Shift.js';
import Holiday from '../../models/Holiday.js';
import Attendance from '../../models/Attendance.js';
import LeaveRequest from '../../models/LeaveRequest.js';
import CompanySettings from '../../models/CompanySettings.js';
import PayrollAdjustment from '../../models/PayrollAdjustment.js';
import {
  ATTENDANCE_STATUS,
  LEAVE_STATUS,
  LIFECYCLE_STAGES,
  PAYROLL_STATUS,
  ROLES,
} from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { isPayrollPrivileged, isValidObjectId } from '../../utils/securityUtils.js';
import { generatePayslipPDF } from '../../utils/pdfGenerator.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const toLocalDateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const INACTIVE_EXIT_STAGES = new Set([
  LIFECYCLE_STAGES.RESIGNED,
  LIFECYCLE_STAGES.TERMINATED,
  LIFECYCLE_STAGES.RELIEVED,
]);

const salaryStructureSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  basicSalary: z.coerce.number().min(0, 'Basic salary cannot be negative'),
  hra: z.coerce.number().min(0).default(0),
  specialAllowance: z.coerce.number().min(0).default(0),
  conveyanceAllowance: z.coerce.number().min(0).default(0),
  customComponents: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        type: z.enum(['earning', 'deduction']),
        calculationType: z.enum(['flat', 'percentage_of_basic', 'percentage_of_gross']).default('flat'),
        value: z.coerce.number().min(0),
        isStatutory: z.boolean().default(false),
      })
    )
    .default([]),
  statutoryConfig: z
    .object({
      pfEnabled: z.boolean().default(true),
      pfEmployeeRate: z.coerce.number().min(0).max(100).default(12),
      esiEnabled: z.boolean().default(false),
      esiEmployeeRate: z.coerce.number().min(0).max(100).default(0.75),
      professionalTax: z.coerce.number().min(0).default(200),
      tdsDeduction: z.coerce.number().min(0).default(0),
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
      employeeId,
      isActive: true,
    })
      .populate('employeeId', 'firstName lastName employeeId email')
      .lean();

    return sendSuccess(res, 'Salary structure retrieved.', { structure });
  } catch (error) {
    next(error);
  }
};

export const saveSalaryStructure = async (req, res, next) => {
  try {
    const validated = salaryStructureSchema.parse(req.body);
    if (!isValidObjectId(validated.employeeId)) {
      return sendError(res, 'Invalid employee ID format.', [], 400);
    }

    const employee = await Employee.findOne({ _id: validated.employeeId, isDeleted: false })
      .select('_id')
      .lean();
    if (!employee) {
      return sendError(res, 'Employee not found.', [], 404);
    }

    // Deactivate previous active structures for this employee
    await SalaryStructure.updateMany(
      { employeeId: validated.employeeId },
      { isActive: false }
    );

    const structure = await SalaryStructure.create({
      employeeId: validated.employeeId,
      basicSalary: validated.basicSalary,
      hra: validated.hra,
      specialAllowance: validated.specialAllowance,
      conveyanceAllowance: validated.conveyanceAllowance,
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
 * Generate monthly payroll batch with real working days, holiday exclusion,
 * attendance/LWP proration, and full salary structure components.
 */
export const generatePayrollRun = async (req, res, next) => {
  try {
    const { month, year, notes, strictAttendance = false } = req.body;

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);
    if (
      Number.isNaN(parsedMonth) ||
      parsedMonth < 1 ||
      parsedMonth > 12 ||
      Number.isNaN(parsedYear) ||
      parsedYear < 2000 ||
      parsedYear > 2100
    ) {
      return sendError(res, 'Valid payroll month (1-12) and year (2000-2100) are required.', [], 400);
    }

    // Check if run already exists & guard finalized/locked runs
    let run = await PayrollRun.findOne({ month: parsedMonth, year: parsedYear });
    if (run && (run.status === PAYROLL_STATUS.PAID || run.isLocked)) {
      return sendError(
        res,
        `Payroll for ${parsedMonth}/${parsedYear} is already finalized/locked and cannot be regenerated.`,
        [],
        400
      );
    }

    const monthStart = new Date(parsedYear, parsedMonth - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(parsedYear, parsedMonth, 0, 23, 59, 59, 999);
    const totalCalendarDays = monthEnd.getDate();

    // Fetch all non-deleted employees who joined on or before monthEnd (including Probation/Confirmed/Promoted/Active)
    const candidateEmployees = await Employee.find({
      isDeleted: false,
      joiningDate: { $lte: monthEnd },
    })
      .select('_id employeeId branchId shiftId joiningDate lastWorkingDate employmentStatus')
      .lean();

    const activeEmployees = candidateEmployees.filter((emp) => {
      if (!INACTIVE_EXIT_STAGES.has(emp.employmentStatus)) {
        return true;
      }
      return Boolean(emp.lastWorkingDate && new Date(emp.lastWorkingDate) >= monthStart);
    });

    const empIds = activeEmployees.map((emp) => emp._id);

    const [activeSalaries, defaultShift, allShifts, monthHolidays, monthAttendances, monthLeaves] =
      await Promise.all([
        empIds.length > 0
          ? SalaryStructure.find({
              employeeId: { $in: empIds },
              isActive: true,
            }).lean()
          : [],
        Shift.findOne({ isDefault: true, isActive: true }).select('weeklyOffDays').lean(),
        Shift.find({ isActive: true }).select('_id weeklyOffDays').lean(),
        Holiday.find({
          date: { $gte: monthStart, $lte: monthEnd },
          isOptional: { $ne: true },
        })
          .select('date branchId')
          .lean(),
        empIds.length > 0
          ? Attendance.find({
              employeeId: { $in: empIds },
              date: { $gte: monthStart, $lte: monthEnd },
            })
              .select('employeeId date status')
              .lean()
          : [],
        empIds.length > 0
          ? LeaveRequest.find({
              employeeId: { $in: empIds },
              status: LEAVE_STATUS.APPROVED,
              startDate: { $lte: monthEnd },
              endDate: { $gte: monthStart },
            })
              .populate('leaveTypeId', 'isPaid name')
              .select('employeeId startDate endDate leaveTypeId')
              .lean()
          : [],
      ]);

    const salaryByEmpId = new Map(activeSalaries.map((s) => [s.employeeId.toString(), s]));
    const shiftById = new Map(allShifts.map((s) => [s._id.toString(), s]));
    const defaultWeeklyOffs = defaultShift?.weeklyOffDays || [0, 6];

    const attendanceByEmpDate = new Map();
    for (const att of monthAttendances) {
      attendanceByEmpDate.set(`${att.employeeId.toString()}:${toLocalDateKey(att.date)}`, att.status);
    }

    const leavesByEmpId = new Map();
    for (const lr of monthLeaves) {
      const k = lr.employeeId.toString();
      if (!leavesByEmpId.has(k)) leavesByEmpId.set(k, []);
      leavesByEmpId.get(k).push(lr);
    }

    if (!run) {
      run = await PayrollRun.create({
        month: parsedMonth,
        year: parsedYear,
        status: PAYROLL_STATUS.PROCESSING,
        processedBy: req.user._id,
        notes: notes || '',
      });
    } else {
      await Promise.all([
        Payslip.deleteMany({ payrollRunId: run._id }),
        PayrollAdjustment.updateMany(
          { appliedPayrollRunId: run._id, status: 'Applied' },
          { $set: { status: 'Approved', appliedPayrollRunId: null, appliedPayslipId: null, appliedAt: null } }
        ),
      ]);
      run.status = PAYROLL_STATUS.PROCESSING;
      run.processedBy = req.user._id;
      if (notes !== undefined) run.notes = notes;
      await run.save();
    }

    const approvedAdjustments =
      empIds.length > 0
        ? await PayrollAdjustment.find({
            employeeId: { $in: empIds },
            status: 'Approved',
            $or: [
              { targetMonth: null },
              { targetMonth: parsedMonth, targetYear: parsedYear },
            ],
          }).lean()
        : [];

    const adjustmentsByEmpId = new Map();
    for (const adj of approvedAdjustments) {
      const k = adj.employeeId.toString();
      if (!adjustmentsByEmpId.has(k)) adjustmentsByEmpId.set(k, []);
      adjustmentsByEmpId.get(k).push(adj);
    }

    let runTotalGross = 0;
    let runTotalDeductions = 0;
    let runTotalNet = 0;
    const payslipsToInsert = [];
    const pendingSettlements = [];

    for (const emp of activeEmployees) {
      const salary = salaryByEmpId.get(emp._id.toString());
      if (!salary) continue;

      const empShift = emp.shiftId ? shiftById.get(emp.shiftId.toString()) : null;
      const weeklyOffSet = new Set(empShift?.weeklyOffDays || defaultWeeklyOffs);
      const branchHolidayKeys = new Set(
        monthHolidays
          .filter(
            (h) =>
              !h.branchId ||
              (emp.branchId && h.branchId.toString() === emp.branchId.toString())
          )
          .map((h) => toLocalDateKey(h.date))
      );

      // Compute scheduled working dates in month (excluding weekly offs & non-optional holidays)
      const scheduledWorkingDates = [];
      let holidayCount = 0;
      for (let day = 1; day <= totalCalendarDays; day++) {
        const dt = new Date(parsedYear, parsedMonth - 1, day, 12, 0, 0, 0);
        if (weeklyOffSet.has(dt.getDay())) continue;
        const key = toLocalDateKey(dt);
        if (branchHolidayKeys.has(key)) {
          holidayCount += 1;
          continue;
        }
        scheduledWorkingDates.push(dt);
      }

      const workingDays = Math.max(1, scheduledWorkingDates.length);
      const empIdStr = emp._id.toString();
      const empLeaves = leavesByEmpId.get(empIdStr) || [];

      const joinDt = new Date(emp.joiningDate);
      const effectiveStart = new Date(joinDt.getFullYear(), joinDt.getMonth(), joinDt.getDate(), 0, 0, 0, 0);
      const exitDt =
        INACTIVE_EXIT_STAGES.has(emp.employmentStatus) && emp.lastWorkingDate
          ? new Date(emp.lastWorkingDate)
          : null;
      const effectiveEnd = exitDt
        ? new Date(exitDt.getFullYear(), exitDt.getMonth(), exitDt.getDate(), 23, 59, 59, 999)
        : monthEnd;

      let attendedDays = 0;
      let paidLeaveDays = 0;
      let unpaidLeaveDays = 0;
      let absentDays = 0;
      let halfDays = 0;
      let unservedDays = 0;
      let lopDays = 0;

      for (const workDate of scheduledWorkingDates) {
        if (workDate < effectiveStart || workDate > effectiveEnd) {
          unservedDays += 1;
          lopDays += 1;
          continue;
        }

        const key = toLocalDateKey(workDate);
        const attStatus = attendanceByEmpDate.get(`${empIdStr}:${key}`);
        const overlappingLeave = empLeaves.find((lr) => {
          const s = new Date(lr.startDate);
          const e = new Date(lr.endDate);
          const sDay = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
          const eDay = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
          return workDate >= sDay && workDate <= eDay;
        });

        if (attStatus === ATTENDANCE_STATUS.ABSENT) {
          absentDays += 1;
          lopDays += 1;
        } else if (attStatus === ATTENDANCE_STATUS.HALF_DAY) {
          halfDays += 1;
          if (overlappingLeave && overlappingLeave.leaveTypeId?.isPaid !== false) {
            attendedDays += 0.5;
            paidLeaveDays += 0.5;
          } else {
            attendedDays += 0.5;
            lopDays += 0.5;
          }
        } else if (attStatus === ATTENDANCE_STATUS.PRESENT || attStatus === ATTENDANCE_STATUS.LATE) {
          attendedDays += 1;
        } else if (overlappingLeave) {
          if (overlappingLeave.leaveTypeId?.isPaid === false) {
            unpaidLeaveDays += 1;
            lopDays += 1;
          } else {
            paidLeaveDays += 1;
          }
        } else if (attStatus === ATTENDANCE_STATUS.ON_LEAVE) {
          // Marked On Leave in Attendance without explicit unpaid LeaveRequest -> paid leave
          paidLeaveDays += 1;
        } else if (strictAttendance) {
          lopDays += 1;
        }
      }

      const presentDays = Math.max(0, Math.round((workingDays - lopDays) * 10) / 10);
      const prorationFactor = workingDays > 0 ? Math.max(0, Math.min(1, presentDays / workingDays)) : 0;

      const baseBasic = salary.basicSalary || 0;
      const baseHra = salary.hra || 0;
      const baseSpecial = salary.specialAllowance || 0;
      const baseConveyance = salary.conveyanceAllowance || 0;

      const earnedBasic = Math.round(baseBasic * prorationFactor);
      const earnedHra = Math.round(baseHra * prorationFactor);
      const earnedSpecial = Math.round(baseSpecial * prorationFactor);
      const earnedConveyance = Math.round(baseConveyance * prorationFactor);

      const earnings = [
        { name: 'House Rent Allowance (HRA)', amount: earnedHra },
        { name: 'Special Allowance', amount: earnedSpecial },
      ];
      if (baseConveyance > 0) {
        earnings.push({ name: 'Conveyance Allowance', amount: earnedConveyance });
      }

      const customGrossEarnings = [];
      for (const comp of salary.customComponents || []) {
        if (comp.type !== 'earning') continue;
        if (comp.calculationType === 'percentage_of_gross') {
          customGrossEarnings.push(comp);
          continue;
        }
        let amt = comp.value;
        if (comp.calculationType === 'percentage_of_basic') {
          amt = (baseBasic * comp.value) / 100;
        }
        earnings.push({ name: comp.name, amount: Math.round(amt * prorationFactor) });
      }

      const preCustomGross = earnedBasic + earnings.reduce((sum, item) => sum + item.amount, 0);
      for (const comp of customGrossEarnings) {
        earnings.push({
          name: comp.name,
          amount: Math.round((preCustomGross * comp.value) / 100),
        });
      }

      const empAdjustments = adjustmentsByEmpId.get(empIdStr) || [];
      for (const adj of empAdjustments) {
        if (adj.adjustmentType === 'CREDIT' && adj.amount > 0) {
          earnings.push({
            name: `Leave Adjustment Credit (${adj.sourceMonth}/${adj.sourceYear})`,
            amount: adj.amount,
          });
        }
      }

      const gross = earnedBasic + earnings.reduce((sum, item) => sum + item.amount, 0);
      const fullMonthGross =
        baseBasic +
        baseHra +
        baseSpecial +
        baseConveyance +
        (salary.customComponents || [])
          .filter((c) => c.type === 'earning' && c.calculationType !== 'percentage_of_gross')
          .reduce(
            (sum, c) =>
              sum + (c.calculationType === 'percentage_of_basic' ? (baseBasic * c.value) / 100 : c.value),
            0
          );

      const deductions = [];
      const { pfEnabled, pfEmployeeRate, esiEnabled, esiEmployeeRate, professionalTax, tdsDeduction } =
        salary.statutoryConfig || {};

      if (pfEnabled && earnedBasic > 0) {
        const pfRate = pfEmployeeRate ?? 12;
        const pfAmount = Math.round((earnedBasic * pfRate) / 100);
        deductions.push({ name: `Provident Fund (${pfRate}%)`, amount: pfAmount });
      }

      if (esiEnabled && gross > 0) {
        const esiRate = esiEmployeeRate ?? 0.75;
        const esiAmount = Math.round((gross * esiRate) / 100);
        deductions.push({ name: `ESI (${esiRate}%)`, amount: esiAmount });
      }

      if (professionalTax && presentDays > 0) {
        deductions.push({ name: 'Professional Tax (PT)', amount: professionalTax });
      }

      if (tdsDeduction && presentDays > 0) {
        deductions.push({ name: 'Tax Deducted at Source (TDS)', amount: tdsDeduction });
      }

      for (const comp of salary.customComponents || []) {
        if (comp.type !== 'deduction') continue;
        if (presentDays === 0) continue;
        let amt = comp.value;
        if (comp.calculationType === 'percentage_of_gross') {
          amt = Math.round((gross * comp.value) / 100);
        } else if (comp.calculationType === 'percentage_of_basic') {
          amt = Math.round((earnedBasic * comp.value) / 100);
        }
        deductions.push({ name: comp.name, amount: amt });
      }

      for (const adj of empAdjustments) {
        if (adj.adjustmentType === 'DEDUCTION' && adj.amount > 0) {
          deductions.push({
            name: `Leave Adjustment Recovery (${adj.sourceMonth}/${adj.sourceYear})`,
            amount: adj.amount,
          });
        }
      }

      if (empAdjustments.length > 0) {
        pendingSettlements.push({
          employeeIdStr: empIdStr,
          adjustmentIds: empAdjustments.map((a) => a._id),
        });
      }

      const totalDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);
      const netSalary = Math.max(0, gross - totalDeductions);
      const payslipNumber = `PS-${parsedYear}${String(parsedMonth).padStart(2, '0')}-${emp.employeeId}`;

      payslipsToInsert.push({
        payrollRunId: run._id,
        employeeId: emp._id,
        month: parsedMonth,
        year: parsedYear,
        payslipNumber,
        basicSalary: earnedBasic,
        earnings,
        deductions,
        grossSalary: gross,
        totalDeductions,
        netSalary,
        workingDays,
        presentDays,
        lopDays,
        paymentStatus: 'Pending',
        calculationSnapshot: {
          calendarDays: totalCalendarDays,
          holidayCount,
          attendedDays,
          paidLeaveDays,
          unpaidLeaveDays,
          absentDays,
          halfDays,
          unservedDays,
          prorationFactor: Math.round(prorationFactor * 10000) / 10000,
          baseBasic,
          lopDeduction: Math.max(0, Math.round(fullMonthGross) - gross),
          strictAttendance: Boolean(strictAttendance),
        },
      });

      runTotalGross += gross;
      runTotalDeductions += totalDeductions;
      runTotalNet += netSalary;
    }

    if (payslipsToInsert.length > 0) {
      const insertedSlips = await Payslip.insertMany(payslipsToInsert);
      if (pendingSettlements.length > 0) {
        const slipIdByEmp = new Map(
          insertedSlips.map((s) => [s.employeeId.toString(), s._id])
        );
        const appliedAt = new Date();
        await Promise.all(
          pendingSettlements.map((item) =>
            PayrollAdjustment.updateMany(
              { _id: { $in: item.adjustmentIds }, status: 'Approved' },
              {
                $set: {
                  status: 'Applied',
                  appliedPayrollRunId: run._id,
                  appliedPayslipId: slipIdByEmp.get(item.employeeIdStr) || null,
                  appliedAt,
                },
              }
            )
          )
        );
      }
    }

    const count = payslipsToInsert.length;
    run.totalEmployees = count;
    run.totalGrossSalary = runTotalGross;
    run.totalDeductions = runTotalDeductions;
    run.totalNetSalary = runTotalNet;
    run.status = PAYROLL_STATUS.APPROVED;
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
    const { status, year } = req.query;
    const query = {};
    if (status) query.status = status;
    if (year) query.year = parseInt(year, 10);

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [runs, total] = await Promise.all([
      PayrollRun.find(query)
        .sort({ year: -1, month: -1 })
        .skip(skip)
        .limit(limit)
        .populate('processedBy', 'email')
        .populate('approvedBy', 'email')
        .lean(),
      PayrollRun.countDocuments(query),
    ]);

    return sendSuccess(res, 'Payroll runs retrieved.', {
      runs,
      pagination: buildPaginationMeta(total, page, limit),
    });
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
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid payroll run ID format.', [], 400);
    }
    const run = await PayrollRun.findById(id);

    if (!run) {
      return sendError(res, 'Payroll run not found.', [], 404);
    }
    if (run.status === PAYROLL_STATUS.PAID || run.isLocked) {
      return sendError(res, 'Payroll run has already been paid and locked.', [], 400);
    }

    const paidAt = new Date();
    run.status = PAYROLL_STATUS.PAID;
    run.paymentDate = paidAt;
    run.approvedBy = req.user._id;
    run.isLocked = true;
    await run.save();

    // Update all payslips in this run to Paid
    await Payslip.updateMany(
      { payrollRunId: run._id },
      { paymentStatus: 'Paid', paymentDate: paidAt }
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
    const { employeeId, month, year } = req.query;

    const query = {};

    // Strict Data Isolation: Non-privileged roles (Employee, Manager, Recruiter) can ONLY view their own payslips
    if (isPayrollPrivileged(req.user.role)) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        query.employeeId = employeeId;
      }
    } else {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile is linked to your user account.', [], 403);
      }
      if (employeeId && employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: You cannot view payslips belonging to another employee.', [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    }

    if (month) query.month = parseInt(month, 10);
    if (year) query.year = parseInt(year, 10);

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });

    const [payslips, total] = await Promise.all([
      Payslip.find(query)
        .sort({ year: -1, month: -1 })
        .skip(skip)
        .limit(limit)
        .populate('employeeId', 'firstName lastName employeeId departmentId designationId')
        .lean(),
      Payslip.countDocuments(query),
    ]);

    return sendSuccess(res, 'Payslips retrieved.', {
      payslips,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download Payslip as PDF
 */
export const downloadPayslipPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid payslip ID format.', [], 400);
    }

    const payslip = await Payslip.findById(id).lean();
    if (!payslip) {
      return sendError(res, 'Payslip not found.', [], 404);
    }

    // Role verification: Non-payroll privileged roles can only download their own payslip
    const isPrivileged = isPayrollPrivileged(req.user.role);

    if (!isPrivileged) {
      if (!req.verifiedEmployeeId || payslip.employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied. You cannot access another employee’s payslip.', [], 403);
      }
    }

    const [employee, company] = await Promise.all([
      Employee.findById(payslip.employeeId)
        .populate('departmentId')
        .populate('designationId')
        .populate('branchId')
        .lean(),
      CompanySettings.findOne().lean(),
    ]);

    const pdfBuffer = await generatePayslipPDF({ payslip, employee, company });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payslip.payslipNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * List Future Payroll Adjustments (strictly scoped by role)
 */
export const getPayrollAdjustments = async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;
    const query = {};

    if (isPayrollPrivileged(req.user.role)) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        query.employeeId = employeeId;
      }
    } else {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile linked to your account.', [], 403);
      }
      if (employeeId && employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: You can only view your own payroll adjustments.', [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    }

    if (status) query.status = status;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [adjustments, total] = await Promise.all([
      PayrollAdjustment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('employeeId', 'firstName lastName employeeId departmentId')
        .populate('leaveRequestId', 'startDate endDate totalDays cancellationReason status')
        .populate('createdBy', 'name email role')
        .populate('reviewedBy', 'name email role')
        .lean(),
      PayrollAdjustment.countDocuments(query),
    ]);

    return sendSuccess(res, 'Payroll adjustments retrieved.', {
      adjustments,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Review Future Payroll Adjustment (Approve for next payroll run or Waive)
 */
export const reviewPayrollAdjustment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, targetMonth, targetYear, reviewNotes } = req.body;

    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid payroll adjustment ID.', [], 400);
    }

    if (!['Approved', 'Waived'].includes(status)) {
      return sendError(res, "Status must be either 'Approved' or 'Waived'.", [], 400);
    }

    if (!isPayrollPrivileged(req.user.role) && req.user.role !== ROLES.PAYROLL_ADMIN) {
      return sendError(res, 'Access denied: Insufficient permissions to review payroll adjustments.', [], 403);
    }

    const adjustment = await PayrollAdjustment.findById(id);
    if (!adjustment) {
      return sendError(res, 'Payroll adjustment record not found.', [], 404);
    }

    if (adjustment.status === 'Applied') {
      return sendError(res, 'This adjustment has already been applied to a payroll run.', [], 400);
    }

    if (targetMonth !== undefined && targetMonth !== null && targetMonth !== '') {
      const m = parseInt(targetMonth, 10);
      if (Number.isNaN(m) || m < 1 || m > 12) {
        return sendError(res, 'Invalid target month (must be 1-12).', [], 400);
      }
      adjustment.targetMonth = m;
    }
    if (targetYear !== undefined && targetYear !== null && targetYear !== '') {
      const y = parseInt(targetYear, 10);
      if (Number.isNaN(y) || y < 2000 || y > 2100) {
        return sendError(res, 'Invalid target year (2000-2100).', [], 400);
      }
      adjustment.targetYear = y;
    }

    adjustment.status = status;
    adjustment.reviewedBy = req.user._id;
    adjustment.reviewedAt = new Date();
    if (reviewNotes !== undefined) adjustment.reviewNotes = String(reviewNotes).trim();

    await adjustment.save();

    await logAudit({
      req,
      action: `PAYROLL_ADJUSTMENT_${status.toUpperCase()}`,
      entity: 'PayrollAdjustment',
      entityId: adjustment._id,
      details: {
        employeeId: String(adjustment.employeeId),
        adjustmentType: adjustment.adjustmentType,
        days: adjustment.days,
        amount: adjustment.amount,
        status,
        targetMonth: adjustment.targetMonth,
        targetYear: adjustment.targetYear,
      },
    });

    return sendSuccess(res, `Payroll adjustment ${status.toLowerCase()}.`, { adjustment });
  } catch (error) {
    next(error);
  }
};
