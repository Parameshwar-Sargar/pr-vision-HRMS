import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMe } from './store/slices/authSlice';
import { Toaster } from 'react-hot-toast';

// Layout & Guards
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Public Auth Pages (eagerly loaded for instant entry)
import LoginPage from './pages/auth/LoginPage';
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));

// Lazy-loaded Enterprise HRMS Pages for Route-Level Code Splitting
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const EmployeesPage = lazy(() => import('./pages/employees/EmployeesPage'));
const DepartmentsPage = lazy(() => import('./pages/departments/DepartmentsPage'));
const AttendancePage = lazy(() => import('./pages/attendance/AttendancePage'));
const LeavesPage = lazy(() => import('./pages/leaves/LeavesPage'));
const ShiftsPage = lazy(() => import('./pages/shifts/ShiftsPage'));
const PayrollPage = lazy(() => import('./pages/payroll/PayrollPage'));
const RecruitmentPage = lazy(() => import('./pages/recruitment/RecruitmentPage'));
const PerformancePage = lazy(() => import('./pages/performance/PerformancePage'));
const TrainingPage = lazy(() => import('./pages/training/TrainingPage'));
const ExpensesPage = lazy(() => import('./pages/expenses/ExpensesPage'));
const AssetsPage = lazy(() => import('./pages/assets/AssetsPage'));
const GrievancesPage = lazy(() => import('./pages/grievances/GrievancesPage'));
const AnnouncementsPage = lazy(() => import('./pages/announcements/AnnouncementsPage'));
const DocumentsPage = lazy(() => import('./pages/documents/DocumentsPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const CompanySettingsPage = lazy(() => import('./pages/settings/CompanySettingsPage'));

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse p-2">
      <div className="h-8 w-56 bg-slate-200 rounded-lg" />
      <div className="h-4 w-80 bg-slate-100 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="h-28 bg-white border border-slate-200 rounded-2xl" />
        <div className="h-28 bg-white border border-slate-200 rounded-2xl" />
        <div className="h-28 bg-white border border-slate-200 rounded-2xl" />
      </div>
      <div className="h-64 bg-white border border-slate-200 rounded-2xl" />
    </div>
  );
}

export default function App() {
  const dispatch = useDispatch();
  const { token } = useSelector((state) => state.auth);

  useEffect(() => {
    document.title = 'PR VISION HRMS | People. Process. Performance.';
  }, []);

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
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
        {/* Entry & Authentication: PR VISION HRMS */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Protected Enterprise Routes */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Role-Restricted Enterprise Routes */}
          <Route
            path="/employees"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'HR_MANAGER', 'PAYROLL_ADMIN']}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/departments"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'HR_MANAGER']}>
                <DepartmentsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/leaves" element={<LeavesPage />} />
          <Route path="/holidays" element={<LeavesPage />} />
          <Route path="/shifts" element={<ShiftsPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route
            path="/recruitment"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'HR_MANAGER', 'RECRUITER']}>
                <RecruitmentPage />
              </ProtectedRoute>
            }
          />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/grievances" element={<GrievancesPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'HR_MANAGER', 'MANAGER', 'PAYROLL_ADMIN']}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<CompanySettingsPage />} />
          <Route path="/security" element={<CompanySettingsPage />} />
          <Route
            path="/organization"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'HR_MANAGER']}>
                <CompanySettingsPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
