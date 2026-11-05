import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  CalendarCheck,
  DollarSign,
  TrendingUp,
  Award,
  ChevronRight,
  Check,
  Building,
} from 'lucide-react';

export default function LandingPage() {
  const plans = [
    {
      name: 'Starter Plan',
      price: '₹1,499',
      period: '/month',
      desc: 'Ideal for early-stage teams & startups',
      features: ['Up to 25 Employees', 'Attendance & Shifts', 'Leave Workflows', 'Basic Payroll', 'CSV Exports'],
      highlight: false,
    },
    {
      name: 'Growth Plan',
      price: '₹3,999',
      period: '/month',
      desc: 'Best for expanding organizations',
      features: [
        'Up to 100 Employees',
        'Full Payroll & Payslip PDF',
        'Recruitment Pipeline',
        'Performance Appraisals',
        'Document Vault',
        'Role Permissions',
      ],
      highlight: true,
    },
    {
      name: 'Enterprise Plan',
      price: '₹9,999',
      period: '/month',
      desc: 'Scale-ready for large enterprises',
      features: [
        'Unlimited Employees',
        'Priority 24/7 Support',
        'Custom Workflows',
        'Audit Compliance Logs',
        'Dedicated Success Manager',
      ],
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-lg flex items-center justify-center shadow-sm">
              PR
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-base tracking-tight">PR VISION HRMS</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Multi-Tenant SaaS
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-blue-600 px-3 py-2 transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register-company"
              className="text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all shadow-blue-200"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 lg:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-6">
          <Building className="w-3.5 h-3.5" />
          <span>PR VISION INNOVATIONS presents Next-Gen Workforce Management</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight max-w-4xl mx-auto">
          People. Process. Performance.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Modern, cloud-based Human Resource Management System with rock-solid multi-tenant data isolation,
          automated attendance, configurable payroll, and performance tracking.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/register-company"
            className="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
          >
            <span>Register Your Company</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            to="/login"
            className="px-6 py-3.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-sm sm:text-base transition-all"
          >
            Explore Demo Logins
          </Link>
        </div>
      </section>

      {/* Key Modules Grid */}
      <section className="py-16 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Enterprise-Grade Capabilities Built for Scale
            </h2>
            <p className="mt-3 text-slate-500 text-sm sm:text-base">
              Everything your organization needs to manage personnel, policies, and payroll in one unified platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: ShieldCheck,
                title: 'Strict Multi-Tenant Isolation',
                desc: 'Every company workspace is logically isolated at the database query level with tenant-scoped indexes.',
              },
              {
                icon: Users,
                title: 'Employee Directory & Profiles',
                desc: 'Complete personnel records, departments, designations, manager hierarchies, and emergency contacts.',
              },
              {
                icon: CalendarCheck,
                title: 'Attendance & Shift Rules',
                desc: 'One-click check-in/out, late arrival detection, shift schedules, overtime, and manager adjustments.',
              },
              {
                icon: DollarSign,
                title: 'Configurable Indian Payroll',
                desc: 'Custom earnings, HRA, statutory PF, ESI, Professional Tax, TDS deductions, and instant PDF payslips.',
              },
              {
                icon: TrendingUp,
                title: 'Recruitment & Job Openings',
                desc: 'Post job openings, manage candidates from screening to offer, and schedule interview rounds.',
              },
              {
                icon: Award,
                title: 'Performance & Appraisals',
                desc: 'Set weighted goals, track progress, conduct employee self-reviews, and submit manager evaluations.',
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Simple, Transparent Pricing</h2>
          <p className="mt-3 text-slate-500 text-sm sm:text-base">
            Start with a 30-day full feature trial. Upgrade or cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`rounded-2xl p-8 transition-all flex flex-col justify-between ${
                plan.highlight
                  ? 'bg-white border-2 border-blue-600 shadow-xl shadow-blue-100 relative'
                  : 'bg-white border border-slate-200'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                  Most Popular
                </span>
              )}
              <div>
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{plan.desc}</p>
                <div className="mt-5 flex items-baseline">
                  <span className="text-3xl font-extrabold text-slate-900">{plan.price}</span>
                  <span className="text-xs text-slate-500 ml-1">{plan.period}</span>
                </div>
                <div className="mt-6 border-t border-slate-100 pt-6 space-y-3">
                  {plan.features.map((f, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-2.5 text-xs text-slate-700">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                to="/register-company"
                className={`mt-8 w-full py-2.5 rounded-xl font-bold text-xs text-center block transition-all ${
                  plan.highlight
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">PR VISION HRMS</span>
            <span>&bull;</span>
            <span>PR VISION INNOVATIONS</span>
          </div>
          <p>&copy; 2026 PR VISION INNOVATIONS. Enterprise Multi-Tenant SaaS Platform.</p>
        </div>
      </footer>
    </div>
  );
}

