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
import TrainingPage from '../pages/training/TrainingPage';
import PerformancePage from '../pages/performance/PerformancePage';
import AssetsPage from '../pages/assets/AssetsPage';
import DocumentsPage from '../pages/documents/DocumentsPage';
import ShiftsPage from '../pages/shifts/ShiftsPage';
import ReportsPage from '../pages/reports/ReportsPage';

const createRoleStore = (role = 'MANAGER') =>
  configureStore({
    reducer: {
      auth: authReducer,
      masterData: masterDataReducer,
    },
    preloadedState: {
      auth: {
        user: {
          _id: 'u-mgr',
          name: 'Vikram Manager',
          email: 'mgr@prvision.test',
          role,
          employeeId: 'e-mgr',
        },
        employee: { _id: 'e-mgr', employeeId: 'PRV-2001', firstName: 'Vikram', lastName: 'Manager' },
        company: { companyName: 'PR VISION INNOVATIONS' },
        tenant: { companyName: 'PR VISION INNOVATIONS' },
        token: 'token-batch-d',
        sessionId: 'sess-batch-d',
        tabId: 'tab-batch-d',
        session: { sessionId: 'sess-batch-d' },
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
      masterData: {
        departments: [{ _id: 'd1', name: 'Engineering', code: 'ENG' }],
        designations: [{ _id: 'des1', title: 'SDE', departmentId: { _id: 'd1', name: 'Engineering' }, code: 'SDE' }],
        branches: [{ _id: 'b1', name: 'Bengaluru HQ', code: 'BLR-HQ', isHeadquarters: true }],
        shifts: [{ _id: 's1', name: 'General Shift', startTime: '09:00', endTime: '18:00' }],
        leaveTypes: [{ _id: 'lt1', name: 'Casual Leave', isPaid: true }],
        loading: false,
        isLoaded: true,
        lastFetchedAt: Date.now(),
        error: null,
      },
    },
  });

describe('Phase 8 Batch D Frontend — Manager Training Self-Enrollment & Strict Option Scope Isolation', () => {
  let originalAdapter;

  beforeEach(() => {
    queryCache.clear();
    queryCache.resetStats();
    sessionStorage.clear();
    sessionStorage.setItem('pr_tab_id', 'tab-batch-d');
    sessionStorage.setItem('pr_session_id', 'sess-batch-d');
    sessionStorage.setItem('pr_access_token', 'token-batch-d');
  });

  afterEach(() => {
    cleanup();
    if (originalAdapter) {
      api.defaults.adapter = originalAdapter;
      originalAdapter = null;
    }
    vi.restoreAllMocks();
  });

  it('TrainingPage passes includeSelf=true on /employees/options so MANAGER can select and enroll both self and direct reports', async () => {
    const calls = [];
    let assignPayload = null;
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      calls.push({ method: (config.method || 'get').toUpperCase(), path: cleanPath, params: config.params || {} });

      if (cleanPath === '/training/programs') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              programs: [
                {
                  _id: 'prog-d1',
                  title: 'Leadership & Architecture Bootcamp',
                  category: 'Leadership',
                  trainerName: 'CTO Office',
                  mode: 'Online',
                  status: 'Upcoming',
                  durationHours: 12,
                  startDate: '2026-09-01T00:00:00.000Z',
                  endDate: '2026-09-03T00:00:00.000Z',
                  enrolledCount: 0,
                  completedCount: 0,
                },
              ],
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }

      if (cleanPath === '/training/assignments') {
        return Promise.resolve({
          data: { success: true, data: { assignments: [] } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }

      if (cleanPath === '/employees/options') {
        const list =
          config.params?.includeSelf === 'true'
            ? [
                { _id: 'e-mgr', employeeId: 'PRV-2001', firstName: 'Vikram', lastName: 'Manager', email: 'mgr@prvision.test' },
                { _id: 'e-rep1', employeeId: 'PRV-2002', firstName: 'Aarav', lastName: 'Report', email: 'rep1@prvision.test' },
              ]
            : [
                { _id: 'e-rep1', employeeId: 'PRV-2002', firstName: 'Aarav', lastName: 'Report', email: 'rep1@prvision.test' },
              ];
        return Promise.resolve({
          data: {
            success: true,
            data: {
              employees: list,
              pagination: { total: list.length, page: 1, pages: 1, limit: 20 },
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }

      if (cleanPath === '/training/programs/prog-d1/assign' && config.method === 'post') {
        assignPayload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        return Promise.resolve({
          data: {
            success: true,
            message: 'Successfully enrolled 2 employees into training.',
            data: { assignments: [{ _id: 'ta-1' }, { _id: 'ta-2' }] },
          },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        });
      }

      return Promise.resolve({ data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config });
    };

    const store = createRoleStore('MANAGER');
    render(
      <Provider store={store}>
        <MemoryRouter>
          <TrainingPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Leadership & Architecture Bootcamp')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));

    // Verify both Manager self and Direct Report appear and includeSelf='true' was sent
    expect(await screen.findByText('Vikram Manager')).toBeTruthy();
    expect(screen.getByText('Aarav Report')).toBeTruthy();

    const optCall = calls.find((c) => c.path === '/employees/options');
    expect(optCall).toBeTruthy();
    expect(optCall.params.includeSelf).toBe('true');

    // Select both self and direct report and submit
    fireEvent.click(screen.getByLabelText(/Vikram Manager/i));
    fireEvent.click(screen.getByLabelText(/Aarav Report/i));
    expect(screen.getByText('Enroll Selected (2)')).toBeTruthy();

    fireEvent.click(screen.getByText('Enroll Selected (2)'));
    await waitFor(() => {
      expect(assignPayload).toEqual({ employeeIds: ['e-mgr', 'e-rep1'] });
    });
  });

  it('PerformancePage, AssetsPage, and DocumentsPage DO NOT pass includeSelf=true on /employees/options', async () => {
    const optionCalls = [];
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      if (cleanPath === '/employees/options') {
        optionCalls.push({ params: { ...(config.params || {}) } });
        return Promise.resolve({
          data: {
            success: true,
            data: {
              employees: [
                { _id: 'e-rep1', employeeId: 'PRV-2002', firstName: 'Aarav', lastName: 'Report', email: 'rep1@prvision.test' },
              ],
              pagination: { total: 1, page: 1, pages: 1, limit: 20 },
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }
      if (cleanPath === '/assets') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              assets: [{ _id: 'a1', assetTag: 'PRV-LAP-1', name: 'ThinkPad', category: 'Laptop', status: 'Available' }],
              pagination: { total: 1, page: 1, pages: 1, limit: 20 },
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }
      return Promise.resolve({
        data: { success: true, data: { reviews: [], documents: [], pagination: { total: 0, page: 1, pages: 1, limit: 20 } } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    // 1. PerformancePage as MANAGER
    const mgrStore = createRoleStore('MANAGER');
    const { unmount: unmountPerf } = render(
      <Provider store={mgrStore}>
        <MemoryRouter>
          <PerformancePage />
        </MemoryRouter>
      </Provider>
    );
    const initiateBtn = await screen.findByRole('button', { name: /Initiate Review Cycle/i });
    fireEvent.click(initiateBtn);
    expect(await screen.findByText(/Aarav Report/i)).toBeTruthy();
    expect(optionCalls).toHaveLength(1);
    expect(optionCalls[0].params.includeSelf).toBeUndefined();
    unmountPerf();
    queryCache.clear();

    // 2. AssetsPage as HR_MANAGER
    const hrStore = createRoleStore('HR_MANAGER');
    const { unmount: unmountAssets } = render(
      <Provider store={hrStore}>
        <MemoryRouter>
          <AssetsPage />
        </MemoryRouter>
      </Provider>
    );
    const assignBtn = await screen.findByRole('button', { name: 'Assign' });
    fireEvent.click(assignBtn);
    expect(await screen.findByText(/Aarav Report/i)).toBeTruthy();
    expect(optionCalls).toHaveLength(2);
    expect(optionCalls[1].params.includeSelf).toBeUndefined();
    unmountAssets();
    queryCache.clear();

    // 3. DocumentsPage as HR_MANAGER
    const { unmount: unmountDocs } = render(
      <Provider store={hrStore}>
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      </Provider>
    );
    const uploadBtn = await screen.findByRole('button', { name: /Upload Document/i });
    fireEvent.click(uploadBtn);
    expect(await screen.findByText(/Aarav Report/i)).toBeTruthy();
    expect(optionCalls).toHaveLength(3);
    expect(optionCalls[2].params.includeSelf).toBeUndefined();
    unmountDocs();
  });

  it('ShiftsPage hides management controls for EMPLOYEE and ReportsPage hides Payroll report tab for MANAGER', async () => {
    originalAdapter = api.defaults.adapter;
    api.defaults.adapter = (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      if (cleanPath === '/shifts') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              shifts: [
                {
                  _id: 's1',
                  name: 'General Shift',
                  startTime: '09:00',
                  endTime: '18:00',
                  gracePeriodMinutes: 15,
                  breakDurationMinutes: 60,
                  weeklyOffDays: [0, 6],
                  isDefault: true,
                },
              ],
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }
      return Promise.resolve({
        data: { success: true, data: { employees: [], attendance: [], payslips: [] } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    // 1. ShiftsPage as EMPLOYEE -> no Add Shift / Edit / Archive controls
    const empStore = createRoleStore('EMPLOYEE');
    const { unmount: unmountEmpShift } = render(
      <Provider store={empStore}>
        <MemoryRouter>
          <ShiftsPage />
        </MemoryRouter>
      </Provider>
    );
    expect(await screen.findByText('General Shift')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add Shift/i })).toBeNull();
    expect(screen.queryByTitle('Edit Shift')).toBeNull();
    expect(screen.queryByTitle('Archive Shift')).toBeNull();
    unmountEmpShift();

    // 2. ReportsPage as MANAGER -> Employees & Attendance tabs visible, Payroll tab hidden
    const mgrStore = createRoleStore('MANAGER');
    const { unmount: unmountMgrRep } = render(
      <Provider store={mgrStore}>
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      </Provider>
    );
    expect(await screen.findByRole('button', { name: /^Employees$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Attendance$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Payroll$/i })).toBeNull();
    unmountMgrRep();
  });
});
