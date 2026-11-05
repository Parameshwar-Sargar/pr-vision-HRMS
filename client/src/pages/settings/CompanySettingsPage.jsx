import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Settings, Building, CreditCard, Check, Sparkles } from 'lucide-react';

export default function CompanySettingsPage() {
  const [profile, setProfile] = useState(null);
  const [subData, setSubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [profRes, subRes] = await Promise.all([
        api.get('/tenants/profile'),
        api.get('/subscriptions'),
      ]);
      setProfile(profRes.data.tenant || {});
      setSubData(subRes.data || {});
    } catch (err) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put('/tenants/profile', {
        name: profile.name,
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        address: profile.address,
        businessInfo: profile.businessInfo,
        settings: profile.settings,
      });
      toast.success('Company settings saved successfully!');
    } catch (err) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgradeDemo = async (planId, planName) => {
    try {
      const res = await api.post('/subscriptions/upgrade-demo', { planId });
      toast.success(`Successfully upgraded to ${planName} (Demo Mode)!`);
      fetchSettings();
    } catch (err) {
      toast.error(err.message || 'Upgrade failed');
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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Company Settings & Subscription</h2>
        <p className="text-xs text-slate-500">Manage corporate profile, localization, and SaaS tier</p>
      </div>

      {/* Subscription Tier Overview */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Current Plan: {subData.currentPlan?.name || 'Growth'}
              </h3>
              <p className="text-xs text-slate-500">
                Capacity: Up to {subData.currentPlan?.employeeLimit || 50} active staff members &bull; Status:{' '}
                <span className="font-bold text-emerald-600 capitalize">{subData.currentPlan?.status}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Upgrade options (Demo Billing) */}
        <div className="pt-4 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-3">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Available Upgrade Tiers (Demo Workflow)</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {subData.availablePlans?.map((p) => (
              <div
                key={p._id}
                className={`p-4 rounded-xl border text-xs flex flex-col justify-between ${
                  p.name === subData.currentPlan?.name
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div>
                  <p className="font-bold text-slate-900">{p.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">₹{p.priceMonthly}/mo &bull; Max {p.maxEmployees} Staff</p>
                </div>
                {p.name === subData.currentPlan?.name ? (
                  <span className="mt-3 text-[11px] font-bold text-blue-700 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Current Plan
                  </span>
                ) : (
                  <button
                    onClick={() => handleUpgradeDemo(p._id, p.name)}
                    className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-center"
                  >
                    Switch to {p.name}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Company Profile Form */}
      <form onSubmit={handleSaveProfile} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
          <Building className="w-4 h-4 text-blue-600" />
          <span>Business Information</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700">Company Name *</label>
            <input
              type="text"
              required
              value={profile.name || ''}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700">Official Contact Email *</label>
            <input
              type="email"
              required
              value={profile.contactEmail || ''}
              onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700">Contact Phone</label>
            <input
              type="text"
              value={profile.contactPhone || ''}
              onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700">Tax ID / GSTIN</label>
            <input
              type="text"
              value={profile.businessInfo?.taxId || ''}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  businessInfo: { ...profile.businessInfo, taxId: e.target.value },
                })
              }
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700">City</label>
            <input
              type="text"
              value={profile.address?.city || ''}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  address: { ...profile.address, city: e.target.value },
                })
              }
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700">State</label>
            <input
              type="text"
              value={profile.address?.state || ''}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  address: { ...profile.address, state: e.target.value },
                })
              }
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700">Country</label>
            <input
              type="text"
              value={profile.address?.country || 'India'}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  address: { ...profile.address, country: e.target.value },
                })
              }
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
          <div>
            <label className="block font-bold text-slate-700">Timezone</label>
            <select
              value={profile.settings?.timezone || 'Asia/Kolkata'}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  settings: { ...profile.settings, timezone: e.target.value },
                })
              }
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (EST)</option>
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700">Currency</label>
            <select
              value={profile.settings?.currency || 'INR'}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  settings: { ...profile.settings, currency: e.target.value },
                })
              }
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-blue-200 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

