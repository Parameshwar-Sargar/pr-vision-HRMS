import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import {
  Megaphone,
  Plus,
  Pin,
  Calendar,
  AlertTriangle,
  Building,
  Trash2,
} from 'lucide-react';

export default function AnnouncementsPage() {
  const { user } = useSelector((state) => state.auth);
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newNotice, setNewNotice] = useState({
    title: '',
    message: '',
    category: 'Company Update',
    priority: 'Normal',
    isPinned: false,
  });

  const canManage = ['ADMIN', 'HR_MANAGER'].includes(user?.role);

  const fetchAnnouncements = async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      const res = await api.get('/announcements');
      setAnnouncements(res.data?.announcements || res.announcements || []);
    } catch (err) {
      toast.error('Failed to load notices.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements(true);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/announcements', newNotice);
      const created = res?.data?.announcement || res?.announcement;
      if (created) {
        setAnnouncements((prev) => [created, ...prev]);
      }
      toast.success('Announcement broadcasted successfully!');
      setShowAddModal(false);
      fetchAnnouncements(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to post announcement.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      setAnnouncements((prev) => prev.filter((a) => a._id !== id));
      await api.delete(`/announcements/${id}`);
      toast.success('Announcement deleted.');
      fetchAnnouncements(false);
    } catch (err) {
      toast.error('Failed to delete.');
      fetchAnnouncements(false);
    }
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
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Post Announcement</span>
          </button>
        )}
      </div>

      {/* Announcements Stream */}
      <div className="space-y-4">
        {announcements.map((a) => (
          <div
            key={a._id}
            className={`bg-white border rounded-xl p-5 shadow-sm transition-shadow ${
              a.isPinned ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
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
                      a.priority === 'High' || a.priority === 'Critical'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {a.priority}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 pt-1">{a.title}</h3>
              </div>

              {canManage && (
                <button
                  onClick={() => handleDelete(a._id)}
                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                  title="Archive Notice"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
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
        ))}

        {announcements.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            No active announcements.
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">Broadcast Announcement</h2>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
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
                    <option value="HR Policy Update">Policy Update</option>
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
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
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
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg"
                >
                  Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

