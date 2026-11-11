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
    const myEmpId = req.verifiedEmployeeId || null;
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    // 1. ADMIN, HR_MANAGER, PAYROLL_ADMIN, RECRUITER Executive Metrics
    if (
      user.role === ROLES.ADMIN ||
      user.role === ROLES.HR_MANAGER ||
      user.role === ROLES.PAYROLL_ADMIN ||
      user.role === ROLES.RECRUITER
    ) {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const inactiveStages = [
        LIFECYCLE_STAGES.RESIGNED,
        LIFECYCLE_STAGES.TERMINATED,
        LIFECYCLE_STAGES.RELIEVED,
      ];

      // Consolidated parallel queries (reduces 17 roundtrips to 2 fast batches over warm sockets)
      const [
        allEmployees,
        recentAttendance,
        activeLeaves,
        pendingExpenses,
        openJobCount,
      ] = await Promise.all([
        Employee.find({ isDeleted: false })
          .select('firstName lastName employeeId joiningDate employmentStatus dateOfBirth departmentId')
          .populate('departmentId', 'name')
          .lean(),
        Attendance.find({
          date: { $gte: sevenDaysAgo, $lte: endOfToday },
        })
          .select('employeeId date status checkInTime checkOutTime')
          .lean(),
        LeaveRequest.find({
          status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
        })
          .select('status startDate endDate')
          .lean(),
        ExpenseClaim.countDocuments({ status: 'Pending' }),
        JobOpening.countDocuments({ status: 'Open' }),
      ]);

      const [
        activeCandidates,
        latestPayroll,
        upcomingHolidays,
        announcements,
        recentActivities,
      ] = await Promise.all([
        Candidate.countDocuments({
          status: { $in: ['Applied', 'Screening', 'Interviewing', 'Offered'] },
        }),
        PayrollRun.findOne().sort({ year: -1, month: -1 }).lean(),
        Holiday.find({ date: { $gte: startOfToday } })
          .sort({ date: 1 })
          .limit(4)
          .lean(),
        Announcement.find()
          .sort({ createdAt: -1 })
          .limit(4)
          .populate('publishedBy', 'name')
          .lean(),
        AuditLog.find()
          .sort({ createdAt: -1 })
          .limit(6)
          .lean(),
      ]);

      const totalEmployees = allEmployees.length;
      let activeEmployees = 0;
      let newJoiners = 0;
      let resignedEmployees = 0;
      const deptMap = new Map();
      const upcomingBirthdays = [];

      for (const emp of allEmployees) {
        if (inactiveStages.includes(emp.employmentStatus)) {
          resignedEmployees++;
        } else {
          activeEmployees++;
        }
        if (emp.joiningDate && new Date(emp.joiningDate) >= thirtyDaysAgo) {
          newJoiners++;
        }
        const deptName = emp.departmentId?.name || 'General';
        deptMap.set(deptName, (deptMap.get(deptName) || 0) + 1);
        if (emp.dateOfBirth && upcomingBirthdays.length < 5) {
          upcomingBirthdays.push(emp);
        }
      }

      const departmentDistribution = Array.from(deptMap.entries()).map(([name, count]) => ({
        name,
        count,
      }));

      // Today's attendance & 7-day trends from single query
      const todayAttendance = [];
      const trendMap = new Map();
      for (const att of recentAttendance) {
        const d = new Date(att.date);
        if (d >= startOfToday && d <= endOfToday) {
          todayAttendance.push(att);
        }
        const dateKey = d.toISOString().split('T')[0];
        const entry = trendMap.get(dateKey) || { _id: dateKey, present: 0, late: 0 };
        if (att.status === ATTENDANCE_STATUS.PRESENT || att.status === ATTENDANCE_STATUS.LATE) {
          entry.present++;
        }
        if (att.status === ATTENDANCE_STATUS.LATE) {
          entry.late++;
        }
        trendMap.set(dateKey, entry);
      }
      const attendanceTrends = Array.from(trendMap.values()).sort((a, b) =>
        a._id.localeCompare(b._id)
      );

      let pendingLeaves = 0;
      let onLeaveToday = 0;
      for (const lv of activeLeaves) {
        if (lv.status === LEAVE_STATUS.PENDING) {
          pendingLeaves++;
        } else if (
          lv.status === LEAVE_STATUS.APPROVED &&
          new Date(lv.startDate) <= endOfToday &&
          new Date(lv.endDate) >= startOfToday
        ) {
          onLeaveToday++;
        }
      }

      const presentToday = todayAttendance.filter(
        (a) =>
          a.status === ATTENDANCE_STATUS.PRESENT ||
          a.status === ATTENDANCE_STATUS.LATE ||
          a.status === ATTENDANCE_STATUS.HALF_DAY
      ).length;
      const lateToday = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.LATE).length;
      const absentToday = todayAttendance.filter((a) => a.status === ATTENDANCE_STATUS.ABSENT).length;
      const attendancePercentage = activeEmployees > 0 ? Math.round((presentToday / activeEmployees) * 100) : 0;
      const pendingApprovals = pendingLeaves + pendingExpenses;

      const myTodayRecord = myEmpId
        ? todayAttendance.find((a) => a.employeeId?.toString() === myEmpId.toString())
        : null;

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
          pendingApprovals,
          openJobCount,
          activeCandidates,
          checkedIn: !!myTodayRecord?.checkInTime,
          checkedOut: !!myTodayRecord?.checkOutTime,
          checkInTime: myTodayRecord?.checkInTime || null,
          checkOutTime: myTodayRecord?.checkOutTime || null,
          statusToday: myTodayRecord?.status || 'Not Checked In',
          latestPayroll:
            latestPayroll &&
            (user.role === ROLES.ADMIN || user.role === ROLES.HR_MANAGER || user.role === ROLES.PAYROLL_ADMIN)
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
        upcomingBirthdays,
        announcements,
        recentActivities,
      });
    }

    // 2. MANAGER Dashboard View
    if (user.role === ROLES.MANAGER) {
      const managerId = myEmpId;
      const teamEmployees = managerId
        ? await Employee.find({ managerId, isDeleted: false }).select('_id firstName lastName').lean()
        : [];
      const teamIds = teamEmployees.map((e) => e._id);

      const [teamPresentToday, teamPendingLeaves, myTodayRecord, upcomingHolidays, announcements] =
        await Promise.all([
          teamIds.length > 0
            ? Attendance.countDocuments({
                employeeId: { $in: teamIds },
                date: { $gte: startOfToday, $lte: endOfToday },
                status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
              })
            : 0,
          teamIds.length > 0
            ? LeaveRequest.countDocuments({
                employeeId: { $in: teamIds },
                status: LEAVE_STATUS.PENDING,
              })
            : 0,
          managerId
            ? Attendance.findOne({
                employeeId: managerId,
                date: { $gte: startOfToday, $lte: endOfToday },
              }).lean()
            : null,
          Holiday.find({ date: { $gte: startOfToday } }).sort({ date: 1 }).limit(4).lean(),
          Announcement.find().sort({ createdAt: -1 }).limit(4).lean(),
        ]);

      return sendSuccess(res, 'Manager team dashboard loaded.', {
        role: user.role,
        kpi: {
          teamCount: teamIds.length,
          teamPresentToday,
          teamPendingLeaves,
          checkedIn: !!myTodayRecord?.checkInTime,
          checkedOut: !!myTodayRecord?.checkOutTime,
          checkInTime: myTodayRecord?.checkInTime || null,
          checkOutTime: myTodayRecord?.checkOutTime || null,
          statusToday: myTodayRecord?.status || 'Not Checked In',
        },
        upcomingHolidays,
        announcements,
      });
    }

    // 3. EMPLOYEE Self-Service (ESS) Dashboard View
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayRecord, monthlyPresent, pendingLeaves, upcomingHolidays, announcements] =
      await Promise.all([
        myEmpId
          ? Attendance.findOne({
              employeeId: myEmpId,
              date: { $gte: startOfToday, $lte: endOfToday },
            }).lean()
          : null,
        myEmpId
          ? Attendance.countDocuments({
              employeeId: myEmpId,
              date: { $gte: startOfMonth, $lte: endOfToday },
              status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
            })
          : 0,
        myEmpId
          ? LeaveRequest.countDocuments({
              employeeId: myEmpId,
              status: LEAVE_STATUS.PENDING,
            })
          : 0,
        Holiday.find({ date: { $gte: startOfToday } }).sort({ date: 1 }).limit(4).lean(),
        Announcement.find().sort({ createdAt: -1 }).limit(4).lean(),
      ]);

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
