import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import {
  LifeBuoy,
  Plus,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertCircle,
  Lock,
} from 'lucide-react';

export default function GrievancesPage() {
  const { user } = useSelector((state) => state.auth);
  const [grievances, setGrievances] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resolveModalItem, setResolveModalItem] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const [newGrievance, setNewGrievance] = useState({
    category: 'Workplace Harassment / POSH',
    priority: 'Medium',
    subject: '',
    description: '',
    isConfidential: false,
  });

  const canResolve = ['ADMIN', 'HR_MANAGER'].includes(user?.role);

  const fetchGrievances = async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      const res = await api.get('/grievances');
      setGrievances(res.data?.grievances || res.grievances || []);
    } catch (err) {
      toast.error('Failed to load tickets.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGrievances(true);
  }, []);

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/grievances', newGrievance);
      const created = res?.data?.grievance || res?.grievance;
      if (created) {
        setGrievances((prev) => [created, ...prev]);
      }
      toast.success('Ticket submitted to HR Redressal Committee!');
      setShowCreateModal(false);
      fetchGrievances(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to file ticket.');
    }
  };

  const handleResolveTicket = async (e) => {
    e.preventDefault();
    try {
      setGrievances((prev) =>
        prev.map((g) =>
          g._id === resolveModalItem._id ? { ...g, status: 'Resolved', resolutionNotes } : g
        )
      );
      await api.patch(`/grievances/${resolveModalItem._id}/status`, {
        status: 'Resolved',
        resolutionNotes,
      });
      toast.success('Ticket marked as Resolved!');
      setResolveModalItem(null);
      setResolutionNotes('');
      fetchGrievances(false);
    } catch (err) {
      toast.error('Failed to update ticket.');
      fetchGrievances(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-rose-600" />
            <span>Grievance Redressal & HR Helpdesk</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Confidential employee support, POSH committee tickets, policy questions, and workplace issue resolution.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Raise Grievance</span>
        </button>
      </div>

      {/* Tickets List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
            <tr>
              <th className="py-3 px-4">Ticket ID</th>
              <th className="py-3 px-4">Subject</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {grievances.map((g) => (
              <tr key={g._id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-mono font-bold text-rose-600">
                  {g.ticketNumber}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  <div className="flex items-center gap-1.5">
                    {g.isConfidential && (
                      <span title="Confidential" className="text-amber-600">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span>{g.subject}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-normal line-clamp-1">{g.description}</div>
                  {g.resolutionNotes && (
                    <div className="mt-1 text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded font-medium">
                      Resolution: {g.resolutionNotes}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                    {g.category}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      g.priority === 'Urgent' || g.priority === 'High'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {g.priority}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      g.status === 'Resolved' || g.status === 'Closed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : g.status === 'Under Review'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {g.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400">
                  {new Date(g.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-right">
                  {canResolve && g.status !== 'Resolved' && g.status !== 'Closed' && (
                    <button
                      onClick={() => setResolveModalItem(g)}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800"
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {grievances.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No grievances or tickets filed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Raise Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">File Grievance / HR Support</h2>
            <form onSubmit={handleSubmitTicket} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Category</label>
                  <select
                    value={newGrievance.category}
                    onChange={(e) => setNewGrievance({ ...newGrievance, category: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Workplace Harassment / POSH">POSH & Harassment</option>
                    <option value="Payroll & Compensation">Payroll & Compensation</option>
                    <option value="Managerial Conflict">Managerial Conflict</option>
                    <option value="Facility & Work Environment">Work Environment</option>
                    <option value="Policy Clarification">Policy Clarification</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">Priority</label>
                  <select
                    value={newGrievance.priority}
                    onChange={(e) => setNewGrievance({ ...newGrievance, priority: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Subject</label>
                <input
                  required
                  type="text"
                  value={newGrievance.subject}
                  onChange={(e) => setNewGrievance({ ...newGrievance, subject: e.target.value })}
                  placeholder="Summary of the issue..."
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Description</label>
                <textarea
                  required
                  rows={4}
                  value={newGrievance.description}
                  onChange={(e) => setNewGrievance({ ...newGrievance, description: e.target.value })}
                  placeholder="Provide all relevant context, dates, and details..."
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="confidential"
                  checked={newGrievance.isConfidential}
                  onChange={(e) => setNewGrievance({ ...newGrievance, isConfidential: e.target.checked })}
                  className="rounded text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="confidential" className="text-slate-700 font-medium cursor-pointer">
                  Mark as Strictly Confidential (Restricted to HR Committee)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {resolveModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-2">Resolve Grievance</h2>
            <p className="text-xs text-slate-500 mb-4">
              Ticket <span className="font-bold font-mono text-slate-800">{resolveModalItem.ticketNumber}</span>: {resolveModalItem.subject}
            </p>

            <form onSubmit={handleResolveTicket} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700">Resolution Findings & Action Taken</label>
                <textarea
                  required
                  rows={4}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Describe how the matter was reviewed and addressed..."
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolveModalItem(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                >
                  Mark as Resolved
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

