import React, { useEffect, useState } from 'react';
import api from '../../services/api';
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
  Layers,
  Phone,
  Mail,
  Globe,
} from 'lucide-react';

export default function CompanySettingsPage() {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'branches' | 'modules' | 'biometric'
  const [company, setCompany] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    fetchOrganizationData();
  }, []);

  const fetchOrganizationData = async () => {
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
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold text-slate-500">
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
