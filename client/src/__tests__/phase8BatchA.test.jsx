import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import queryCache from '../services/queryCache';
import api from '../services/api';
import authReducer from '../store/slices/authSlice';
import masterDataReducer from '../store/slices/masterDataSlice';
import AttendancePage from '../pages/attendance/AttendancePage';
import DashboardPage from '../pages/dashboard/DashboardPage';

describe('Phase 8 Batch A Frontend — Attendance Clock Isolation & Lazy Recharts', () => {
  let originalAdapter;
  let originalResizeObserver;

  const createStore = (role = 'EMPLOYEE') =>
    configureStore({
      reducer: {
        auth: authReducer,
        masterData: masterDataReducer,
      },
      preloadedState: {
        auth: {
          user: { _id: 'u1', name: `${role} User`, email: `${role.toLowerCase()}@prvision.com`, role },
          employee: { _id: 'emp1', firstName: 'Amit', lastName: 'Patel' },
          company: { companyName: 'PR VISION INNOVATIONS' },
          token: 'tok-p8a',
          refreshToken: 'ref-p8a',
          sessionId: 'sess-p8a',
          tabId: 'tab-p8a',
          session: { sessionId: 'sess-p8a' },
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

  beforeEach(() => {
    originalAdapter = api.defaults.adapter;
    originalResizeObserver = globalThis.ResizeObserver;
    queryCache.clear();
    queryCache.resetStats();
    sessionStorage.clear();
    sessionStorage.setItem('pr_tab_id', 'tab-p8a');
    sessionStorage.setItem('pr_session_id', 'sess-p8a');
    sessionStorage.setItem('pr_access_token', 'tok-p8a');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
    api.defaults.adapter = originalAdapter;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('isolates 1-second clock ticks in AttendancePage so table rows do not re-render every second and interval clears on unmount', async () => {
    vi.useFakeTimers();
    const dateSpy = vi.spyOn(Date.prototype, 'toLocaleDateString');
    const timeSpy = vi.spyOn(Date.prototype, 'toLocaleTimeString');

    const records = Array.from({ length: 5 }, (_, idx) => ({
      _id: `att-${idx}`,
      date: '2026-11-16T00:00:00.000Z',
      checkInTime: '2026-11-16T03:30:00.000Z',
      checkOutTime: '2026-11-16T12:30:00.000Z',
      totalHours: 9,
      overtimeHours: 1,
      status: 'Present',
      employeeId: { _id: `emp-${idx}`, firstName: `Member${idx}`, lastName: 'Test', employeeId: `PRV-00${idx}` },
    }));

    api.defaults.adapter = async (config) => ({
      data: { success: true, data: { attendance: records } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    const { unmount } = render(
      <Provider store={createStore('ADMIN')}>
        <MemoryRouter>
          <AttendancePage />
        </MemoryRouter>
      </Provider>
    );

    // Flush initial async fetch inside act under fake timers
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Member0 Test')).toBeInTheDocument();

    const dateCallsBeforeTicks = dateSpy.mock.calls.length;
    const timeCallsBeforeTicks = timeSpy.mock.calls.length;

    // Advance 10 full seconds -> clock component ticks 10 times; table rows must NOT re-render
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(timeSpy.mock.calls.length - timeCallsBeforeTicks).toBeGreaterThanOrEqual(10);
    expect(dateSpy.mock.calls.length - dateCallsBeforeTicks).toBe(0);

    // Verify clearInterval stops updates cleanly upon unmount
    const timeCallsAtUnmount = timeSpy.mock.calls.length;
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(timeSpy.mock.calls.length - timeCallsAtUnmount).toBe(0);
  });

  it('does not load or render Recharts on EMPLOYEE dashboard and lazily renders AttendanceTrendChart for ADMIN with trend data', async () => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    // 1. EMPLOYEE ESS view -> renders KPIs without chart widget
    api.defaults.adapter = async (config) => ({
      data: {
        success: true,
        data: {
          role: 'EMPLOYEE',
          kpi: { checkedIn: false, statusToday: 'Not Checked In', monthlyPresentDays: 14, pendingLeaves: 1 },
          upcomingHolidays: [],
          announcements: [],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    const empView = render(
      <Provider store={createStore('EMPLOYEE')}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText(/Monthly Present Days/i)).toBeInTheDocument();
    expect(screen.queryByText(/7-Day Attendance Trends/i)).not.toBeInTheDocument();
    expect(document.querySelector('.recharts-responsive-container')).toBeNull();
    empView.unmount();
    queryCache.clear();

    // 2. ADMIN view with empty trends -> skips lazy chart mount
    api.defaults.adapter = async (config) => ({
      data: {
        success: true,
        data: {
          role: 'ADMIN',
          kpi: { totalEmployees: 20, activeEmployees: 20, presentToday: 18, attendancePercentage: 90, pendingLeaves: 2, pendingExpenses: 1 },
          attendanceTrends: [],
          departmentDistribution: [{ name: 'Engineering', count: 20 }],
          upcomingHolidays: [],
          upcomingBirthdays: [],
          announcements: [],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    const emptyAdminView = render(
      <Provider store={createStore('ADMIN')}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText(/No attendance records for the last 7 days\./i)).toBeInTheDocument();
    expect(document.querySelector('.recharts-responsive-container')).toBeNull();
    emptyAdminView.unmount();
    queryCache.clear();

    // 3. ADMIN view with trend data -> resolves React.lazy(AttendanceTrendChart) inside Suspense cleanly
    api.defaults.adapter = async (config) => ({
      data: {
        success: true,
        data: {
          role: 'ADMIN',
          kpi: { totalEmployees: 20, activeEmployees: 20, presentToday: 18, attendancePercentage: 90, pendingLeaves: 2, pendingExpenses: 1 },
          attendanceTrends: [{ _id: '2026-11-16', present: 18, late: 2 }],
          departmentDistribution: [{ name: 'Engineering', count: 20 }],
          upcomingHolidays: [],
          upcomingBirthdays: [],
          announcements: [],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    render(
      <Provider store={createStore('ADMIN')}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText(/7-Day Attendance Trends/i)).toBeInTheDocument();
    await waitFor(
      () => {
        expect(document.querySelector('.recharts-responsive-container')).not.toBeNull();
      },
      { timeout: 10000 }
    );
  }, 15000);
});
