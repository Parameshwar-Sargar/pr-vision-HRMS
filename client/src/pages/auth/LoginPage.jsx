import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../../store/slices/authSlice';
import api, { getTabId } from '../../services/api';
import { toast } from 'react-hot-toast';
import {
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
} from 'lucide-react';

// Development auto-fill configuration (strictly eliminated in production builds)
const isDev = import.meta.env.DEV;
const defaultEmail = isDev ? (import.meta.env.VITE_DEV_ADMIN_EMAIL || 'admin@prvision.com') : '';
const defaultPassword = isDev ? (import.meta.env.VITE_DEV_ADMIN_PASSWORD || 'Password@123') : '';

export default function LoginPage() {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const cleanEmail = (email || '').trim();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Please enter both corporate email and password.');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', {
        email: cleanEmail,
        password: cleanPassword,
        rememberMe,
        tabId: getTabId(),
      });
      const payload = res?.data || res;
      const user = payload?.user;
      const company = payload?.company;
      const session = payload?.session || null;
      const accessToken = payload?.tokens?.accessToken || payload?.accessToken;
      const refreshToken = payload?.tokens?.refreshToken || payload?.refreshToken;

      if (!user || !accessToken) {
        throw new Error('Malformed authentication response received from server.');
      }

      dispatch(setCredentials({ user, accessToken, refreshToken, company, session }));
      toast.success(`Welcome back, ${user.name}!`);

      navigate('/dashboard');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Authentication failed. Please verify the backend server and database connection.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setIsLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', {
        email: demoEmail,
        password: demoPassword,
        rememberMe,
        tabId: getTabId(),
      });
      const payload = res?.data || res;
      const user = payload?.user;
      const company = payload?.company;
      const session = payload?.session || null;
      const accessToken = payload?.tokens?.accessToken || payload?.accessToken;
      const refreshToken = payload?.tokens?.refreshToken || payload?.refreshToken;

      if (!user || !accessToken) {
        throw new Error('Malformed authentication response received from server.');
      }

      dispatch(setCredentials({ user, accessToken, refreshToken, company, session }));
      toast.success(`Logged in as ${user.name} (${user.role.replace('_', ' ')})`);
      navigate('/dashboard');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Login failed. Please verify the backend server and database connection.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 sm:px-6 lg:px-8 selection:bg-blue-600 selection:text-white">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-xl shadow-blue-600/25">
            PR
          </div>
          <div className="text-left">
            <span className="text-2xl font-black text-slate-900 tracking-tight block">PR VISION HRMS</span>
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">
              Human Resource Management System
            </span>
          </div>
        </div>

        <p className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 inline-block px-3 py-1 rounded-full mt-2">
          People. Process. Performance.
        </p>
      </div>

      {/* Login Card */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 sm:rounded-2xl border border-slate-200/90 sm:px-10">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Sign in to Enterprise Workspace</h2>
              {isDev && (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full">
                  Dev Auto-Fill
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Access attendance, leaves, payroll, assets, and employee operations.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Corporate Email Address</label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@prvision.com"
                  className="block w-full pl-9 pr-3 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white placeholder:text-slate-400 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-9 pr-10 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white placeholder:text-slate-400 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 font-medium select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span>Remember this workstation</span>
              </label>

              <Link
                to="/forgot-password"
                className="font-bold text-blue-600 hover:text-blue-700"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-md shadow-blue-500/20 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Access for Development Evaluation Only */}
          {isDev && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>6 Core Roles Demo Access</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">Password: Password@123</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin@prvision.com', 'Password@123')}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 text-left transition-colors group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-blue-700">Admin</div>
                  <div className="text-[10px] text-slate-500">Director / Settings</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('hr@prvision.com', 'Password@123')}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 text-left transition-colors group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-blue-700">HR Manager</div>
                  <div className="text-[10px] text-slate-500">People & Lifecycle</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('manager@prvision.com', 'Password@123')}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 text-left transition-colors group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-blue-700">Team Manager</div>
                  <div className="text-[10px] text-slate-500">Approvals & KPIs</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('employee@prvision.com', 'Password@123')}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 text-left transition-colors group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-blue-700">Employee</div>
                  <div className="text-[10px] text-slate-500">Self-Service Clock</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('recruiter@prvision.com', 'Password@123')}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 text-left transition-colors group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-blue-700">Recruiter</div>
                  <div className="text-[10px] text-slate-500">ATS & Candidate Hires</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('payroll@prvision.com', 'Password@123')}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 text-left transition-colors group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-blue-700">Payroll Admin</div>
                  <div className="text-[10px] text-slate-500">Salaries & Payslips</div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          PR VISION INNOVATIONS &bull; Enterprise HRMS Software Delivery Platform
        </p>
      </div>
    </div>
  );
}
