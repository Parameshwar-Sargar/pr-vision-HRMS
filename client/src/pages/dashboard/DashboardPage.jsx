import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  CalendarDays,
  CreditCard,
  Building2,
  Calendar,
  Activity,
  CheckCircle,
  AlertCircle,
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
  const { user, tenant } = useSelector((state) => state.auth);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clockLoading, setClockLoading] = useState(false);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/dashboard/stats');
      setStats(res.data);
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
      toast.success(res.message || 'Clocked in successfully!');
      fetchDashboardStats();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClockLoading(false);
    }
  };

  const handleClockOut = async () => {
    try {
      setClockLoading(true);
      const res = await api.post('/attendance/check-out');
      toast.success(res.message || 'Clocked out successfully!');
      fetchDashboardStats();
    } catch (err) {
      toast.error(err.message);
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

  const kpi = stats?.kpi || {};
  const isEmployee = user?.role === 'EMPLOYEE';
  const isManager = user?.role === 'MANAGER';
  const isAdminOrHR = user?.role === 'COMPANY_ADMIN' || user?.role === 'HR_MANAGER';

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Welcome back, {user?.name}!
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-blue-100">
              {tenant?.name || 'PR VISION HRMS'} &bull; Role: {user?.role?.replace('_', ' ')}
            </p>
          </div>

          {/* Quick Clock-In/Clock-Out widget for Employee or Manager */}
          {(isEmployee || isManager) && (
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-2 rounded-xl border border-white/20">
              <span className="text-xs font-semibold mr-1">
                Status: {kpi.statusToday || 'Active'}
              </span>
              {!kpi.checkedIn ? (
                <button
                  onClick={handleClockIn}
                  disabled={clockLoading}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {clockLoading ? 'Processing...' : 'Clock In'}
                </button>
              ) : !kpi.checkedOut ? (
                <button
                  onClick={handleClockOut}
                  disabled={clockLoading}
                  className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {clockLoading ? 'Processing...' : 'Clock Out'}
                </button>
              ) : (
                <span className="text-xs px-2 py-1 rounded bg-white/20 font-bold">Completed Today</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards (Admin / HR) */}
      {isAdminOrHR && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Staff</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{kpi.totalEmployees || 0}</p>
            <span className="text-[11px] text-emerald-600 font-semibold">
              {kpi.activeEmployees || 0} currently active
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Present Today</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{kpi.presentToday || 0}</p>
            <span className="text-[11px] text-amber-600 font-semibold">
              {kpi.lateToday || 0} late arrivals
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">On Leave / Absent</span>
              <div className="p-2 rounded-xl bg-red-50 text-red-600">
                <UserX className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{kpi.onLeaveToday || 0}</p>
            <span className="text-[11px] text-slate-500 font-semibold">
              {kpi.absentToday || 0} unexcused absent
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Pending Leaves</span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{kpi.pendingLeaveRequests || 0}</p>
            <span className="text-[11px] text-blue-600 font-semibold">Requires review</span>
          </div>
        </div>
      )}

      {/* KPI Cards (Employee View) */}
      {isEmployee && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Today's Check In</span>
            <p className="text-xl font-bold text-slate-800 mt-2">
              {kpi.checkInTime ? new Date(kpi.checkInTime).toLocaleTimeString() : 'Not clocked in'}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">This Month Present Days</span>
            <p className="text-xl font-bold text-blue-600 mt-2">{kpi.monthlyPresentDays || 0} Days</p>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase">Pending Leave Requests</span>
            <p className="text-xl font-bold text-amber-600 mt-2">{kpi.pendingLeaves || 0}</p>
          </div>
        </div>
      )}

      {/* Charts & Department Breakdown (Admin / HR) */}
      {isAdminOrHR && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 7-Day Attendance Trend Chart */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                7-Day Attendance Trend
              </h3>
              <span className="text-xs text-slate-400">Database Live Feed</span>
            </div>
            <div className="h-64 w-full">
              {stats.attendanceTrends && stats.attendanceTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.attendanceTrends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="_id" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="present" fill="#2563EB" name="Present" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="late" fill="#F59E0B" name="Late" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No attendance logged in the past 7 days.
                </div>
              )}
            </div>
          </div>

          {/* Department Distribution */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Department Staffing</span>
              </h3>
              <div className="space-y-4">
                {stats.departmentDistribution && stats.departmentDistribution.length > 0 ? (
                  stats.departmentDistribution.map((dept, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-700">{dept.name}</span>
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

            {kpi.latestPayroll && (
              <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  <span>Latest Payroll: {kpi.latestPayroll.month}/{kpi.latestPayroll.year}</span>
                </div>
                <p className="text-sm font-extrabold text-blue-900 mt-1">
                  ₹ {kpi.latestPayroll.totalNetSalary?.toLocaleString('en-IN') || 0}
                </p>
                <span className="text-[10px] text-emerald-700 font-semibold uppercase">
                  Status: {kpi.latestPayroll.status}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Row: Upcoming Holidays & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Holidays */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>Upcoming Holidays</span>
          </h3>
          <div className="divide-y divide-slate-100">
            {stats.upcomingHolidays && stats.upcomingHolidays.length > 0 ? (
              stats.upcomingHolidays.map((h) => (
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

        {/* Recent Activity */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span>System Activity Log</span>
          </h3>
          <div className="divide-y divide-slate-100">
            {stats.recentActivities && stats.recentActivities.length > 0 ? (
              stats.recentActivities.map((act) => (
                <div key={act._id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">
                      {act.action?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] text-slate-400">by {act.actorEmail}</p>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4">No recent activity recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

