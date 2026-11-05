import Employee from '../../models/Employee.js';
import Attendance from '../../models/Attendance.js';
import LeaveRequest from '../../models/LeaveRequest.js';
import Payslip from '../../models/Payslip.js';
import { sendSuccess } from '../../utils/responseUtils.js';

export const getEmployeeReport = async (req, res, next) => {
  try {
    const { format, branchId, departmentId } = req.query;
    const filter = { isDeleted: false };
    if (branchId) filter.branchId = branchId;
    if (departmentId) filter.departmentId = departmentId;

    const employees = await Employee.find(filter)
      .populate('departmentId', 'name')
      .populate('designationId', 'title')
      .populate('branchId', 'name code')
      .sort({ employeeId: 1 });

    if (format === 'csv') {
      let csv = 'Employee ID,First Name,Last Name,Email,Branch,Department,Designation,Status,Joining Date\n';
      employees.forEach((e) => {
        csv += `"${e.employeeId}","${e.firstName}","${e.lastName}","${e.email}","${e.branchId?.name || 'HQ'}","${e.departmentId?.name || ''}","${e.designationId?.title || ''}","${e.employmentStatus}","${e.joiningDate ? new Date(e.joiningDate).toISOString().split('T')[0] : ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employee-report.csv"');
      return res.send(csv);
    }

    return sendSuccess(res, 'Employee report generated.', { employees });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = req.query;
    const query = {};

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    const attendance = await Attendance.find(query)
      .populate('employeeId', 'employeeId firstName lastName')
      .sort({ date: -1 });

    if (format === 'csv') {
      let csv = 'Date,Employee ID,Employee Name,Check In,Check Out,Total Hours,Status\n';
      attendance.forEach((a) => {
        csv += `"${new Date(a.date).toISOString().split('T')[0]}","${a.employeeId?.employeeId || ''}","${a.employeeId?.firstName || ''} ${a.employeeId?.lastName || ''}","${a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString() : ''}","${a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString() : ''}","${a.totalHours}","${a.status}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
      return res.send(csv);
    }

    return sendSuccess(res, 'Attendance report generated.', { attendance });
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

    const payslips = await Payslip.find(query)
      .populate('employeeId', 'employeeId firstName lastName')
      .sort({ year: -1, month: -1 });

    if (format === 'csv') {
      let csv = 'Payslip Number,Month,Year,Employee ID,Employee Name,Gross Salary,Total Deductions,Net Salary,Status\n';
      payslips.forEach((p) => {
        csv += `"${p.payslipNumber}","${p.month}","${p.year}","${p.employeeId?.employeeId || ''}","${p.employeeId?.firstName || ''} ${p.employeeId?.lastName || ''}","${p.grossSalary}","${p.totalDeductions}","${p.netSalary}","${p.paymentStatus}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="payroll-report.csv"');
      return res.send(csv);
    }

    return sendSuccess(res, 'Payroll report generated.', { payslips });
  } catch (error) {
    next(error);
  }
};
