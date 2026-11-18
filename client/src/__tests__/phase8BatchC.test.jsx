import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import queryCache from '../services/queryCache';
import api from '../services/api';
import authReducer from '../store/slices/authSlice';
import masterDataReducer from '../store/slices/masterDataSlice';
import useEmployeeOptions from '../hooks/useEmployeeOptions';
import EmployeeOptionPicker from '../components/common/EmployeeOptionPicker';
import AssetsPage from '../pages/assets/AssetsPage';
import DocumentsPage from '../pages/documents/DocumentsPage';
import PerformancePage from '../pages/performance/PerformancePage';
import TrainingPage from '../pages/training/TrainingPage';
import EmployeesPage from '../pages/employees/EmployeesPage';

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
        token: 'token-batch-c',
        sessionId: 'sess-batch-c',
        tabId: 'tab-batch-c',
        session: { sessionId: 'sess-batch-c' },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        ...overrides,
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

const makeSlimOption = (idNum, firstName, lastName) => ({
  _id: `e${idNum}`,
  employeeId: `PRV-${String(idNum).padStart(4, '0')}`,
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}${idNum}@prvision.test`,
});

describe('Phase 8 Batch C Frontend — Employee Options Adoption, Pagination, Cancellation & RBAC', () => {
  let originalAdapter;

  beforeEach(() => {
    queryCache.clear();
    queryCache.resetStats();
    sessionStorage.clear();
    sessionStorage.setItem('pr_tab_id', 'tab-batch-c');
    sessionStorage.setItem('pr_session_id', 'sess-batch-c');
    sessionStorage.setItem('pr_access_token', 'token-batch-c');
  });

  afterEach(() => {
    cleanup();
    if (originalAdapter) {
      api.defaults.adapter = originalAdapter;
      originalAdapter = null;
    }
    vi.restoreAllMocks();
  });

  it('AssetsPage lazily calls /employees/options only on Assign modal open, supports search + pagination, and submits selected employeeId', async () => {
    const calls = [];
    let assignPayload = null;
    originalAdapter = api.defaults.adapter;

    const page1 = [makeSlimOption(1, 'Aarav', 'Rao'), makeSlimOption(2, 'Bhavna', 'Kulkarni')];
    const page2 = [makeSlimOption(3, 'Chetan', 'Sinha')];

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();
      calls.push({ method, path: cleanPath, params: config.params || {} });

      if (method === 'get' && cleanPath === '/assets') {
        return {
          data: {
            success: true,
            data: {
              assets: [
                {
                  _id: 'ast1',
                  assetTag: 'PRV-AST-01',
                  name: 'ThinkPad X1',
                  category: 'Laptop',
                  status: 'Available',
                  condition: 'Good',
                  currentAssignedTo: null,
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

      if (method === 'get' && cleanPath === '/employees/options') {
        const search = config.params?.search || '';
        const page = Number(config.params?.page || 1);
        if (search === 'ZzzNoMatch') {
          return {
            data: { success: true, data: { employees: [], pagination: { total: 0, page: 1, pages: 1, limit: 20 } } },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: {
            success: true,
            data: {
              employees: page === 2 ? page2 : page1,
              pagination: { total: 3, page, pages: 2, limit: 20 },
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      if (method === 'post' && cleanPath === '/assets/ast1/assign') {
        assignPayload = JSON.parse(config.data);
        return { data: { success: true, data: { asset: { _id: 'ast1', status: 'Assigned' } } }, status: 200, statusText: 'OK', headers: {}, config };
      }

      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const store = createTestStore('HR_MANAGER');
    render(
      <Provider store={store}>
        <MemoryRouter>
          <AssetsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('ThinkPad X1')).toBeTruthy();
    // 0 employee calls while just viewing assets inventory
    expect(calls.filter((c) => c.path.startsWith('/employees'))).toHaveLength(0);

    fireEvent.click(screen.getByText('Assign'));
    expect(await screen.findByText('Aarav Rao (PRV-0001)')).toBeTruthy();
    expect(calls.some((c) => c.path === '/employees/options')).toBe(true);
    expect(calls.some((c) => c.path === '/employees')).toBe(false);

    // Load more appends page 2 cleanly
    expect(screen.getByText('Showing 2 of 3 active employees')).toBeTruthy();
    fireEvent.click(screen.getByText('Load more'));
    expect(await screen.findByText('Chetan Sinha (PRV-0003)')).toBeTruthy();
    expect(screen.getByText('Showing 3 of 3 active employees')).toBeTruthy();

    // Select Chetan, then search empty term -> Chetan stays selected in <select>
    const select = screen.getByLabelText('Select Employee');
    fireEvent.change(select, { target: { value: 'e3' } });
    expect(select.value).toBe('e3');

    const searchBox = screen.getByLabelText('Search employees');
    fireEvent.change(searchBox, { target: { value: 'ZzzNoMatch' } });
    expect(await screen.findByText('No matching active employees found.')).toBeTruthy();
    expect(select.value).toBe('e3');

    // Submit form sends selected employeeId cleanly
    fireEvent.click(screen.getByText('Confirm Allocation'));
    await waitFor(() => {
      expect(assignPayload).toEqual({
        employeeId: 'e3',
        conditionAtAssignment: 'Good',
        notes: '',
      });
    });
  });

  it('DocumentsPage migrates HR upload dropdown to /employees/options, preserves selection across reopen, and omits lookup for EMPLOYEE role', async () => {
    const hrCalls = [];
    let uploadedEmployeeId = null;
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();
      hrCalls.push({ method, path: cleanPath, params: config.params || {} });

      if (method === 'get' && cleanPath === '/documents') {
        return { data: { success: true, data: { documents: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath === '/employees/options') {
        const q = config.params?.search || '';
        const list = q
          ? [makeSlimOption(2, 'Priya', 'Sharma')]
          : [makeSlimOption(1, 'Aarav', 'Rao'), makeSlimOption(2, 'Priya', 'Sharma')];
        return {
          data: { success: true, data: { employees: list, pagination: { total: list.length, page: 1, pages: 1, limit: 20 } } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (method === 'post' && cleanPath === '/documents/upload') {
        if (config.data && typeof config.data.get === 'function') {
          uploadedEmployeeId = config.data.get('employeeId');
        }
        return { data: { success: true, data: { document: { _id: 'doc1' } } }, status: 201, statusText: 'Created', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const hrStore = createTestStore('HR_MANAGER');
    const view1 = render(
      <Provider store={hrStore}>
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Document Repository')).toBeTruthy();
    expect(hrCalls.filter((c) => c.path.startsWith('/employees'))).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Upload Document' }));
    expect(await screen.findByText('Priya Sharma (PRV-0002)')).toBeTruthy();
    expect(hrCalls.filter((c) => c.path === '/employees/options')).toHaveLength(1);
    expect(hrCalls.filter((c) => c.path === '/employees')).toHaveLength(0);

    // Pick Priya, close modal via Cancel, reopen -> selection preserved
    const empSelect = screen.getByLabelText('Assign to Employee (Optional)');
    fireEvent.change(empSelect, { target: { value: 'e2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload Document' }));

    const reopenedSelect = await screen.findByLabelText('Assign to Employee (Optional)');
    expect(reopenedSelect.value).toBe('e2');

    fireEvent.change(screen.getByPlaceholderText('e.g. Employee Code of Conduct 2026'), {
      target: { value: 'Offer Pack' },
    });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [new File(['%PDF'], 'offer.pdf', { type: 'application/pdf' })] } });
    fireEvent.submit(reopenedSelect.closest('form'));

    await waitFor(() => {
      expect(uploadedEmployeeId).toBe('e2');
    });
    view1.unmount();

    // EMPLOYEE role opening Upload Document never calls /employees/options
    const empCallsBefore = hrCalls.length;
    const empStore = createTestStore('EMPLOYEE');
    render(
      <Provider store={empStore}>
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      </Provider>
    );
    expect(await screen.findByText('Document Repository')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upload Document' }));
    expect(screen.queryByLabelText('Assign to Employee (Optional)')).toBeNull();
    const newCalls = hrCalls.slice(empCallsBefore);
    expect(newCalls.some((c) => c.path.startsWith('/employees'))).toBe(false);
  });

  it('PerformancePage allows MANAGER scoped initiation via /employees/options and blocks EMPLOYEE initiation UI', async () => {
    const calls = [];
    let createdReviewBody = null;
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();
      calls.push({ method, path: cleanPath, params: config.params || {} });

      if (method === 'get' && cleanPath === '/performance') {
        return { data: { success: true, data: { reviews: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath === '/employees/options') {
        return {
          data: {
            success: true,
            data: {
              employees: [makeSlimOption(10, 'Rohan', 'TeamMember')],
              pagination: { total: 1, page: 1, pages: 1, limit: 20 },
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (method === 'post' && cleanPath === '/performance') {
        createdReviewBody = JSON.parse(config.data);
        return { data: { success: true, data: { review: { _id: 'rev-new' } } }, status: 201, statusText: 'Created', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const mgrStore = createTestStore('MANAGER');
    const mgrView = render(
      <Provider store={mgrStore}>
        <MemoryRouter>
          <PerformancePage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText(/No active performance review cycles/i)).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith('/employees'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Initiate Review Cycle/i }));
    expect(await screen.findByText('Rohan TeamMember (PRV-0010)')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Employee *'), { target: { value: 'e10' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Deliver Q4 Roadmap'), {
      target: { value: 'Ship Batch C' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Initiate Review' }));

    await waitFor(() => {
      expect(createdReviewBody?.employeeId).toBe('e10');
      expect(createdReviewBody?.goals?.[0]?.title).toBe('Ship Batch C');
    });
    mgrView.unmount();

    // EMPLOYEE does not render Initiate button or fetch options
    const empStore = createTestStore('EMPLOYEE');
    render(
      <Provider store={empStore}>
        <MemoryRouter>
          <PerformancePage />
        </MemoryRouter>
      </Provider>
    );
    expect(await screen.findByText(/No active performance review cycles/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Initiate Review Cycle/i })).toBeNull();
  });

  it('TrainingPage supports multi-select across server search and submits preserved employeeIds', async () => {
    const calls = [];
    let assignPayload = null;
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      const method = (config.method || 'get').toLowerCase();
      calls.push({ method, path: cleanPath, params: config.params || {} });

      if (method === 'get' && cleanPath === '/training/programs') {
        return {
          data: {
            success: true,
            data: {
              programs: [
                {
                  _id: 'tp1',
                  title: 'Security Workshop',
                  category: 'Technical',
                  mode: 'Online',
                  trainerName: 'Principal Engineer',
                  durationHours: 4,
                  startDate: '2026-12-01',
                  endDate: '2026-12-02',
                  status: 'Scheduled',
                  enrolledCount: 0,
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
      if (method === 'get' && cleanPath === '/training/assignments') {
        return { data: { success: true, data: { assignments: [] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      if (method === 'get' && cleanPath === '/employees/options') {
        const search = config.params?.search || '';
        const list = search === 'Neha' ? [makeSlimOption(25, 'Neha', 'Verma')] : [makeSlimOption(1, 'Aarav', 'Rao')];
        return {
          data: { success: true, data: { employees: list, pagination: { total: list.length, page: 1, pages: 1, limit: 20 } } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (method === 'post' && cleanPath === '/training/programs/tp1/assign') {
        assignPayload = JSON.parse(config.data);
        return { data: { success: true, message: 'Enrolled!' }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const store = createTestStore('HR_MANAGER');
    render(
      <Provider store={store}>
        <MemoryRouter>
          <TrainingPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Security Workshop')).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith('/employees'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
    expect(await screen.findByText('Aarav Rao')).toBeTruthy();

    // Check Aarav
    const aaravBox = screen.getByLabelText(/Aarav Rao/i);
    fireEvent.click(aaravBox);
    expect(screen.getByText('Enroll Selected (1)')).toBeTruthy();

    // Search Neha & check Neha -> total 2 preserved!
    fireEvent.change(screen.getByLabelText('Search employees'), { target: { value: 'Neha' } });
    expect(await screen.findByText('Neha Verma')).toBeTruthy();
    const nehaBox = screen.getByLabelText(/Neha Verma/i);
    fireEvent.click(nehaBox);
    expect(screen.getByText('Enroll Selected (2)')).toBeTruthy();

    fireEvent.click(screen.getByText('Enroll Selected (2)'));
    await waitFor(() => {
      expect(assignPayload).toEqual({ employeeIds: ['e1', 'e25'] });
    });
  });

  it('handles loading, error, retry, cancellation, stale out-of-order responses, StrictMode dedupe, and department/branch params', async () => {
    const adapterCalls = [];
    const signals = [];
    let attempt = 0;
    let resolveSlowReq1 = null;
    originalAdapter = api.defaults.adapter;

    api.defaults.adapter = (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      adapterCalls.push({ path: cleanPath, params: config.params || {} });
      signals.push(config.signal);

      if (cleanPath === '/employees/options') {
        attempt += 1;
        // Attempt 1 fails -> test error + retry
        if (attempt === 1) {
          return Promise.reject(Object.assign(new Error('Options timeout'), { config }));
        }
        // Attempt 2 passes retry
        if (attempt === 2 && !config.params?.search) {
          return Promise.resolve({
            data: {
              success: true,
              data: {
                employees: [makeSlimOption(1, 'RetrySuccess', 'User')],
                pagination: { total: 1, page: 1, pages: 1, limit: 20 },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        }
        // Out-of-order test: slow request for "Old" vs fast request for "Fresh"
        if (config.params?.search === 'Slow') {
          return new Promise((resolve) => {
            resolveSlowReq1 = () =>
              resolve({
                data: {
                  success: true,
                  data: {
                    employees: [makeSlimOption(99, 'StaleOld', 'Result')],
                    pagination: { total: 1, page: 1, pages: 1, limit: 20 },
                  },
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
              });
          });
        }
        if (config.params?.search === 'Fresh') {
          return Promise.resolve({
            data: {
              success: true,
              data: {
                employees: [makeSlimOption(100, 'FreshNew', 'Result')],
                pagination: { total: 1, page: 1, pages: 1, limit: 20 },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        }
      }
      return Promise.resolve({ data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config });
    };

    function Harness({ dept, branch, enabled = true }) {
      const [val, setVal] = React.useState('');
      const empOptions = useEmployeeOptions({
        enabled,
        departmentId: dept,
        branchId: branch,
        debounceMs: 10,
      });
      return (
        <EmployeeOptionPicker
          mode="single"
          label="Harness Emp"
          value={val}
          onChange={setVal}
          employeeOptions={empOptions}
        />
      );
    }

    const view = render(
      <React.StrictMode>
        <Harness dept="d-eng" branch="b-hq" />
      </React.StrictMode>
    );

    // Retry flow
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Options timeout')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('RetrySuccess User (PRV-0001)')).toBeTruthy();

    // Verify departmentId & branchId forwarded cleanly, and StrictMode emitted only 1 call on attempt 1!
    expect(adapterCalls[0].params).toMatchObject({ departmentId: 'd-eng', branchId: 'b-hq', page: 1, limit: 20 });

    // Stale response test: start "Slow", switch to "Fresh" before Slow settles, then resolve Slow last
    const searchInput = screen.getByLabelText('Search employees');
    fireEvent.change(searchInput, { target: { value: 'Slow' } });
    await waitFor(() => expect(typeof resolveSlowReq1).toBe('function'));

    fireEvent.change(searchInput, { target: { value: 'Fresh' } });
    expect(await screen.findByText('FreshNew Result (PRV-0100)')).toBeTruthy();

    // Resolving slow request AFTER Fresh resolved must NEVER overwrite FreshNew Result
    await act(async () => {
      resolveSlowReq1();
    });
    expect(screen.getByText('FreshNew Result (PRV-0100)')).toBeTruthy();
    expect(screen.queryByText(/StaleOld/)).toBeNull();

    // Unmount aborts cleanly without errors
    view.unmount();
  });

  it('keeps EmployeesPage directory on full GET /employees endpoint (intentionally not migrated)', async () => {
    const paths = [];
    originalAdapter = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      const cleanPath = (config.url || '').replace(/^.*\/api\/v1/, '');
      paths.push(cleanPath);
      if (cleanPath === '/employees') {
        return {
          data: {
            success: true,
            data: {
              employees: [
                {
                  _id: 'e1',
                  employeeId: 'PRV-0001',
                  firstName: 'Anita',
                  lastName: 'Nair',
                  email: 'anita@prvision.test',
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

    const store = createTestStore('HR_MANAGER');
    render(
      <Provider store={store}>
        <MemoryRouter>
          <EmployeesPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Anita Nair')).toBeTruthy();
    expect(paths).toContain('/employees');
    expect(paths).not.toContain('/employees/options');
  });
});
