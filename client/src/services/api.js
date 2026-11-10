import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach bearer token if stored
api.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem('pr_access_token') ||
      sessionStorage.getItem('pr_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to catch unauthorized errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const msg = error.response?.data?.message || '';
      if (
        msg.includes('User account not found') ||
        msg.includes('expired') ||
        msg.includes('Authentication required') ||
        msg.includes('revoked')
      ) {
        localStorage.removeItem('pr_access_token');
        localStorage.removeItem('pr_refresh_token');
        localStorage.removeItem('pr_user');
        localStorage.removeItem('pr_company');
        localStorage.removeItem('pr_remember_me');

        sessionStorage.removeItem('pr_access_token');
        sessionStorage.removeItem('pr_refresh_token');
        sessionStorage.removeItem('pr_user');
        sessionStorage.removeItem('pr_company');
        sessionStorage.removeItem('pr_remember_me');

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
    return Promise.reject(new Error(message));
  }
);

export default api;
