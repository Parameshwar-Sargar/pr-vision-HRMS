import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import queryCache from '../services/queryCache';
import api from '../services/api';
import authReducer from '../store/slices/authSlice';
import masterDataReducer from '../store/slices/masterDataSlice';
import PerformancePage from '../pages/performance/PerformancePage';
import TrainingPage from '../pages/training/TrainingPage';
import AssetsPage from '../pages/assets/AssetsPage';
import RecruitmentPage from '../pages/recruitment/RecruitmentPage';
import Sidebar from '../components/layout/Sidebar';

describe('Phase 6 Frontend E2E Workflow, Cache Sync & Role UI Integration', () => {
  let originalAdapter;

  const createTestStore = (role = 'HR_MANAGER', overrides = {}) =>
    configureStore({
      reducer: {
        auth: authReducer,
        masterData: masterDataReducer,
      },
      preloadedState: {
        auth: {
          user: {
            _id: 'u1',
            name: `${role} User`,
            email: `${role.toLowerCase()}@prvision.test`,
            role,
            employeeId: 'e1',
          },
          employee: { _id: 'e1', firstName: 'Amit', lastName: 'Patel' },
          company: { companyName: 'PR VISION INNOVATIONS', tagline: 'People. Process. Performance.' },
          tenant: { companyName: 'PR VISION INNOVATIONS' },
          token: 'token-tab-1',
          sessionId: 'sess-tab-1',
          tabId: 'tab-test-1',
          session: { sessionId: 'sess-tab-1' },
          isAuthenticated: true,
          isLoading: false,
          error: null,
          ...overrides,
        },
        masterData: {
          departments: [{ _id: 'd1', name: 'Engineering', code: 'ENG' }],
          designations: [{ _id: 'des1', title: 'SDE', departmentId: { _id: 'd1', name: 'Engineering' }, code: 'SDE' }],
          branches: [{ _id: 'b1', name: 'Bengaluru HQ', code: 'HQ-BLR', isHeadquarters: true }],
          shifts: [{ _id: 's1', name: 'General Shift', startTime: '09:00', endTime: '18:00' }],
          leaveTypes: [{ _id: 'lt1', name: 'Casual Leave', isPaid: true }],
          loading: false,
          isLoaded: true,
          lastFetchedAt: Date.now(),
          error: null,
        },
      },
    });

  beforeEach(() => {
    queryCache.clear();
    queryCache.resetStats();
    sessionStorage.clear();
    sessionStorage.setItem('pr_tab_id', 'tab-test-1');
    sessionStorage.setItem('pr_session_id', 'sess-tab-1');
    sessionStorage.setItem('pr_access_token', 'token-tab-1');
  });

  afterEach(() => {
    cleanup();
    if (originalAdapter) {
      api.defaults.adapter = originalAdapter;
      originalAdapter = null;
    }
    vi.restoreAllMocks();
  });

  it('keeps queryCache invalidation selective: unrelated shift mutation preserves dashboard/notifications while leave/payroll invalidates dashboard', async () => {
    let dashboardCalls = 0;
    let notificationsCalls = 0;
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();

      if (method === 'get' && cleanPath.startsWith('/dashboard')) {
        dashboardCalls += 1;
        return { data: { success: true, data: { ok: true } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/notifications')) {
        notificationsCalls += 1;
        return { data: { success: true, data: { notifications: [], unreadCount: 0 } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'post') {
        return { data: { success: true, data: {} }, status: 201, statusText: 'Created', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    await api.get('/dashboard/stats', { cacheTtl: 60000 });
    await api.get('/notifications', { cacheTtl: 60000 });
    expect(dashboardCalls).toBe(1);
    expect(notificationsCalls).toBe(1);

    // Cache hit before unrelated mutation
    await api.get('/dashboard/stats', { cacheTtl: 60000 });
    expect(dashboardCalls).toBe(1);

    // Unrelated shift mutation should NOT invalidate dashboard or notifications
    await api.post('/shifts', { name: 'Night Test', startTime: '21:00', endTime: '06:00' });
    await api.get('/dashboard/stats', { cacheTtl: 60000 });
    await api.get('/notifications', { cacheTtl: 60000 });
    expect(dashboardCalls).toBe(1);
    expect(notificationsCalls).toBe(1);

    // Leave mutation DOES invalidate dashboard, without unnecessarily invalidating notifications
    await api.post('/leaves/apply', { leaveTypeId: 'lt1' });
    await api.get('/dashboard/stats', { cacheTtl: 60000 });
    await api.get('/notifications', { cacheTtl: 60000 });
    expect(dashboardCalls).toBe(2);
    expect(notificationsCalls).toBe(1);
  });

  it('PerformancePage executes Manager Initiate -> Employee Self-Review -> Manager Final Evaluation flow', async () => {
    let reviewsState = [
      {
        _id: 'rev1',
        reviewCycle: 'Q4-2026',
        status: 'Self Review Pending',
        employeeId: { _id: 'e1', firstName: 'Amit', lastName: 'Patel', designationId: { title: 'SDE' } },
        goals: [{ title: 'Ship RBAC', weightage: 100, progress: 50, status: 'In Progress' }],
      },
    ];
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();

      if (method === 'get' && cleanPath.startsWith('/performance')) {
        return { data: { success: true, data: { reviews: reviewsState } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/employees')) {
        return { data: { success: true, data: { employees: [{ _id: 'e1', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP-001' }] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'patch' && cleanPath === '/performance/rev1/self-review') {
        const body = JSON.parse(config.data);
        reviewsState = reviewsState.map((r) =>
          r._id === 'rev1' ? { ...r, selfRating: body.selfRating, status: 'Manager Review Pending' } : r
        );
        return { data: { success: true, data: { review: reviewsState[0] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'patch' && cleanPath === '/performance/rev1/manager-review') {
        const body = JSON.parse(config.data);
        reviewsState = reviewsState.map((r) =>
          r._id === 'rev1' ? { ...r, managerRating: body.managerRating, finalScore: body.finalScore, status: 'Completed' } : r
        );
        return { data: { success: true, data: { review: reviewsState[0] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const hrStore = createTestStore('HR_MANAGER');
    render(
      <Provider store={hrStore}>
        <MemoryRouter>
          <PerformancePage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Q4-2026')).toBeTruthy();
    expect(screen.getByText('Self Review Pending')).toBeTruthy();

    // Submit Self-Review
    fireEvent.click(screen.getByText('Submit Self-Review'));
    const submitButtons = screen.getAllByText('Submit Self-Review');
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(await screen.findByText('Manager Review Pending')).toBeTruthy();

    // Manager Evaluation
    fireEvent.click(screen.getByText('Complete Evaluation'));
    fireEvent.click(screen.getByText('Finalize Evaluation'));

    expect(await screen.findByText('Completed')).toBeTruthy();
  });

  it('TrainingPage updates enrollment progress & score and reflects Completed status in UI', async () => {
    let assignmentsState = [
      {
        _id: 'ta1',
        programId: { _id: 'tp1', title: 'Security Training' },
        employeeId: { _id: 'e1', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP-001' },
        status: 'Enrolled',
        score: null,
      },
    ];
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();

      if (method === 'get' && cleanPath.startsWith('/training/programs')) {
        return {
          data: {
            success: true,
            data: {
              programs: [{ _id: 'tp1', title: 'Security Training', category: 'Compliance & POSH', mode: 'Online', trainerName: 'CISO', durationHours: 4, startDate: '2026-10-01', endDate: '2026-10-02', status: 'Scheduled', enrolledCount: 1 }],
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (method === 'get' && cleanPath.startsWith('/training/assignments')) {
        return { data: { success: true, data: { assignments: assignmentsState } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/employees')) {
        return { data: { success: true, data: { employees: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'patch' && cleanPath === '/training/assignments/ta1/progress') {
        const body = JSON.parse(config.data);
        assignmentsState = assignmentsState.map((a) =>
          a._id === 'ta1' ? { ...a, status: body.status, score: body.score } : a
        );
        return { data: { success: true, data: { assignment: assignmentsState[0] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const empStore = createTestStore('EMPLOYEE');
    render(
      <Provider store={empStore}>
        <MemoryRouter>
          <TrainingPage />
        </MemoryRouter>
      </Provider>
    );

    fireEvent.click(await screen.findByText(/My Enrollments/i));
    expect(await screen.findByText('Update Progress')).toBeTruthy();

    fireEvent.click(screen.getByText('Update Progress'));
    fireEvent.click(screen.getByText('Save Progress'));

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeTruthy();
      expect(screen.getByText('100%')).toBeTruthy();
    });
  });

  it('AssetsPage executes Assign -> Assigned and Return (Needs Maintenance) -> Under Repair transitions', async () => {
    let assetsState = [
      {
        _id: 'ast1',
        assetTag: 'PRV-MBP-01',
        name: 'MacBook Pro M3',
        category: 'Laptop',
        status: 'Available',
        condition: 'Good',
        currentAssignedTo: null,
      },
    ];
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();

      if (method === 'get' && cleanPath.startsWith('/assets')) {
        return { data: { success: true, data: { assets: assetsState } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/employees')) {
        return { data: { success: true, data: { employees: [{ _id: 'e1', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP-001' }] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'post' && cleanPath === '/assets/ast1/assign') {
        assetsState = assetsState.map((a) =>
          a._id === 'ast1' ? { ...a, status: 'Assigned', currentAssignedTo: { _id: 'e1', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP-001' } } : a
        );
        return { data: { success: true, data: { asset: assetsState[0] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'post' && cleanPath === '/assets/ast1/return') {
        const body = JSON.parse(config.data);
        assetsState = assetsState.map((a) =>
          a._id === 'ast1'
            ? { ...a, status: body.conditionAtReturn === 'Needs Maintenance' ? 'Under Repair' : 'Available', condition: body.conditionAtReturn, currentAssignedTo: null }
            : a
        );
        return { data: { success: true, data: { asset: assetsState[0] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const hrStore = createTestStore('HR_MANAGER');
    render(
      <Provider store={hrStore}>
        <MemoryRouter>
          <AssetsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Available')).toBeTruthy();
    fireEvent.click(screen.getByText('Assign'));
    expect(await screen.findByText(/Amit Patel \(EMP-001\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Confirm Allocation'));

    expect(await screen.findByText('Assigned')).toBeTruthy();

    fireEvent.click(screen.getByText('Return'));
    const condSelect = screen.getByDisplayValue('Good (Available)');
    fireEvent.change(condSelect, { target: { value: 'Needs Maintenance' } });
    fireEvent.click(screen.getByText('Confirm Return'));

    expect(await screen.findByText('Under Repair')).toBeTruthy();
  });

  it('RecruitmentPage converts an Offered candidate via modal into Onboarded Employee state', async () => {
    let candState = [
      {
        _id: 'cand1',
        fullName: 'Rohan Kulkarni',
        email: 'rohan@prvision.test',
        status: 'Offered',
        expectedCtc: 1800000,
        noticePeriodDays: 30,
        jobOpeningId: { _id: 'j1', title: 'SDE II', departmentId: { _id: 'd1', name: 'Engineering' } },
      },
    ];
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();

      if (method === 'get' && cleanPath.startsWith('/recruitment/jobs')) {
        return { data: { success: true, data: { jobs: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/recruitment/candidates')) {
        return { data: { success: true, data: { candidates: candState } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'post' && cleanPath === '/recruitment/candidates/cand1/convert') {
        candState = candState.map((c) =>
          c._id === 'cand1' ? { ...c, status: 'Hired', convertedToEmployeeId: { _id: 'empNew', employeeId: 'PRV-0010' } } : c
        );
        return { data: { success: true, data: { candidate: candState[0], employee: { _id: 'empNew', employeeId: 'PRV-0010' } } }, status: 201, statusText: 'Created', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const hrStore = createTestStore('HR_MANAGER');
    render(
      <Provider store={hrStore}>
        <MemoryRouter>
          <RecruitmentPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Convert')).toBeTruthy();
    fireEvent.click(screen.getByText('Convert'));
    fireEvent.click(screen.getByText('Confirm & Onboard'));

    expect(await screen.findByText('Onboarded (PRV-0010)')).toBeTruthy();
  });

  it('Sidebar enforces strict navigation isolation across all 7 roles (EMPLOYEE, MANAGER, RECRUITER, PAYROLL_ADMIN, HR_MANAGER, ADMIN, SUPER_ADMIN)', () => {
    const cases = [
      { role: 'EMPLOYEE', present: ['Dashboard', 'My Attendance', 'My Leaves', 'My Payslips', 'Security & Sessions'], absent: ['Employees', 'Departments', 'Recruitment', 'Reports'] },
      { role: 'MANAGER', present: ['Dashboard', 'Team Attendance', 'Team Leaves', 'Team Reports'], absent: ['Employees', 'Departments', 'Payroll', 'My Payslips', 'Recruitment'] },
      { role: 'RECRUITER', present: ['Dashboard', 'Recruitment', 'Security & Sessions'], absent: ['Employees', 'Departments', 'Payroll', 'Reports'] },
      { role: 'PAYROLL_ADMIN', present: ['Dashboard', 'Employees', 'Payroll', 'Reports'], absent: ['Departments', 'Recruitment'] },
      { role: 'HR_MANAGER', present: ['Dashboard', 'Employees', 'Departments', 'Payroll', 'Recruitment', 'Reports', 'Settings & Security'], absent: [] },
      { role: 'ADMIN', present: ['Dashboard', 'Employees', 'Departments', 'Payroll', 'Recruitment', 'Reports', 'Settings & Security'], absent: [] },
      { role: 'SUPER_ADMIN', present: ['Dashboard', 'Employees', 'Departments', 'Payroll', 'Recruitment', 'Reports', 'Settings & Security'], absent: [] },
    ];

    for (const c of cases) {
      cleanup();
      const store = createTestStore(c.role);
      render(
        <Provider store={store}>
          <MemoryRouter>
            <Sidebar isOpen={true} onClose={() => {}} />
          </MemoryRouter>
        </Provider>
      );
      for (const label of c.present) {
        expect(screen.getByText(label), `Expected "${label}" visible for ${c.role}`).toBeTruthy();
      }
      for (const label of c.absent) {
        expect(screen.queryByText(label), `Expected "${label}" hidden for ${c.role}`).toBeNull();
      }
    }
  });
});
