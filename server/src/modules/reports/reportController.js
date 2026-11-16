import Employee from '../../models/Employee.js';
import Attendance from '../../models/Attendance.js';
import Payslip from '../../models/Payslip.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { sanitizeCsvCell } from '../../utils/securityUtils.js';

export const getEmployeeReport = async (req, res, next) => {
  try {
    const { format, branchId, departmentId } = req.query;
    const filter = { isDeleted: false };

    if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      filter.managerId = req.verifiedEmployeeId;
    }

    if (branchId) filter.branchId = branchId;
    if (departmentId) filter.departmentId = departmentId;

    const isCsv = format === 'csv';
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });

    // Strict projection: never expose bankDetails, salary history, or private PII in reports
    const empQuery = Employee.find(filter)
      .select('employeeId firstName lastName email phone branchId departmentId designationId employmentStatus employmentType joiningDate')
      .populate('departmentId', 'name')
      .populate('designationId', 'title')
      .populate('branchId', 'name code')
      .sort({ employeeId: 1 })
      .lean();

    if (!isCsv) {
      empQuery.skip(skip).limit(limit);
    }

    const [employees, total] = await Promise.all([
      empQuery,
      isCsv ? Promise.resolve(0) : Employee.countDocuments(filter),
    ]);

    if (isCsv) {
      let csv = 'Employee ID,First Name,Last Name,Email,Branch,Department,Designation,Status,Joining Date\n';
      employees.forEach((e) => {
        csv += [
          sanitizeCsvCell(e.employeeId),
          sanitizeCsvCell(e.firstName),
          sanitizeCsvCell(e.lastName),
          sanitizeCsvCell(e.email),
          sanitizeCsvCell(e.branchId?.name || 'HQ'),
          sanitizeCsvCell(e.departmentId?.name || ''),
          sanitizeCsvCell(e.designationId?.title || ''),
          sanitizeCsvCell(e.employmentStatus),
          sanitizeCsvCell(e.joiningDate ? new Date(e.joiningDate).toISOString().split('T')[0] : ''),
        ].join(',') + '\n';
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employee-report.csv"');
      return res.send(csv);
    }

    return sendSuccess(res, 'Employee report generated.', {
      employees,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = req.query;
    const query = {};

    if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      const teamEmployees = await Employee.find({
        managerId: req.verifiedEmployeeId,
        isDeleted: false,
      })
        .select('_id')
        .lean();
      query.employeeId = { $in: [...teamEmployees.map((t) => t._id), req.verifiedEmployeeId] };
    }

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    const isCsv = format === 'csv';
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });

    const attQuery = Attendance.find(query)
      .select('employeeId date checkInTime checkOutTime totalHours status')
      .populate('employeeId', 'employeeId firstName lastName')
      .sort({ date: -1 })
      .lean();

    if (!isCsv) {
      attQuery.skip(skip).limit(limit);
    }

    const [attendance, total] = await Promise.all([
      attQuery,
      isCsv ? Promise.resolve(0) : Attendance.countDocuments(query),
    ]);

    if (isCsv) {
      let csv = 'Date,Employee ID,Employee Name,Check In,Check Out,Total Hours,Status\n';
      attendance.forEach((a) => {
        csv += [
          sanitizeCsvCell(new Date(a.date).toISOString().split('T')[0]),
          sanitizeCsvCell(a.employeeId?.employeeId || ''),
          sanitizeCsvCell(`${a.employeeId?.firstName || ''} ${a.employeeId?.lastName || ''}`.trim()),
          sanitizeCsvCell(a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString() : ''),
          sanitizeCsvCell(a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString() : ''),
          sanitizeCsvCell(a.totalHours),
          sanitizeCsvCell(a.status),
        ].join(',') + '\n';
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
      return res.send(csv);
    }

    return sendSuccess(res, 'Attendance report generated.', {
      attendance,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const getPayrollReport = async (req, res, next) => {
  try {
    const { month, year, format } = req.query;
    const query = {};
    if (month) query.month = parseInt(month, 10);
    if (year) query.year = parseInt(year, 10);

    const isCsv = format === 'csv';
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });

    const payslipQuery = Payslip.find(query)
      .populate('employeeId', 'employeeId firstName lastName')
      .sort({ year: -1, month: -1 })
      .lean();

    if (!isCsv) {
      payslipQuery.skip(skip).limit(limit);
    }

    const [payslips, total] = await Promise.all([
      payslipQuery,
      isCsv ? Promise.resolve(0) : Payslip.countDocuments(query),
    ]);

    if (isCsv) {
      let csv = 'Payslip Number,Month,Year,Employee ID,Employee Name,Gross Salary,Total Deductions,Net Salary,Status\n';
      payslips.forEach((p) => {
        csv += [
          sanitizeCsvCell(p.payslipNumber),
          sanitizeCsvCell(p.month),
          sanitizeCsvCell(p.year),
          sanitizeCsvCell(p.employeeId?.employeeId || ''),
          sanitizeCsvCell(`${p.employeeId?.firstName || ''} ${p.employeeId?.lastName || ''}`.trim()),
          sanitizeCsvCell(p.grossSalary),
          sanitizeCsvCell(p.totalDeductions),
          sanitizeCsvCell(p.netSalary),
          sanitizeCsvCell(p.paymentStatus),
        ].join(',') + '\n';
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="payroll-report.csv"');
      return res.send(csv);
    }

    return sendSuccess(res, 'Payroll report generated.', {
      payslips,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};
