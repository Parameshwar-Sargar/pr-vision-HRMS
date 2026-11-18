import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Clock,
  Play,
  Square,
  Edit,
  MessageSquarePlus,
  X,
} from 'lucide-react';

const toLocalDateTimeInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Isolated memoized clock component so 1-second ticks do not re-render AttendancePage or its log table.
 */
const LiveAttendanceClock = React.memo(function LiveAttendanceClock() {
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 mt-0.5">
      {currentTime}
    </div>
  );
});

export default function AttendancePage() {
  const { user, employee } = useSelector((state) => state.auth);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockLoading, setClockLoading] = useState(false);

  // Filter
  const [statusFilter, setStatusFilter] = useState('');

  // Adjustment Modal (Admin / HR)
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ checkInTime: '', checkOutTime: '', status: 'Present', notes: '' });

  // Correction Request Modal (Employee / Self)
  const [correctionRecord, setCorrectionRecord] = useState(null);
  const [correctionForm, setCorrectionForm] = useState({
    requestedCheckIn: '',
    requestedCheckOut: '',
    reason: '',
  });

  const isAdminOrHR = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role);
  const currentEmployeeId = employee?._id || user?.employeeId || null;

  useEffect(() => {
    const controller = new AbortController();
    fetchAttendance(attendance.length === 0, controller.signal);
    return () => controller.abort();
  }, [statusFilter]);

  const fetchAttendance = async (showSkeleton = false, signal = null) => {
    try {
      if (showSkeleton) setLoading(true);
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/attendance', { params, signal, cacheTtl: 10000 });
      setAttendance(res.data?.attendance || res.attendance || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    if (clockLoading) return;
    try {
      setClockLoading(true);
      const res = await api.post('/attendance/check-in');
      const record = res?.data?.record || res?.record;
      if (record) {
        setAttendance((prev) => [record, ...prev.filter((r) => r._id !== record._id)]);
      }
      toast.success(res.message || 'Checked in successfully!');
      fetchAttendance(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClockLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (clockLoading) return;
    try {
      setClockLoading(true);
      const res = await api.post('/attendance/check-out');
      const record = res?.data?.record || res?.record;
      if (record) {
        setAttendance((prev) => prev.map((r) => (r._id === record._id ? { ...r, ...record } : r)));
      }
      toast.success(res.message || 'Checked out successfully!');
      fetchAttendance(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClockLoading(false);
    }
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        status: adjustForm.status,
        notes: adjustForm.notes,
        checkInTime: adjustForm.checkInTime ? new Date(adjustForm.checkInTime).toISOString() : undefined,
        checkOutTime: adjustForm.checkOutTime ? new Date(adjustForm.checkOutTime).toISOString() : undefined,
      };
      const res = await api.patch(`/attendance/${selectedRecord._id}/adjust`, payload);
      const updated = res?.data?.record || res?.record;
      if (updated) {
        setAttendance((prev) => prev.map((r) => (r._id === updated._id ? { ...r, ...updated } : r)));
      }
      toast.success('Attendance adjusted successfully');
      setSelectedRecord(null);
      fetchAttendance(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Adjustment failed');
    }
  };

  const handleRejectCorrection = async () => {
    if (!selectedRecord) return;
    try {
      await api.patch(`/attendance/${selectedRecord._id}/adjust`, {
        correctionStatus: 'Rejected',
        notes: adjustForm.notes || 'Correction request rejected by HR/Admin',
      });
      toast.success('Correction request marked as Rejected');
      setSelectedRecord(null);
      fetchAttendance(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to reject request');
    }
  };

  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    if (!correctionRecord) return;
    try {
      await api.post(`/attendance/${correctionRecord._id}/correction`, {
        requestedCheckIn: correctionForm.requestedCheckIn
          ? new Date(correctionForm.requestedCheckIn).toISOString()
          : undefined,
        requestedCheckOut: correctionForm.requestedCheckOut
          ? new Date(correctionForm.requestedCheckOut).toISOString()
          : undefined,
        reason: correctionForm.reason,
      });
      toast.success('Attendance correction request submitted!');
      setCorrectionRecord(null);
      setCorrectionForm({ requestedCheckIn: '', requestedCheckOut: '', reason: '' });
      fetchAttendance(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit correction request');
    }
  };

  return (
    <div className="space-y-6">
      {/* Clock-in Terminal Banner */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <LiveAttendanceClock />
            <p className="text-xs text-slate-500 mt-1">Live Employee Timestamp & Overtime Recorder</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleClockIn}
            disabled={clockLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-200 transition-all disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Clock In</span>
          </button>
          <button
            onClick={handleClockOut}
            disabled={clockLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-200 transition-all disabled:opacity-50"
          >
            <Square className="w-4 h-4 fill-white" />
            <span>Clock Out</span>
          </button>
        </div>
      </div>

      {/* Attendance Logs Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Attendance Log Register</h3>
            <p className="text-xs text-slate-500">Database timestamps, calculated work hours, and status</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Half-day">Half-day</option>
              <option value="Absent">Absent</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : attendance.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No attendance records logged for this criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Clock In</th>
                  <th className="py-3 px-4">Clock Out</th>
                  <th className="py-3 px-4">Hours Worked</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.map((rec) => {
                  const isOwnRecord =
                    (currentEmployeeId && rec.employeeId?._id === currentEmployeeId) ||
                    (user?.email && rec.employeeId?.email === user.email) ||
                    !isAdminOrHR;
                  return (
                  <tr key={rec._id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {new Date(rec.date).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block">
                        {rec.employeeId?.firstName} {rec.employeeId?.lastName}
                      </span>
                      <span className="font-mono text-[10px] text-blue-600">
                        {rec.employeeId?.employeeId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-mono">
                      {rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-mono">
                      {rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {rec.totalHours || 0} hrs
                      {rec.overtimeHours > 0 && (
                        <span className="text-[10px] text-emerald-600 font-semibold block">
                          +{rec.overtimeHours}h OT
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          rec.status === 'Present'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec.status === 'Late'
                            ? 'bg-amber-100 text-amber-800'
                            : rec.status === 'Half-day'
                            ? 'bg-purple-100 text-purple-800'
                            : rec.status === 'On Leave'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {rec.status}
                      </span>
                      {rec.correctionRequest?.isRequested && (
                        <span
                          className={`block mt-1 text-[10px] font-semibold ${
                            rec.correctionRequest.status === 'Approved'
                              ? 'text-emerald-700'
                              : rec.correctionRequest.status === 'Rejected'
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}
                        >
                          Correction: {rec.correctionRequest.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {isOwnRecord && (
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectionRecord(rec);
                            setCorrectionForm({
                              requestedCheckIn: toLocalDateTimeInput(rec.checkInTime),
                              requestedCheckOut: toLocalDateTimeInput(rec.checkOutTime),
                              reason: '',
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold text-slate-600 hover:text-blue-600 hover:bg-slate-100"
                          title="Request Regularization"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          <span>Correction</span>
                        </button>
                      )}
                      {isAdminOrHR && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRecord(rec);
                            setAdjustForm({
                              checkInTime: toLocalDateTimeInput(rec.checkInTime),
                              checkOutTime: toLocalDateTimeInput(rec.checkOutTime),
                              status: rec.status,
                              notes: rec.notes || '',
                            });
                          }}
                          className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                          title="HR Adjustment"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjust Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Adjust Attendance</h3>
              <button type="button" onClick={() => setSelectedRecord(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {selectedRecord.correctionRequest?.isRequested && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                <div className="font-bold">
                  Correction Request ({selectedRecord.correctionRequest.status})
                </div>
                <div>Reason: {selectedRecord.correctionRequest.reason}</div>
                {selectedRecord.correctionRequest.status === 'Pending' && (
                  <button
                    type="button"
                    onClick={() =>
                      setAdjustForm((prev) => ({
                        ...prev,
                        checkInTime: selectedRecord.correctionRequest.requestedCheckIn
                          ? toLocalDateTimeInput(selectedRecord.correctionRequest.requestedCheckIn)
                          : prev.checkInTime,
                        checkOutTime: selectedRecord.correctionRequest.requestedCheckOut
                          ? toLocalDateTimeInput(selectedRecord.correctionRequest.requestedCheckOut)
                          : prev.checkOutTime,
                      }))
                    }
                    className="text-blue-700 font-bold underline"
                  >
                    Load Requested Check-In/Out Times
                  </button>
                )}
              </div>
            )}
            <form onSubmit={handleAdjustSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Check In Time</label>
                <input
                  type="datetime-local"
                  value={adjustForm.checkInTime}
                  onChange={(e) => setAdjustForm({ ...adjustForm, checkInTime: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Check Out Time</label>
                <input
                  type="datetime-local"
                  value={adjustForm.checkOutTime}
                  onChange={(e) => setAdjustForm({ ...adjustForm, checkOutTime: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Attendance Status</label>
                <select
                  value={adjustForm.status}
                  onChange={(e) => setAdjustForm({ ...adjustForm, status: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Half-day">Half-day</option>
                  <option value="Absent">Absent</option>
                  <option value="On Leave">On Leave</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Biometric reader sync failure"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                {selectedRecord.correctionRequest?.status === 'Pending' && (
                  <button
                    type="button"
                    onClick={handleRejectCorrection}
                    className="mr-auto px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold"
                  >
                    Reject Request
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Correction Modal */}
      {correctionRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Request Attendance Correction</h3>
              <button type="button" onClick={() => setCorrectionRecord(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCorrectionSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Requested Check In Time</label>
                <input
                  type="datetime-local"
                  value={correctionForm.requestedCheckIn}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckIn: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Requested Check Out Time</label>
                <input
                  type="datetime-local"
                  value={correctionForm.requestedCheckOut}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckOut: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Reason *</label>
                <textarea
                  rows={3}
                  required
                  minLength={3}
                  placeholder="Explain missed punch or regularization reason..."
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCorrectionRecord(null)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

