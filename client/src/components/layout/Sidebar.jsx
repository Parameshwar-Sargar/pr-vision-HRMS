import React from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarCheck,
  CalendarRange,
  Clock,
  DollarSign,
  Briefcase,
  Target,
  FileText,
  BarChart3,
  Settings,
  ShieldAlert,
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const { user, tenant } = useSelector((state) => state.auth);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    ...(isSuperAdmin
      ? [{ name: 'Super Admin Portal', path: '/super-admin', icon: ShieldAlert }]
      : []),
    { name: 'Employees', path: '/employees', icon: Users },
    { name: 'Departments', path: '/departments', icon: Building2 },
    { name: 'Attendance', path: '/attendance', icon: CalendarCheck },
    { name: 'Leaves', path: '/leaves', icon: CalendarRange },
    { name: 'Shifts', path: '/shifts', icon: Clock },
    { name: 'Payroll', path: '/payroll', icon: DollarSign },
    { name: 'Recruitment', path: '/recruitment', icon: Briefcase },
    { name: 'Performance', path: '/performance', icon: Target },
    { name: 'Documents', path: '/documents', icon: FileText },
    { name: 'Reports', path: '/reports', icon: BarChart3 },
    ...(!isSuperAdmin
      ? [{ name: 'Company Settings', path: '/settings', icon: Settings }]
      : []),
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-slate-200 transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-100">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-lg shadow-sm">
            PR
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 tracking-tight text-sm">PR VISION HRMS</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              {tenant?.name || 'Enterprise SaaS'}
            </span>
          </div>
        </div>

        {/* Tenant Workspace Badge */}
        {tenant && !isSuperAdmin && (
          <div className="px-4 py-2.5 mx-3 mt-3 bg-blue-50/70 border border-blue-100 rounded-lg">
            <p className="text-[11px] font-semibold text-blue-900 truncate">{tenant.name}</p>
            <p className="text-[10px] text-blue-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {tenant.planName || 'Growth'} Plan
            </p>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Card Footer */}
        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
              {user?.name?.slice(0, 2) || 'PR'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] text-slate-500 truncate capitalize">
                {user?.role?.replace('_', ' ').toLowerCase() || 'Employee'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

