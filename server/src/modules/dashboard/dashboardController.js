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
import { isAdminOrHR, isPayrollPrivileged, sanitizeAuditDetails } from '../../utils/securityUtils.js';
import { sendSuccess } from '../../utils/responseUtils.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const user = req.user;
    const myEmpId = req.verifiedEmployeeId || null;
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const privilegedAdminHR = isAdminOrHR(user.role);
    const canViewPayroll = isPayrollPrivileged(user.role);
    const isRecruiter = user.role === ROLES.RECRUITER;
    const isPayrollOnly = user.role === ROLES.PAYROLL_ADMIN;

    // 1. ADMIN, SUPER_ADMIN, HR_MANAGER, PAYROLL_ADMIN, RECRUITER Executive Metrics (strictly scoped by role)
    if (privilegedAdminHR || isPayrollOnly || isRecruiter) {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const inactiveStages = [
        LIFECYCLE_STAGES.RESIGNED,
        LIFECYCLE_STAGES.TERMINATED,
        LIFECYCLE_STAGES.RELIEVED,
      ];

      const empSelect = privilegedAdminHR
        ? 'firstName lastName employeeId joiningDate employmentStatus dateOfBirth departmentId'
        : 'joiningDate employmentStatus departmentId';

      const [
        rawEmployees,
        departments,
        recentAttendance,
        leaveStatsAgg,
        pendingExpenses,
      ] = await Promise.all([
        Employee.find({ isDeleted: false })
          .select(empSelect)
          .lean(),
        Department.find({ isDeleted: false })
          .select('_id name')
          .lean(),
        !isRecruiter
          ? Attendance.find({
              date: { $gte: sevenDaysAgo, $lte: endOfToday },
            })
              .select('employeeId date status checkInTime checkOutTime')
              .lean()
          : myEmpId
          ? Attendance.find({
              employeeId: myEmpId,
              date: { $gte: startOfToday, $lte: endOfToday },
            })
              .select('employeeId date status checkInTime checkOutTime')
              .lean()
          : [],
        privilegedAdminHR
          ? LeaveRequest.aggregate([
              {
                $match: {
                  $or: [
                    { status: LEAVE_STATUS.PENDING },
                    {
                      status: LEAVE_STATUS.APPROVED,
                      startDate: { $lte: endOfToday },
                      endDate: { $gte: startOfToday },
                    },
                  ],
                },
              },
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                },
              },
            ])
          : [],
        privilegedAdminHR ? ExpenseClaim.countDocuments({ status: 'Pending' }) : 0,
      ]);

      const [
        openJobCount,
        activeCandidates,
        latestPayroll,
        upcomingHolidays,
        announcements,
        recentActivities,
      ] = await Promise.all([
        privilegedAdminHR || isRecruiter ? JobOpening.countDocuments({ status: 'Open' }) : 0,
        privilegedAdminHR || isRecruiter
          ? Candidate.countDocuments({
              $or: [
                { status: { $in: ['Applied', 'Screening', 'Interviewing', 'Offered'] } },
                { stage: { $in: ['Applied', 'Screening', 'Interview', 'Technical', 'HR Round', 'Offered'] } },
              ],
            })
          : 0,
        canViewPayroll
          ? PayrollRun.findOne()
              .sort({ year: -1, month: -1 })
              .select('month year totalNetSalary status')
              .lean()
          : null,
        Holiday.find({ date: { $gte: startOfToday } })
          .sort({ date: 1 })
          .limit(4)
          .lean(),
        Announcement.find()
          .sort({ createdAt: -1 })
          .limit(4)
          .populate('publishedBy', 'name')
          .lean(),
        privilegedAdminHR
          ? AuditLog.find()
              .sort({ createdAt: -1 })
              .limit(6)
              .lean()
          : [],
      ]);

      const deptById = new Map(departments.map((d) => [d._id.toString(), d]));

      const totalEmployees = rawEmployees.length;
      let activeEmployees = 0;
      let newJoiners = 0;
      let resignedEmployees = 0;
      const deptMap = new Map();
      const upcomingBirthdays = [];

      for (const emp of rawEmployees) {
        const populatedDept = emp.departmentId
          ? deptById.get(emp.departmentId.toString()) || null
          : null;
        emp.departmentId = populatedDept;

        if (inactiveStages.includes(emp.employmentStatus)) {
          resignedEmployees++;
        } else {
          activeEmployees++;
        }
        if (emp.joiningDate && new Date(emp.joiningDate) >= thirtyDaysAgo) {
          newJoiners++;
        }
        const deptName = populatedDept?.name || 'General';
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
      for (const item of leaveStatsAgg) {
        if (item._id === LEAVE_STATUS.PENDING) {
          pendingLeaves = item.count;
        } else if (item._id === LEAVE_STATUS.APPROVED) {
          onLeaveToday = item.count;
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
          resignedEmployees: isRecruiter ? 0 : resignedEmployees,
          presentToday: isRecruiter ? 0 : presentToday,
          lateToday: isRecruiter ? 0 : lateToday,
          absentToday: isRecruiter ? 0 : absentToday,
          onLeaveToday: privilegedAdminHR ? onLeaveToday : 0,
          attendancePercentage: isRecruiter ? 0 : attendancePercentage,
          pendingLeaves: privilegedAdminHR ? pendingLeaves : 0,
          pendingExpenses: privilegedAdminHR ? pendingExpenses : 0,
          pendingApprovals: privilegedAdminHR ? pendingApprovals : 0,
          openJobCount,
          activeCandidates,
          checkedIn: !!myTodayRecord?.checkInTime,
          checkedOut: !!myTodayRecord?.checkOutTime,
          checkInTime: myTodayRecord?.checkInTime || null,
          checkOutTime: myTodayRecord?.checkOutTime || null,
          statusToday: myTodayRecord?.status || 'Not Checked In',
          latestPayroll:
            latestPayroll && canViewPayroll
              ? {
                  month: latestPayroll.month,
                  year: latestPayroll.year,
                  totalNetSalary: latestPayroll.totalNetSalary,
                  status: latestPayroll.status,
                }
              : null,
        },
        departmentDistribution,
        attendanceTrends: isRecruiter ? [] : attendanceTrends,
        upcomingHolidays,
        upcomingBirthdays: privilegedAdminHR ? upcomingBirthdays : [],
        announcements: announcements.map((a) => ({ ...a, content: a.content ?? a.message })),
        recentActivities: privilegedAdminHR
          ? recentActivities.map((act) => ({
              ...act,
              details: sanitizeAuditDetails(act.details),
            }))
          : [],
      });
    }

    // 2. MANAGER Dashboard View
    if (user.role === ROLES.MANAGER) {
      const managerId = myEmpId;
      const [teamEmployees, myTodayRecord, upcomingHolidays, announcements] = await Promise.all([
        managerId
          ? Employee.find({ managerId, isDeleted: false }).select('_id firstName lastName').lean()
          : [],
        managerId
          ? Attendance.findOne({
              employeeId: managerId,
              date: { $gte: startOfToday, $lte: endOfToday },
            })
              .select('status checkInTime checkOutTime')
              .lean()
          : null,
        Holiday.find({ date: { $gte: startOfToday } }).sort({ date: 1 }).limit(4).lean(),
        Announcement.find().sort({ createdAt: -1 }).limit(4).lean(),
      ]);

      const teamIds = teamEmployees.map((e) => e._id);

      const [teamPresentToday, teamPendingLeaves] =
        teamIds.length > 0
          ? await Promise.all([
              Attendance.countDocuments({
                employeeId: { $in: teamIds },
                date: { $gte: startOfToday, $lte: endOfToday },
                status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
              }),
              LeaveRequest.countDocuments({
                employeeId: { $in: teamIds },
                status: LEAVE_STATUS.PENDING,
              }),
            ])
          : [0, 0];

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
        announcements: announcements.map((a) => ({ ...a, content: a.content ?? a.message })),
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
            })
              .select('status checkInTime checkOutTime')
              .lean()
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
      announcements: announcements.map((a) => ({ ...a, content: a.content ?? a.message })),
    });
  } catch (error) {
    next(error);
  }
};
