import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import {
  Laptop,
  Plus,
  Tag,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  UserCheck,
} from 'lucide-react';

export default function AssetsPage() {
  const { user } = useSelector((state) => state.auth);
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [assignModalAsset, setAssignModalAsset] = useState(null);
  const [selectedEmpId, setSelectedEmpId] = useState('');

  const [newAsset, setNewAsset] = useState({
    assetTag: '',
    name: '',
    category: 'Laptop',
    serialNumber: '',
    purchaseCost: '',
    condition: 'Good',
  });

  const canManage = ['ADMIN', 'HR_MANAGER'].includes(user?.role);

  const fetchAssetsData = async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      const [astRes, empRes] = await Promise.all([
        api.get('/assets'),
        canManage ? api.get('/employees?limit=100').catch(() => ({ data: { employees: [] } })) : Promise.resolve({ data: { employees: [] } }),
      ]);
      setAssets(astRes.data?.assets || astRes.assets || []);
      setEmployees(empRes.data?.employees || empRes.employees || []);
    } catch (err) {
      toast.error('Failed to load assets.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssetsData(true);
  }, []);

  const handleCreateAsset = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/assets', newAsset);
      const created = res?.data?.asset || res?.asset;
      if (created) {
        setAssets((prev) => [created, ...prev]);
      }
      toast.success('Asset added to inventory!');
      setShowAddModal(false);
      fetchAssetsData(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to register asset.');
    }
  };

  const handleAssignAsset = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) return toast.error('Please select an employee.');
    try {
      await api.post(`/assets/${assignModalAsset._id}/assign`, {
        employeeId: selectedEmpId,
      });
      toast.success('Asset assigned successfully!');
      setAssignModalAsset(null);
      fetchAssetsData(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to assign asset.');
    }
  };

  const handleReturnAsset = async (assetId) => {
    if (!window.confirm('Confirm returning this asset to inventory?')) return;
    try {
      setAssets((prev) =>
        prev.map((a) => (a._id === assetId ? { ...a, status: 'Available', currentAssignedTo: null } : a))
      );
      await api.post(`/assets/${assetId}/return`, { conditionAtReturn: 'Good' });
      toast.success('Asset returned and available!');
      fetchAssetsData(false);
    } catch (err) {
      toast.error('Failed to return asset.');
      fetchAssetsData(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Laptop className="w-6 h-6 text-indigo-600" />
            <span>Asset Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track enterprise hardware, serial numbers, allocation state, and equipment returns.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Register Asset</span>
          </button>
        )}
      </div>

      {/* Assets Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
            <tr>
              <th className="py-3 px-4">Tag</th>
              <th className="py-3 px-4">Asset Name</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Condition</th>
              <th className="py-3 px-4">Current Assignee</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {assets.map((ast) => (
              <tr key={ast._id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                  {ast.assetTag}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  {ast.name}
                  {ast.serialNumber && (
                    <div className="text-[10px] text-slate-400 font-mono">S/N: {ast.serialNumber}</div>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                    {ast.category}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      ast.status === 'Available'
                        ? 'bg-emerald-100 text-emerald-800'
                        : ast.status === 'Assigned'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {ast.status}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-slate-600">{ast.condition}</td>
                <td className="py-3 px-4">
                  {ast.currentAssignedTo ? (
                    <div>
                      <span className="font-semibold text-slate-900">
                        {ast.currentAssignedTo.firstName} {ast.currentAssignedTo.lastName}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {ast.currentAssignedTo.employeeId}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  {canManage && ast.status === 'Available' && (
                    <button
                      onClick={() => {
                        setAssignModalAsset(ast);
                        setSelectedEmpId(employees[0]?._id || '');
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      Assign
                    </button>
                  )}
                  {canManage && ast.status === 'Assigned' && (
                    <button
                      onClick={() => handleReturnAsset(ast._id)}
                      className="text-[11px] font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1 inline-flex"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Return</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No assets in inventory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">Register New Asset</h2>
            <form onSubmit={handleCreateAsset} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Asset Tag</label>
                  <input
                    required
                    type="text"
                    value={newAsset.assetTag}
                    onChange={(e) => setNewAsset({ ...newAsset, assetTag: e.target.value })}
                    placeholder="PRV-AST-0105"
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Category</label>
                  <select
                    value={newAsset.category}
                    onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Desktop">Desktop</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Mobile Device">Mobile Device</option>
                    <option value="Access Card">Access Card</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Asset Name</label>
                <input
                  required
                  type="text"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                  placeholder="e.g. MacBook Pro M3 (16GB/512GB)"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Serial Number</label>
                  <input
                    type="text"
                    value={newAsset.serialNumber}
                    onChange={(e) => setNewAsset({ ...newAsset, serialNumber: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Cost (INR)</label>
                  <input
                    type="number"
                    value={newAsset.purchaseCost}
                    onChange={(e) => setNewAsset({ ...newAsset, purchaseCost: e.target.value })}
                    placeholder="120000"
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
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
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModalAsset && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-2">Assign Equipment</h2>
            <p className="text-xs text-slate-500 mb-4">
              Allocate <span className="font-bold text-slate-800">{assignModalAsset.name}</span> ({assignModalAsset.assetTag}) to an employee.
            </p>

            <form onSubmit={handleAssignAsset} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700">Select Employee</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                >
                  {employees.map((emp) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalAsset(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg"
                >
                  Confirm Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

