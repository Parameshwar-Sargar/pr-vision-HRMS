import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Building2, Plus, Users, Trash2, Edit2, X, Briefcase, RefreshCw, Layers } from 'lucide-react';

export default function DepartmentsPage() {
  const [activeTab, setActiveTab] = useState('departments'); // 'departments' | 'designations'
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showDesigModal, setShowDesigModal] = useState(false);

  // Forms
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });
  const [desigForm, setDesigForm] = useState({ title: '', departmentId: '', code: '', level: 1, description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [deptRes, desigRes] = await Promise.all([
        api.get('/departments'),
        api.get('/designations'),
      ]);
      setDepartments(deptRes.data?.departments || deptRes.departments || []);
      setDesignations(desigRes.data?.designations || desigRes.designations || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load organizational units', { id: 'org-fetch-error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDept = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!deptForm.name.trim()) {
      toast.error('Department name is required', { id: 'dept-name-required' });
      return;
    }

    try {
      setIsSaving(true);
      await api.post('/departments', {
        name: deptForm.name.trim(),
        code: deptForm.code.trim().toUpperCase() || deptForm.name.trim().substring(0, 3).toUpperCase(),
        description: deptForm.description.trim(),
      });
      toast.success('Department created successfully!', { id: 'dept-success' });
      setShowDeptModal(false);
      setDeptForm({ name: '', code: '', description: '' });
      await fetchData();
    } catch (err) {
      toast.error(err.message || 'Department creation failed', { id: 'dept-error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateDesig = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!desigForm.title.trim()) {
      toast.error('Designation title is required', { id: 'desig-title-required' });
      return;
    }
    if (!desigForm.departmentId) {
      toast.error('Please select a department', { id: 'desig-dept-required' });
      return;
    }

    try {
      setIsSaving(true);
      await api.post('/designations', {
        title: desigForm.title.trim(),
        departmentId: desigForm.departmentId,
        code: desigForm.code.trim().toUpperCase() || desigForm.title.trim().substring(0, 4).toUpperCase(),
        level: Number(desigForm.level) || 1,
        description: desigForm.description.trim(),
      });
      toast.success('Designation created successfully!', { id: 'desig-success' });
      setShowDesigModal(false);
      setDesigForm({ title: '', departmentId: '', code: '', level: 1, description: '' });
      await fetchData();
    } catch (err) {
      toast.error(err.message || 'Designation creation failed', { id: 'desig-error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDept = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete department "${name}"?`)) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Department deleted', { id: 'dept-del' });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Delete failed', { id: 'dept-del-err' });
    }
  };

  const handleDeleteDesig = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete designation "${title}"?`)) return;
    try {
      await api.delete(`/designations/${id}`);
      toast.success('Designation deleted', { id: 'desig-del' });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Delete failed', { id: 'desig-del-err' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Organization Hierarchy</h2>
          <p className="text-xs text-slate-500">Configure corporate departments and job designations with MongoDB Atlas cloud persistence</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-slate-200/70 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('departments')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'departments' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Departments ({departments.length})
            </button>
            <button
              onClick={() => setActiveTab('designations')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'designations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Designations ({designations.length})
            </button>
          </div>

          {activeTab === 'departments' ? (
            <button
              onClick={() => setShowDeptModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Department</span>
            </button>
          ) : (
            <button
              onClick={() => setShowDesigModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Designation</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : activeTab === 'departments' ? (
        departments.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-700 text-sm">No departments registered yet</h3>
            <p className="text-xs text-slate-400">Create your initial company department to begin assigning staff.</p>
            <button
              onClick={() => setShowDeptModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              Create Department
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => (
              <div
                key={dept._id}
                className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {dept.code || 'DEPT'}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm mt-1">{dept.name}</h3>
                    </div>
                    <button
                      onClick={() => handleDeleteDept(dept._id, dept.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Department"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                    {dept.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{dept.employeeCount || 0} Staff</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* DESIGNATIONS TAB */
        designations.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
            <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-700 text-sm">No designations registered yet</h3>
            <p className="text-xs text-slate-400">Add designations linked to departments for employee assignments.</p>
            <button
              onClick={() => setShowDesigModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              Add Designation
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Designation Title</th>
                    <th className="px-6 py-3">Department</th>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Hierarchy Level</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {designations.map((desig) => (
                    <tr key={desig._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-slate-900 flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-blue-500" />
                        <span>{desig.title}</span>
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-600">
                        {desig.departmentId?.name || 'Unassigned'}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {desig.code}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                          Level {desig.level}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => handleDeleteDesig(desig._id, desig.title)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete Designation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Create Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add New Department</h3>
              <button
                disabled={isSaving}
                onClick={() => setShowDeptModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDept} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  disabled={isSaving}
                  placeholder="e.g. Information Technology"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Department Code</label>
                <input
                  type="text"
                  disabled={isSaving}
                  placeholder="e.g. IT (Auto-generated if left blank)"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 uppercase font-mono disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  disabled={isSaving}
                  placeholder="Brief summary of department responsibilities"
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowDeptModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 transition-all"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? 'Saving...' : 'Save Department'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Designation Modal */}
      {showDesigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add New Designation</h3>
              <button
                disabled={isSaving}
                onClick={() => setShowDesigModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDesig} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  disabled={isSaving}
                  placeholder="e.g. Senior Software Engineer"
                  value={desigForm.title}
                  onChange={(e) => setDesigForm({ ...desigForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Department *</label>
                <select
                  required
                  disabled={isSaving}
                  value={desigForm.departmentId}
                  onChange={(e) => setDesigForm({ ...desigForm, departmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white disabled:bg-slate-50"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Designation Code</label>
                  <input
                    type="text"
                    disabled={isSaving}
                    placeholder="e.g. SRDEV"
                    value={desigForm.code}
                    onChange={(e) => setDesigForm({ ...desigForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase font-mono disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hierarchy Level</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={isSaving}
                    value={desigForm.level}
                    onChange={(e) => setDesigForm({ ...desigForm, level: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowDesigModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 transition-all"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? 'Saving...' : 'Save Designation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
