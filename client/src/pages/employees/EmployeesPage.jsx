import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Trash2,
  Eye,
  X,
  CheckCircle,
  Building2,
  Briefcase,
  Calendar,
  RefreshCw,
  Plus,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQuickDeptModal, setShowQuickDeptModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Quick Dept Form
  const [quickDeptForm, setQuickDeptForm] = useState({ name: '', code: '', description: '' });
  const [quickDeptSaving, setQuickDeptSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    branchId: '',
    departmentId: '',
    designationId: '',
    shiftId: '',
    employmentType: 'Full-Time',
    gender: 'Male',
    joiningDate: new Date().toISOString().split('T')[0],
    createUserAccount: true,
    password: 'Welcome@123',
    role: 'EMPLOYEE',
  });

  useEffect(() => {
    fetchEmployees();
    fetchMetadata();
  }, [selectedDept, selectedStatus]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedDept) params.departmentId = selectedDept;
      if (selectedStatus) params.status = selectedStatus;
      const res = await api.get('/employees', { params });
      setEmployees(res.data?.employees || res.employees || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load employee directory', { id: 'emp-list-err' });
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      setMetadataLoading(true);
      const [deptRes, desigRes, branchRes, shiftRes] = await Promise.all([
        api.get('/departments'),
        api.get('/designations'),
        api.get('/organization/branches').catch(() => ({ data: { branches: [] } })),
        api.get('/shifts').catch(() => ({ data: { shifts: [] } })),
      ]);
      const depts = deptRes.data?.departments || deptRes.departments || [];
      const desigs = desigRes.data?.designations || desigRes.designations || [];
      const brs = branchRes.data?.branches || branchRes.branches || [];
      const sfts = shiftRes.data?.shifts || shiftRes.shifts || [];

      setDepartments(depts);
      setDesignations(desigs);
      setBranches(brs);
      setShifts(sfts);
    } catch (err) {
      console.error('Metadata fetch error:', err);
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };

      // Reset designationId if department changes and designation doesn't belong to it
      if (name === 'departmentId') {
        const validForDept = designations.find((des) => {
          const dId = des.departmentId?._id || des.departmentId;
          return des._id === prev.designationId && dId?.toString() === value?.toString();
        });
        if (!validForDept) {
          updated.designationId = '';
        }
      }
      return updated;
    });
  };

  const handleCreateEmployee = async (e) => {
    e?.preventDefault();
    if (isSaving) return;

    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      toast.error('First Name, Last Name and Corporate Email are required.', { id: 'emp-val-err' });
      return;
    }

    if (!formData.departmentId) {
      toast.error('Please assign a department to the employee.', { id: 'emp-dept-val-err' });
      return;
    }

    if (!formData.designationId) {
      toast.error('Please assign a job designation to the employee.', { id: 'emp-desig-val-err' });
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        ...formData,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        branchId: formData.branchId || null,
        shiftId: formData.shiftId || null,
      };

      await api.post('/employees', payload);
      toast.success('Employee created successfully with generated ID!', { id: 'emp-create-success' });
      setShowAddModal(false);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        branchId: '',
        departmentId: '',
        designationId: '',
        shiftId: '',
        employmentType: 'Full-Time',
        gender: 'Male',
        joiningDate: new Date().toISOString().split('T')[0],
        createUserAccount: true,
        password: 'Welcome@123',
        role: 'EMPLOYEE',
      });
      fetchEmployees();
    } catch (err) {
      toast.error(err.message || 'Failed to create employee', { id: 'emp-create-err' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateQuickDept = async (e) => {
    e?.preventDefault();
    if (quickDeptSaving) return;
    if (!quickDeptForm.name.trim()) {
      toast.error('Department name is required', { id: 'quick-dept-err' });
      return;
    }

    try {
      setQuickDeptSaving(true);
      const res = await api.post('/departments', {
        name: quickDeptForm.name.trim(),
        code: quickDeptForm.code.trim().toUpperCase() || quickDeptForm.name.trim().substring(0, 3).toUpperCase(),
        description: quickDeptForm.description.trim(),
      });
      const newDept = res.data?.department || res.department;
      toast.success(`Department "${newDept.name}" created!`, { id: 'quick-dept-success' });
      setShowQuickDeptModal(false);
      setQuickDeptForm({ name: '', code: '', description: '' });

      // Refresh metadata and auto-select new department
      await fetchMetadata();
      if (newDept?._id) {
        setFormData((prev) => ({ ...prev, departmentId: newDept._id }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to create department', { id: 'quick-dept-create-err' });
    } finally {
      setQuickDeptSaving(false);
    }
  };

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate employee: ${name}?`)) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success(`${name} has been deactivated`, { id: 'emp-deact-toast' });
      fetchEmployees();
    } catch (err) {
      toast.error(err.message || 'Deactivation failed', { id: 'emp-deact-err' });
    }
  };

  // Filtered designations for current selected department
  const filteredDesignations = designations.filter((des) => {
    if (!formData.departmentId) return true;
    const dId = des.departmentId?._id || des.departmentId;
    return dId?.toString() === formData.departmentId?.toString();
  });

  const filteredEmployees = employees.filter(
    (e) =>
      e.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.employeeId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
              Workforce Master
            </span>
            <span className="text-xs text-slate-400 font-semibold">&bull; Cloud Persistence (Atlas)</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Personnel Directory</h2>
          <p className="text-xs text-slate-500">Manage employee master records, department hierarchies, and system accounts</p>
        </div>

        <button
          onClick={() => {
            fetchMetadata();
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 transition-all self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Departments ({departments.length})</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Lifecycle Statuses</option>
            <option value="Active">Active</option>
            <option value="Probation">Probation</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Resigned">Resigned</option>
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No personnel records found</h3>
            <p className="text-xs text-slate-400">Add staff records or adjust your search filters above.</p>
            <button
              onClick={() => {
                fetchMetadata();
                setShowAddModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              Add First Employee
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Employee Details</th>
                  <th className="px-6 py-3">Department & Role</th>
                  <th className="px-6 py-3">Contact</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">System Account</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEmployees.map((emp) => (
                  <tr key={emp._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                          {emp.firstName?.[0]}
                          {emp.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <span className="font-mono text-[10px] text-slate-400 font-semibold">{emp.employeeId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-slate-800">{emp.departmentId?.name || 'Unassigned'}</p>
                      <p className="text-[11px] text-slate-500">{emp.designationId?.title || 'No Title'}</p>
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="text-slate-800 font-medium">{emp.email}</p>
                      <p className="text-[11px] text-slate-400">{emp.phone || 'No phone'}</p>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {emp.lifecycleStage || 'Confirmed'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {emp.userId ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{emp.userId?.role || 'User'}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedEmployee(emp)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(emp._id, `${emp.firstName} ${emp.lastName}`)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deactivate Employee"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add New Personnel Record</h3>
                <p className="text-xs text-slate-400">Fill in employee details and assign corporate hierarchy</p>
              </div>
              <button
                disabled={isSaving}
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    disabled={isSaving}
                    placeholder="e.g. Rahul"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    disabled={isSaving}
                    placeholder="e.g. Sharma"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Corporate Email *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    disabled={isSaving}
                    placeholder="name@prvision.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    disabled={isSaving}
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Department & Designation dropdowns with shortcut */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Department *</label>
                    <button
                      type="button"
                      onClick={() => setShowQuickDeptModal(true)}
                      className="text-[11px] text-blue-600 font-bold hover:underline"
                    >
                      + New Department
                    </button>
                  </div>
                  <select
                    name="departmentId"
                    required
                    disabled={isSaving || metadataLoading}
                    value={formData.departmentId}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white disabled:bg-slate-50"
                  >
                    <option value="">Select Department</option>
                    {departments.length === 0 ? (
                      <option value="" disabled>No departments configured</option>
                    ) : (
                      departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name} ({d.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Designation *</label>
                  <select
                    name="designationId"
                    required
                    disabled={isSaving || metadataLoading}
                    value={formData.designationId}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white disabled:bg-slate-50"
                  >
                    <option value="">
                      {!formData.departmentId ? 'Select Department first' : 'Select Designation'}
                    </option>
                    {filteredDesignations.length === 0 ? (
                      <option value="" disabled>
                        {formData.departmentId ? 'No designations in this department' : 'Choose department first'}
                      </option>
                    ) : (
                      filteredDesignations.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.title} ({d.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Branch & Shift */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Branch Location</label>
                  <select
                    name="branchId"
                    disabled={isSaving}
                    value={formData.branchId}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="">Select Operational Branch</option>
                    {branches.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Work Shift</label>
                  <select
                    name="shiftId"
                    disabled={isSaving}
                    value={formData.shiftId}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="">Standard Shift</option>
                    {shifts.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.startTime} - {s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Employment Type & Joining Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Employment Type</label>
                  <select
                    name="employmentType"
                    disabled={isSaving}
                    value={formData.employmentType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    name="gender"
                    disabled={isSaving}
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-Binary">Non-Binary</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Joining Date *</label>
                  <input
                    type="date"
                    name="joiningDate"
                    required
                    disabled={isSaving}
                    value={formData.joiningDate}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Login Account Options */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="createUserAccount"
                    checked={formData.createUserAccount}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Provision Portal Login Account for this Employee
                  </span>
                </label>

                {formData.createUserAccount && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Initial Password</label>
                      <input
                        type="text"
                        name="password"
                        disabled={isSaving}
                        value={formData.password}
                        onChange={handleInputChange}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Access Role</label>
                      <select
                        name="role"
                        disabled={isSaving}
                        value={formData.role}
                        onChange={handleInputChange}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="MANAGER">Manager</option>
                        <option value="HR_MANAGER">HR Manager</option>
                        <option value="RECRUITER">Recruiter</option>
                        <option value="PAYROLL_ADMIN">Payroll Admin</option>
                        <option value="ADMIN">Company Admin</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50 transition-all"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? 'Registering...' : 'Save Employee'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Department Modal */}
      {showQuickDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add New Department</h3>
              <button
                disabled={quickDeptSaving}
                onClick={() => setShowQuickDeptModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickDept} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  disabled={quickDeptSaving}
                  placeholder="e.g. Quality Assurance"
                  value={quickDeptForm.name}
                  onChange={(e) => setQuickDeptForm({ ...quickDeptForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Department Code</label>
                <input
                  type="text"
                  disabled={quickDeptSaving}
                  placeholder="e.g. QA"
                  value={quickDeptForm.code}
                  onChange={(e) => setQuickDeptForm({ ...quickDeptForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  disabled={quickDeptSaving}
                  placeholder="Department summary"
                  value={quickDeptForm.description}
                  onChange={(e) => setQuickDeptForm({ ...quickDeptForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={quickDeptSaving}
                  onClick={() => setShowQuickDeptModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickDeptSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm"
                >
                  {quickDeptSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{quickDeptSaving ? 'Saving...' : 'Create & Select'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Details Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Personnel Dossier</h3>
              <button onClick={() => setSelectedEmployee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-extrabold text-lg flex items-center justify-center shadow-md shadow-blue-500/20">
                {selectedEmployee.firstName?.[0]}
                {selectedEmployee.lastName?.[0]}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </h4>
                <p className="text-xs text-slate-500">
                  {selectedEmployee.designationId?.title || 'Designation'} &bull;{' '}
                  {selectedEmployee.departmentId?.name || 'Department'}
                </p>
                <span className="font-mono text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">
                  {selectedEmployee.employeeId}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100">
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Email</span>
                <p className="font-semibold text-slate-800 truncate">{selectedEmployee.email}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Phone</span>
                <p className="font-semibold text-slate-800">{selectedEmployee.phone || 'N/A'}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Branch Location</span>
                <p className="font-semibold text-slate-800">{selectedEmployee.branchId?.name || 'HQ-BLR'}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
                <p className="font-semibold text-emerald-600">{selectedEmployee.lifecycleStage || 'Confirmed'}</p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
