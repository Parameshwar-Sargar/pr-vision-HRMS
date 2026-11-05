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
} from 'lucide-react';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    departmentId: '',
    designationId: '',
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
      setEmployees(res.data.employees || []);
    } catch (err) {
      toast.error('Failed to load employee directory');
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [deptRes, desigRes] = await Promise.all([
        api.get('/departments'),
        api.get('/designations'),
      ]);
      setDepartments(deptRes.data.departments || []);
      setDesignations(desigRes.data.designations || []);
    } catch (err) {
      // Non-blocking
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      await api.post('/employees', formData);
      toast.success('Employee created successfully with auto-generated ID!');
      setShowAddModal(false);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        departmentId: '',
        designationId: '',
        employmentType: 'Full-Time',
        gender: 'Male',
        joiningDate: new Date().toISOString().split('T')[0],
        createUserAccount: true,
        password: 'Welcome@123',
        role: 'EMPLOYEE',
      });
      fetchEmployees();
    } catch (err) {
      toast.error(err.message || 'Failed to create employee');
    }
  };

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate employee: ${name}?`)) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success(`${name} has been deactivated`);
      fetchEmployees();
    } catch (err) {
      toast.error(err.message || 'Deactivation failed');
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Personnel Directory</h2>
          <p className="text-xs text-slate-500">Manage workforce profiles, department mappings & accounts</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 transition-all self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by code, name, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="On Leave">On Leave</option>
            <option value="Terminated">Terminated</option>
          </select>
        </div>
      </div>

      {/* Employee List Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No employees found matching the specified filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Department & Role</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Joining Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr key={emp._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                      {emp.employeeId}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                          {emp.firstName[0]}
                          {emp.lastName[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <span className="text-[10px] text-slate-400">{emp.employmentType}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800">{emp.designationId?.title || 'Staff'}</p>
                      <span className="text-[11px] text-slate-500">{emp.departmentId?.name || 'General'}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-slate-700">{emp.email}</p>
                      <span className="text-[11px] text-slate-400">{emp.phone || 'No phone'}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {new Date(emp.joiningDate).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          emp.employmentStatus === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : emp.employmentStatus === 'On Leave'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {emp.employmentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => setSelectedEmployee(emp)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                        title="View Profile"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeactivate(emp._id, `${emp.firstName} ${emp.lastName}`)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100"
                        title="Deactivate"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
              <h3 className="text-base font-bold text-slate-900">Add New Personnel Record</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700">First Name *</label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">Last Name *</label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700">Email Address *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700">Department *</label>
                  <select
                    name="departmentId"
                    required
                    value={formData.departmentId}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
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
                  <label className="block text-xs font-bold text-slate-700">Designation *</label>
                  <select
                    name="designationId"
                    required
                    value={formData.designationId}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="">Select Designation</option>
                    {designations
                      .filter((des) => !formData.departmentId || des.departmentId?._id === formData.departmentId)
                      .map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Login Account Options */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="createUserAccount"
                    checked={formData.createUserAccount}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Provision Portal Login Account
                  </span>
                </label>

                {formData.createUserAccount && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600">Initial Password</label>
                      <input
                        type="text"
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        className="mt-1 block w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600">Access Role</label>
                      <select
                        name="role"
                        value={formData.role}
                        onChange={handleInputChange}
                        className="mt-1 block w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="MANAGER">Manager</option>
                        <option value="HR_MANAGER">HR Manager</option>
                        <option value="COMPANY_ADMIN">Company Admin</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Details Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Employee Details</h3>
              <button onClick={() => setSelectedEmployee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-black uppercase">
                  {selectedEmployee.firstName[0]}
                  {selectedEmployee.lastName[0]}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </h4>
                  <span className="font-mono text-blue-600 font-bold">{selectedEmployee.employeeId}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p><span className="font-bold text-slate-500">Department:</span> {selectedEmployee.departmentId?.name || 'N/A'}</p>
                <p><span className="font-bold text-slate-500">Designation:</span> {selectedEmployee.designationId?.title || 'N/A'}</p>
                <p><span className="font-bold text-slate-500">Email:</span> {selectedEmployee.email}</p>
                <p><span className="font-bold text-slate-500">Phone:</span> {selectedEmployee.phone || 'N/A'}</p>
                <p><span className="font-bold text-slate-500">Joined:</span> {new Date(selectedEmployee.joiningDate).toLocaleDateString()}</p>
                <p><span className="font-bold text-slate-500">Employment Status:</span> {selectedEmployee.employmentStatus}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

