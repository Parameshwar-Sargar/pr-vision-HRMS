import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Building2,
  Users,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  Power,
  ShieldAlert,
} from 'lucide-react';

export default function SuperAdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSuperAdminData();
  }, []);

  const fetchSuperAdminData = async () => {
    try {
      setLoading(true);
      const [statsRes, compRes, logsRes] = await Promise.all([
        api.get('/super-admin/stats'),
        api.get('/super-admin/companies'),
        api.get('/super-admin/audit-logs'),
      ]);
      setStats(statsRes.data);
      setCompanies(compRes.data.companies || []);
      setLogs(logsRes.data.logs || []);
    } catch (err) {
      toast.error('Failed to load Super Admin portal data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (company) => {
    const newStatus = company.status === 'active' ? 'suspended' : 'active';
    try {
      await api.patch(`/super-admin/companies/${company._id}/status`, {
        status: newStatus,
      });
      toast.success(`Company ${company.name} is now ${newStatus}`);
      fetchSuperAdminData();
    } catch (err) {
      toast.error(err.message || 'Status update failed');
    }
  };

  const handleUpdateLimit = async (company, newLimit) => {
    const limit = parseInt(newLimit, 10);
    if (!limit || limit < 1) return;
    try {
      await api.patch(`/super-admin/companies/${company._id}/status`, {
        employeeLimit: limit,
      });
      toast.success(`Employee limit updated to ${limit}`);
      fetchSuperAdminData();
    } catch (err) {
      toast.error(err.message || 'Limit update failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contactEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Platform Administration Console</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-Tenant SaaS governance, company tenant activations, limits & compliance auditing
            </p>
          </div>
        </div>
      </div>

      {/* Global Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase">Total Companies</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{stats?.counts?.totalCompanies || 0}</p>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase">Active Tenancies</span>
          <p className="text-2xl font-black text-emerald-600 mt-1">{stats?.counts?.activeCompanies || 0}</p>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase">Suspended</span>
          <p className="text-2xl font-black text-red-600 mt-1">{stats?.counts?.suspendedCompanies || 0}</p>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase">Cross-Tenant Personnel</span>
          <p className="text-2xl font-black text-blue-600 mt-1">{stats?.counts?.totalEmployees || 0}</p>
        </div>
      </div>

      {/* Company Management Table */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Registered SaaS Tenants</h3>
            <p className="text-xs text-slate-500">Manage company workspaces, status, and quotas</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
              />
            </div>
            <button
              onClick={fetchSuperAdminData}
              className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
              <tr>
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Slug / Domain</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Plan & Quota</th>
                <th className="py-3 px-4">Active Staff</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCompanies.map((c) => (
                <tr key={c._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-800">{c.name}</td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">{c.slug}</td>
                  <td className="py-3.5 px-4 text-slate-600">{c.contactEmail}</td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-blue-700">{c.planName || 'Growth'}</span>
                    <span className="text-[11px] text-slate-400 block">
                      Limit: {c.employeeLimit || 50}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-700">{c.employeeCount || 0}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        c.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.status === 'trial'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    <button
                      onClick={() => handleToggleStatus(c)}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                        c.status === 'active'
                          ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      {c.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform Audit Logs */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4">Platform Audit Trails</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Actor Email</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Target Tenant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log._id}>
                  <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-700">{log.actorEmail}</td>
                  <td className="py-2.5 px-3 font-bold text-blue-700">{log.action}</td>
                  <td className="py-2.5 px-3 text-slate-600">{log.targetTenantId?.name || 'Platform'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

