import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:5000/api/v1';
const PASSWORD = 'Password@123';

/**
 * Simulates an isolated browser tab with its own sessionStorage and Axios-like interceptor
 */
class SimulatedBrowserTab {
  constructor(name, tabId) {
    this.name = name;
    this.sessionStorage = new Map();
    this.sessionStorage.set('pr_tab_id', tabId);
  }

  get tabId() {
    return this.sessionStorage.get('pr_tab_id');
  }

  get accessToken() {
    return this.sessionStorage.get('pr_access_token') || null;
  }

  get refreshToken() {
    return this.sessionStorage.get('pr_refresh_token') || null;
  }

  get sessionId() {
    return this.sessionStorage.get('pr_session_id') || null;
  }

  get user() {
    const raw = this.sessionStorage.get('pr_user');
    return raw ? JSON.parse(raw) : null;
  }

  async request(method, path, body = undefined) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Tab-Id': this.tabId,
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    if (this.sessionId) {
      headers['X-Session-Id'] = this.sessionId;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookieHeader = res.headers.get('set-cookie') || '';
    const json = await res.json().catch(() => ({}));
    return { status: res.status, data: json, setCookieHeader };
  }

  async login(email, password = PASSWORD) {
    const { status, data, setCookieHeader } = await this.request('POST', '/auth/login', {
      email,
      password,
      tabId: this.tabId,
    });

    if (status === 200 && data.success) {
      const payload = data.data;
      this.sessionStorage.set('pr_access_token', payload.tokens.accessToken);
      this.sessionStorage.set('pr_refresh_token', payload.tokens.refreshToken);
      this.sessionStorage.set('pr_session_id', payload.session.sessionId);
      this.sessionStorage.set('pr_session_meta', JSON.stringify(payload.session));
      this.sessionStorage.set('pr_user', JSON.stringify(payload.user));
    }

    return { status, data, setCookieHeader };
  }

  async logout() {
    const res = await this.request('POST', '/auth/logout');
    this.sessionStorage.delete('pr_access_token');
    this.sessionStorage.delete('pr_refresh_token');
    this.sessionStorage.delete('pr_session_id');
    this.sessionStorage.delete('pr_session_meta');
    this.sessionStorage.delete('pr_user');
    return res;
  }
}

async function runTests() {
  console.log('================================================================================');
  console.log('🧪 PR VISION HRMS — MULTI-TAB, MULTI-ROLE SESSION ISOLATION & RBAC VERIFICATION');
  console.log('================================================================================\n');

  const tab1 = new SimulatedBrowserTab('Tab 1 (ADMIN)', 'tab_1_admin');
  const tab2 = new SimulatedBrowserTab('Tab 2 (HR_MANAGER)', 'tab_2_hr');
  const tab3 = new SimulatedBrowserTab('Tab 3 (RECRUITER)', 'tab_3_recruiter');
  const tab4 = new SimulatedBrowserTab('Tab 4 (EMPLOYEE)', 'tab_4_employee');
  const tab5 = new SimulatedBrowserTab('Tab 5 (PAYROLL_ADMIN)', 'tab_5_payroll');

  // =========================================================================
  // TEST 1: Five Independent Tab Logins
  // =========================================================================
  console.log('▶ TEST 1: Five Independent Simultaneous Tab Logins');
  const [login1, login2, login3, login4, login5] = await Promise.all([
    tab1.login('admin@prvision.com'),
    tab2.login('hr@prvision.com'),
    tab3.login('recruiter@prvision.com'),
    tab4.login('employee@prvision.com'),
    tab5.login('payroll@prvision.com'),
  ]);

  for (const [tab, loginRes, expectedEmail, expectedRole] of [
    [tab1, login1, 'admin@prvision.com', 'ADMIN'],
    [tab2, login2, 'hr@prvision.com', 'HR_MANAGER'],
    [tab3, login3, 'recruiter@prvision.com', 'RECRUITER'],
    [tab4, login4, 'employee@prvision.com', 'EMPLOYEE'],
    [tab5, login5, 'payroll@prvision.com', 'PAYROLL_ADMIN'],
  ]) {
    assert.equal(loginRes.status, 200, `${tab.name} login should return 200`);
    assert.equal(loginRes.data.data.user.email, expectedEmail);
    assert.equal(loginRes.data.data.user.role, expectedRole);
    assert.ok(tab.sessionId, `${tab.name} must receive a unique sessionId`);
    // Ensure server does not set shared accessToken cookie with a token value
    assert.ok(
      !loginRes.setCookieHeader.includes('accessToken=eyJ'),
      `${tab.name} must not set shared accessToken cookie`
    );
  }

  const allSessionIds = new Set([
    tab1.sessionId,
    tab2.sessionId,
    tab3.sessionId,
    tab4.sessionId,
    tab5.sessionId,
  ]);
  assert.equal(allSessionIds.size, 5, 'All 5 tabs must have distinct sessionIds');

  // Verify /api/v1/auth/me in each tab concurrently
  const [me1, me2, me3, me4, me5] = await Promise.all([
    tab1.request('GET', '/auth/me'),
    tab2.request('GET', '/auth/me'),
    tab3.request('GET', '/auth/me'),
    tab4.request('GET', '/auth/me'),
    tab5.request('GET', '/auth/me'),
  ]);

  for (const [tab, meRes, expectedEmail, expectedRole] of [
    [tab1, me1, 'admin@prvision.com', 'ADMIN'],
    [tab2, me2, 'hr@prvision.com', 'HR_MANAGER'],
    [tab3, me3, 'recruiter@prvision.com', 'RECRUITER'],
    [tab4, me4, 'employee@prvision.com', 'EMPLOYEE'],
    [tab5, me5, 'payroll@prvision.com', 'PAYROLL_ADMIN'],
  ]) {
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.data.user.email, expectedEmail);
    assert.equal(meRes.data.data.user.role, expectedRole);
    assert.equal(meRes.data.data.session.sessionId, tab.sessionId);
    console.log(
      `  ✅ ${tab.name.padEnd(22)} | Email: ${expectedEmail.padEnd(23)} | Role: ${expectedRole.padEnd(14)} | Session: ${tab.sessionId}`
    );
  }

  // =========================================================================
  // TEST 2: Reload Persistence
  // =========================================================================
  console.log('\n▶ TEST 2: Page Reload Persistence in Tab 1 (ADMIN) and Tab 2 (HR_MANAGER)');
  const [reload1, reload2] = await Promise.all([
    tab1.request('GET', '/auth/me'),
    tab2.request('GET', '/auth/me'),
  ]);
  assert.equal(reload1.status, 200);
  assert.equal(reload1.data.data.user.role, 'ADMIN');
  assert.equal(reload1.data.data.session.sessionId, tab1.sessionId);
  assert.equal(reload2.status, 200);
  assert.equal(reload2.data.data.user.role, 'HR_MANAGER');
  assert.equal(reload2.data.data.session.sessionId, tab2.sessionId);
  console.log('  ✅ Tab 1 reloaded -> retained ADMIN session (' + tab1.sessionId + ')');
  console.log('  ✅ Tab 2 reloaded -> retained HR_MANAGER session (' + tab2.sessionId + ')');

  // =========================================================================
  // TEST 3: Single-Tab Logout Isolation
  // =========================================================================
  console.log('\n▶ TEST 3: Single-Tab Logout Isolation (Logout Tab 3 RECRUITER)');
  const tab3OldToken = tab3.accessToken;
  const logoutRes3 = await tab3.logout();
  assert.equal(logoutRes3.status, 200);

  // Verify Tab 3's old token is now rejected by the backend because its UserSession is revoked
  const revokedCheck = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${tab3OldToken}` },
  });
  assert.equal(revokedCheck.status, 401, 'Logged-out Tab 3 token must be rejected with 401');

  // Verify Tabs 1, 2, 4, 5 remain completely active
  const [afterLogout1, afterLogout2, afterLogout4, afterLogout5] = await Promise.all([
    tab1.request('GET', '/auth/me'),
    tab2.request('GET', '/auth/me'),
    tab4.request('GET', '/auth/me'),
    tab5.request('GET', '/auth/me'),
  ]);
  assert.equal(afterLogout1.status, 200);
  assert.equal(afterLogout2.status, 200);
  assert.equal(afterLogout4.status, 200);
  assert.equal(afterLogout5.status, 200);
  console.log('  ✅ Tab 3 logged out and token revoked (401 on reuse)');
  console.log('  ✅ Tabs 1, 2, 4, and 5 remained active and completely unaffected (200 OK)');

  // Also verify same-account multi-tab isolation: Admin logs into Tab 1B and logs out Tab 1B; Tab 1 remains active!
  const tab1B = new SimulatedBrowserTab('Tab 1B (ADMIN 2nd Tab)', 'tab_1b_admin');
  await tab1B.login('admin@prvision.com');
  await tab1B.logout();
  const checkTab1After1BLogout = await tab1.request('GET', '/auth/me');
  assert.equal(checkTab1After1BLogout.status, 200, 'Tab 1 (ADMIN) must remain active even when another ADMIN tab logs out');
  console.log('  ✅ Same-account multi-tab isolation verified: logging out second ADMIN tab did not affect Tab 1 ADMIN');

  // =========================================================================
  // TEST 4: Account Switching in One Tab
  // =========================================================================
  console.log('\n▶ TEST 4: Account Switching in Tab 4 (EMPLOYEE -> RECRUITER -> EMPLOYEE)');
  await tab4.logout();
  await tab4.login('recruiter@prvision.com');
  const switchedMe4 = await tab4.request('GET', '/auth/me');
  assert.equal(switchedMe4.status, 200);
  assert.equal(switchedMe4.data.data.user.email, 'recruiter@prvision.com');
  assert.equal(switchedMe4.data.data.user.role, 'RECRUITER');

  // Verify Tabs 1, 2, 5 still have their exact identities
  const [verify1, verify2, verify5] = await Promise.all([
    tab1.request('GET', '/auth/me'),
    tab2.request('GET', '/auth/me'),
    tab5.request('GET', '/auth/me'),
  ]);
  assert.equal(verify1.data.data.user.role, 'ADMIN');
  assert.equal(verify2.data.data.user.role, 'HR_MANAGER');
  assert.equal(verify5.data.data.user.role, 'PAYROLL_ADMIN');
  console.log('  ✅ Tab 4 switched to RECRUITER without affecting Tabs 1, 2, or 5');

  // Restore Tab 3 as RECRUITER and Tab 4 as EMPLOYEE for Test 5
  await tab3.login('recruiter@prvision.com');
  await tab4.logout();
  await tab4.login('employee@prvision.com');

  // =========================================================================
  // TEST 5: Role-Based Permission Verification (PUT /api/v1/employees/:id)
  // =========================================================================
  console.log('\n▶ TEST 5: Role-Based Permission Verification on PUT /api/v1/employees/:id');
  const empListRes = await tab1.request('GET', '/employees?limit=5');
  assert.equal(empListRes.status, 200);
  const targetEmployee = empListRes.data.data.employees[0];
  assert.ok(targetEmployee && targetEmployee._id, 'Must find an employee record to test updates');

  const updatePayload = {
    firstName: targetEmployee.firstName,
    lastName: targetEmployee.lastName,
    phone: targetEmployee.phone || '9876543210',
    departmentId: targetEmployee.departmentId?._id || targetEmployee.departmentId,
    designationId: targetEmployee.designationId?._id || targetEmployee.designationId,
    branchId: targetEmployee.branchId?._id || targetEmployee.branchId || '',
    employmentType: targetEmployee.employmentType || 'Full-Time',
    employmentStatus: targetEmployee.employmentStatus || 'Confirmed',
  };

  const [updAdmin, updHR, updRecruiter, updEmployee, updPayroll] = await Promise.all([
    tab1.request('PUT', `/employees/${targetEmployee._id}`, updatePayload),
    tab2.request('PUT', `/employees/${targetEmployee._id}`, updatePayload),
    tab3.request('PUT', `/employees/${targetEmployee._id}`, updatePayload),
    tab4.request('PUT', `/employees/${targetEmployee._id}`, updatePayload),
    tab5.request('PUT', `/employees/${targetEmployee._id}`, updatePayload),
  ]);

  assert.equal(updAdmin.status, 200, 'ADMIN must be allowed (200 OK) to update employee');
  assert.equal(updHR.status, 200, 'HR_MANAGER must be allowed (200 OK) to update employee');
  assert.equal(updRecruiter.status, 403, 'RECRUITER must be denied (403 Forbidden) from updating employee');
  assert.equal(updEmployee.status, 403, 'EMPLOYEE must be denied (403 Forbidden) from updating employee');
  assert.equal(updPayroll.status, 403, 'PAYROLL_ADMIN must be denied (403 Forbidden) from updating employee');

  console.log(`  ✅ Tab 1 (ADMIN)         -> PUT /employees/${targetEmployee._id} : ${updAdmin.status} OK (Allowed)`);
  console.log(`  ✅ Tab 2 (HR_MANAGER)    -> PUT /employees/${targetEmployee._id} : ${updHR.status} OK (Allowed)`);
  console.log(`  ✅ Tab 3 (RECRUITER)     -> PUT /employees/${targetEmployee._id} : ${updRecruiter.status} Forbidden (${updRecruiter.data.message})`);
  console.log(`  ✅ Tab 4 (EMPLOYEE)      -> PUT /employees/${targetEmployee._id} : ${updEmployee.status} Forbidden (${updEmployee.data.message})`);
  console.log(`  ✅ Tab 5 (PAYROLL_ADMIN) -> PUT /employees/${targetEmployee._id} : ${updPayroll.status} Forbidden (${updPayroll.data.message})`);

  // =========================================================================
  // TEST 6: Session Revocation, Active Sessions API, & Refresh Token Rotation
  // =========================================================================
  console.log('\n▶ TEST 6: Session Revocation Isolation & Refresh Token Rotation');
  const tabAdminExtra = new SimulatedBrowserTab('Tab Admin Extra', 'tab_admin_extra');
  await tabAdminExtra.login('admin@prvision.com');
  const extraSessionId = tabAdminExtra.sessionId;

  // List sessions from Tab 1
  const sessionsRes = await tab1.request('GET', '/auth/sessions');
  assert.equal(sessionsRes.status, 200);
  const activeSessions = sessionsRes.data.data.sessions;
  assert.ok(
    activeSessions.some((s) => s.sessionId === extraSessionId),
    'Active sessions list must include the newly opened Admin session'
  );
  assert.ok(
    activeSessions.every((s) => !s.refreshTokenHash && !s.refreshToken),
    'Active sessions API must never expose refreshTokenHash or raw tokens'
  );

  // Revoke tabAdminExtra from Tab 1
  const revokeRes = await tab1.request('DELETE', `/auth/sessions/${extraSessionId}`);
  assert.equal(revokeRes.status, 200);

  // Verify tabAdminExtra is now rejected (401), while Tab 1 is still active (200)
  const [extraMeAfterRevoke, tab1MeAfterRevoke] = await Promise.all([
    tabAdminExtra.request('GET', '/auth/me'),
    tab1.request('GET', '/auth/me'),
  ]);
  assert.equal(extraMeAfterRevoke.status, 401, 'Revoked session must receive 401');
  assert.equal(tab1MeAfterRevoke.status, 200, 'Tab 1 session must remain active (200)');
  console.log(`  ✅ Individual session revocation (${extraSessionId}) terminated only that session; Tab 1 remained 200 OK`);

  // Test Refresh Token Rotation & Reuse Detection on a test session
  const tabRefreshTest = new SimulatedBrowserTab('Tab Refresh Test', 'tab_refresh_test');
  await tabRefreshTest.login('hr@prvision.com');
  const oldRefreshToken = tabRefreshTest.refreshToken;

  const rotateRes = await tabRefreshTest.request('POST', '/auth/refresh-token', {
    refreshToken: oldRefreshToken,
  });
  assert.equal(rotateRes.status, 200, 'Valid refresh token rotation should return 200');
  const rotatedRefreshToken = rotateRes.data.data.tokens.refreshToken;
  assert.notEqual(rotatedRefreshToken, oldRefreshToken, 'Refresh token must rotate to a new value');

  // Attempt to reuse the old refresh token -> must trigger reuse detection and revoke the session!
  const reuseRes = await tabRefreshTest.request('POST', '/auth/refresh-token', {
    refreshToken: oldRefreshToken,
  });
  assert.equal(reuseRes.status, 401, 'Reusing a rotated refresh token must return 401 and revoke the session');
  console.log('  ✅ Refresh token rotation & replay/reuse detection verified (401 on token reuse)');

  // Clean up test sessions
  await Promise.all([
    tab1.logout(),
    tab2.logout(),
    tab3.logout(),
    tab4.logout(),
    tab5.logout(),
  ]);

  console.log('\n================================================================================');
  console.log('🎉 ALL 6 MULTI-TAB SESSION ISOLATION & RBAC TEST SUITES PASSED 100%!');
  console.log('================================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

