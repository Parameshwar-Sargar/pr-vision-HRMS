import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

const storedToken = localStorage.getItem('pr_access_token');
const storedUser = localStorage.getItem('pr_user') ? JSON.parse(localStorage.getItem('pr_user')) : null;
const storedTenant = localStorage.getItem('pr_tenant') ? JSON.parse(localStorage.getItem('pr_tenant')) : null;

export const loginUser = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/login', credentials);
    const { user, tenant, tokens } = res.data;
    localStorage.setItem('pr_access_token', tokens.accessToken);
    localStorage.setItem('pr_user', JSON.stringify(user));
    if (tenant) localStorage.setItem('pr_tenant', JSON.stringify(tenant));
    return { user, tenant, token: tokens.accessToken };
  } catch (err) {
    return rejectWithValue(err.message);
  }
});

export const registerCompany = createAsyncThunk('auth/registerCompany', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/register-company', data);
    const { user, tenant, tokens } = res.data;
    localStorage.setItem('pr_access_token', tokens.accessToken);
    localStorage.setItem('pr_user', JSON.stringify(user));
    if (tenant) localStorage.setItem('pr_tenant', JSON.stringify(tenant));
    return { user, tenant, token: tokens.accessToken };
  } catch (err) {
    return rejectWithValue(err.message);
  }
});

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/auth/me');
    const { user, tenant, employee } = res.data;
    localStorage.setItem('pr_user', JSON.stringify(user));
    if (tenant) localStorage.setItem('pr_tenant', JSON.stringify(tenant));
    return { user, tenant, employee };
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

export const { clearError } = authSlice.actions;
export default authSlice.reducer;

