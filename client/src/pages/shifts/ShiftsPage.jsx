import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Clock, Plus, Edit2, Trash2, X } from 'lucide-react';
import { addShift, updateShift, removeShift } from '../../store/slices/masterDataSlice';

const WEEKDAY_LABELS = [
  { day: 0, label: 'Sun' },
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];

const getInitialShiftForm = () => ({
  name: '',
  startTime: '09:00',
  endTime: '18:00',
  breakDurationMinutes: 60,
  gracePeriodMinutes: 15,
  weeklyOffDays: [0, 6],
  isDefault: false,
});

export default function ShiftsPage() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'].includes(user?.role);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [form, setForm] = useState(getInitialShiftForm);

  useEffect(() => {
    const controller = new AbortController();
    fetchShifts(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchShifts = async (signal = null) => {
    try {
      setLoading(true);
      const res = await api.get('/shifts', { signal, cacheTtl: 30000 });
      setShifts(res.data?.shifts || res.shifts || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('Failed to load shift timings');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingShift(null);
    setForm(getInitialShiftForm());
  };

  const openEditShift = (shift) => {
    setEditingShift(shift);
    setForm({
      name: shift.name || '',
      startTime: shift.startTime || '09:00',
      endTime: shift.endTime || '18:00',
      breakDurationMinutes: shift.breakDurationMinutes ?? 60,
      gracePeriodMinutes: shift.gracePeriodMinutes ?? 15,
      weeklyOffDays: Array.isArray(shift.weeklyOffDays) ? shift.weeklyOffDays : [0, 6],
      isDefault: !!shift.isDefault,
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        breakDurationMinutes: Number(form.breakDurationMinutes) || 0,
        gracePeriodMinutes: Number(form.gracePeriodMinutes) || 0,
      };
      if (editingShift) {
        const res = await api.put(`/shifts/${editingShift._id}`, payload);
        const updated = res.data?.shift || res.shift;
        if (updated) {
          dispatch(updateShift(updated));
        }
        toast.success('Shift schedule updated!');
      } else {
        const res = await api.post('/shifts', payload);
        const created = res.data?.shift || res.shift;
        if (created) {
          dispatch(addShift(created));
        }
        toast.success('Shift schedule created!');
      }
      closeModal();
      fetchShifts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Save failed');
    }
  };

  const toggleWeeklyOffDay = (day) => {
    setForm((prev) => {
      const exists = prev.weeklyOffDays.includes(day);
      const nextDays = exists
        ? prev.weeklyOffDays.filter((d) => d !== day)
        : [...prev.weeklyOffDays, day].sort((a, b) => a - b);
      return { ...prev, weeklyOffDays: nextDays };
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this shift schedule?')) return;
    try {
      await api.delete(`/shifts/${id}`);
      dispatch(removeShift(id));
      toast.success('Shift deleted');
      fetchShifts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Shift Schedules</h2>
          <p className="text-xs text-slate-500">Configure standard working hours, grace periods & weekly offs</p>
        </div>

        {canManage && (
          <button
            onClick={() => {
              setEditingShift(null);
              setForm(getInitialShiftForm());
              setShowModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
          >
            <Plus className="w-4 h-4" />
            <span>Add Shift</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {shifts.map((shift) => {
          const offLabels = (shift.weeklyOffDays || [0, 6])
            .map((d) => WEEKDAY_LABELS.find((w) => w.day === d)?.label)
            .filter(Boolean)
            .join(', ');
          return (
            <div
              key={shift._id}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                    <Clock className="w-5 h-5" />
                  </span>
                  {shift.isDefault && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                      Default Shift
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-3">{shift.name}</h3>
                <p className="text-xl font-black font-mono text-blue-600 mt-2">
                  {shift.startTime} - {shift.endTime}
                </p>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>Grace Period: {shift.gracePeriodMinutes} mins</p>
                  <p>Break Duration: {shift.breakDurationMinutes} mins</p>
                  <p>Weekly Off: {offLabels || 'None'}</p>
                </div>
              </div>

              {canManage && (
                <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditShift(shift)}
                    className="text-slate-500 hover:text-blue-600 p-1 rounded"
                    title="Edit Shift"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(shift._id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded"
                    title="Archive Shift"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canManage && showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingShift ? 'Edit Shift Schedule' : 'Create Shift'}
              </h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Shift Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Morning Shift"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Start Time (HH:mm)</label>
                  <input
                    type="time"
                    required
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">End Time (HH:mm)</label>
                  <input
                    type="time"
                    required
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Grace Period (Mins)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.gracePeriodMinutes}
                    onChange={(e) => setForm({ ...form, gracePeriodMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Break Duration (Mins)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.breakDurationMinutes}
                    onChange={(e) => setForm({ ...form, breakDurationMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Weekly Off Days</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((w) => {
                    const checked = form.weeklyOffDays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => toggleWeeklyOffDay(w.day)}
                        className={`px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors ${
                          checked
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="rounded text-blue-600"
                />
                <span className="font-semibold text-slate-700">Set as Company Default Shift</span>
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  {editingShift ? 'Update Shift' : 'Save Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

