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

const INACTIVE_STAGES = [
  LIFECYCLE_STAGES.RESIGNED,
  LIFECYCLE_STAGES.TERMINATED,
  LIFECYCLE_STAGES.RELIEVED,
];

const HOLIDAY_SELECT = '_id name date year branchId description isOptional';
const ANNOUNCEMENT_SELECT =
  '_id title message category priority publishedBy targetBranchId targetDepartmentId isPinned isActive expiresAt createdAt';
const AUDIT_SELECT = '_id actorId actorEmail actorRole action entity entityId details createdAt';

const buildAnnouncementVisibilityFilter = (req, now) => {
  const andConditions = [
    { isActive: true },
    { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
  ];

  if (!isAdminOrHR(req.user.role)) {
    const empBranchId = req.employee?.branchId || null;
    const empDeptId = req.employee?.departmentId || null;
    andConditions.push(
      empBranchId ? { $or: [{ targetBranchId: null }, { targetBranchId: empBranchId }] } : { targetBranchId: null }
    );
    andConditions.push(
      empDeptId ? { $or: [{ targetDepartmentId: null }, { targetDepartmentId: empDeptId }] } : { targetDepartmentId: null }
    );
  }

  return { $and: andConditions };
};

const serializeAnnouncements = (rows = []) =>
  rows.map((a) => ({
    ...a,
    content: a.content ?? a.message,
  }));

const buildMyAttendanceKpi = (myTodayRecord) => ({
  checkedIn: !!myTodayRecord?.checkInTime,
  checkedOut: !!myTodayRecord?.checkOutTime,
  checkInTime: myTodayRecord?.checkInTime || null,
  checkOutTime: myTodayRecord?.checkOutTime || null,
  statusToday: myTodayRecord?.status || 'Not Checked In',
});

export const getDashboardStats = async (req, res, next) => {
  try {
    const { user } = req;
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const privilegedAdminHR = isAdminOrHR(user.role);
    const canViewPayroll = isPayrollPrivileged(user.role);
    const isRecruiter = user.role === ROLES.RECRUITER;
    const isPayrollOnly = user.role === ROLES.PAYROLL_ADMIN;
    const myEmpId = req.verifiedEmployeeId || null;

    // 1. ADMIN / SUPER_ADMIN / HR_MANAGER / PAYROLL_ADMIN / RECRUITER Dashboard
    // Single parallel batch: aggregates inside MongoDB instead of downloading collections into RAM.
    if (privilegedAdminHR || isPayrollOnly || isRecruiter) {
      const employeeFacet = {
        totals: [
          {
            $group: {
              _id: null,
              totalEmployees: { $sum: 1 },
              resignedEmployees: {
                $sum: { $cond: [{ $in: ['$employmentStatus', INACTIVE_STAGES] }, 1, 0] },
              },
              newJoiners: {
                $sum: { $cond: [{ $gte: ['$joiningDate', thirtyDaysAgo] }, 1, 0] },
              },
            },
          },
        ],
        departments: [
          {
            $group: {
              _id: '$departmentId',
              count: { $sum: 1 },
            },
          },
        ],
      };

      if (privilegedAdminHR) {
        employeeFacet.birthdays = [
          { $match: { dateOfBirth: { $ne: null } } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'departments',
              localField: 'departmentId',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1 } }],
              as: '_dept',
            },
          },
          {
            $project: {
              firstName: 1,
              lastName: 1,
              employeeId: 1,
              joiningDate: 1,
              employmentStatus: 1,
              dateOfBirth: 1,
              departmentId: { $ifNull: [{ $arrayElemAt: ['$_dept', 0] }, null] },
            },
          },
        ];
      }

      const [
        empFacetResult,
        departments,
        attFacetResult,
        myTodayRecord,
        leaveStatsAgg,
        pendingExpenses,
        openJobCount,
        activeCandidates,
        latestPayroll,
        upcomingHolidays,
        announcements,
        recentActivities,
      ] = await Promise.all([
        Employee.aggregate([
          { $match: { isDeleted: false } },
          { $facet: employeeFacet },
        ]),
        Department.find({ isDeleted: false }).select('_id name').lean(),
        !isRecruiter
          ? Attendance.aggregate([
              { $match: { date: { $gte: sevenDaysAgo, $lte: endOfToday } } },
              {
                $facet: {
                  trends: [
                    {
                      $group: {
                        // Match JS Date.prototype.toISOString().split('T')[0] (UTC calendar day)
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
                  ],
                  today: [
                    { $match: { date: { $gte: startOfToday, $lte: endOfToday } } },
                    {
                      $group: {
                        _id: null,
                        presentToday: {
                          $sum: {
                            $cond: [
                              {
                                $in: [
                                  '$status',
                                  [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE, ATTENDANCE_STATUS.HALF_DAY],
                                ],
                              },
                              1,
                              0,
                            ],
                          },
                        },
                        lateToday: {
                          $sum: { $cond: [{ $eq: ['$status', ATTENDANCE_STATUS.LATE] }, 1, 0] },
                        },
                        absentToday: {
                          $sum: { $cond: [{ $eq: ['$status', ATTENDANCE_STATUS.ABSENT] }, 1, 0] },
                        },
                      },
                    },
                  ],
                },
              },
            ])
          : Promise.resolve([]),
        myEmpId
          ? Attendance.findOne({
              employeeId: myEmpId,
              date: { $gte: startOfToday, $lte: endOfToday },
            })
              .select('status checkInTime checkOutTime')
              .lean()
          : Promise.resolve(null),
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
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ])
          : Promise.resolve([]),
        privilegedAdminHR ? ExpenseClaim.countDocuments({ status: 'Pending' }) : Promise.resolve(0),
        privilegedAdminHR || isRecruiter ? JobOpening.countDocuments({ status: 'Open' }) : Promise.resolve(0),
        privilegedAdminHR || isRecruiter
          ? Candidate.countDocuments({ status: { $in: ['Applied', 'Screening', 'Interviewing', 'Offered'] } })
          : Promise.resolve(0),
        canViewPayroll
          ? PayrollRun.findOne().sort({ year: -1, month: -1 }).select('month year totalNetSalary status').lean()
          : Promise.resolve(null),
        Holiday.find({ date: { $gte: startOfToday } }).sort({ date: 1 }).limit(4).select(HOLIDAY_SELECT).lean(),
        Announcement.find(buildAnnouncementVisibilityFilter(req, today))
          .sort({ isPinned: -1, createdAt: -1 })
          .limit(4)
          .select(ANNOUNCEMENT_SELECT)
          .populate('publishedBy', 'name')
          .lean(),
        privilegedAdminHR
          ? AuditLog.find().sort({ createdAt: -1 }).limit(6).select(AUDIT_SELECT).lean()
          : Promise.resolve([]),
      ]);

      const facetDoc = empFacetResult[0] || {};
      const empTotals = facetDoc.totals?.[0] || {};
      const totalEmployees = empTotals.totalEmployees || 0;
      const rawResignedEmployees = empTotals.resignedEmployees || 0;
      const activeEmployees = totalEmployees - rawResignedEmployees;
      const newJoiners = empTotals.newJoiners || 0;
      const resignedEmployees = canViewPayroll ? rawResignedEmployees : 0;

      const deptMap = new Map(departments.map((d) => [d._id.toString(), d.name]));
      const deptDistMap = new Map();
      for (const bucket of facetDoc.departments || []) {
        const deptName = bucket._id ? deptMap.get(bucket._id.toString()) || 'General' : 'General';
        deptDistMap.set(deptName, (deptDistMap.get(deptName) || 0) + bucket.count);
      }
      const departmentDistribution = Array.from(deptDistMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

      const attFacetDoc = attFacetResult[0] || {};
      const attendanceTrends = attFacetDoc.trends || [];
      const todaySummary = attFacetDoc.today?.[0] || {};
      const presentToday = !isRecruiter ? todaySummary.presentToday || 0 : 0;
      const lateToday = !isRecruiter ? todaySummary.lateToday || 0 : 0;
      const absentToday = !isRecruiter ? todaySummary.absentToday || 0 : 0;

      const pendingLeaves = leaveStatsAgg.find((l) => l._id === LEAVE_STATUS.PENDING)?.count || 0;
      const onLeaveToday = leaveStatsAgg.find((l) => l._id === LEAVE_STATUS.APPROVED)?.count || 0;

      const attendancePercentage =
        !isRecruiter && activeEmployees > 0 ? Math.round((presentToday / activeEmployees) * 100) : 0;

      const upcomingBirthdays = privilegedAdminHR ? facetDoc.birthdays || [] : [];

      return sendSuccess(res, 'Dashboard metrics retrieved successfully.', {
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
          pendingApprovals: pendingLeaves + pendingExpenses,
          openJobCount,
          activeCandidates,
          ...buildMyAttendanceKpi(myTodayRecord),
          latestPayroll:
            canViewPayroll && latestPayroll
              ? {
                  month: latestPayroll.month,
                  year: latestPayroll.year,
                  totalNetSalary: latestPayroll.totalNetSalary || 0,
                  status: latestPayroll.status,
                }
              : null,
        },
        departmentDistribution,
        attendanceTrends,
        upcomingHolidays,
        upcomingBirthdays,
        announcements: serializeAnnouncements(announcements),
        recentActivities: privilegedAdminHR
          ? recentActivities.map((act) => ({
              ...act,
              details: sanitizeAuditDetails(act.details),
            }))
          : [],
      });
    }

    // 2. MANAGER Dashboard — Parallelized independent feeds alongside indexed team counts
    if (user.role === ROLES.MANAGER) {
      const managerId = req.verifiedEmployeeId;

      const myTodayPromise = managerId
        ? Attendance.findOne({ employeeId: managerId, date: { $gte: startOfToday, $lte: endOfToday } })
            .select('status checkInTime checkOutTime')
            .lean()
        : Promise.resolve(null);
      const holidaysPromise = Holiday.find({ date: { $gte: startOfToday } })
        .sort({ date: 1 })
        .limit(4)
        .select(HOLIDAY_SELECT)
        .lean();
      const announcementsPromise = Announcement.find(buildAnnouncementVisibilityFilter(req, today))
        .sort({ isPinned: -1, createdAt: -1 })
        .limit(4)
        .select(ANNOUNCEMENT_SELECT)
        .lean();

      const teamEmployees = managerId
        ? await Employee.find({ managerId, isDeleted: false }).select('_id').lean()
        : [];
      const teamIds = teamEmployees.map((t) => t._id);

      const [teamPresentToday, teamPendingLeaves, myTodayRecord, upcomingHolidays, announcements] =
        await Promise.all([
          teamIds.length > 0
            ? Attendance.countDocuments({
                employeeId: { $in: teamIds },
                date: { $gte: startOfToday, $lte: endOfToday },
                status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
              })
            : Promise.resolve(0),
          teamIds.length > 0
            ? LeaveRequest.countDocuments({
                employeeId: { $in: teamIds },
                status: LEAVE_STATUS.PENDING,
              })
            : Promise.resolve(0),
          myTodayPromise,
          holidaysPromise,
          announcementsPromise,
        ]);

      return sendSuccess(res, 'Manager dashboard retrieved.', {
        role: user.role,
        kpi: {
          teamCount: teamEmployees.length,
          teamPresentToday,
          teamPendingLeaves,
          ...buildMyAttendanceKpi(myTodayRecord),
        },
        upcomingHolidays,
        announcements: serializeAnnouncements(announcements),
      });
    }

    // 3. EMPLOYEE (ESS) Dashboard
    const empId = req.verifiedEmployeeId;

    const [myTodayRecord, myPresentThisMonth, myPendingLeaves, upcomingHolidays, announcements] =
      await Promise.all([
        empId
          ? Attendance.findOne({ employeeId: empId, date: { $gte: startOfToday, $lte: endOfToday } })
              .select('status checkInTime checkOutTime')
              .lean()
          : Promise.resolve(null),
        empId
          ? Attendance.countDocuments({
              employeeId: empId,
              date: { $gte: startOfMonth, $lte: endOfToday },
              status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE] },
            })
          : Promise.resolve(0),
        empId
          ? LeaveRequest.countDocuments({ employeeId: empId, status: LEAVE_STATUS.PENDING })
          : Promise.resolve(0),
        Holiday.find({ date: { $gte: startOfToday } }).sort({ date: 1 }).limit(4).select(HOLIDAY_SELECT).lean(),
        Announcement.find(buildAnnouncementVisibilityFilter(req, today))
          .sort({ isPinned: -1, createdAt: -1 })
          .limit(4)
          .select(ANNOUNCEMENT_SELECT)
          .lean(),
      ]);

    return sendSuccess(res, 'Employee dashboard retrieved.', {
      role: user.role,
      kpi: {
        ...buildMyAttendanceKpi(myTodayRecord),
        monthlyPresentDays: myPresentThisMonth,
        pendingLeaves: myPendingLeaves,
      },
      upcomingHolidays,
      announcements: serializeAnnouncements(announcements),
    });
  } catch (error) {
    next(error);
  }
};
