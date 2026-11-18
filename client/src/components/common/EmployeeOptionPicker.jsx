import React, { useEffect, useMemo, useRef } from 'react';
import { Search, RefreshCw, X } from 'lucide-react';

const formatEmployeeLabel = (emp) => `${emp.firstName} ${emp.lastName} (${emp.employeeId})`;

/**
 * Reusable lightweight employee selector supporting single (<select>) and multi (checkbox)
 * workflows with server search, Load More pagination, loading/empty/error/retry states,
 * and selection preservation across search and pagination transitions.
 */
export default function EmployeeOptionPicker({
  mode = 'single',
  label,
  required = false,
  emptyOptionLabel = '',
  value,
  onChange,
  employeeOptions,
}) {
  const {
    options = [],
    pagination = { total: 0, page: 1, pages: 1 },
    loading = false,
    loadingMore = false,
    error = null,
    hasMore = false,
    search = '',
    setSearch,
    clearSearch,
    loadMore,
    retry,
  } = employeeOptions || {};

  // Cache seen employee objects so existing selections keep their display labels even when
  // filtered out by a temporary search query or before reloading after reopen.
  const knownByIdRef = useRef(new Map());

  useEffect(() => {
    for (const emp of options) {
      if (emp?._id) {
        knownByIdRef.current.set(emp._id, emp);
      }
    }
  }, [options]);

  const singleDisplayOptions = useMemo(() => {
    if (mode !== 'single') return options;
    if (!value || options.some((emp) => emp._id === value)) {
      return options;
    }
    const remembered = knownByIdRef.current.get(value);
    return remembered ? [remembered, ...options] : options;
  }, [mode, options, value]);

  const totalCount = pagination?.total ?? options.length;

  const toggleMultiId = (empId, checked) => {
    const current = Array.isArray(value) ? value : [];
    if (checked) {
      if (!current.includes(empId)) {
        onChange([...current, empId]);
      }
    } else {
      onChange(current.filter((id) => id !== empId));
    }
  };

  return (
    <div className="space-y-2">
      {label && <label className="block font-bold text-slate-700">{label}</label>}

      {/* Server-side Search Box */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          aria-label="Search employees"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, employee ID, or email..."
          className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear employee search"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div role="status" className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
          <span>Loading employees...</span>
        </div>
      )}

      {/* Error + Retry State */}
      {error && (
        <div
          role="alert"
          className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between gap-2 text-[11px]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={retry}
            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Selector Body */}
      {mode === 'single' ? (
        <select
          aria-label={label || 'Employee'}
          required={required}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs"
        >
          {emptyOptionLabel && <option value="">{emptyOptionLabel}</option>}
          {!emptyOptionLabel && singleDisplayOptions.length === 0 && (
            <option value="">
              {loading ? 'Loading employees...' : 'No active employees found'}
            </option>
          )}
          {singleDisplayOptions.map((emp) => (
            <option key={emp._id} value={emp._id}>
              {formatEmployeeLabel(emp)}
            </option>
          ))}
        </select>
      ) : (
        <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {options.length === 0 && !loading ? (
            <div className="p-3 text-slate-400 text-center space-y-1.5">
              <p>{search.trim() ? 'No matching active employees found.' : 'No active employees found.'}</p>
              {search.trim() && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="text-blue-600 hover:text-blue-800 font-bold text-[11px]"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            options.map((emp) => {
              const selectedList = Array.isArray(value) ? value : [];
              const checked = selectedList.includes(emp._id);
              return (
                <label
                  key={emp._id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <div>
                    <span className="font-semibold text-slate-800">
                      {emp.firstName} {emp.lastName}
                    </span>
                    <span className="ml-2 text-[10px] text-slate-400 font-mono">{emp.employeeId}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleMultiId(emp._id, e.target.checked)}
                  />
                </label>
              );
            })
          )}
        </div>
      )}

      {/* Empty Search Helper for Single Select */}
      {mode === 'single' && !loading && !error && options.length === 0 && (
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>{search.trim() ? 'No matching active employees found.' : 'No active employees found.'}</span>
          {search.trim() && (
            <button
              type="button"
              onClick={clearSearch}
              className="text-blue-600 hover:text-blue-800 font-bold"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Pagination Footer */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
          <span>
            Showing {options.length} of {totalCount} active employees
          </span>
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {loadingMore ? 'Loading more...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
