import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import queryCache from '../services/queryCache';
import api, { downloadAuthenticatedFile, getTabId } from '../services/api';
import masterDataReducer, {
  addDepartment,
  updateDepartment,
  removeDepartment,
  addDesignation,
  updateDesignation,
  removeDesignation,
  addShift,
  updateShift,
  removeShift,
  clearMasterData,
} from '../store/slices/masterDataSlice';

describe('Phase 3 Verification: Query Cache & In-Flight Request Deduplication', () => {
  beforeEach(() => {
    queryCache.clear();
    vi.restoreAllMocks();
  });

  it('generates deterministic cache keys regardless of query parameter order', () => {
    const key1 = queryCache.generateKey('get', '/api/v1/employees', { page: 1, limit: 10 });
    const key2 = queryCache.generateKey('GET', '/api/v1/employees', { limit: 10, page: 1 });
    expect(key1).toBe(key2);
    expect(key1).toBe('get:/api/v1/employees:{"limit":10,"page":1}');
  });

  it('coalesces concurrent identical in-flight requests into a single network call', async () => {
    let callCount = 0;
    const mockRequestFn = vi.fn().mockImplementation(async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true, count: callCount, data: [{ id: '1', name: 'Engineering' }] };
    });

    const key = 'get:/departments:{}';

    // Fire 4 simultaneous identical requests
    const [res1, res2, res3, res4] = await Promise.all([
      queryCache.deduplicate(key, mockRequestFn, { ttl: 1000 }),
      queryCache.deduplicate(key, mockRequestFn, { ttl: 1000 }),
      queryCache.deduplicate(key, mockRequestFn, { ttl: 1000 }),
      queryCache.deduplicate(key, mockRequestFn, { ttl: 1000 }),
    ]);

    expect(callCount).toBe(1);
    expect(mockRequestFn).toHaveBeenCalledTimes(1);
    expect(res1).toEqual(res2);
    expect(res2).toEqual(res3);
    expect(res3).toEqual(res4);
  });

  it('returns cached data within TTL and refetches when TTL expires', async () => {
    let callCount = 0;
    const mockRequestFn = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return { count: callCount, time: Date.now() };
    });

    const key = 'get:/designations:{}';

    // 1st call - should fetch
    const first = await queryCache.deduplicate(key, mockRequestFn, { ttl: 100, tags: ['designations'] });
    expect(callCount).toBe(1);

    // 2nd call immediately - should serve from cache
    const second = await queryCache.deduplicate(key, mockRequestFn, { ttl: 100, tags: ['designations'] });
    expect(callCount).toBe(1);
    expect(second).toEqual(first);

    // Wait 120ms for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 120));

    // 3rd call - should fetch fresh
    const third = await queryCache.deduplicate(key, mockRequestFn, { ttl: 100, tags: ['designations'] });
    expect(callCount).toBe(2);
    expect(third.count).toBe(2);
  });

  it('invalidates cache entries selectively by tag when mutations occur', async () => {
    const deptFn = vi.fn().mockResolvedValue({ departments: ['HR', 'IT'] });
    const empFn = vi.fn().mockResolvedValue({ employees: ['Alice', 'Bob'] });

    await queryCache.deduplicate('get:/departments:{}', deptFn, { ttl: 5000, tags: ['departments'] });
    await queryCache.deduplicate('get:/employees:{}', empFn, { ttl: 5000, tags: ['employees'] });

    expect(deptFn).toHaveBeenCalledTimes(1);
    expect(empFn).toHaveBeenCalledTimes(1);

    // Invalidate ONLY departments
    queryCache.invalidateTags(['departments']);

    // Call employees again -> should hit cache, NOT call empFn again
    await queryCache.deduplicate('get:/employees:{}', empFn, { ttl: 5000, tags: ['employees'] });
    expect(empFn).toHaveBeenCalledTimes(1);

    // Call departments again -> invalidated, should call deptFn a second time
    await queryCache.deduplicate('get:/departments:{}', deptFn, { ttl: 5000, tags: ['departments'] });
    expect(deptFn).toHaveBeenCalledTimes(2);
  });

  it('determines cross-module affected tags correctly on mutation', () => {
    // Attendance mutation affects attendance and dashboard
    const attendanceTags = queryCache.getAffectedTags('post', '/api/v1/attendance/clock-in');
    expect(attendanceTags).toContain('attendance');
    expect(attendanceTags).toContain('dashboard');

    // Employee mutation affects employees, dashboard, and master-data
    const employeeTags = queryCache.getAffectedTags('post', '/api/v1/employees');
    expect(employeeTags).toContain('employees');
    expect(employeeTags).toContain('dashboard');
    expect(employeeTags).toContain('master-data');

    // Department mutation affects departments, master-data, designations
    const deptTags = queryCache.getAffectedTags('post', '/api/v1/departments');
    expect(deptTags).toContain('departments');
    expect(deptTags).toContain('master-data');
  });

  it('completely purges cache and in-flight map on clear() (simulating logout)', async () => {
    const fn = vi.fn().mockResolvedValue({ user: 'test' });
    await queryCache.deduplicate('get:/auth/me:{}', fn, { ttl: 10000 });
    expect(fn).toHaveBeenCalledTimes(1);

    queryCache.clear();
    expect(queryCache.cache.size).toBe(0);
    expect(queryCache.inFlightRequests.size).toBe(0);

    // Next call must re-fetch
    await queryCache.deduplicate('get:/auth/me:{}', fn, { ttl: 10000 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not store cache entry if request function throws an error', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('Network failure'));
    const key = 'get:/failing-endpoint:{}';

    await expect(queryCache.deduplicate(key, failingFn, { ttl: 5000 })).rejects.toThrow('Network failure');
    expect(queryCache.getCached(key)).toBeNull();
    expect(queryCache.inFlightRequests.has(key)).toBe(false);
  });
});

describe('Phase 3 Verification: Master Data Redux Slice', () => {
  const initialMasterState = {
    departments: [],
    designations: [],
    branches: [],
    shifts: [],
    leaveTypes: [],
    loading: false,
    isLoaded: false,
    lastFetchedAt: null,
    error: null,
  };

  it('manages departments state via add, update, and remove reducers', () => {
    let state = masterDataReducer(initialMasterState, addDepartment({ _id: 'd1', name: 'Finance' }));
    expect(state.departments).toHaveLength(1);
    expect(state.departments[0].name).toBe('Finance');

    // Duplicate add prevention
    state = masterDataReducer(state, addDepartment({ _id: 'd1', name: 'Finance Duplicate' }));
    expect(state.departments).toHaveLength(1);

    // Update
    state = masterDataReducer(state, updateDepartment({ _id: 'd1', name: 'Finance & Accounting' }));
    expect(state.departments[0].name).toBe('Finance & Accounting');

    // Remove
    state = masterDataReducer(state, removeDepartment('d1'));
    expect(state.departments).toHaveLength(0);
  });

  it('manages designations state via add, update, and remove reducers', () => {
    let state = masterDataReducer(initialMasterState, addDesignation({ _id: 'des1', title: 'Software Engineer' }));
    expect(state.designations).toHaveLength(1);

    state = masterDataReducer(state, updateDesignation({ _id: 'des1', title: 'Senior Software Engineer' }));
    expect(state.designations[0].title).toBe('Senior Software Engineer');

    state = masterDataReducer(state, removeDesignation('des1'));
    expect(state.designations).toHaveLength(0);
  });

  it('manages shifts state via add, update, and remove reducers', () => {
    let state = masterDataReducer(initialMasterState, addShift({ _id: 's1', name: 'General Shift', startTime: '09:00' }));
    expect(state.shifts).toHaveLength(1);

    state = masterDataReducer(state, updateShift({ _id: 's1', name: 'Morning Shift', startTime: '08:00' }));
    expect(state.shifts[0].name).toBe('Morning Shift');
    expect(state.shifts[0].startTime).toBe('08:00');

    state = masterDataReducer(state, removeShift('s1'));
    expect(state.shifts).toHaveLength(0);
  });

  it('resets state completely on clearMasterData', () => {
    let state = masterDataReducer(initialMasterState, addDepartment({ _id: 'd1', name: 'Engineering' }));
    state = masterDataReducer(state, addShift({ _id: 's1', name: 'Night Shift' }));
    expect(state.departments).toHaveLength(1);
    expect(state.shifts).toHaveLength(1);

    state = masterDataReducer(state, clearMasterData());
    expect(state.departments).toEqual([]);
    expect(state.shifts).toEqual([]);
    expect(state.isLoaded).toBe(false);
  });
});

describe('Phase 3 Verification: AbortController Concurrency, StrictMode & Complete Tags', () => {
  beforeEach(() => {
    queryCache.clear();
    queryCache.resetStats();
    vi.restoreAllMocks();
  });

  it('covers all HRMS route module tags and selective cross-module invalidations', () => {
    expect(queryCache.getModuleTag('/holidays')).toBe('holidays');
    expect(queryCache.getModuleTag('/performance')).toBe('performance');
    expect(queryCache.getModuleTag('/training/programs')).toBe('training');
    expect(queryCache.getModuleTag('/organization/settings')).toBe('company');
    expect(queryCache.getModuleTag('/organization/branches')).toBe('branches');
    expect(queryCache.getModuleTag('/leaves/types')).toBe('leaveTypes');
    expect(queryCache.getModuleTag('/leaves/requests')).toBe('leaves');
    expect(queryCache.getModuleTag('/auth/sessions')).toBe('sessions');
    expect(queryCache.getModuleTag('/system/diagnostics')).toBe('system');

    const branchTags = queryCache.getAffectedTags('post', '/organization/branches');
    expect(branchTags).toContain('branches');
    expect(branchTags).toContain('master-data');
    expect(branchTags).toContain('company');
    expect(branchTags).not.toContain('employees');

    const leaveTypeTags = queryCache.getAffectedTags('post', '/leaves/types');
    expect(leaveTypeTags).toContain('leaveTypes');
    expect(leaveTypeTags).toContain('leaves');
    expect(leaveTypeTags).toContain('master-data');

    const convertTags = queryCache.getAffectedTags('post', '/recruitment/candidates/123/convert');
    expect(convertTags).toEqual(
      expect.arrayContaining(['recruitment', 'dashboard', 'employees', 'master-data', 'reports'])
    );
  });

  it('keeps shared in-flight request alive when one subscriber aborts (sibling survival)', async () => {
    let internalSignal = null;
    const fn = vi.fn().mockImplementation(async (sig) => {
      internalSignal = sig;
      await new Promise((r) => setTimeout(r, 40));
      return { ok: true };
    });

    const ac1 = new AbortController();
    const ac2 = new AbortController();

    const p1 = queryCache.deduplicate('get:/employees:{}', fn, { ttl: 5000, signal: ac1.signal });
    const p2 = queryCache.deduplicate('get:/employees:{}', fn, { ttl: 5000, signal: ac2.signal });

    ac1.abort();

    await expect(p1).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    const res2 = await p2;
    expect(res2).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(internalSignal.aborted).toBe(false);
    expect(queryCache.getCached('get:/employees:{}')).toEqual({ ok: true });
  });

  it('survives React 18 StrictMode synchronous unmount->remount abort without duplicate calls', async () => {
    let internalSignal = null;
    const fn = vi.fn().mockImplementation(async (sig) => {
      internalSignal = sig;
      await new Promise((r) => setTimeout(r, 25));
      return { strictModeSafe: true };
    });

    const ac1 = new AbortController();
    const p1 = queryCache.deduplicate('get:/departments:{}', fn, { ttl: 5000, signal: ac1.signal });
    ac1.abort();

    const ac2 = new AbortController();
    const p2 = queryCache.deduplicate('get:/departments:{}', fn, { ttl: 5000, signal: ac2.signal });

    await expect(p1).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(await p2).toEqual({ strictModeSafe: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(internalSignal.aborted).toBe(false);
  });

  it('aborts underlying request when all subscribers cancel and clears in-flight state', async () => {
    let internalSignal = null;
    const fn = vi.fn().mockImplementation(
      (sig) =>
        new Promise((resolve, reject) => {
          internalSignal = sig;
          sig.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })));
        })
    );

    const ac = new AbortController();
    const p = queryCache.deduplicate('get:/attendance:{}', fn, { ttl: 5000, signal: ac.signal });
    ac.abort();

    await expect(p).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await new Promise((r) => setTimeout(r, 10));
    expect(internalSignal.aborted).toBe(true);
    expect(queryCache.inFlightRequests.size).toBe(0);
    expect(queryCache.getCached('get:/attendance:{}')).toBeNull();
  });

  it('prevents stale in-flight GET response from populating cache after mutation bump', async () => {
    let releaseGet;
    const getFn = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = resolve;
        })
    );

    const p = queryCache.deduplicate('get:/employees:{"limit":10}', getFn, {
      ttl: 10000,
      tags: ['employees'],
    });

    // Mutation occurs while GET is still in-flight
    queryCache.invalidateTags(['employees']);
    queryCache.bumpTagVersions(['employees']);

    releaseGet({ employees: ['stale-list'] });
    const data = await p;
    expect(data).toEqual({ employees: ['stale-list'] });
    // Must NOT persist stale response into cache after concurrent mutation
    expect(queryCache.getCached('get:/employees:{"limit":10}')).toBeNull();
  });
});

describe('Phase 3 Verification: Session Isolation & Authenticated Downloads', () => {
  let originalAdapter;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

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
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('enforces per-tab sessionStorage headers, zero localStorage auth, and session-scoped cache keys', async () => {
    const seenHeaders = [];
    api.defaults.adapter = async (config) => {
      seenHeaders.push(config.headers);
      return {
        data: { success: true, data: { employees: [{ _id: 'e1', firstName: 'Amit', lastName: 'Patel' }] } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await api.get('/employees', { cacheTtl: 10000 });
    await api.get('/employees', { cacheTtl: 10000 }); // Cached for sess-tab-1

    expect(seenHeaders).toHaveLength(1);
    const hdrs = seenHeaders[0];
    expect(hdrs.Authorization || hdrs.get?.('Authorization')).toBe('Bearer token-tab-1');
    expect(hdrs['X-Tab-Id'] || hdrs.get?.('X-Tab-Id')).toBe(getTabId());
    expect(hdrs['X-Session-Id'] || hdrs.get?.('X-Session-Id')).toBe('sess-tab-1');
    expect(localStorage.getItem('pr_access_token')).toBeNull();
    expect(localStorage.getItem('pr_session_id')).toBeNull();

    // Switching active session in same tab must miss previous session's cached entry
    sessionStorage.setItem('pr_session_id', 'sess-tab-2');
    sessionStorage.setItem('pr_access_token', 'token-tab-2');
    await api.get('/employees', { cacheTtl: 10000 });
    expect(seenHeaders).toHaveLength(2);
  });

  it('sends authenticated per-tab headers during blob file downloads and handles blob JSON errors', async () => {
    const adapterSpy = vi.fn(async (config) => ({
      data: new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' }),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    api.defaults.adapter = adapterSpy;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadAuthenticatedFile('/payroll/payslips/p1/pdf', 'Slip-p1.pdf');

    expect(adapterSpy).toHaveBeenCalledTimes(1);
    const reqConfig = adapterSpy.mock.calls[0][0];
    expect(reqConfig.responseType).toBe('blob');
    expect(reqConfig.headers.Authorization).toBe('Bearer token-tab-1');
    expect(reqConfig.headers['X-Tab-Id']).toBe('tab-test-1');
    expect(reqConfig.headers['X-Session-Id']).toBe('sess-tab-1');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Also verifies JSON error extraction when server returns error inside Blob
    api.defaults.adapter = async (config) => {
      const err = new Error('Forbidden');
      err.response = {
        status: 403,
        data: new Blob([JSON.stringify({ message: 'Unauthorized payslip access' })], {
          type: 'application/json',
        }),
      };
      err.config = config;
      throw err;
    };

    await expect(downloadAuthenticatedFile('/payroll/payslips/other/pdf', 'x.pdf')).rejects.toThrow(
      'Unauthorized payslip access'
    );
  });
});

