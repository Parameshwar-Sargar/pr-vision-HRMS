import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

const storedToken = localStorage.getItem('pr_access_token');
const storedUser = localStorage.getItem('pr_user') ? JSON.parse(localStorage.getItem('pr_user')) : null;
const storedTenant = localStorage.getItem('pr_tenant') ? JSON.parse(localStorage.getItem('pr_tenant')) : null;

export const loginUser = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/login', credentials);
    const payload = res?.data || res;
    const user = payload?.user;
    const company = payload?.company || payload?.tenant;
    const token = payload?.tokens?.accessToken || payload?.accessToken;
    const refreshToken = payload?.tokens?.refreshToken || payload?.refreshToken;

    if (token) localStorage.setItem('pr_access_token', token);
    if (refreshToken) localStorage.setItem('pr_refresh_token', refreshToken);
    if (user) localStorage.setItem('pr_user', JSON.stringify(user));
    if (company) localStorage.setItem('pr_company', JSON.stringify(company));

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

    if (user) localStorage.setItem('pr_user', JSON.stringify(user));
    if (company) localStorage.setItem('pr_company', JSON.stringify(company));

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
  localStorage.removeItem('pr_user');
  localStorage.removeItem('pr_tenant');
  return null;
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser,
    tenant: storedTenant,
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
      const { user, accessToken, refreshToken } = action.payload;
      state.user = user;
      state.token = accessToken;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
      if (accessToken) localStorage.setItem('pr_access_token', accessToken);
      if (refreshToken) localStorage.setItem('pr_refresh_token', refreshToken);
      if (user) localStorage.setItem('pr_user', JSON.stringify(user));
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
      // Register
      .addCase(registerCompany.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerCompany.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.tenant = action.payload.tenant;
        state.token = action.payload.token;
      })
      .addCase(registerCompany.rejected, (state, action) => {
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

