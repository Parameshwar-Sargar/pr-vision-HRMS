import Employee from '../../models/Employee.js';
import Attendance from '../../models/Attendance.js';
import LeaveRequest from '../../models/LeaveRequest.js';
import Department from '../../models/Department.js';
import Holiday from '../../models/Holiday.js';
import PayrollRun from '../../models/PayrollRun.js';
import AuditLog from '../../models/AuditLog.js';
import { ROLES, ATTENDANCE_STATUS, LEAVE_STATUS } from '../../config/constants.js';
import { sendSuccess } from '../../utils/responseUtils.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user;

    // Normalize today's date range (midnight to midnight)
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    // ==========================================
    // 1. COMPANY ADMIN & HR MANAGER DASHBOARD
    // ==========================================
    if (user.role === ROLES.COMPANY_ADMIN || user.role === ROLES.HR_MANAGER) {
      // Employee Metrics
      const totalEmployees = await Employee.countDocuments({ tenantId, isDeleted: false });
      const activeEmployees = await Employee.countDocuments({
        tenantId,
        employmentStatus: 'Active',
        isDeleted: false,
      });

      // Today's Attendance
      const todayAttendance = await Attendance.find({
        tenantId,
        date: { $gte: startOfToday, $lte: endOfToday },
      });

      const presentToday = todayAttendance.filter(
        (a) => a.status === ATTENDANCE_STATUS.PRESENT || a.status === ATTENDANCE_STATUS.LATE
      ).length;
      const lateToday = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.LATE).length;

      // On Leave Today
      const onLeaveToday = await LeaveRequest.countDocuments({
        tenantId,
        status: LEAVE_STATUS.APPROVED,
        startDate: { $lte: endOfToday },
        endDate: { $gte: startOfToday },
      });

      const absentToday = Math.max(0, activeEmployees - (presentToday + onLeaveToday));

      // Pending Leaves
      const pendingLeaveRequests = await LeaveRequest.countDocuments({
        tenantId,
        status: LEAVE_STATUS.PENDING,
      });

      // Latest Payroll Run
      const latestPayroll = await PayrollRun.findOne({ tenantId }).sort({ year: -1, month: -1 });

      // Department Distribution
      const departmentDistribution = await Employee.aggregate([
        { $match: { tenantId, isDeleted: false } },
        {
          $group: {
            _id: '$departmentId',
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'departments',
            localField: '_id',
            foreignField: '_id',
            as: 'dept',
          },
        },
        { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: { $ifNull: ['$dept.name', 'Unassigned'] },
            count: 1,
            _id: 0,
          },
        },
      ]);

      // Attendance Trends (Past 7 Days)
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const pastSevenDaysAttendance = await Attendance.aggregate([
        {
          $match: {
            tenantId,
            date: { $gte: sevenDaysAgo, $lte: endOfToday },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            present: {
              $sum: {
                $cond: [
                  { $in: ['$status', [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE]] },
                  1,
                  0,
                ],
              },
            },
            late: {
              $sum: { $cond: [{ $eq: ['$status', ATTENDANCE_STATUS.LATE] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Upcoming Holidays
      const upcomingHolidays = await Holiday.find({
        tenantId,
        date: { $gte: startOfToday },
      })
        .sort({ date: 1 })
        .limit(4);

      // Recent Activity Log
      const recentActivities = await AuditLog.find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(6)
        .select('action actorEmail entity createdAt');

      return sendSuccess(res, 'Dashboard statistics loaded.', {
        role: user.role,
        kpi: {
          totalEmployees,
          activeEmployees,
          presentToday,
          lateToday,
          absentToday,
          onLeaveToday,
          pendingLeaveRequests,
          latestPayroll: latestPayroll
            ? {
                month: latestPayroll.month,
                year: latestPayroll.year,
                totalNetSalary: latestPayroll.totalNetSalary,
                status: latestPayroll.status,
              }
            : null,
        },
        departmentDistribution,
        attendanceTrends: pastSevenDaysAttendance,
        upcomingHolidays,
        recentActivities,
      });
    }

    // ==========================================
    // 2. MANAGER DASHBOARD
    // ==========================================
    if (user.role === ROLES.MANAGER) {
      // Find my employee profile first
      const managerEmployee = await Employee.findOne({ tenantId, userId: user._id });
      const managerId = managerEmployee ? managerEmployee._id : null;

      const teamCount = managerId
        ? await Employee.countDocuments({ tenantId, managerId, isDeleted: false })
        : 0;

      const teamEmployeeIds = managerId
        ? (await Employee.find({ tenantId, managerId, isDeleted: false }).select('_id')).map((e) => e._id)
        : [];

      // Team present today
      const teamPresentToday = await Attendance.countDocuments({
        tenantId,
        employeeId: { $in: teamEmployeeIds },
        date: { $gte: startOfToday, $lte: endOfToday },
        status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
      });

      // Team pending leave requests
      const teamPendingLeaves = await LeaveRequest.countDocuments({
        tenantId,
        employeeId: { $in: teamEmployeeIds },
        status: LEAVE_STATUS.PENDING,
      });

      // Upcoming holidays
      const upcomingHolidays = await Holiday.find({
        tenantId,
        date: { $gte: startOfToday },
      })
        .sort({ date: 1 })
        .limit(4);

      return sendSuccess(res, 'Manager dashboard statistics loaded.', {
        role: user.role,
        kpi: {
          teamCount,
          teamPresentToday,
          teamPendingLeaves,
        },
        upcomingHolidays,
      });
    }

    // ==========================================
    // 3. EMPLOYEE PERSONAL DASHBOARD
    // ==========================================
    const emp = await Employee.findOne({ tenantId, userId: user._id });
    const empId = emp ? emp._id : null;

    let todayRecord = null;
    let monthlyPresent = 0;
    let pendingLeaves = 0;

    if (empId) {
      todayRecord = await Attendance.findOne({
        tenantId,
        employeeId: empId,
        date: { $gte: startOfToday, $lte: endOfToday },
      });

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      monthlyPresent = await Attendance.countDocuments({
        tenantId,
        employeeId: empId,
        date: { $gte: startOfMonth, $lte: endOfToday },
        status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
      });

      pendingLeaves = await LeaveRequest.countDocuments({
        tenantId,
        employeeId: empId,
        status: LEAVE_STATUS.PENDING,
      });
    }

    const upcomingHolidays = await Holiday.find({
      tenantId,
      date: { $gte: startOfToday },
    })
      .sort({ date: 1 })
      .limit(4);

    return sendSuccess(res, 'Employee dashboard statistics loaded.', {
      role: user.role,
      kpi: {
        checkedIn: !!todayRecord?.checkInTime,
        checkedOut: !!todayRecord?.checkOutTime,
        checkInTime: todayRecord?.checkInTime || null,
        checkOutTime: todayRecord?.checkOutTime || null,
        statusToday: todayRecord?.status || 'Not Checked In',
        monthlyPresentDays: monthlyPresent,
        pendingLeaves,
      },
      upcomingHolidays,
    });
  } catch (error) {
    next(error);
  }
};

