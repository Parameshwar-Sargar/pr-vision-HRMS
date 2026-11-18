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
import LeavesPage from '../pages/leaves/LeavesPage';
import PayrollPage from '../pages/payroll/PayrollPage';

describe('Phase 6.1 Frontend UI — Approved Leave Cancellation & Payroll Adjustment Queue', () => {
  let originalAdapter;

  const createStore = (role = 'EMPLOYEE', empId = 'empSelf') =>
    configureStore({
      reducer: {
        auth: authReducer,
        masterData: masterDataReducer,
      },
      preloadedState: {
        auth: {
          user: { _id: 'u1', name: `${role} User`, email: `${role.toLowerCase()}@prvision.test`, role, employeeId: empId },
          employee: { _id: empId, firstName: 'Amit', lastName: 'Patel' },
          company: { companyName: 'PR VISION INNOVATIONS' },
          token: 'tok-1',
          sessionId: 'sess-1',
          tabId: 'tab-1',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
        masterData: {
          departments: [],
          designations: [],
          branches: [],
          shifts: [],
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
    sessionStorage.setItem('pr_tab_id', 'tab-1');
    sessionStorage.setItem('pr_session_id', 'sess-1');
    sessionStorage.setItem('pr_access_token', 'tok-1');
  });

  afterEach(() => {
    cleanup();
    if (originalAdapter) {
      api.defaults.adapter = originalAdapter;
      originalAdapter = null;
    }
    vi.restoreAllMocks();
  });

  const sampleRequests = [
    {
      _id: 'lrApprovedSelf',
      employeeId: { _id: 'empSelf', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP-001' },
      leaveTypeId: { _id: 'lt1', name: 'Casual Leave', isPaid: true },
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      totalDays: 2,
      reason: 'Approved trip',
      status: 'Approved',
    },
    {
      _id: 'lrPendingSelf',
      employeeId: { _id: 'empSelf', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP-001' },
      leaveTypeId: { _id: 'lt1', name: 'Casual Leave', isPaid: true },
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      totalDays: 1,
      reason: 'Pending dentist visit',
      status: 'Pending',
    },
  ];

  const mockLeavesAdapter = (onCancel) => {
    let reqList = sampleRequests.map((r) => ({ ...r }));
    return async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();

      if (method === 'get' && cleanPath.startsWith('/leaves/balances')) {
        return { data: { success: true, data: { balances: [{ leaveTypeId: { name: 'Casual Leave' }, allocated: 12, used: 2, pending: 1, remaining: 9 }] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/leaves/types')) {
        return { data: { success: true, data: { leaveTypes: [{ _id: 'lt1', name: 'Casual Leave', isPaid: true }] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/leaves/requests')) {
        return { data: { success: true, data: { requests: reqList } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'post' && cleanPath.includes('/cancel')) {
        const body = config.data ? JSON.parse(config.data) : {};
        if (onCancel) onCancel(cleanPath, body);
        const targetId = cleanPath.split('/requests/')[1].split('/cancel')[0];
        reqList = reqList.map((r) =>
          r._id === targetId ? { ...r, status: 'Cancelled', cancellationReason: body.cancellationReason || '' } : r
        );
        const updated = reqList.find((r) => r._id === targetId);
        return {
          data: {
            success: true,
            data: {
              leaveRequest: updated,
              payrollImpact: { hasLockedPayroll: targetId === 'lrApprovedSelf' },
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };
  };

  it('prevents EMPLOYEE and MANAGER from seeing Cancel Approved button on Approved requests while preserving Pending Cancel', async () => {
    originalAdapter = api.defaults.adapter;
    api.defaults.adapter = mockLeavesAdapter();

    for (const role of ['EMPLOYEE', 'MANAGER']) {
      cleanup();
      render(
        <Provider store={createStore(role, 'empSelf')}>
          <MemoryRouter>
            <LeavesPage />
          </MemoryRouter>
        </Provider>
      );

      expect(await screen.findByText('Approved trip')).toBeTruthy();
      expect(screen.getByText('Pending dentist visit')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.queryByText('Cancel Approved')).toBeNull();
    }
  });

  it('allows HR_MANAGER to cancel an Approved leave via mandatory reason modal, displays reason, and invalidates leave/attendance/payroll caches', async () => {
    const cancelPayloads = [];
    originalAdapter = api.defaults.adapter;
    api.defaults.adapter = mockLeavesAdapter((url, body) => cancelPayloads.push({ url, body }));

    expect(queryCache.getAffectedTags('post', '/leaves/requests/lrApprovedSelf/cancel')).toEqual(
      expect.arrayContaining(['leaves', 'dashboard', 'attendance', 'reports', 'payroll'])
    );

    render(
      <Provider store={createStore('HR_MANAGER', 'empHR')}>
        <MemoryRouter>
          <LeavesPage />
        </MemoryRouter>
      </Provider>
    );

    const cancelApprovedBtn = await screen.findByText('Cancel Approved');
    fireEvent.click(cancelApprovedBtn);

    expect(await screen.findByText('Cancel Approved Leave Request')).toBeTruthy();
    const textarea = screen.getByPlaceholderText(/minimum 3 characters/i);

    // Too short reason blocked by form handler
    fireEvent.change(textarea, { target: { value: 'ab' } });
    fireEvent.click(screen.getByText('Confirm Cancellation'));
    expect(cancelPayloads).toHaveLength(0);

    // Valid mandatory reason submits cleanly
    fireEvent.change(textarea, { target: { value: 'Client schedule postponed by HR' } });
    fireEvent.click(screen.getByText('Confirm Cancellation'));

    await waitFor(() => {
      expect(cancelPayloads).toHaveLength(1);
      expect(cancelPayloads[0].body).toEqual({ cancellationReason: 'Client schedule postponed by HR' });
      expect(screen.getByText(/Cancelled: Client schedule postponed by HR/)).toBeTruthy();
    });
  });

  it('PayrollPage lazily loads Future Payroll Adjustments tab for HR/Payroll Admin and approves adjustment for next run', async () => {
    const callLog = [];
    let adjList = [
      {
        _id: 'adj1',
        employeeId: { firstName: 'Amit', lastName: 'Patel' },
        sourceMonth: 3,
        sourceYear: 2026,
        adjustmentType: 'CREDIT',
        days: 2,
        amount: 2000,
        reason: 'Locked LWP reversal',
        status: 'Pending',
      },
    ];
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();
      callLog.push(`${method.toUpperCase()} ${cleanPath}`);

      if (method === 'get' && cleanPath.startsWith('/payroll/runs')) {
        return { data: { success: true, data: { runs: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/payroll/payslips')) {
        return { data: { success: true, data: { payslips: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath.startsWith('/payroll/adjustments')) {
        return { data: { success: true, data: { adjustments: adjList } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'patch' && cleanPath === '/payroll/adjustments/adj1') {
        adjList = adjList.map((a) => (a._id === 'adj1' ? { ...a, status: 'Approved' } : a));
        return { data: { success: true, data: { adjustment: adjList[0] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    render(
      <Provider store={createStore('PAYROLL_ADMIN', 'empPay')}>
        <MemoryRouter>
          <PayrollPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(callLog.some((c) => c.includes('/payroll/runs'))).toBe(true);
    });
    // Zero extra mount call to /payroll/adjustments before tab click
    expect(callLog.some((c) => c.includes('/payroll/adjustments'))).toBe(false);

    fireEvent.click(screen.getByText('Future Payroll Adjustments'));
    expect(await screen.findByText('Locked LWP reversal')).toBeTruthy();

    fireEvent.click(screen.getByText('Approve for Next Run'));
    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeTruthy();
    });
  });
});
