import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import {
  GraduationCap,
  Plus,
  BookOpen,
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Video,
} from 'lucide-react';

export default function TrainingPage() {
  const { user } = useSelector((state) => state.auth);
  const [programs, setPrograms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activeTab, setActiveTab] = useState('programs');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form
  const [newProgram, setNewProgram] = useState({
    title: '',
    category: 'Technical',
    trainerName: '',
    description: '',
    startDate: '',
    endDate: '',
    durationHours: 8,
    mode: 'Online',
  });

  const canManage = ['ADMIN', 'HR_MANAGER'].includes(user?.role);

  const fetchTrainingData = async () => {
    setIsLoading(true);
    try {
      const [progRes, assignRes] = await Promise.all([
        api.get('/training/programs'),
        api.get('/training/assignments'),
      ]);
      setPrograms(progRes.data.data.programs || []);
      setAssignments(assignRes.data.data.assignments || []);
    } catch (err) {
      toast.error('Failed to load training data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainingData();
  }, []);

  const handleCreateProgram = async (e) => {
    e.preventDefault();
    try {
      await api.post('/training/programs', newProgram);
      toast.success('Training program created successfully!');
      setShowAddModal(false);
      fetchTrainingData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create program.');
    }
  };

  const handleMarkCompleted = async (assignmentId) => {
    try {
      await api.patch(`/training/assignments/${assignmentId}/progress`, {
        status: 'Completed',
        score: 100,
        feedback: 'Completed self-paced training module.',
      });
      toast.success('Marked as Completed!');
      fetchTrainingData();
    } catch (err) {
      toast.error('Failed to update progress.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-600" />
            <span>Training & Development</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Corporate upskilling, compliance certifications, and employee learning pathways.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Training Program</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-bold text-slate-600 space-x-6">
        <button
          onClick={() => setActiveTab('programs')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'programs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Programs Catalog ({programs.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('my-learning')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'my-learning'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>{canManage ? 'All Enrollments' : 'My Enrollments'} ({assignments.length})</span>
        </button>
      </div>

      {/* Tab 1: Programs */}
      {activeTab === 'programs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((p) => (
            <div
              key={p._id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {p.category}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                    <Video className="w-3.5 h-3.5 text-slate-400" />
                    {p.mode}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{p.title}</h3>
                <p className="text-xs text-slate-600 mt-2 line-clamp-3">{p.description}</p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Duration:
                    </span>
                    <span className="font-semibold text-slate-700">{p.durationHours} Hours</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Trainer:</span>
                    <span className="font-semibold text-slate-700">{p.trainerName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Enrolled:</span>
                    <span className="font-semibold text-blue-600">{p.enrolledCount || 0} employees</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-400">
                  {new Date(p.startDate).toLocaleDateString()}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.status === 'Completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Enrollments */}
      {activeTab === 'my-learning' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="py-3 px-4">Program</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {assignments.map((a) => (
                <tr key={a._id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {a.programId?.title || 'Program'}
                  </td>
                  <td className="py-3 px-4">
                    {a.employeeId?.firstName} {a.employeeId?.lastName}
                    <div className="text-[10px] text-slate-400">{a.employeeId?.employeeId}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {a.score !== null ? `${a.score}%` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {a.status !== 'Completed' && (
                      <button
                        onClick={() => handleMarkCompleted(a._id)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                      >
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No learning assignments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">Create Training Program</h2>
            <form onSubmit={handleCreateProgram} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Program Title</label>
                <input
                  required
                  type="text"
                  value={newProgram.title}
                  onChange={(e) => setNewProgram({ ...newProgram, title: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  placeholder="e.g. Advanced System Design"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Category</label>
                  <select
                    value={newProgram.category}
                    onChange={(e) => setNewProgram({ ...newProgram, category: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Technical">Technical</option>
                    <option value="Compliance & POSH">Compliance & POSH</option>
                    <option value="Leadership">Leadership</option>
                    <option value="Sales">Sales</option>
                    <option value="Soft Skills">Soft Skills</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">Delivery Mode</label>
                  <select
                    value={newProgram.mode}
                    onChange={(e) => setNewProgram({ ...newProgram, mode: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Online">Online</option>
                    <option value="Classroom">Classroom</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Self-Paced">Self-Paced</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Trainer Name</label>
                  <input
                    required
                    type="text"
                    value={newProgram.trainerName}
                    onChange={(e) => setNewProgram({ ...newProgram, trainerName: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Duration (Hours)</label>
                  <input
                    type="number"
                    value={newProgram.durationHours}
                    onChange={(e) => setNewProgram({ ...newProgram, durationHours: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Start Date</label>
                  <input
                    required
                    type="date"
                    value={newProgram.startDate}
                    onChange={(e) => setNewProgram({ ...newProgram, startDate: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">End Date</label>
                  <input
                    required
                    type="date"
                    value={newProgram.endDate}
                    onChange={(e) => setNewProgram({ ...newProgram, endDate: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Description</label>
                <textarea
                  required
                  rows={3}
                  value={newProgram.description}
                  onChange={(e) => setNewProgram({ ...newProgram, description: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                >
                  Create Program
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

