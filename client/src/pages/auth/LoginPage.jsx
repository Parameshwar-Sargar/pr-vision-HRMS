import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginUser } from '../../store/slices/authSlice';
import toast from 'react-hot-toast';
import { Lock, Mail, ArrowRight, ShieldCheck, UserCheck, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, error } = useSelector((state) => state.auth);

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    const res = await dispatch(loginUser({ email, password }));
    if (!res.error) {
      toast.success('Signed in successfully!');
      if (res.payload.user?.role === 'SUPER_ADMIN') {
        navigate('/super-admin');
      } else {
        navigate(from);
      }
    } else {
      toast.error(res.payload || 'Login failed');
    }
  };

  const handleQuickLogin = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    dispatch(loginUser({ email: demoEmail, password: demoPassword })).then((res) => {
      if (!res.error) {
        toast.success(`Signed in as ${demoEmail}`);
        if (res.payload.user?.role === 'SUPER_ADMIN') {
          navigate('/super-admin');
        } else {
          navigate(from);
        }
      } else {
        toast.error(res.payload || 'Login failed');
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-extrabold text-xl flex items-center justify-center shadow-md shadow-blue-200">
            PR
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tight">PR VISION HRMS</span>
        </Link>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Sign in to your account</h2>
        <p className="mt-2 text-xs text-slate-500">
          Or{' '}
          <Link to="/register-company" className="font-semibold text-blue-600 hover:text-blue-500">
            register a new company workspace
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 sm:rounded-2xl border border-slate-200 sm:px-10">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold text-slate-700">Email Address</label>
              <div className="mt-1 relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full pl-9 pr-3 py-2 sm:text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">Password</label>
              <div className="mt-1 relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-9 pr-3 py-2 sm:text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins Section */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>One-Click Demo Logins</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickLogin('superadmin@prvision.com', 'AdminPassword@123')}
                className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 text-left transition-colors"
              >
                <div className="font-bold text-slate-800">Super Admin</div>
                <div className="text-[10px] text-slate-500">Platform Portal</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('rajesh.admin@prvision.com', 'Password@123')}
                className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 text-left transition-colors"
              >
                <div className="font-bold text-slate-800">Company Admin</div>
                <div className="text-[10px] text-slate-500">PR VISION HRMS</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('priya.hr@prvision.com', 'Password@123')}
                className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 text-left transition-colors"
              >
                <div className="font-bold text-slate-800">HR Manager</div>
                <div className="text-[10px] text-slate-500">People & Payroll</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('ananya.emp@prvision.com', 'Password@123')}
                className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 text-left transition-colors"
              >
                <div className="font-bold text-slate-800">Employee</div>
                <div className="text-[10px] text-slate-500">Attendance/Leaves</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

