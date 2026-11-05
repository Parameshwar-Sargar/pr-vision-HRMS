import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Dynamic Page Title mapping
  const getPageTitle = (pathname) => {
    if (pathname.includes('/dashboard')) return 'Enterprise Dashboard';
    if (pathname.includes('/super-admin')) return 'Platform Super Admin';
    if (pathname.includes('/employees')) return 'Employee Directory';
    if (pathname.includes('/departments')) return 'Departments & Designations';
    if (pathname.includes('/attendance')) return 'Attendance Management';
    if (pathname.includes('/leaves')) return 'Leave Management & Approvals';
    if (pathname.includes('/shifts')) return 'Shift Schedules';
    if (pathname.includes('/payroll')) return 'Payroll & Payslips';
    if (pathname.includes('/recruitment')) return 'Talent Acquisition & Pipeline';
    if (pathname.includes('/performance')) return 'Performance Appraisals';
    if (pathname.includes('/documents')) return 'Document Repository';
    if (pathname.includes('/reports')) return 'Reports & Analytics';
    if (pathname.includes('/settings')) return 'Company Configuration';
    return 'PR VISION HRMS';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar navigation */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Navbar
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          title={getPageTitle(location.pathname)}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

