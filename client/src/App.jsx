import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMe } from './store/slices/authSlice';
import { Toaster } from 'react-hot-toast';

// Layout & Guards
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Pages
import LandingPage from './pages/public/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterCompanyPage from './pages/auth/RegisterCompanyPage';

import DashboardPage from './pages/dashboard/DashboardPage';
import SuperAdminDashboardPage from './pages/super-admin/SuperAdminDashboardPage';
import EmployeesPage from './pages/employees/EmployeesPage';
import DepartmentsPage from './pages/departments/DepartmentsPage';
import AttendancePage from './pages/attendance/AttendancePage';
import LeavesPage from './pages/leaves/LeavesPage';
import ShiftsPage from './pages/shifts/ShiftsPage';
import PayrollPage from './pages/payroll/PayrollPage';
import RecruitmentPage from './pages/recruitment/RecruitmentPage';
import PerformancePage from './pages/performance/PerformancePage';
import DocumentsPage from './pages/documents/DocumentsPage';
import ReportsPage from './pages/reports/ReportsPage';
import CompanySettingsPage from './pages/settings/CompanySettingsPage';

export default function App() {
  const dispatch = useDispatch();
  const { token } = useSelector((state) => state.auth);

  useEffect(() => {
    if (token) {
      dispatch(fetchMe());
    }
  }, [dispatch, token]);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            fontSize: '12px',
            borderRadius: '10px',
            padding: '12px 16px',
          },
        }}
      />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register-company" element={<RegisterCompanyPage />} />

        {/* Protected Application Routes */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                <SuperAdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/leaves" element={<LeavesPage />} />
          <Route path="/shifts" element={<ShiftsPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/recruitment" element={<RecruitmentPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<CompanySettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
