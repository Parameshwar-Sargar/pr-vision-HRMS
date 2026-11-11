import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// Purge any legacy shared localStorage keys so tabs never share or leak credentials
export const purgeLegacySharedAuth = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('pr_access_token');
    localStorage.removeItem('pr_refresh_token');
    localStorage.removeItem('pr_user');
    localStorage.removeItem('pr_company');
    localStorage.removeItem('pr_tenant');
    localStorage.removeItem('pr_remember_me');
  } catch (_) {}
};

purgeLegacySharedAuth();

export const getTabId = () => {
  if (typeof window === 'undefined') return 'srv';
  let tabId = sessionStorage.getItem('pr_tab_id');
  if (!tabId) {
    tabId = `tab_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36).slice(-4)}`;
    sessionStorage.setItem('pr_tab_id', tabId);
  }
  return tabId;
};

export const clearTabSessionStorage = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('pr_access_token');
  sessionStorage.removeItem('pr_refresh_token');
  sessionStorage.removeItem('pr_session_id');
  sessionStorage.removeItem('pr_session_meta');
  sessionStorage.removeItem('pr_user');
  sessionStorage.removeItem('pr_company');
  sessionStorage.removeItem('pr_remember_me');
};

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: false, // Strictly per-tab Authorization header; never shared browser cookies
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: always read token exclusively from the current tab's sessionStorage
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('pr_access_token');
    const sessionId = sessionStorage.getItem('pr_session_id');
    const tabId = getTabId();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (tabId) {
      config.headers['X-Tab-Id'] = tabId;
    }
    if (sessionId) {
      config.headers['X-Session-Id'] = sessionId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (newToken) => {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
};

// Response interceptor: handle per-tab token refresh, 401 session termination, and mutation events
api.interceptors.response.use(
  (response) => {
    const method = (response.config?.method || 'get').toLowerCase();
    const url = response.config?.url || '';
    if (
      typeof window !== 'undefined' &&
      ['post', 'put', 'patch', 'delete'].includes(method) &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh')
    ) {
      window.dispatchEvent(
        new CustomEvent('hrms:data-mutated', {
          detail: { method, url, data: response.data },
        })
      );
    }
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const reqUrl = originalRequest.url || '';

    if (
      error.response?.status === 401 &&
      !reqUrl.includes('/auth/login') &&
      !reqUrl.includes('/auth/refresh-token') &&
      !reqUrl.includes('/auth/logout')
    ) {
      const msg = error.response?.data?.message || '';
      const refreshToken = sessionStorage.getItem('pr_refresh_token');

      // Attempt automatic per-tab refresh-token rotation when access token expires
      if (msg.includes('Token has expired') && refreshToken && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((newToken) => {
              if (!newToken) {
                return reject(error);
              }
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshRes = await axios.post(
            `${BASE_URL}/auth/refresh-token`,
            { refreshToken },
            { headers: { 'Content-Type': 'application/json', 'X-Tab-Id': getTabId() } }
          );
          const payload = refreshRes.data?.data || refreshRes.data;
          const newAccessToken = payload?.tokens?.accessToken;
          const newRefreshToken = payload?.tokens?.refreshToken;
          const sessionMeta = payload?.session;

          if (newAccessToken && newRefreshToken) {
            sessionStorage.setItem('pr_access_token', newAccessToken);
            sessionStorage.setItem('pr_refresh_token', newRefreshToken);
            if (sessionMeta) {
              sessionStorage.setItem('pr_session_meta', JSON.stringify(sessionMeta));
              if (sessionMeta.sessionId) {
                sessionStorage.setItem('pr_session_id', sessionMeta.sessionId);
              }
            }
            isRefreshing = false;
            onRefreshed(newAccessToken);
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return api(originalRequest);
          }
        } catch (refreshErr) {
          isRefreshing = false;
          onRefreshed(null);
          clearTabSessionStorage();
          if (
            typeof window !== 'undefined' &&
            window.location.pathname !== '/login' &&
            window.location.pathname !== '/'
          ) {
            window.location.href = '/login?session_expired=true';
          }
          return Promise.reject(refreshErr);
        }
      }

      // If session was revoked, invalidated, or expired without valid refresh token, clear ONLY this tab
      if (
        msg.includes('User account not found') ||
        msg.includes('expired') ||
        msg.includes('Authentication required') ||
        msg.includes('revoked') ||
        msg.includes('Session not found') ||
        msg.includes('Invalid authentication token')
      ) {
        clearTabSessionStorage();
        if (
          typeof window !== 'undefined' &&
          window.location.pathname !== '/login' &&
          window.location.pathname !== '/'
        ) {
          window.location.href = '/login?session_expired=true';
        }
      }
    }

    const message =
      error.response?.data?.message ||
      error.response?.data?.errors?.[0] ||
      (error.code === 'ERR_NETWORK' || error.message === 'Network Error'
        ? 'Cannot connect to backend server (http://localhost:5000). Please ensure the backend server is running and database is reachable.'
        : error.message) ||
      'An unexpected error occurred';
    const customErr = new Error(message);
    customErr.response = error.response;
    customErr.status = error.response?.status;
    return Promise.reject(customErr);
  }
);

export default api;
