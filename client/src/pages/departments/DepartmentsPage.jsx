import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Building2, Plus, Users, Trash2, Edit2, X, Briefcase } from 'lucide-react';

export default function DepartmentsPage() {
  const [activeTab, setActiveTab] = useState('departments'); // 'departments' | 'designations'
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showDesigModal, setShowDesigModal] = useState(false);

  // Forms
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });
  const [desigForm, setDesigForm] = useState({ title: '', departmentId: '', code: '', level: 1 });

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
      setDepartments(deptRes.data.departments || []);
      setDesignations(desigRes.data.designations || []);
    } catch (err) {
      toast.error('Failed to load organizational units');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDept = async (e) => {
    e.preventDefault();
    try {
      await api.post('/departments', deptForm);
      toast.success('Department created successfully!');
      setShowDeptModal(false);
      setDeptForm({ name: '', code: '', description: '' });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Department creation failed');
    }
  };

  const handleCreateDesig = async (e) => {
    e.preventDefault();
    try {
      await api.post('/designations', desigForm);
      toast.success('Designation created successfully!');
      setShowDesigModal(false);
      setDesigForm({ title: '', departmentId: '', code: '', level: 1 });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Designation creation failed');
    }
  };

  const handleDeleteDept = async (id, name) => {
    if (!window.confirm(`Delete department ${name}?`)) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Department deleted');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Organization Hierarchy</h2>
          <p className="text-xs text-slate-500">Configure business departments and job designations</p>
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
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
            >
              <Plus className="w-4 h-4" />
              <span>Add Department</span>
            </button>
          ) : (
            <button
              onClick={() => setShowDesigModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
            >
              <Plus className="w-4 h-4" />
              <span>Add Designation</span>
            </button>
          )}
        </div>
      </div>

      {/* Departments Grid */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {departments.map((dept) => (
            <div
              key={dept._id}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 mb-3">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {dept.code}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{dept.name}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {dept.description || 'General company organizational branch'}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-slate-400" />
                  {dept.employeeCount || 0} Employees
                </span>
                <button
                  onClick={() => handleDeleteDept(dept._id, dept.name)}
                  className="text-red-500 hover:text-red-700 p-1 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Designations Table */}
      {activeTab === 'designations' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Hierarchy Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {designations.map((desig) => (
                  <tr key={desig._id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-bold text-slate-800">{desig.title}</td>
                    <td className="py-3.5 px-4 font-semibold text-blue-700">
                      {desig.departmentId?.name || 'General'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{desig.code || 'N/A'}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        Level {desig.level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add Department</h3>
              <button onClick={() => setShowDeptModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDept} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Finance & Accounting"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. FIN"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Description</label>
                <textarea
                  rows={3}
                  placeholder="Brief summary of department responsibilities"
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold shadow-sm"
                >
                  Save
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
              <h3 className="text-sm font-bold text-slate-900">Add Designation</h3>
              <button onClick={() => setShowDesigModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDesig} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Job Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Accountant"
                  value={desigForm.title}
                  onChange={(e) => setDesigForm({ ...desigForm, title: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Department *</label>
                <select
                  required
                  value={desigForm.departmentId}
                  onChange={(e) => setDesigForm({ ...desigForm, departmentId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Hierarchy Level</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={desigForm.level}
                  onChange={(e) => setDesigForm({ ...desigForm, level: parseInt(e.target.value, 10) })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDesigModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold shadow-sm"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

