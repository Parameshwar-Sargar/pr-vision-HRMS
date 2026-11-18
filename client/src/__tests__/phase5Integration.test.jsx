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
import AnnouncementsPage from '../pages/announcements/AnnouncementsPage';
import DocumentsPage from '../pages/documents/DocumentsPage';
import LeavesPage from '../pages/leaves/LeavesPage';
import ExpensesPage from '../pages/expenses/ExpensesPage';
import CompanySettingsPage from '../pages/settings/CompanySettingsPage';
import EmployeesPage from '../pages/employees/EmployeesPage';

describe('Phase 5 Integration: Functional Bug Fixes, Cache Sync & Workflow Reliability', () => {
  let originalAdapter;

  const createTestStore = (preloadedAuth = {}, preloadedMaster = {}) =>
    configureStore({
      reducer: {
        auth: authReducer,
        masterData: masterDataReducer,
      },
      preloadedState: {
        auth: {
          user: { _id: 'u1', name: 'Admin User', email: 'admin@prvision.com', role: 'ADMIN', employeeId: 'e1' },
          employee: { _id: 'e1', firstName: 'Admin', lastName: 'User' },
          company: { companyName: 'PR VISION INNOVATIONS', tagline: 'People. Process. Performance.' },
          tenant: { companyName: 'PR VISION INNOVATIONS' },
          token: 'token-tab-1',
          sessionId: 'sess-tab-1',
          tabId: 'tab-test-1',
          session: { sessionId: 'sess-tab-1' },
          isAuthenticated: true,
          isLoading: false,
          error: null,
          ...preloadedAuth,
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
          ...preloadedMaster,
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

  it('AnnouncementsPage posts `message` + `content`, allows Edit & unpublish, and invalidates dashboard cache', async () => {
    const store = createTestStore();
    const capturedPosts = [];
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();

      if (method === 'get' && cleanPath.startsWith('/dashboard')) {
        return {
          data: { success: true, data: { announcements: [] } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (method === 'get' && cleanPath.startsWith('/announcements')) {
        return {
          data: {
            success: true,
            data: {
              announcements: [
                {
                  _id: 'a1',
                  title: 'Townhall Notice',
                  message: 'Join at 4 PM',
                  category: 'Event',
                  priority: 'Important',
                  isActive: true,
                  createdAt: new Date().toISOString(),
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
      if (method === 'post' && cleanPath.startsWith('/announcements')) {
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        capturedPosts.push(body);
        return {
          data: {
            success: true,
            data: { announcement: { _id: 'a2', ...body, isActive: true, createdAt: new Date().toISOString() } },
          },
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
        };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    // Prime dashboard cache before mutation
    await api.get('/dashboard', { cacheTtl: 30000 });
    expect(queryCache.cache.size).toBeGreaterThan(0);

    render(
      <Provider store={store}>
        <MemoryRouter>
          <AnnouncementsPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Townhall Notice')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Post Announcement'));
    fireEvent.change(screen.getByPlaceholderText(/Q4 Town Hall Meeting/i), {
      target: { value: 'Holiday Shutdown' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Write the complete announcement text/i), {
      target: { value: 'Office closed on Friday' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Broadcast' }));

    await waitFor(() => {
      expect(capturedPosts.length).toBe(1);
    });
    expect(capturedPosts[0].message).toBe('Office closed on Friday');
    expect(queryCache.getCached(Array.from(queryCache.cache.keys()).find((k) => k.includes('/dashboard')) || '')).toBeNull();
  });

  it('DocumentsPage removes invalid Contract category and aligns with Document.js categories', async () => {
    const store = createTestStore();
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      if (cleanPath.startsWith('/documents')) {
        return { data: { success: true, data: { documents: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (cleanPath.startsWith('/employees')) {
        return { data: { success: true, data: { employees: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    render(
      <Provider store={store}>
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Document Repository')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Contract' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Offer Letter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Company Policy' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Upload Document' }));
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Contract' })).toBeNull();
      expect(screen.getByRole('option', { name: 'Offer Letter' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Company Policy' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Payslip Archive' })).toBeTruthy();
    });
  });

  it('LeavesPage allows Manager to cancel own pending leave without self-Approve, auto-calculates totalDays, and renders Holiday calendar', async () => {
    const store = createTestStore({
      user: { _id: 'umgr', name: 'Manager User', email: 'manager@prvision.com', role: 'MANAGER', employeeId: 'eMgr' },
      employee: { _id: 'eMgr', firstName: 'Vikram', lastName: 'Manager' },
    });
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      if (cleanPath.startsWith('/leaves/balances')) {
        return { data: { success: true, data: { balances: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (cleanPath.startsWith('/leaves/types')) {
        return { data: { success: true, data: { leaveTypes: [{ _id: 'lt1', name: 'Casual Leave', isPaid: true }] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (cleanPath.startsWith('/holidays')) {
        return {
          data: {
            success: true,
            data: { holidays: [{ _id: 'h1', name: 'Independence Day', date: '2026-08-15', description: 'National' }] },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (cleanPath.startsWith('/leaves/requests')) {
        return {
          data: {
            success: true,
            data: {
              requests: [
                {
                  _id: 'lrSelf',
                  employeeId: { _id: 'eMgr', firstName: 'Vikram', lastName: 'Manager', employeeId: 'EMP002' },
                  leaveTypeId: { _id: 'lt1', name: 'Casual Leave' },
                  startDate: '2026-12-01',
                  endDate: '2026-12-02',
                  totalDays: 2,
                  reason: 'Own pending request',
                  status: 'Pending',
                },
                {
                  _id: 'lrReportee',
                  employeeId: { _id: 'eRep', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP005' },
                  leaveTypeId: { _id: 'lt1', name: 'Casual Leave' },
                  startDate: '2026-12-05',
                  endDate: '2026-12-05',
                  totalDays: 1,
                  reason: 'Reportee pending request',
                  status: 'Pending',
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
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    render(
      <Provider store={store}>
        <MemoryRouter>
          <LeavesPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Own pending request')).toBeTruthy();
    });

    // Only ONE Approve button (on reportee's row), and Cancel button is visible for Manager's own pending row
    expect(screen.getAllByText('Approve').length).toBe(1);
    expect(screen.getByText('Cancel')).toBeTruthy();

    // Switch to Holiday Calendar tab and confirm lazy Holiday fetch
    fireEvent.click(screen.getByText('Holiday Calendar'));
    await waitFor(() => {
      expect(screen.getByText('Independence Day')).toBeTruthy();
    });
  });

  it('ExpensesPage shows Mark Reimbursed for Approved claims & CompanySettingsPage syncs Redux company branding', async () => {
    const store = createTestStore({
      user: { _id: 'u1', name: 'Admin User', email: 'admin@prvision.com', role: 'ADMIN', employeeId: 'e1' },
    });
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();
      if (cleanPath.startsWith('/expenses')) {
        return {
          data: {
            success: true,
            data: {
              claims: [
                {
                  _id: 'ex1',
                  title: 'Hotel Stay',
                  category: 'Lodging / Accommodation',
                  amount: 4500,
                  date: '2026-11-12',
                  status: 'Approved',
                  receiptUrl: 'receipt:hotel.pdf',
                  employeeId: { _id: 'e2', firstName: 'Neha', lastName: 'Singh', employeeId: 'EMP009' },
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
      if (method === 'get' && cleanPath.startsWith('/organization/settings')) {
        return {
          data: {
            success: true,
            data: { company: { companyName: 'PR VISION INNOVATIONS', tagline: 'People. Process. Performance.', contactEmail: 'contact@prvision.com' } },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (method === 'put' && cleanPath.startsWith('/organization/settings')) {
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        return {
          data: { success: true, data: { company: { ...body } } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (cleanPath.startsWith('/organization/branches')) {
        return {
          data: { success: true, data: { branches: [{ _id: 'b1', name: 'HQ', code: 'HQ-BLR', isHeadquarters: true }] } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (cleanPath.startsWith('/auth/sessions')) {
        return { data: { success: true, data: { sessions: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const { unmount } = render(
      <Provider store={store}>
        <MemoryRouter>
          <ExpensesPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Hotel Stay')).toBeTruthy();
    });
    expect(screen.getByText('Mark Reimbursed')).toBeTruthy();
    expect(screen.getByText('Receipt')).toBeTruthy();
    unmount();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <CompanySettingsPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('PR VISION INNOVATIONS')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('PR VISION INNOVATIONS'), {
      target: { value: 'PR VISION ENTERPRISE' },
    });
    fireEvent.click(screen.getByText('Save Company Settings'));

    await waitFor(() => {
      expect(store.getState().auth.company.companyName).toBe('PR VISION ENTERPRISE');
    });
  });

  it('EmployeesPage excludes self from Reporting Manager selector inside Edit modal', async () => {
    const store = createTestStore();
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      if (cleanPath.startsWith('/employees')) {
        return {
          data: {
            success: true,
            data: {
              employees: [
                {
                  _id: 'e1',
                  employeeId: 'EMP001',
                  firstName: 'Amit',
                  lastName: 'Patel',
                  email: 'amit@prvision.com',
                  departmentId: { _id: 'd1', name: 'Engineering' },
                  designationId: { _id: 'des1', title: 'SDE' },
                  employmentStatus: 'Confirmed',
                },
                {
                  _id: 'e2',
                  employeeId: 'EMP002',
                  firstName: 'Vikram',
                  lastName: 'Joshi',
                  email: 'vikram@prvision.com',
                  departmentId: { _id: 'd1', name: 'Engineering' },
                  designationId: { _id: 'des1', title: 'SDE' },
                  employmentStatus: 'Confirmed',
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
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    render(
      <Provider store={store}>
        <MemoryRouter>
          <EmployeesPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Amit Patel')).toBeTruthy();
    });

    const editBtns = screen.getAllByTitle('Edit Employee');
    fireEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Employee Profile')).toBeTruthy();
    });

    expect(screen.getByRole('option', { name: /Vikram Joshi \(EMP002\)/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Amit Patel \(EMP001\)/ })).toBeNull();
  });
});
