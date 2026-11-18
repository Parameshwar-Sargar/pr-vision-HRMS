import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * Fetches lightweight employee dropdown options from GET /api/v1/employees/options
 * with debounced server search, Load More pagination, in-flight cancellation,
 * stale-response guarding, and queryCache integration.
 */
export function useEmployeeOptions({
  enabled = false,
  departmentId = '',
  branchId = '',
  status = '',
  includeInactive = false,
  includeSelf = false,
  limit = 20,
  debounceMs = 250,
} = {}) {
  const [options, setOptions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const reqSeqRef = useRef(0);
  const activeControllerRef = useRef(null);

  // Debounce free-text search input before issuing server queries
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === debouncedSearch) return undefined;
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [searchInput, debouncedSearch, debounceMs]);

  const executeFetch = useCallback(
    async ({ page = 1, append = false, search = '' } = {}) => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const seq = ++reqSeqRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = { page, limit };
        if (search) params.search = search;
        if (departmentId) params.departmentId = departmentId;
        if (branchId) params.branchId = branchId;
        if (status) params.status = status;
        if (includeInactive) params.includeInactive = 'true';
        if (includeSelf) params.includeSelf = 'true';

        const res = await api.get('/employees/options', {
          params,
          signal: controller.signal,
          cacheTtl: 60000,
        });

        if (controller.signal.aborted || seq !== reqSeqRef.current) {
          return;
        }

        const list = res?.data?.employees || res?.employees || [];
        const meta = res?.data?.pagination ||
          res?.pagination || {
            total: list.length,
            page,
            pages: 1,
            limit,
          };

        setOptions((prev) => {
          if (!append) return list;
          const seen = new Set(prev.map((item) => item._id));
          const additions = list.filter((item) => item?._id && !seen.has(item._id));
          return [...prev, ...additions];
        });
        setPagination(meta);
      } catch (err) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          return;
        }
        if (seq !== reqSeqRef.current) {
          return;
        }
        setError(err?.response?.data?.message || err?.message || 'Failed to load employee options.');
      } finally {
        if (seq === reqSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [branchId, departmentId, includeInactive, includeSelf, limit, status]
  );

  useEffect(() => {
    if (!enabled) {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
      reqSeqRef.current += 1;
      setLoading(false);
      setLoadingMore(false);
      return undefined;
    }

    executeFetch({ page: 1, append: false, search: debouncedSearch });

    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
      reqSeqRef.current += 1;
    };
  }, [enabled, debouncedSearch, executeFetch, reloadNonce]);

  // Refresh open selector automatically when employee/recruitment mutations invalidate 'employees' tag
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const onMutated = (e) => {
      const affected = e?.detail?.affectedTags || [];
      if (affected.includes('employees')) {
        setReloadNonce((n) => n + 1);
      }
    };
    window.addEventListener('hrms:data-mutated', onMutated);
    return () => window.removeEventListener('hrms:data-mutated', onMutated);
  }, [enabled]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore) return;
    if ((pagination?.page || 1) >= (pagination?.pages || 1)) return;
    executeFetch({
      page: (pagination?.page || 1) + 1,
      append: true,
      search: debouncedSearch,
    });
  }, [debouncedSearch, enabled, executeFetch, loading, loadingMore, pagination]);

  const retry = useCallback(() => {
    if (!enabled) return;
    setReloadNonce((n) => n + 1);
  }, [enabled]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
  }, []);

  const hasMore = (pagination?.page || 1) < (pagination?.pages || 1);

  return {
    options,
    pagination,
    loading,
    loadingMore,
    error,
    hasMore,
    search: searchInput,
    debouncedSearch,
    setSearch: setSearchInput,
    clearSearch,
    loadMore,
    retry,
  };
}

export default useEmployeeOptions;
