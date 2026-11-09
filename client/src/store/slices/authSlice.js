import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

const getInitialStoredState = () => {
  const token =
    localStorage.getItem('pr_access_token') ||
    sessionStorage.getItem('pr_access_token');
  const userRaw =
    localStorage.getItem('pr_user') ||
    sessionStorage.getItem('pr_user');
  const companyRaw =
    localStorage.getItem('pr_company') ||
    sessionStorage.getItem('pr_company');

  let user = null;
  let company = null;
  try {
    if (userRaw) user = JSON.parse(userRaw);
    if (companyRaw) company = JSON.parse(companyRaw);
  } catch (_) {}

  return { token, user, company };
};

const { token: storedToken, user: storedUser, company: storedCompany } = getInitialStoredState();

export const loginUser = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/login', credentials);
    const payload = res?.data || res;
    const user = payload?.user;
    const company = payload?.company || payload?.tenant;
    const token = payload?.tokens?.accessToken || payload?.accessToken;
    const refreshToken = payload?.tokens?.refreshToken || payload?.refreshToken;
    const rememberMe = credentials?.rememberMe ?? true;

    const targetStorage = rememberMe ? localStorage : sessionStorage;
    const alternateStorage = rememberMe ? sessionStorage : localStorage;

    alternateStorage.removeItem('pr_access_token');
    alternateStorage.removeItem('pr_refresh_token');
    alternateStorage.removeItem('pr_user');
    alternateStorage.removeItem('pr_company');
    alternateStorage.removeItem('pr_remember_me');

    if (token) targetStorage.setItem('pr_access_token', token);
    if (refreshToken) targetStorage.setItem('pr_refresh_token', refreshToken);
    if (user) targetStorage.setItem('pr_user', JSON.stringify(user));
    if (company) targetStorage.setItem('pr_company', JSON.stringify(company));
    targetStorage.setItem('pr_remember_me', rememberMe ? 'true' : 'false');

    return { user, company, token };
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
    const employee = payload?.employee;

    const rememberMe = (localStorage.getItem('pr_remember_me') !== 'false');
    const targetStorage = rememberMe ? localStorage : sessionStorage;

    if (user) targetStorage.setItem('pr_user', JSON.stringify(user));
    if (company) targetStorage.setItem('pr_company', JSON.stringify(company));

    return { user, company, employee };
  } catch (err) {
    return rejectWithValue(err.message);
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await api.post('/auth/logout');
  } catch (err) {
    // Ignore error on logout
  }
  localStorage.removeItem('pr_access_token');
  localStorage.removeItem('pr_refresh_token');
  localStorage.removeItem('pr_user');
  localStorage.removeItem('pr_company');
  localStorage.removeItem('pr_tenant');
  localStorage.removeItem('pr_remember_me');

  sessionStorage.removeItem('pr_access_token');
  sessionStorage.removeItem('pr_refresh_token');
  sessionStorage.removeItem('pr_user');
  sessionStorage.removeItem('pr_company');
  sessionStorage.removeItem('pr_remember_me');

  return null;
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser,
    company: storedCompany,
    tenant: storedCompany,
    token: storedToken,
    isAuthenticated: !!storedToken,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCredentials: (state, action) => {
      const { user, accessToken, refreshToken, company, rememberMe = true } = action.payload;
      state.user = user;
      state.token = accessToken;
      state.company = company || state.company;
      state.tenant = company || state.tenant;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;

      const targetStorage = rememberMe ? localStorage : sessionStorage;
      const alternateStorage = rememberMe ? sessionStorage : localStorage;

      alternateStorage.removeItem('pr_access_token');
      alternateStorage.removeItem('pr_refresh_token');
      alternateStorage.removeItem('pr_user');
      alternateStorage.removeItem('pr_company');
      alternateStorage.removeItem('pr_remember_me');

      if (accessToken) targetStorage.setItem('pr_access_token', accessToken);
      if (refreshToken) targetStorage.setItem('pr_refresh_token', refreshToken);
      if (user) targetStorage.setItem('pr_user', JSON.stringify(user));
      if (company) targetStorage.setItem('pr_company', JSON.stringify(company));
      targetStorage.setItem('pr_remember_me', rememberMe ? 'true' : 'false');
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
        state.tenant = action.payload.tenant;
        state.token = action.payload.token;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // FetchMe
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.tenant = action.payload.tenant;
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.tenant = null;
        state.token = null;
        state.isAuthenticated = false;
      });
  },
});

export const { clearError, setCredentials } = authSlice.actions;
export default authSlice.reducer;

