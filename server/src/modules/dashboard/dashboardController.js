import Employee from '../../models/Employee.js';
import Attendance from '../../models/Attendance.js';
import LeaveRequest from '../../models/LeaveRequest.js';
import Department from '../../models/Department.js';
import Holiday from '../../models/Holiday.js';
import PayrollRun from '../../models/PayrollRun.js';
import JobOpening from '../../models/JobOpening.js';
import Candidate from '../../models/Candidate.js';
import ExpenseClaim from '../../models/ExpenseClaim.js';
import AuditLog from '../../models/AuditLog.js';
import Announcement from '../../models/Announcement.js';
import { ROLES, ATTENDANCE_STATUS, LEAVE_STATUS, LIFECYCLE_STAGES } from '../../config/constants.js';
import { sendSuccess } from '../../utils/responseUtils.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const user = req.user;
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    // 1. ADMIN, HR_MANAGER, PAYROLL_ADMIN, RECRUITER Executive Metrics
    if (user.role === ROLES.ADMIN || user.role === ROLES.HR_MANAGER || user.role === ROLES.PAYROLL_ADMIN || user.role === ROLES.RECRUITER) {
      const totalEmployees = await Employee.countDocuments({ isDeleted: false });
      const activeEmployees = await Employee.countDocuments({
        employmentStatus: { $in: [LIFECYCLE_STAGES.CONFIRMED, LIFECYCLE_STAGES.PROBATION] },
        isDeleted: false,
      });

      // New joiners in past 30 days
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newJoiners = await Employee.countDocuments({
        joiningDate: { $gte: thirtyDaysAgo },
        isDeleted: false,
      });

      const resignedEmployees = await Employee.countDocuments({
        employmentStatus: { $in: [LIFECYCLE_STAGES.RESIGNED, LIFECYCLE_STAGES.TERMINATED] },
        isDeleted: false,
      });

      // Attendance today
      const todayAttendance = await Attendance.find({
        date: { $gte: startOfToday, $lte: endOfToday },
      });

      const presentToday = todayAttendance.filter(
        (a) => a.status === ATTENDANCE_STATUS.PRESENT || a.status === ATTENDANCE_STATUS.LATE
      ).length;
      const lateToday = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.LATE).length;

      // On leave today
      const onLeaveToday = await LeaveRequest.countDocuments({
        status: LEAVE_STATUS.APPROVED,
        startDate: { $lte: endOfToday },
        endDate: { $gte: startOfToday },
      });

      const absentToday = Math.max(0, activeEmployees - (presentToday + onLeaveToday));
      const attendancePercentage = activeEmployees > 0 ? Math.round((presentToday / activeEmployees) * 100) : 0;

      // Pending Approvals
      const pendingLeaves = await LeaveRequest.countDocuments({ status: LEAVE_STATUS.PENDING });
      const pendingExpenses = await ExpenseClaim.countDocuments({ status: 'Pending' });

      // Recruitment stats
      const openJobCount = await JobOpening.countDocuments({ status: 'Open' });
      const activeCandidates = await Candidate.countDocuments({
        status: { $in: ['Applied', 'Screening', 'Interviewing', 'Offered'] },
      });

      // Latest Payroll Run
      const latestPayroll = await PayrollRun.findOne().sort({ year: -1, month: -1 });

      // Department distribution
      const departmentDistribution = await Employee.aggregate([
        { $match: { isDeleted: false } },
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
            name: { $ifNull: ['$dept.name', 'General'] },
            count: 1,
            _id: 0,
          },
        },
      ]);

      // 7-day attendance trend
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const attendanceTrends = await Attendance.aggregate([
        {
          $match: {
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
      const upcomingHolidays = await Holiday.find({ date: { $gte: startOfToday } })
        .sort({ date: 1 })
        .limit(4);

      // Recent Announcements
      const announcements = await Announcement.find()
        .sort({ createdAt: -1 })
        .limit(4)
        .populate('publishedBy', 'name');

      // Recent System Activity
      const recentActivities = await AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(6);

      return sendSuccess(res, 'Enterprise dashboard data loaded.', {
        role: user.role,
        kpi: {
          totalEmployees,
          activeEmployees,
          newJoiners,
          resignedEmployees,
          presentToday,
          lateToday,
          absentToday,
          onLeaveToday,
          attendancePercentage,
          pendingLeaves,
          pendingExpenses,
          openJobCount,
          activeCandidates,
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
        attendanceTrends,
        upcomingHolidays,
        announcements,
        recentActivities,
      });
    }

    // 2. MANAGER Dashboard View
    if (user.role === ROLES.MANAGER) {
      const myEmp = await Employee.findOne({ userId: user._id });
      const managerId = myEmp ? myEmp._id : null;

      const teamEmployees = managerId
        ? await Employee.find({ managerId, isDeleted: false }).select('_id firstName lastName')
        : [];
      const teamIds = teamEmployees.map((e) => e._id);

      const teamPresentToday = await Attendance.countDocuments({
        employeeId: { $in: teamIds },
        date: { $gte: startOfToday, $lte: endOfToday },
        status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
      });

      const teamPendingLeaves = await LeaveRequest.countDocuments({
        employeeId: { $in: teamIds },
        status: LEAVE_STATUS.PENDING,
      });

      const upcomingHolidays = await Holiday.find({ date: { $gte: startOfToday } })
        .sort({ date: 1 })
        .limit(4);

      const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(4);

      return sendSuccess(res, 'Manager team dashboard loaded.', {
        role: user.role,
        kpi: {
          teamCount: teamIds.length,
          teamPresentToday,
          teamPendingLeaves,
        },
        upcomingHolidays,
        announcements,
      });
    }

    // 3. EMPLOYEE Self-Service (ESS) Dashboard View
    const emp = await Employee.findOne({ userId: user._id });
    const empId = emp ? emp._id : null;

    let todayRecord = null;
    let monthlyPresent = 0;
    let pendingLeaves = 0;

    if (empId) {
      todayRecord = await Attendance.findOne({
        employeeId: empId,
        date: { $gte: startOfToday, $lte: endOfToday },
      });

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      monthlyPresent = await Attendance.countDocuments({
        employeeId: empId,
        date: { $gte: startOfMonth, $lte: endOfToday },
        status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
      });

      pendingLeaves = await LeaveRequest.countDocuments({
        employeeId: empId,
        status: LEAVE_STATUS.PENDING,
      });
    }

    const upcomingHolidays = await Holiday.find({ date: { $gte: startOfToday } })
      .sort({ date: 1 })
      .limit(4);

    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(4);

    return sendSuccess(res, 'Employee ESS dashboard loaded.', {
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
      announcements,
    });
  } catch (error) {
    next(error);
  }
};
