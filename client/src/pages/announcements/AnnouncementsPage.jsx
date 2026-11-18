import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../services/api';
import { fetchMasterData } from '../../store/slices/masterDataSlice';
import { toast } from 'react-hot-toast';
import {
  Megaphone,
  Plus,
  Pin,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
} from 'lucide-react';

const EMPTY_NOTICE = {
  title: '',
  message: '',
  category: 'Company Update',
  priority: 'Normal',
  targetBranchId: '',
  targetDepartmentId: '',
  isPinned: false,
};

export default function AnnouncementsPage() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { branches, departments } = useSelector((state) => state.masterData);
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState(null);

  const [newNotice, setNewNotice] = useState(EMPTY_NOTICE);

  const canManage = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'].includes(user?.role);

  const fetchAnnouncements = async (showSpinner = false, signal = null) => {
    if (showSpinner) setIsLoading(true);
    try {
      const params = canManage ? { includeInactive: 'true' } : {};
      const res = await api.get('/announcements', { params, signal, cacheTtl: 15000 });
      setAnnouncements(res.data?.announcements || res.announcements || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.message || 'Failed to load notices.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) {
      dispatch(fetchMasterData(false));
    }
    const controller = new AbortController();
    fetchAnnouncements(true, controller.signal);
    return () => controller.abort();
  }, [canManage, dispatch]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    const payload = {
      title: newNotice.title.trim(),
      message: newNotice.message.trim(),
      category: newNotice.category,
      priority: newNotice.priority,
      targetBranchId: newNotice.targetBranchId || null,
      targetDepartmentId: newNotice.targetDepartmentId || null,
      isPinned: Boolean(newNotice.isPinned),
    };

    try {
      setIsSaving(true);
      if (editingNotice) {
        const res = await api.put(`/announcements/${editingNotice._id}`, payload);
        const updated = res?.data?.announcement || res?.announcement;
        if (updated) {
          setAnnouncements((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
        }
        toast.success('Announcement updated successfully!');
      } else {
        const res = await api.post('/announcements', payload);
        const created = res?.data?.announcement || res?.announcement;
        if (created) {
          setAnnouncements((prev) => [created, ...prev]);
        }
        toast.success('Announcement broadcasted successfully!');
      }
      setShowAddModal(false);
      setEditingNotice(null);
      setNewNotice(EMPTY_NOTICE);
      fetchAnnouncements(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublish = async (notice) => {
    try {
      const nextActive = notice.isActive === false;
      const res = await api.patch(`/announcements/${notice._id}`, { isActive: nextActive });
      const updated = res?.data?.announcement || res?.announcement;
      if (updated) {
        setAnnouncements((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
      }
      toast.success(nextActive ? 'Announcement published.' : 'Announcement unpublished.');
      fetchAnnouncements(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update publish status.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Archive this announcement?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      toast.success('Announcement archived.');
      fetchAnnouncements(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to archive announcement.');
      fetchAnnouncements(false);
    }
  };

  const openCreateModal = () => {
    setEditingNotice(null);
    setNewNotice(EMPTY_NOTICE);
    setShowAddModal(true);
  };

  const openEditModal = (a) => {
    setEditingNotice(a);
    setNewNotice({
      title: a.title || '',
      message: a.message || a.content || '',
      category: a.category || 'Company Update',
      priority: a.priority || 'Normal',
      targetBranchId: a.targetBranchId?._id || a.targetBranchId || '',
      targetDepartmentId: a.targetDepartmentId?._id || a.targetDepartmentId || '',
      isPinned: Boolean(a.isPinned),
    });
    setShowAddModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-amber-500" />
            <span>Announcements & Communications</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Official company news, town hall broadcasts, holidays, and organizational updates.
          </p>
        </div>

        {canManage && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Post Announcement</span>
          </button>
        )}
      </div>

      {/* Announcements Stream */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            Loading announcements...
          </div>
        ) : (
          announcements.map((a) => (
            <div
              key={a._id}
              className={`bg-white border rounded-xl p-5 shadow-sm transition-shadow ${
                a.isActive === false
                  ? 'border-slate-200 opacity-75'
                  : a.isPinned
                  ? 'border-amber-300 ring-1 ring-amber-100'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.isPinned && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        <Pin className="w-3 h-3 fill-amber-500 text-amber-600" />
                        Pinned Notice
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {a.category}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        a.priority === 'High' || a.priority === 'Critical' || a.priority === 'Important'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {a.priority}
                    </span>
                    {a.targetBranchId?.name && (
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        Branch: {a.targetBranchId.name}
                      </span>
                    )}
                    {a.targetDepartmentId?.name && (
                      <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                        Dept: {a.targetDepartmentId.name}
                      </span>
                    )}
                    {a.isActive === false && (
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                        Unpublished / Archived
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 pt-1">{a.title}</h3>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(a)}
                      className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                      title="Edit Notice"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleTogglePublish(a)}
                      className="text-slate-400 hover:text-amber-600 transition-colors p-1"
                      title={a.isActive === false ? 'Publish Notice' : 'Unpublish Notice'}
                    >
                      {a.isActive === false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    {a.isActive !== false && (
                      <button
                        onClick={() => handleDelete(a._id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Archive Notice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-700 mt-3 whitespace-pre-wrap leading-relaxed">
                {a.message || a.content}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Published by {a.publishedBy?.name || 'Corporate HR'}</span>
                <span>{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}

        {!isLoading && announcements.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            No active announcements.
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">
              {editingNotice ? 'Edit Announcement' : 'Broadcast Announcement'}
            </h2>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Notice Title</label>
                <input
                  required
                  type="text"
                  value={newNotice.title}
                  onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                  placeholder="e.g. Q4 Town Hall Meeting & Awards"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Category</label>
                  <select
                    value={newNotice.category}
                    onChange={(e) => setNewNotice({ ...newNotice, category: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Company Update">Company Update</option>
                    <option value="Company News">Company News</option>
                    <option value="HR Policy Update">HR Policy Update</option>
                    <option value="Team Event">Team Event</option>
                    <option value="Events">Events</option>
                    <option value="Holiday Notice">Holiday Notice</option>
                    <option value="Urgent Alert">Urgent Alert</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">Priority</label>
                  <select
                    value={newNotice.priority}
                    onChange={(e) => setNewNotice({ ...newNotice, priority: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Important">Important</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Target Branch</label>
                  <select
                    value={newNotice.targetBranchId}
                    onChange={(e) => setNewNotice({ ...newNotice, targetBranchId: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">Target Department</label>
                  <select
                    value={newNotice.targetDepartmentId}
                    onChange={(e) => setNewNotice({ ...newNotice, targetDepartmentId: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Message Content</label>
                <textarea
                  required
                  rows={4}
                  value={newNotice.message}
                  onChange={(e) => setNewNotice({ ...newNotice, message: e.target.value })}
                  placeholder="Write the complete announcement text..."
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="pinNotice"
                  checked={newNotice.isPinned}
                  onChange={(e) => setNewNotice({ ...newNotice, isPinned: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <label htmlFor="pinNotice" className="text-slate-700 font-medium cursor-pointer">
                  Pin this notice to top of dashboard
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingNotice(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingNotice ? 'Save Changes' : 'Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

