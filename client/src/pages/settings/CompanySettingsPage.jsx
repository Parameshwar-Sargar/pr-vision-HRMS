import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { logoutUser, logoutAllSessions } from '../../store/slices/authSlice';
import toast from 'react-hot-toast';
import {
  Building2,
  MapPin,
  Clock,
  Coins,
  Cpu,
  Plus,
  Trash2,
  CheckCircle2,
  Sliders,
  Shield,
  ShieldCheck,
  Laptop,
  LogOut,
  RefreshCw,
  KeyRound,
  Layers,
  Phone,
  Mail,
  Globe,
} from 'lucide-react';

export default function CompanySettingsPage() {
  const { user, session: reduxSession, tabId } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdminOrHR = user?.role === 'ADMIN' || user?.role === 'HR_MANAGER';
  const queryTab = new URLSearchParams(location.search).get('tab');

  const [activeTab, setActiveTab] = useState(
    queryTab === 'security' || location.pathname === '/security' || !isAdminOrHR
      ? 'security'
      : 'general'
  ); // 'general' | 'branches' | 'modules' | 'biometric' | 'security'
  const [company, setCompany] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Active Sessions State
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(reduxSession || null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  // New Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    isHeadquarters: false,
    contactPhone: '',
    contactEmail: '',
    timezone: 'Asia/Kolkata',
    address: {
      street: '',
      city: '',
      state: '',
      country: 'India',
      postalCode: '',
    },
  });

  useEffect(() => {
    if (queryTab === 'security' || location.pathname === '/security' || !isAdminOrHR) {
      setActiveTab('security');
    }
  }, [queryTab, location.pathname, isAdminOrHR]);

  useEffect(() => {
    fetchOrganizationData();
    fetchActiveSessions();
  }, []);

  useEffect(() => {
    if (activeTab === 'security') {
      fetchActiveSessions();
    }
  }, [activeTab]);

  const fetchActiveSessions = async () => {
    try {
      setLoadingSessions(true);
      const res = await api.get('/auth/sessions');
      const payload = res?.data || res;
      setSessions(payload?.sessions || []);
      if (payload?.currentSession) {
        setCurrentSession(payload.currentSession);
      }
    } catch (err) {
      // Non-blocking
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSession = async (targetSessionId, isCurrent) => {
    try {
      setRevokingId(targetSessionId);
      await api.delete(`/auth/sessions/${targetSessionId}`);
      if (isCurrent) {
        await dispatch(logoutUser());
        toast.success('Current tab session revoked and signed out.');
        navigate('/login');
      } else {
        toast.success('Session revoked successfully.');
        fetchActiveSessions();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAllSessions = async () => {
    try {
      setLoadingSessions(true);
      await dispatch(logoutAllSessions());
      toast.success('Signed out from all active sessions across tabs and devices.');
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Failed to sign out from all sessions');
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchOrganizationData = async () => {
    if (!isAdminOrHR) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [settingsRes, branchesRes] = await Promise.all([
        api.get('/organization/settings'),
        api.get('/organization/branches'),
      ]);
      setCompany(settingsRes.data.company || {});
      setBranches(branchesRes.data.branches || []);
    } catch (err) {
      toast.error('Failed to load organization settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.put('/organization/settings', {
        companyName: company.companyName,
        tagline: company.tagline,
        primaryColor: company.primaryColor,
        contactEmail: company.contactEmail,
        contactPhone: company.contactPhone,
        website: company.website,
        address: company.address,
        businessInfo: company.businessInfo,
        settings: company.settings,
        modules: company.modules,
        biometricConfig: company.biometricConfig,
      });
      setCompany(res.data.company);
      toast.success('Organization configuration saved successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    try {
      await api.post('/organization/branches', branchForm);
      toast.success('New branch registered successfully!');
      setShowBranchModal(false);
      setBranchForm({
        name: '',
        code: '',
        isHeadquarters: false,
        contactPhone: '',
        contactEmail: '',
        timezone: 'Asia/Kolkata',
        address: { street: '', city: '', state: '', country: 'India', postalCode: '' },
      });
      fetchOrganizationData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Branch creation failed');
    }
  };

  const handleDeleteBranch = async (id, isHeadquarters) => {
    if (isHeadquarters) {
      toast.error('Cannot remove designated Headquarters branch');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this branch?')) return;
    try {
      await api.delete(`/organization/branches/${id}`);
      toast.success('Branch deactivated');
      fetchOrganizationData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
              Master System Settings
            </span>
            <span className="text-xs text-slate-400 font-semibold">&bull; Dedicated Database</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Company Configuration & Infrastructure
          </h1>
          <p className="text-xs text-slate-500">
            Configure PR VISION INNOVATIONS profile, operational branches, statutory rules, and modules.
          </p>
        </div>

        {activeTab === 'branches' && (
          <button
            onClick={() => setShowBranchModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Branch Location</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 gap-6 text-xs font-bold text-slate-500">
        {isAdminOrHR && (
          <>
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-3 transition-colors ${
                activeTab === 'general' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'
              }`}
            >
              General & Branding
            </button>
            <button
              onClick={() => setActiveTab('branches')}
              className={`pb-3 transition-colors ${
                activeTab === 'branches' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'
              }`}
            >
              Branches ({branches.length})
            </button>
            <button
              onClick={() => setActiveTab('modules')}
              className={`pb-3 transition-colors ${
                activeTab === 'modules' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'
              }`}
            >
              Enabled Enterprise Modules
            </button>
            <button
              onClick={() => setActiveTab('biometric')}
              className={`pb-3 transition-colors ${
                activeTab === 'biometric' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'
              }`}
            >
              Biometric Hardware Integration
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 transition-colors flex items-center gap-1.5 ${
            activeTab === 'security' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Security & Active Sessions ({sessions.length || 1})</span>
        </button>
      </div>

      {/* TAB 1: GENERAL & BRANDING */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Corporate Identity & Branding</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Company Legal Name *</label>
                <input
                  type="text"
                  required
                  value={company?.companyName || ''}
                  onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Company Tagline</label>
                <input
                  type="text"
                  value={company?.tagline || ''}
                  onChange={(e) => setCompany({ ...company, tagline: e.target.value })}
                  placeholder="People. Process. Performance."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Official Contact Email *</label>
                <input
                  type="email"
                  required
                  value={company?.contactEmail || ''}
                  onChange={(e) => setCompany({ ...company, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={company?.contactPhone || ''}
                  onChange={(e) => setCompany({ ...company, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Corporate Website</label>
                <input
                  type="text"
                  value={company?.website || ''}
                  onChange={(e) => setCompany({ ...company, website: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Primary Theme Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={company?.primaryColor || '#1E40AF'}
                    onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={company?.primaryColor || '#1E40AF'}
                    onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Coins className="w-4 h-4 text-blue-600" />
              <span>Localization & Work Schedule</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Timezone</label>
                <select
                  value={company?.settings?.timezone || 'Asia/Kolkata'}
                  onChange={(e) =>
                    setCompany({
                      ...company,
                      settings: { ...company.settings, timezone: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                  <option value="UTC">UTC (Universal Coordinated)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Currency</label>
                <select
                  value={company?.settings?.currency || 'INR'}
                  onChange={(e) =>
                    setCompany({
                      ...company,
                      settings: { ...company.settings, currency: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED (د.إ)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Standard Work Hours / Day</label>
                <input
                  type="number"
                  min="4"
                  max="12"
                  value={company?.settings?.standardWorkHoursPerDay || 8}
                  onChange={(e) =>
                    setCompany({
                      ...company,
                      settings: {
                        ...company.settings,
                        standardWorkHoursPerDay: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Company Settings'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: BRANCH INFRASTRUCTURE */}
      {activeTab === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {branches.map((b) => (
            <div
              key={b._id}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{b.name}</h3>
                    <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {b.code}
                    </span>
                  </div>
                  {b.isHeadquarters ? (
                    <span className="px-2.5 py-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Headquarters
                    </span>
                  ) : (
                    <button
                      onClick={() => handleDeleteBranch(b._id, b.isHeadquarters)}
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>
                      {b.address?.street}, {b.address?.city}, {b.address?.state} {b.address?.postalCode}
                    </span>
                  </div>
                  {b.contactPhone && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{b.contactPhone}</span>
                    </div>
                  )}
                  {b.contactEmail && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{b.contactEmail}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Timezone: {b.timezone}</span>
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Operational
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: ENTERPRISE MODULES */}
      {activeTab === 'modules' && (
        <form onSubmit={handleSaveSettings} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Configurable Enterprise Modules</h3>
            <p className="text-xs text-slate-500">Enable or disable specific business suites for this client installation.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { id: 'recruitment', label: 'Recruitment & ATS', desc: 'Job postings, applicant pipeline, and conversion to employee' },
              { id: 'training', label: 'Training & Development', desc: 'Corporate courses, employee assignments, and completion scoring' },
              { id: 'expenses', label: 'Expense Reimbursements', desc: 'Travel and office reimbursement claims with receipt upload' },
              { id: 'assets', label: 'Hardware & Asset Tracking', desc: 'Inventory tagging, serial tracking, and equipment allocation' },
              { id: 'grievances', label: 'Grievance Desk & POSH', desc: 'Confidential employee ticket routing and resolution workflows' },
              { id: 'performance', label: 'Performance & Appraisals', desc: 'Self/manager evaluations, KRAs, and quarterly reviews' },
              { id: 'documents', label: 'Document Vault', desc: 'Contracts, NDAs, policies, and employee document repository' },
            ].map((m) => {
              const isChecked = company?.modules?.[m.id] ?? true;
              return (
                <div
                  key={m.id}
                  onClick={() =>
                    setCompany({
                      ...company,
                      modules: { ...company.modules, [m.id]: !isChecked },
                    })
                  }
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isChecked
                      ? 'border-blue-500 bg-blue-50/40 text-slate-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">{m.label}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{m.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              {saving ? 'Updating...' : 'Save Module Preferences'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: BIOMETRIC HARDWARE */}
      {activeTab === 'biometric' && (
        <form onSubmit={handleSaveSettings} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span>Biometric Hardware Synchronization</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Connect on-premise biometric finger/face scanners (e.g., ZKTeco, eSSL) to auto-sync punches.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={company?.biometricConfig?.enabled || false}
                onChange={(e) =>
                  setCompany({
                    ...company,
                    biometricConfig: {
                      ...company.biometricConfig,
                      enabled: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-xs font-bold text-slate-800">Enable Hardware Push</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Hardware Brand / Type</label>
              <input
                type="text"
                value={company?.biometricConfig?.deviceType || 'ZKTeco / eSSL'}
                onChange={(e) =>
                  setCompany({
                    ...company,
                    biometricConfig: {
                      ...company.biometricConfig,
                      deviceType: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Device / Server IP Address</label>
              <input
                type="text"
                placeholder="192.168.1.201"
                value={company?.biometricConfig?.serverIp || ''}
                onChange={(e) =>
                  setCompany({
                    ...company,
                    biometricConfig: {
                      ...company.biometricConfig,
                      serverIp: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Communication Port</label>
              <input
                type="number"
                value={company?.biometricConfig?.port || 4370}
                onChange={(e) =>
                  setCompany({
                    ...company,
                    biometricConfig: {
                      ...company.biometricConfig,
                      port: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Auto-Sync Cadence (Minutes)</label>
              <input
                type="number"
                min="5"
                max="60"
                value={company?.biometricConfig?.autoSyncIntervalMinutes || 15}
                onChange={(e) =>
                  setCompany({
                    ...company,
                    biometricConfig: {
                      ...company.biometricConfig,
                      autoSyncIntervalMinutes: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              {saving ? 'Updating...' : 'Save Biometric Settings'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 5: SECURITY & ACTIVE SESSIONS */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Current Tab Session Identity Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Current Tab Session & Role Identity</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  This browser tab maintains an isolated session in <code className="font-mono text-blue-700">sessionStorage</code>. Signing in or out on other tabs will not affect this tab.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchActiveSessions}
                  disabled={loadingSessions}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogoutAllSessions}
                  disabled={loadingSessions}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout From All Sessions</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Current Logged-In User
                </span>
                <p className="font-bold text-slate-900 text-sm mt-1">{user?.name || 'Unknown'}</p>
                <p className="text-slate-500 text-[11px]">{user?.email}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Current Role & Tenant
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 uppercase">
                    {user?.role}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {currentSession?.tenantId || 'pr_vision_hrms'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Session / Device Identifier
                </span>
                <p className="font-mono font-bold text-slate-800 text-[11px] mt-1 truncate">
                  {currentSession?.sessionId || sessionStorage.getItem('pr_session_id') || 'Active'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {currentSession?.deviceLabel || `Tab ${tabId}`}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Login Time
                </span>
                <p className="font-semibold text-slate-800 mt-1">
                  {currentSession?.loginAt
                    ? new Date(currentSession.loginAt).toLocaleString()
                    : 'Current session'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Last Active Time
                </span>
                <p className="font-semibold text-slate-800 mt-1">
                  {currentSession?.lastActiveAt
                    ? new Date(currentSession.lastActiveAt).toLocaleString()
                    : 'Just now'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Session Expiry
                </span>
                <p className="font-semibold text-slate-800 mt-1">
                  {currentSession?.expiresAt
                    ? new Date(currentSession.expiresAt).toLocaleString()
                    : '7 days from login'}
                </p>
              </div>
            </div>
          </div>

          {/* Active Sessions List */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-blue-600" />
                  <span>Active Sessions for {user?.email} ({sessions.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage and revoke individual browser tab or device sessions without exposing tokens.
                </p>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No active sessions found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {sessions.map((s) => (
                  <div
                    key={s.sessionId}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs ${
                      s.isCurrentSession ? 'bg-blue-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{s.deviceLabel || 'Browser Session'}</span>
                        {s.isCurrentSession ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Current Tab Session
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            Other Tab / Device
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700">
                          ID: {s.sessionId}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        <span>Role: <strong className="text-slate-700">{s.role}</strong></span>
                        <span>IP: <strong className="text-slate-700">{s.ipAddress || '127.0.0.1'}</strong></span>
                        <span>Login: <strong className="text-slate-700">{new Date(s.loginAt).toLocaleString()}</strong></span>
                        <span>Last Active: <strong className="text-slate-700">{new Date(s.lastActiveAt).toLocaleString()}</strong></span>
                        <span>Expires: <strong className="text-slate-700">{new Date(s.expiresAt).toLocaleDateString()}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        disabled={revokingId === s.sessionId}
                        onClick={() => handleRevokeSession(s.sessionId, s.isCurrentSession)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          s.isCurrentSession
                            ? 'border border-rose-200 text-rose-700 hover:bg-rose-50'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        }`}
                      >
                        {revokingId === s.sessionId
                          ? 'Revoking...'
                          : s.isCurrentSession
                          ? 'Revoke & Sign Out Tab'
                          : 'Revoke Session'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD BRANCH MODAL */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Add New Branch Location</h3>
              <button
                onClick={() => setShowBranchModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Branch Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pune Tech Center"
                    value={branchForm.name}
                    onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Branch Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BR-PUN"
                    value={branchForm.code}
                    onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={branchForm.contactPhone}
                    onChange={(e) => setBranchForm({ ...branchForm, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={branchForm.contactEmail}
                    onChange={(e) => setBranchForm({ ...branchForm, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={branchForm.address.street}
                  onChange={(e) =>
                    setBranchForm({
                      ...branchForm,
                      address: { ...branchForm.address, street: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={branchForm.address.city}
                    onChange={(e) =>
                      setBranchForm({
                        ...branchForm,
                        address: { ...branchForm.address, city: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={branchForm.address.state}
                    onChange={(e) =>
                      setBranchForm({
                        ...branchForm,
                        address: { ...branchForm.address, state: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={branchForm.address.postalCode}
                    onChange={(e) =>
                      setBranchForm({
                        ...branchForm,
                        address: { ...branchForm.address, postalCode: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                >
                  Save Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
