import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import queryCache from '../services/queryCache';
import api from '../services/api';
import authReducer, { setCredentials, logoutUser } from '../store/slices/authSlice';
import masterDataReducer, { addDepartment } from '../store/slices/masterDataSlice';
import EmployeesPage from '../pages/employees/EmployeesPage';
import RecruitmentPage from '../pages/recruitment/RecruitmentPage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import DepartmentsPage from '../pages/departments/DepartmentsPage';
import LeavesPage from '../pages/leaves/LeavesPage';
import AssetsPage from '../pages/assets/AssetsPage';
import PayrollPage from '../pages/payroll/PayrollPage';
import App from '../App';

describe('Phase 3 Integration: Shared MasterData, StrictMode Safety, Mutations & Auth Flow', () => {
  let originalAdapter;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  const createTestStore = (preloadedAuth = {}) =>
    configureStore({
      reducer: {
        auth: authReducer,
        masterData: masterDataReducer,
      },
      preloadedState: {
        auth: {
          user: { _id: 'u1', name: 'Admin User', email: 'admin@prvision.com', role: 'ADMIN' },
          employee: null,
          company: { companyName: 'PR VISION INNOVATIONS' },
          token: 'token-tab-1',
          refreshToken: 'refresh-tab-1',
          sessionId: 'sess-tab-1',
          tabId: 'tab-test-1',
          session: { sessionId: 'sess-tab-1' },
          isAuthenticated: true,
          isLoading: false,
          error: null,
          ...preloadedAuth,
        },
      },
    });

  beforeEach(() => {
    queryCache.clear();
    queryCache.resetStats();
    sessionStorage.clear();
    localStorage.clear();

    sessionStorage.setItem('pr_tab_id', 'tab-test-1');
    sessionStorage.setItem('pr_session_id', 'sess-tab-1');
    sessionStorage.setItem('pr_access_token', 'token-tab-1');
    sessionStorage.setItem('pr_refresh_token', 'refresh-tab-1');
    sessionStorage.setItem(
      'pr_user',
      JSON.stringify({ _id: 'u1', name: 'Admin User', email: 'admin@prvision.com', role: 'ADMIN' })
    );

    originalAdapter = api.defaults.adapter;
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;

    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
    api.defaults.adapter = originalAdapter;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('reuses shared Redux masterData across Employees -> Recruitment navigation without duplicate metadata fetches', async () => {
    const requestLog = [];
    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      requestLog.push(cleanPath);

      const responses = {
        '/departments': { departments: [{ _id: 'd1', name: 'Engineering' }] },
        '/designations': { designations: [{ _id: 'des1', title: 'SDE' }] },
        '/organization/branches': { branches: [{ _id: 'b1', name: 'Bengaluru HQ' }] },
        '/shifts': { shifts: [{ _id: 's1', name: 'General', startTime: '09:00', endTime: '18:00' }] },
        '/leaves/types': { leaveTypes: [{ _id: 'lt1', name: 'Casual Leave' }] },
        '/employees': {
          employees: [
            {
              _id: 'e1',
              employeeId: 'EMP001',
              firstName: 'Parameshwar',
              lastName: 'Sargar',
              email: 'param@prvision.com',
              departmentId: { _id: 'd1', name: 'Engineering' },
              designationId: { _id: 'des1', title: 'SDE' },
              employmentStatus: 'Confirmed',
            },
          ],
        },
        '/recruitment/jobs': { jobs: [] },
        '/recruitment/candidates': { candidates: [] },
      };

      const dataKey = Object.keys(responses).find((k) => cleanPath.startsWith(k));
      return {
        data: { success: true, data: responses[dataKey] || {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const store = createTestStore();

    // Render EmployeesPage inside StrictMode to prove cancellation-safe dedupe works cleanly
    const empView = render(
      <React.StrictMode>
        <Provider store={store}>
          <MemoryRouter>
            <EmployeesPage />
          </MemoryRouter>
        </Provider>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByText(/Parameshwar Sargar/)).toBeInTheDocument();
    });

    const deptCallsAfterEmp = requestLog.filter((u) => u.startsWith('/departments')).length;
    const empCallsAfterEmp = requestLog.filter((u) => u.startsWith('/employees')).length;
    expect(deptCallsAfterEmp).toBe(1);
    expect(empCallsAfterEmp).toBe(1);

    empView.unmount();

    // Navigate to RecruitmentPage sharing the same Redux store + cache
    render(
      <Provider store={store}>
        <MemoryRouter>
          <RecruitmentPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Recruitment & Hiring Pipeline/)).toBeInTheDocument();
    });

    // All 5 master-data endpoints must still have been called ONLY ONCE total across both pages
    expect(requestLog.filter((u) => u.startsWith('/departments'))).toHaveLength(1);
    expect(requestLog.filter((u) => u.startsWith('/designations'))).toHaveLength(1);
    expect(requestLog.filter((u) => u.startsWith('/organization/branches'))).toHaveLength(1);
    expect(requestLog.filter((u) => u.startsWith('/shifts'))).toHaveLength(1);
    expect(requestLog.filter((u) => u.startsWith('/leaves/types'))).toHaveLength(1);
  });

  it('invalidates dashboard cache and triggers refresh on check-in mutation', async () => {
    let statsFetches = 0;
    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      if (cleanPath.startsWith('/dashboard/stats')) {
        statsFetches += 1;
        return {
          data: {
            success: true,
            data: {
              kpi: {
                checkedIn: statsFetches > 1,
                presentDays: statsFetches > 1 ? 15 : 14,
                leaveBalance: 12,
                checkInTime: statsFetches > 1 ? new Date().toISOString() : null,
              },
              announcements: [],
              upcomingHolidays: [],
              upcomingBirthdays: [],
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (cleanPath.startsWith('/attendance/check-in')) {
        return {
          data: {
            success: true,
            message: 'Clocked in successfully!',
            data: { record: { checkInTime: new Date().toISOString() } },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const store = createTestStore({
      user: { _id: 'u2', name: 'Amit Patel', email: 'amit@prvision.com', role: 'EMPLOYEE' },
    });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Provider>
    );

    const clockInBtn = await screen.findByRole('button', { name: /Clock In/i });
    expect(statsFetches).toBe(1);
    expect(queryCache.getCached(`tab-test-1:sess-tab-1:get:/dashboard/stats:{}`)).not.toBeNull();

    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(statsFetches).toBe(2);
    });
  });

  it('clears queryCache and masterData on logout and avoids duplicate /auth/me right after setCredentials', async () => {
    const authMeCalls = [];
    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      if (cleanPath.includes('/auth/me')) authMeCalls.push(cleanPath);
      return {
        data: { success: true, data: { employees: [{ _id: 'e1' }] } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await api.get('/employees', { cacheTtl: 30000 });
    expect(queryCache.cache.size).toBe(1);

    // Boot unauthenticated -> login via setCredentials -> App must NOT fire redundant /auth/me
    sessionStorage.clear();
    window.history.pushState({}, '', '/login');
    const unauthStore = createTestStore({ token: null, isAuthenticated: false, user: null, sessionId: null });
    render(
      <Provider store={unauthStore}>
        <App />
      </Provider>
    );

    await screen.findByText(/Sign in to Enterprise Workspace/i);

    unauthStore.dispatch(
      setCredentials({
        user: { _id: 'u1', name: 'Admin', role: 'ADMIN' },
        accessToken: 'fresh-tok',
        refreshToken: 'fresh-ref',
        company: { companyName: 'PR VISION' },
        session: { sessionId: 'fresh-sess' },
      })
    );

    await new Promise((r) => setTimeout(r, 40));
    expect(authMeCalls).toHaveLength(0);

    // Logout must completely clear queryCache & masterData
    unauthStore.dispatch(addDepartment({ _id: 'd1', name: 'Sales' }));
    expect(unauthStore.getState().masterData.departments).toHaveLength(1);
    await unauthStore.dispatch(logoutUser());
    expect(queryCache.cache.size).toBe(0);
    expect(unauthStore.getState().masterData.departments).toHaveLength(0);
  });

  it('invalidates Redux masterData on /organization/branches mutation while serving unaffected masterData from cache', async () => {
    const networkCalls = [];
    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      networkCalls.push(`${(config.method || 'get').toUpperCase()} ${cleanPath}`);
      if (config.method === 'post' && cleanPath === '/organization/branches') {
        return {
          data: { success: true, data: { branch: { _id: 'b2', name: 'Pune Branch' } } },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        };
      }
      const payloads = {
        '/auth/me': { user: { _id: 'u1', name: 'Admin', role: 'ADMIN' } },
        '/departments': { departments: [{ _id: 'd1', name: 'Engineering' }] },
        '/designations': { designations: [{ _id: 'des1', title: 'SDE' }] },
        '/organization/branches': { branches: [{ _id: 'b1', name: 'Bengaluru HQ' }] },
        '/shifts': { shifts: [{ _id: 's1', name: 'General' }] },
        '/leaves/types': { leaveTypes: [{ _id: 'lt1', name: 'Casual' }] },
        '/dashboard/stats': { kpi: { totalEmployees: 10 }, announcements: [], upcomingHolidays: [], upcomingBirthdays: [] },
      };
      const key = Object.keys(payloads).find((k) => cleanPath.startsWith(k));
      return {
        data: { success: true, data: payloads[key] || {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    window.history.pushState({}, '', '/dashboard');
    const store = createTestStore();
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );

    await screen.findByText(/People\. Process\. Performance\./i);

    const { fetchMasterData } = await import('../store/slices/masterDataSlice');
    await store.dispatch(fetchMasterData(false));
    expect(store.getState().masterData.isLoaded).toBe(true);

    // Mutate branches -> App listener invalidates masterData in Redux + queryCache invalidates branches ONLY
    await api.post('/organization/branches', { name: 'Pune Branch', code: 'PUN' });
    expect(store.getState().masterData.isLoaded).toBe(false);

    networkCalls.length = 0;
    await store.dispatch(fetchMasterData(false));

    // Only /organization/branches hits the network; departments/designations/shifts/leaveTypes hit queryCache!
    expect(networkCalls).toEqual(['GET /organization/branches']);
  });

  it('maintains 0 duplicate requests across multi-module navigation and React 18 StrictMode mounts', async () => {
    const networkLog = [];
    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      networkLog.push(cleanPath);

      const map = {
        '/dashboard/stats': {
          kpi: { totalEmployees: 7, presentToday: 6, onLeaveToday: 0, pendingApprovals: 1 },
          announcements: [],
          upcomingHolidays: [],
          upcomingBirthdays: [],
        },
        '/employees': {
          employees: [
            {
              _id: 'e1',
              employeeId: 'EMP001',
              firstName: 'Parameshwar',
              lastName: 'Sargar',
              email: 'param@prvision.com',
              departmentId: { _id: 'd1', name: 'Engineering' },
              designationId: { _id: 'des1', title: 'SDE' },
              employmentStatus: 'Confirmed',
            },
          ],
        },
        '/departments': { departments: [{ _id: 'd1', name: 'Engineering' }] },
        '/designations': { designations: [{ _id: 'des1', title: 'SDE' }] },
        '/organization/branches': { branches: [{ _id: 'b1', name: 'Bengaluru HQ' }] },
        '/shifts': { shifts: [{ _id: 's1', name: 'General', startTime: '09:00', endTime: '18:00' }] },
        '/leaves/types': { leaveTypes: [{ _id: 'lt1', name: 'Casual Leave' }] },
        '/leaves/balances': { balances: [] },
        '/leaves/requests': { leaveRequests: [] },
        '/recruitment/jobs': { jobs: [] },
        '/recruitment/candidates': { candidates: [] },
        '/assets': { assets: [] },
      };

      const key = Object.keys(map).find((k) => cleanPath.startsWith(k));
      await new Promise((r) => setTimeout(r, 10));
      return {
        data: { success: true, data: map[key] || {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const store = createTestStore();

    // 1. Dashboard under StrictMode -> 1 /dashboard/stats request (not 2)
    const dash1 = render(
      <React.StrictMode>
        <Provider store={store}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </Provider>
      </React.StrictMode>
    );
    await screen.findByText(/People\. Process\. Performance\./i);
    expect(networkLog.filter((p) => p.startsWith('/dashboard/stats'))).toHaveLength(1);
    dash1.unmount();

    // 2. Employees under StrictMode -> 1 /employees + 5 master-data calls
    const beforeEmpCount = networkLog.length;
    const empView = render(
      <React.StrictMode>
        <Provider store={store}>
          <MemoryRouter>
            <EmployeesPage />
          </MemoryRouter>
        </Provider>
      </React.StrictMode>
    );
    await screen.findByText(/Parameshwar Sargar/);
    expect(networkLog.length - beforeEmpCount).toBe(6);
    empView.unmount();

    // 3. Recruitment -> 2 calls (/jobs + /candidates), 0 masterData calls
    const beforeRecCount = networkLog.length;
    const recView = render(
      <Provider store={store}>
        <MemoryRouter>
          <RecruitmentPage />
        </MemoryRouter>
      </Provider>
    );
    await screen.findByText(/Recruitment & Hiring Pipeline/);
    expect(networkLog.length - beforeRecCount).toBe(2);
    recView.unmount();

    // 4. Return to Dashboard -> 0 network calls (served from 30s queryCache)
    const beforeDashReturn = networkLog.length;
    const dash2 = render(
      <Provider store={store}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Provider>
    );
    await screen.findByText(/People\. Process\. Performance\./i);
    expect(networkLog.length - beforeDashReturn).toBe(0);
    dash2.unmount();

    // 5. Departments -> 0 network calls (reuses 30s TTL /departments & /designations cache)
    const beforeDept = networkLog.length;
    const deptView = render(
      <Provider store={store}>
        <MemoryRouter>
          <DepartmentsPage />
        </MemoryRouter>
      </Provider>
    );
    await screen.findByText(/Organization Hierarchy/);
    expect(networkLog.length - beforeDept).toBe(0);
    deptView.unmount();

    // 6. Leaves -> 2 calls (/balances + /requests), 0 /leaves/types duplicate
    const beforeLeaves = networkLog.length;
    const leavesView = render(
      <Provider store={store}>
        <MemoryRouter>
          <LeavesPage />
        </MemoryRouter>
      </Provider>
    );
    await screen.findByText(/Leave Balances/i);
    expect(networkLog.length - beforeLeaves).toBe(2);
    expect(networkLog.filter((p) => p.startsWith('/leaves/types'))).toHaveLength(1);
    leavesView.unmount();

    // 7. Assets -> 1 call (/assets), 0 duplicate /employees?limit=100 call
    const beforeAssets = networkLog.length;
    const assetsView = render(
      <Provider store={store}>
        <MemoryRouter>
          <AssetsPage />
        </MemoryRouter>
      </Provider>
    );
    await screen.findByText(/No assets in inventory\./i);
    expect(networkLog.length - beforeAssets).toBe(1);
    expect(networkLog.filter((p) => p.startsWith('/employees'))).toHaveLength(1);
    assetsView.unmount();

    // Total across 7 screens (including StrictMode): 1 + 6 + 2 + 0 + 0 + 2 + 1 = 12 HTTP calls total!
    expect(networkLog).toHaveLength(12);
    expect(queryCache.getStats().hits).toBeGreaterThanOrEqual(4);
  });

  it('downloads PDF payslip from PayrollPage using authenticated per-tab headers (no raw fetch)', async () => {
    const adapterCalls = [];
    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      adapterCalls.push({ path: cleanPath, responseType: config.responseType, headers: config.headers });

      if (cleanPath.includes('/pdf')) {
        return {
          data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (cleanPath.startsWith('/payroll/payslips')) {
        return {
          data: {
            success: true,
            data: {
              payslips: [
                {
                  _id: 'ps-101',
                  payslipNumber: 'PAY-2026-01',
                  month: 1,
                  year: 2026,
                  netPay: 75000,
                  grossPay: 85000,
                  totalDeductions: 10000,
                  paymentStatus: 'Paid',
                  employeeId: { firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP002' },
                },
              ],
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      return {
        data: { success: true, data: { runs: [] } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <PayrollPage />
        </MemoryRouter>
      </Provider>
    );

    const dlBtn = await screen.findByRole('button', { name: /PDF/i });
    fireEvent.click(dlBtn);

    await waitFor(() => {
      const pdfReq = adapterCalls.find((c) => c.path === '/payroll/payslips/ps-101/pdf');
      expect(pdfReq).toBeDefined();
      expect(pdfReq.responseType).toBe('blob');
      expect(pdfReq.headers.Authorization).toBe('Bearer token-tab-1');
      expect(pdfReq.headers['X-Tab-Id']).toBe('tab-test-1');
      expect(pdfReq.headers['X-Session-Id']).toBe('sess-tab-1');
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
