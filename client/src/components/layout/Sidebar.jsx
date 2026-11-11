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
  GraduationCap,
  Receipt,
  Laptop,
  LifeBuoy,
  Megaphone,
  FileText,
  BarChart3,
  Settings,
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useSelector((state) => state.auth);

  const role = user?.role || 'EMPLOYEE';
  const isAdmin = role === 'ADMIN';
  const isHR = role === 'HR_MANAGER';
  const isManager = role === 'MANAGER';
  const isEmployee = role === 'EMPLOYEE';
  const isRecruiter = role === 'RECRUITER';
  const isPayroll = role === 'PAYROLL_ADMIN';

  // Build role-isolated navigation items
  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },

    // Employees Directory (Restricted to HR, Admin, Payroll)
    ...(isAdmin || isHR || isPayroll
      ? [{ name: 'Employees', path: '/employees', icon: Users }]
      : []),

    // Departments & Designations (Admin & HR only)
    ...(isAdmin || isHR
      ? [{ name: 'Departments', path: '/departments', icon: Building2 }]
      : []),

    // Attendance
    {
      name: isEmployee ? 'My Attendance' : isManager ? 'Team Attendance' : 'Attendance',
      path: '/attendance',
      icon: CalendarCheck,
    },

    // Leaves
    {
      name: isEmployee ? 'My Leaves' : isManager ? 'Team Leaves' : 'Leaves',
      path: '/leaves',
      icon: CalendarRange,
    },

    // Shifts
    {
      name: isEmployee ? 'My Shift' : 'Shifts',
      path: '/shifts',
      icon: Clock,
    },

    // Payroll (Self-service payslips for Employee; Full payroll for Admin, HR, Payroll Admin)
    ...(isAdmin || isHR || isPayroll || isEmployee
      ? [{ name: isEmployee ? 'My Payslips' : 'Payroll', path: '/payroll', icon: DollarSign }]
      : []),

    // Recruitment (Admin, HR, Recruiter)
    ...(isAdmin || isHR || isRecruiter
      ? [{ name: 'Recruitment', path: '/recruitment', icon: Briefcase }]
      : []),

    // Performance
    {
      name: isEmployee ? 'My Performance' : isManager ? 'Team Performance' : 'Performance',
      path: '/performance',
      icon: Target,
    },

    // Training
    {
      name: isEmployee ? 'My Training' : 'Training',
      path: '/training',
      icon: GraduationCap,
    },

    // Expenses
    {
      name: isEmployee ? 'My Expenses' : isManager ? 'Team Expenses' : 'Expenses',
      path: '/expenses',
      icon: Receipt,
    },

    // Assets
    {
      name: isEmployee ? 'My Assets' : 'Assets',
      path: '/assets',
      icon: Laptop,
    },

    // Grievances
    {
      name: isEmployee ? 'My Grievances' : 'Grievances',
      path: '/grievances',
      icon: LifeBuoy,
    },

    // Announcements (All)
    { name: 'Announcements', path: '/announcements', icon: Megaphone },

    // Documents
    {
      name: isEmployee ? 'My Documents' : 'Documents',
      path: '/documents',
      icon: FileText,
    },

    // Reports (Restricted to Admin, HR, Manager, Payroll Admin)
    ...(!isEmployee && !isRecruiter
      ? [{ name: isManager ? 'Team Reports' : 'Reports', path: '/reports', icon: BarChart3 }]
      : []),

    // Settings, Branches & Security Sessions (Accessible to all roles; Admin/HR get full company settings)
    {
      name: isAdmin || isHR ? 'Settings & Security' : 'Security & Sessions',
      path: isAdmin || isHR ? '/settings' : '/security',
      icon: Settings,
    },
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
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-lg shadow-sm">
            PR
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 tracking-tight text-sm">PR VISION HRMS</span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              People. Process. Performance.
            </span>
          </div>
        </div>

        {/* Enterprise Organization Badge */}
        <div className="px-4 py-2 mx-3 mt-3 bg-blue-50/70 border border-blue-100 rounded-lg flex-shrink-0">
          <p className="text-[11px] font-bold text-blue-950 truncate">PR VISION INNOVATIONS</p>
          <p className="text-[10px] text-blue-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Enterprise Master Suite
          </p>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
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
        <div className="p-3 border-t border-slate-100 flex-shrink-0">
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
