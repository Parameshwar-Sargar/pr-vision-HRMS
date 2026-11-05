import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Clock, Plus, CheckCircle, Trash2, X } from 'lucide-react';

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    breakDurationMinutes: 60,
    gracePeriodMinutes: 15,
    weeklyOffDays: [0, 6],
    isDefault: false,
  });

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/shifts');
      setShifts(res.data.shifts || []);
    } catch (err) {
      toast.error('Failed to load shift timings');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/shifts', form);
      toast.success('Shift schedule created!');
      setShowModal(false);
      setForm({
        name: '',
        startTime: '09:00',
        endTime: '18:00',
        breakDurationMinutes: 60,
        gracePeriodMinutes: 15,
        weeklyOffDays: [0, 6],
        isDefault: false,
      });
      fetchShifts();
    } catch (err) {
      toast.error(err.message || 'Creation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this shift schedule?')) return;
    try {
      await api.delete(`/shifts/${id}`);
      toast.success('Shift deleted');
      fetchShifts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Shift Schedules</h2>
          <p className="text-xs text-slate-500">Configure standard working hours, grace periods & weekly offs</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
        >
          <Plus className="w-4 h-4" />
          <span>Add Shift</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {shifts.map((shift) => (
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
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => handleDelete(shift._id)}
                className="text-red-500 hover:text-red-700 p-1 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Create Shift</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-3 text-xs">
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
                    value={form.gracePeriodMinutes}
                    onChange={(e) => setForm({ ...form, gracePeriodMinutes: parseInt(e.target.value, 10) })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Break Duration (Mins)</label>
                  <input
                    type="number"
                    value={form.breakDurationMinutes}
                    onChange={(e) => setForm({ ...form, breakDurationMinutes: parseInt(e.target.value, 10) })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
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
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

