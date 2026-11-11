import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api, { getTabId, clearTabSessionStorage, purgeLegacySharedAuth } from '../../services/api';

const getInitialStoredState = () => {
  purgeLegacySharedAuth();

  const token = sessionStorage.getItem('pr_access_token');
  const sessionId = sessionStorage.getItem('pr_session_id');
  const userRaw = sessionStorage.getItem('pr_user');
  const companyRaw = sessionStorage.getItem('pr_company');
  const sessionRaw = sessionStorage.getItem('pr_session_meta');

  let user = null;
  let company = null;
  let session = null;
  try {
    if (userRaw) user = JSON.parse(userRaw);
    if (companyRaw) company = JSON.parse(companyRaw);
    if (sessionRaw) session = JSON.parse(sessionRaw);
  } catch (_) {}

  return { token, sessionId, user, company, session, tabId: getTabId() };
};

const {
  token: storedToken,
  sessionId: storedSessionId,
  user: storedUser,
  company: storedCompany,
  session: storedSession,
  tabId: initialTabId,
} = getInitialStoredState();

export const loginUser = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const tabId = getTabId();
    const res = await api.post('/auth/login', { ...credentials, tabId });
    const payload = res?.data || res;
    const user = payload?.user;
    const employee = payload?.employee || null;
    const company = payload?.company || payload?.tenant;
    const token = payload?.tokens?.accessToken || payload?.accessToken;
    const refreshToken = payload?.tokens?.refreshToken || payload?.refreshToken;
    const session = payload?.session || null;
    const sessionId = session?.sessionId || null;

    // Store strictly in this tab's sessionStorage so other tabs are never overwritten
    purgeLegacySharedAuth();
    if (token) sessionStorage.setItem('pr_access_token', token);
    if (refreshToken) sessionStorage.setItem('pr_refresh_token', refreshToken);
    if (sessionId) sessionStorage.setItem('pr_session_id', sessionId);
    if (session) sessionStorage.setItem('pr_session_meta', JSON.stringify(session));
    if (user) sessionStorage.setItem('pr_user', JSON.stringify(user));
    if (company) sessionStorage.setItem('pr_company', JSON.stringify(company));

    return { user, employee, company, token, sessionId, session };
  } catch (err) {
    return rejectWithValue(err.message);
  }
});

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/auth/me');
    const payload = res?.data || res;
    const user = payload?.user;
    const company = payload?.company || payload?.tenant;
    const employee = payload?.employee || null;
    const session = payload?.session || null;

    if (user) sessionStorage.setItem('pr_user', JSON.stringify(user));
    if (company) sessionStorage.setItem('pr_company', JSON.stringify(company));
    if (session) {
      sessionStorage.setItem('pr_session_meta', JSON.stringify(session));
      if (session.sessionId) {
        sessionStorage.setItem('pr_session_id', session.sessionId);
      }
    }

    return { user, company, employee, session };
  } catch (err) {
    return rejectWithValue(err.message);
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await api.post('/auth/logout');
  } catch (_) {
    // Ignore error on logout
  }
  clearTabSessionStorage();
  return null;
});

export const logoutAllSessions = createAsyncThunk('auth/logoutAll', async () => {
  try {
    await api.post('/auth/logout-all');
  } catch (_) {
    // Ignore error on logout-all
  }
  clearTabSessionStorage();
  return null;
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser,
    employee: null,
    company: storedCompany,
    tenant: storedCompany,
    token: storedToken,
    sessionId: storedSessionId,
    session: storedSession,
    tabId: initialTabId,
    isAuthenticated: !!storedToken,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCredentials: (state, action) => {
      const { user, accessToken, refreshToken, company, session } = action.payload;
      const sessionId = session?.sessionId || state.sessionId;

      state.user = user;
      state.token = accessToken;
      state.sessionId = sessionId;
      state.session = session || state.session;
      state.company = company || state.company;
      state.tenant = company || state.tenant;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;

      purgeLegacySharedAuth();
      if (accessToken) sessionStorage.setItem('pr_access_token', accessToken);
      if (refreshToken) sessionStorage.setItem('pr_refresh_token', refreshToken);
      if (sessionId) sessionStorage.setItem('pr_session_id', sessionId);
      if (session) sessionStorage.setItem('pr_session_meta', JSON.stringify(session));
      if (user) sessionStorage.setItem('pr_user', JSON.stringify(user));
      if (company) sessionStorage.setItem('pr_company', JSON.stringify(company));
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.employee = action.payload.employee;
        state.company = action.payload.company;
        state.tenant = action.payload.company;
        state.token = action.payload.token;
        state.sessionId = action.payload.sessionId;
        state.session = action.payload.session;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // FetchMe
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.employee = action.payload.employee;
        state.company = action.payload.company;
        state.tenant = action.payload.company;
        if (action.payload.session) {
          state.session = action.payload.session;
          state.sessionId = action.payload.session.sessionId || state.sessionId;
        }
      })
      // Logout (single tab)
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.employee = null;
        state.company = null;
        state.tenant = null;
        state.token = null;
        state.sessionId = null;
        state.session = null;
        state.isAuthenticated = false;
      })
      // Logout All Sessions
      .addCase(logoutAllSessions.fulfilled, (state) => {
        state.user = null;
        state.employee = null;
        state.company = null;
        state.tenant = null;
        state.token = null;
        state.sessionId = null;
        state.session = null;
        state.isAuthenticated = false;
      });
  },
});

export const { clearError, setCredentials } = authSlice.actions;
export default authSlice.reducer;

