import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  CalendarDays,
  DollarSign,
  Building2,
  Calendar,
  Activity,
  CheckCircle,
  AlertCircle,
  Briefcase,
  GraduationCap,
  Cake,
  ArrowRight,
  TrendingUp,
  Megaphone,
  CreditCard,
  UserPlus,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export default function DashboardPage() {
  const { user } = useSelector((state) => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clockLoading, setClockLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live ticking clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/dashboard/stats');
      setData(res.data.data);
    } catch (err) {
      toast.error('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    try {
      setClockLoading(true);
      const res = await api.post('/attendance/check-in');
      toast.success(res.data.message || 'Clocked in successfully!');
      fetchDashboardStats();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setClockLoading(false);
    }
  };

  const handleClockOut = async () => {
    try {
      setClockLoading(true);
      const res = await api.post('/attendance/check-out');
      toast.success(res.data.message || 'Clocked out successfully!');
      fetchDashboardStats();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setClockLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const role = user?.role || 'EMPLOYEE';
  const kpi = data?.kpi || {};
  const isAdmin = role === 'ADMIN';
  const isHR = role === 'HR_MANAGER';
  const isManager = role === 'MANAGER';
  const isEmployee = role === 'EMPLOYEE';
  const isRecruiter = role === 'RECRUITER';
  const isPayroll = role === 'PAYROLL_ADMIN';

  return (
    <div className="space-y-6">
      {/* Welcome Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-500/10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white uppercase tracking-wider backdrop-blur-sm">
                {role.replace('_', ' ')} Workspace
              </span>
              <span className="text-blue-200 text-xs font-semibold">PR VISION INNOVATIONS</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              Good {currentTime.getHours() < 12 ? 'morning' : currentTime.getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name}!
            </h1>
            <p className="mt-1 text-xs text-blue-100">
              People. Process. Performance. &bull; Bengaluru HQ, Mumbai, and Hyderabad Operations.
            </p>
          </div>

          {/* Realtime Clock & Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 text-right">
              <div className="text-[10px] text-blue-200 font-semibold uppercase tracking-wider">
                {currentTime.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              <div className="font-mono text-base font-bold text-white tracking-wider">
                {currentTime.toLocaleTimeString()}
              </div>
            </div>

            {/* Quick Clock button for Employee & Manager */}
            {(isEmployee || isManager) && (
              <div className="flex items-center gap-2">
                {!kpi.checkedIn ? (
                  <button
                    onClick={handleClockIn}
                    disabled={clockLoading}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{clockLoading ? 'Checking in...' : 'Clock In Now'}</span>
                  </button>
                ) : !kpi.checkedOut ? (
                  <button
                    onClick={handleClockOut}
                    disabled={clockLoading}
                    className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/20 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{clockLoading ? 'Checking out...' : 'Clock Out'}</span>
                  </button>
                ) : (
                  <span className="px-3 py-2 rounded-xl bg-white/20 text-white text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Clocked Out</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1. ADMIN & HR_MANAGER DASHBOARD VIEW */}
      {(isAdmin || isHR) && (
        <>
          {/* Executive Metrics Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Headcount</span>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{kpi.totalEmployees || 0}</p>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-emerald-600 font-semibold">{kpi.activeEmployees || 0} active</span>
                <span className="text-slate-400 font-medium">3 Branches</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Present Today</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{kpi.presentToday || 0}</p>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-blue-600 font-semibold">{kpi.attendancePercentage || 0}% rate</span>
                <span className="text-amber-600 font-medium">{kpi.lateToday || 0} late</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">On Leave / Absent</span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <UserX className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{kpi.onLeaveToday || 0}</p>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-rose-600 font-semibold">{kpi.absentToday || 0} absent</span>
                <span className="text-slate-400 font-medium">Approved leaves</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Pending Approvals</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">
                {(kpi.pendingLeaves || 0) + (kpi.pendingExpenses || 0)}
              </p>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-amber-600 font-semibold">{kpi.pendingLeaves || 0} Leaves</span>
                <span className="text-blue-600 font-semibold">{kpi.pendingExpenses || 0} Expenses</span>
              </div>
            </div>
          </div>

          {/* Middle Row: 7-Day Attendance Trend Chart & Department Staffing */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">7-Day Attendance Trends</h3>
                  <p className="text-[11px] text-slate-400">Live check-in and punctuality telemetry</p>
                </div>
                <Link to="/attendance" className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <span>View Timesheets</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="h-64 w-full">
                {data?.attendanceTrends && data.attendanceTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.attendanceTrends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="_id" tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          fontSize: '11px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="present" fill="#2563EB" name="Present" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="late" fill="#F59E0B" name="Late Arrivals" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No attendance records for the last 7 days.
                  </div>
                )}
              </div>
            </div>

            {/* Department Breakdown */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Department Distribution</span>
                  </h3>
                  <Link to="/departments" className="text-xs font-bold text-blue-600 hover:text-blue-700">
                    Manage
                  </Link>
                </div>

                <div className="space-y-3.5">
                  {data?.departmentDistribution && data.departmentDistribution.length > 0 ? (
                    data.departmentDistribution.map((dept, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-800">{dept.name}</span>
                          <span className="text-slate-500">{dept.count} Members</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((dept.count / (kpi.totalEmployees || 1)) * 100)
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">No departments configured yet.</p>
                  )}
                </div>
              </div>

              {/* Monthly Payroll Summary Widget */}
              {kpi.latestPayroll && (
                <div className="mt-6 p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <span>Monthly Payroll ({kpi.latestPayroll.month}/{kpi.latestPayroll.year})</span>
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-200/60 text-blue-800 uppercase">
                      {kpi.latestPayroll.status}
                    </span>
                  </div>
                  <p className="text-lg font-black text-blue-950 mt-1.5">
                    ₹ {kpi.latestPayroll.totalNetSalary?.toLocaleString('en-IN')}
                  </p>
                  <Link
                    to="/payroll"
                    className="mt-2 text-[11px] font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                  >
                    <span>View Payroll Run Details</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 2. MANAGER DASHBOARD VIEW */}
      {isManager && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">My Team Members</span>
            <p className="text-3xl font-black text-slate-900 mt-2">{kpi.teamCount || 0}</p>
            <span className="text-xs text-slate-400">Under direct reporting line</span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Team Present Today</span>
            <p className="text-3xl font-black text-emerald-600 mt-2">{kpi.teamPresentToday || 0}</p>
            <span className="text-xs text-slate-400">Clocked in across branches</span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Pending Team Leaves</span>
            <p className="text-3xl font-black text-amber-600 mt-2">{kpi.teamPendingLeaves || 0}</p>
            <Link to="/leaves" className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 mt-1">
              <span>Review Requests</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* 3. EMPLOYEE ESS VIEW */}
      {isEmployee && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Today's Check In</span>
            <p className="text-xl font-black text-slate-900 mt-2">
              {kpi.checkInTime ? new Date(kpi.checkInTime).toLocaleTimeString() : 'Not Checked In'}
            </p>
            <span className="text-xs text-slate-400">Status: {kpi.statusToday}</span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Monthly Present Days</span>
            <p className="text-xl font-black text-blue-600 mt-2">{kpi.monthlyPresentDays || 0} Days</p>
            <span className="text-xs text-slate-400">Current calendar month</span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">My Pending Leaves</span>
            <p className="text-xl font-black text-amber-600 mt-2">{kpi.pendingLeaves || 0}</p>
            <Link to="/leaves" className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 mt-1">
              <span>Apply for Leave</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* 4. RECRUITER VIEW */}
      {isRecruiter && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Open Job Requisitions</span>
            <p className="text-3xl font-black text-blue-600 mt-2">{kpi.openJobCount || 0}</p>
            <Link to="/recruitment" className="text-xs font-bold text-blue-600 inline-flex items-center gap-1 mt-1">
              <span>Manage Job Openings</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Active Candidate Pipeline</span>
            <p className="text-3xl font-black text-indigo-600 mt-2">{kpi.activeCandidates || 0}</p>
            <span className="text-xs text-slate-400">Applied, Screening & Interviews</span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Headcount</span>
            <p className="text-3xl font-black text-slate-900 mt-2">{kpi.totalEmployees || 0}</p>
            <span className="text-xs text-emerald-600 font-semibold">{kpi.activeEmployees || 0} active</span>
          </div>
        </div>
      )}

      {/* 5. PAYROLL ADMIN VIEW */}
      {isPayroll && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Employees</span>
            <p className="text-3xl font-black text-slate-900 mt-2">{kpi.totalEmployees || 0}</p>
            <span className="text-xs text-emerald-600 font-semibold">Active salary structures</span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Latest Payroll Batch</span>
            <p className="text-2xl font-black text-blue-600 mt-2">
              ₹ {kpi.latestPayroll?.totalNetSalary?.toLocaleString('en-IN') || '0'}
            </p>
            <span className="text-xs text-slate-400 uppercase font-semibold">
              Status: {kpi.latestPayroll?.status || 'Draft'}
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Pending Expense Claims</span>
            <p className="text-3xl font-black text-amber-600 mt-2">{kpi.pendingExpenses || 0}</p>
            <Link to="/expenses" className="text-xs font-bold text-blue-600 inline-flex items-center gap-1 mt-1">
              <span>Review Claims</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Bottom Grid: Holidays, Upcoming Birthdays & System Activities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Holidays */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>Upcoming Holidays</span>
          </h3>
          <div className="divide-y divide-slate-100">
            {data?.upcomingHolidays && data.upcomingHolidays.length > 0 ? (
              data.upcomingHolidays.map((h) => (
                <div key={h._id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-800">{h.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(h.date).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {h.isOptional ? 'Optional' : 'Official'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4">No upcoming holidays scheduled.</p>
            )}
          </div>
        </div>

        {/* Upcoming Birthdays */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-2">
            <Cake className="w-4 h-4 text-pink-600" />
            <span>Colleague Birthdays</span>
          </h3>
          <div className="divide-y divide-slate-100">
            {data?.upcomingBirthdays && data.upcomingBirthdays.length > 0 ? (
              data.upcomingBirthdays.map((b) => (
                <div key={b._id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-800">{b.firstName} {b.lastName}</p>
                    <p className="text-[11px] text-slate-400">{b.departmentId?.name || 'PR VISION'}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-50 text-pink-700 border border-pink-200">
                    {new Date(b.dateOfBirth).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4">No birthdays recorded this month.</p>
            )}
          </div>
        </div>

        {/* Company Announcements / Notice Board */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-500" />
              <span>Announcements</span>
            </h3>
            <Link to="/announcements" className="text-xs font-bold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.announcements && data.announcements.length > 0 ? (
              data.announcements.slice(0, 3).map((a) => (
                <div key={a._id} className="py-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 line-clamp-1">{a.title}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{a.message || a.content}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4">No active announcements.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
