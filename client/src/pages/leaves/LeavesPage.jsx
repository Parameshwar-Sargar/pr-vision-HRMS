import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Plus,
  Calendar,
  Trash2,
  X,
} from 'lucide-react';

const calculateInclusiveDays = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

export default function LeavesPage() {
  const { user, employee } = useSelector((state) => state.auth);
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.pathname === '/holidays' ? 'holidays' : 'leaves');
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Apply Leave Modal
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    totalDays: 1,
    reason: '',
  });

  // Add Holiday Modal
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: '',
    description: '',
    isOptional: false,
  });

  // Cancel Approved Leave Modal (HR/Admin Only)
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const isApprover = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role);
  const isAdminOrHR = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role);
  const currentEmployeeId = employee?._id || user?.employeeId || null;

  const isOwnLeaveRequest = (req) => {
    if (currentEmployeeId && req.employeeId?._id === currentEmployeeId) return true;
    if (user?.email && req.employeeId?.email === user.email) return true;
    return !isApprover;
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchLeaveData(true, controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (location.pathname === '/holidays') {
      setActiveTab('holidays');
    }
  }, [location.pathname]);

  useEffect(() => {
    if (activeTab !== 'holidays') return;
    const controller = new AbortController();
    fetchHolidays(controller.signal);
    return () => controller.abort();
  }, [activeTab]);

  const fetchHolidays = async (signal = null) => {
    try {
      const holRes = await api.get('/holidays', { signal, cacheTtl: 30000 });
      setHolidays(holRes.data?.holidays || holRes.holidays || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('Failed to load holiday calendar');
    }
  };

  const fetchLeaveData = async (showSkeleton = false, signal = null) => {
    try {
      if (showSkeleton) setLoading(true);
      const [balRes, reqRes, typesRes] = await Promise.all([
        api.get('/leaves/balances', { signal, cacheTtl: 10000 }),
        api.get('/leaves/requests', { signal, cacheTtl: 10000 }),
        api.get('/leaves/types', { signal, cacheTtl: 300000 }),
      ]);
      setBalances(balRes.data?.balances || balRes.balances || []);
      setRequests(reqRes.data?.requests || reqRes.requests || []);
      setLeaveTypes(typesRes.data?.leaveTypes || typesRes.leaveTypes || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('Failed to load leave records');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      const res = await api.post('/leaves/apply', {
        ...applyForm,
        totalDays: Number(applyForm.totalDays),
      });
      const created = res?.data?.request || res?.request;
      if (created) {
        setRequests((prev) => [created, ...prev]);
      }
      toast.success('Leave applied successfully and sent for approval!');
      setShowApplyModal(false);
      setApplyForm({ leaveTypeId: '', startDate: '', endDate: '', totalDays: 1, reason: '' });
      fetchLeaveData(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Leave application failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateRangeChange = (field, value) => {
    setApplyForm((prev) => {
      const updated = { ...prev, [field]: value };
      const computed = calculateInclusiveDays(updated.startDate, updated.endDate);
      if (computed !== null) {
        updated.totalDays = computed;
      }
      return updated;
    });
  };

  const handleCreateHoliday = async (e) => {
    e.preventDefault();
    try {
      await api.post('/holidays', holidayForm);
      toast.success('Holiday added to company calendar!');
      setShowHolidayModal(false);
      setHolidayForm({ name: '', date: '', description: '', isOptional: false });
      fetchHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to add holiday');
    }
  };

  const handleDeleteHoliday = async (holidayId) => {
    try {
      await api.delete(`/holidays/${holidayId}`);
      toast.success('Holiday removed');
      fetchHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to remove holiday');
    }
  };

  const handleReview = async (id, status) => {
    try {
      setRequests((prev) => prev.map((r) => (r._id === id ? { ...r, status } : r)));
      await api.patch(`/leaves/requests/${id}/review`, { status });
      toast.success(`Leave request ${status.toLowerCase()}`);
      fetchLeaveData(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Review action failed');
      fetchLeaveData(false);
    }
  };

  const handleCancelLeave = async (id, reason = '') => {
    try {
      setIsCancelling(true);
      const res = await api.post(`/leaves/requests/${id}/cancel`, reason ? { cancellationReason: reason } : {});
      setRequests((prev) =>
        prev.map((r) =>
          r._id === id ? res?.data?.leaveRequest || { ...r, status: 'Cancelled', cancellationReason: reason } : r
        )
      );
      if (res?.data?.payrollImpact?.hasLockedPayroll) {
        toast.success('Approved leave cancelled. Locked payroll untouched — pending adjustment queued.');
      } else {
        toast.success('Leave request cancelled successfully.');
      }
      setCancelTarget(null);
      setCancellationReason('');
      fetchLeaveData(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to cancel leave');
      fetchLeaveData(false);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleConfirmApprovedCancel = async (e) => {
    e.preventDefault();
    if (!cancelTarget || isCancelling) return;
    const trimmed = cancellationReason.trim();
    if (trimmed.length < 3) {
      toast.error('Please enter a cancellation reason (at least 3 characters).');
      return;
    }
    await handleCancelLeave(cancelTarget._id, trimmed);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Leave Management</h2>
          <p className="text-xs text-slate-500">Track leave balances, submit requests & manager approvals</p>
        </div>

        <button
          onClick={() => setShowApplyModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
        >
          <Plus className="w-4 h-4" />
          <span>Apply for Leave</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-bold text-slate-600 space-x-6">
        <button
          type="button"
          onClick={() => setActiveTab('leaves')}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === 'leaves' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Leave Requests &amp; Balances
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('holidays')}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === 'holidays' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Holiday Calendar
        </button>
      </div>

      {activeTab === 'leaves' && (
        <>
      {/* Leave Balances Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {balances.map((b, idx) => (
          <div key={idx} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              {b.leaveTypeId?.name || 'Leave Type'}
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-black text-blue-600">{b.remaining}</span>
                <span className="text-xs text-slate-400 ml-1">days left</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Used: {b.used} / {b.allocated}
              </span>
            </div>
            {b.pending > 0 && (
              <span className="mt-2 inline-block text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                {b.pending} day(s) pending review
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Leave Requests Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4">Leave Applications</h3>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No leave requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Leave Type</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr key={req._id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {req.employeeId?.firstName} {req.employeeId?.lastName}
                      <span className="block text-[10px] font-mono text-slate-400">
                        {req.employeeId?.employeeId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-blue-700">
                      {req.leaveTypeId?.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {new Date(req.startDate).toLocaleDateString()} &rarr;{' '}
                      {new Date(req.endDate).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{req.totalDays} Days</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                      <div className="truncate">{req.reason}</div>
                      {req.reviewRemarks && (
                        <div className="text-[10px] text-slate-400 truncate">Remarks: {req.reviewRemarks}</div>
                      )}
                      {req.cancellationReason && (
                        <div className="text-[10px] text-rose-600 truncate">
                          Cancelled: {req.cancellationReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          req.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : req.status === 'Pending'
                            ? 'bg-amber-100 text-amber-800'
                            : req.status === 'Cancelled'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {isApprover && req.status === 'Pending' && (isAdminOrHR || !isOwnLeaveRequest(req)) && (
                        <>
                          <button
                            onClick={() => handleReview(req._id, 'Approved')}
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded font-bold"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReview(req._id, 'Rejected')}
                            className="px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded font-bold"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {req.status === 'Pending' && (isOwnLeaveRequest(req) || isAdminOrHR) && (
                        <button
                          onClick={() => handleCancelLeave(req._id)}
                          className="px-2.5 py-1 bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-700 border border-slate-300 rounded font-bold"
                        >
                          Cancel
                        </button>
                      )}
                      {req.status === 'Approved' && isAdminOrHR && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelTarget(req);
                            setCancellationReason('');
                          }}
                          className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded font-bold"
                        >
                          Cancel Approved
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Apply for Leave</h3>
              <button onClick={() => setShowApplyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleApplyLeave} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Leave Category *</label>
                <select
                  required
                  value={applyForm.leaveTypeId}
                  onChange={(e) => setApplyForm({ ...applyForm, leaveTypeId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Leave Type</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt._id} value={lt._id}>
                      {lt.name} ({lt.isPaid ? 'Paid' : 'Unpaid'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.startDate}
                    onChange={(e) => handleDateRangeChange('startDate', e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">End Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.endDate}
                    onChange={(e) => handleDateRangeChange('endDate', e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700">Total Working Days *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={applyForm.totalDays}
                  onChange={(e) => setApplyForm({ ...applyForm, totalDays: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700">Reason for Leave *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide brief context for manager review"
                  value={applyForm.reason}
                  onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowApplyModal(false);
                    setApplyForm({ leaveTypeId: '', startDate: '', endDate: '', totalDays: 1, reason: '' });
                  }}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Company Holidays Section */}
      {activeTab === 'holidays' && (
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Company Holiday Calendar</h3>
              <p className="text-[11px] text-slate-500">Official non-working public and regional holidays</p>
            </div>
          </div>
          {isAdminOrHR && (
            <button
              type="button"
              onClick={() => setShowHolidayModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Holiday</span>
            </button>
          )}
        </div>
        {holidays.length === 0 ? (
          <p className="text-xs text-slate-400">No holidays configured for the current calendar year.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {holidays.map((h) => (
              <div
                key={h._id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-2"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase text-blue-600">
                    {new Date(h.date).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <h4 className="text-xs font-bold text-slate-900 mt-0.5">{h.name}</h4>
                  <span className="text-[10px] text-slate-500">
                    {h.isOptional ? 'Optional / Restricted Holiday' : 'Company Holiday'}
                    {h.description ? ` • ${h.description}` : ''}
                  </span>
                </div>
                {isAdminOrHR && (
                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(h._id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    title="Delete holiday"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Cancel Approved Leave Modal (HR / Admin Mandatory Reason) */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Cancel Approved Leave Request</h3>
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancellationReason('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmApprovedCancel} className="mt-4 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                <p className="font-bold">
                  {cancelTarget.employeeId?.firstName} {cancelTarget.employeeId?.lastName} — {cancelTarget.leaveTypeId?.name} ({cancelTarget.totalDays} days)
                </p>
                <p className="text-[11px]">
                  This will restore leave balance, update On Leave attendance records, log an audit entry, and queue a future payroll adjustment if the payroll period is already locked/paid.
                </p>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Mandatory Cancellation Reason *</label>
                <textarea
                  rows={3}
                  required
                  minLength={3}
                  placeholder="Enter reason for cancelling this approved leave (minimum 3 characters)"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setCancelTarget(null);
                    setCancellationReason('');
                  }}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Keep Approved
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add Company Holiday</h3>
              <button type="button" onClick={() => setShowHolidayModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateHoliday} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Holiday Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Republic Day"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Holiday Date *</label>
                <input
                  type="date"
                  required
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. National / Regional observance"
                  value={holidayForm.description}
                  onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={holidayForm.isOptional}
                  onChange={(e) => setHolidayForm({ ...holidayForm, isOptional: e.target.checked })}
                />
                <span>Optional / Restricted Holiday (does not reduce mandatory workdays)</span>
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

