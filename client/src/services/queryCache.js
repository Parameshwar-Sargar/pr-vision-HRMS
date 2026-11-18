/**
 * PR VISION HRMS — Frontend In-Flight Request Deduplication & Query Cache
 * Provides per-tab, in-memory request coalescing, TTL-based caching,
 * granular tag invalidation, and complete cache purging on logout.
 */

class QueryCache {
  constructor() {
    this.cache = new Map();
    this.inFlightRequests = new Map();
  }

  /**
   * Generates a deterministic cache key from method, URL, and query params.
   */
  generateKey(method = 'get', url = '', params = {}) {
    const sortedParams = params
      ? Object.keys(params)
          .sort()
          .reduce((acc, k) => {
            if (params[k] !== undefined && params[k] !== null) {
              acc[k] = params[k];
            }
            return acc;
          }, {})
      : {};
    return `${method.toLowerCase()}:${url.replace(/\/$/, '')}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Determines module cache tag from a request URL.
   */
  getModuleTag(url = '') {
    const cleanUrl = url.toLowerCase();
    if (cleanUrl.includes('/departments')) return 'departments';
    if (cleanUrl.includes('/designations')) return 'designations';
    if (cleanUrl.includes('/organization/branches') || cleanUrl.includes('/branches')) return 'branches';
    if (cleanUrl.includes('/organization/settings') || cleanUrl.includes('/organization')) return 'company';
    if (cleanUrl.includes('/shifts')) return 'shifts';
    if (cleanUrl.includes('/leaves/types')) return 'leaveTypes';
    if (cleanUrl.includes('/leaves')) return 'leaves';
    if (cleanUrl.includes('/holidays')) return 'holidays';
    if (cleanUrl.includes('/employees')) return 'employees';
    if (cleanUrl.includes('/attendance')) return 'attendance';
    if (cleanUrl.includes('/payroll')) return 'payroll';
    if (cleanUrl.includes('/recruitment')) return 'recruitment';
    if (cleanUrl.includes('/performance')) return 'performance';
    if (cleanUrl.includes('/training')) return 'training';
    if (cleanUrl.includes('/dashboard')) return 'dashboard';
    if (cleanUrl.includes('/notifications')) return 'notifications';
    if (cleanUrl.includes('/reports')) return 'reports';
    if (cleanUrl.includes('/assets')) return 'assets';
    if (cleanUrl.includes('/expenses')) return 'expenses';
    if (cleanUrl.includes('/grievances')) return 'grievances';
    if (cleanUrl.includes('/documents')) return 'documents';
    if (cleanUrl.includes('/announcements')) return 'announcements';
    if (cleanUrl.includes('/auth/sessions')) return 'sessions';
    if (cleanUrl.includes('/auth/me')) return 'auth';
    if (cleanUrl.includes('/system')) return 'system';
    return 'generic';
  }

  /**
   * Determines which cache tags must be invalidated when a mutation succeeds.
   */
  getAffectedTags(method = 'post', url = '') {
    const tag = this.getModuleTag(url);
    const cleanUrl = url.toLowerCase();
    const affected = new Set([tag]);

    // Cross-module dependencies
    if (tag === 'attendance' || tag === 'payroll') {
      affected.add('dashboard');
      affected.add('reports');
    }
    if (tag === 'leaves') {
      affected.add('dashboard');
      affected.add('attendance');
      affected.add('reports');
      if (cleanUrl.includes('/cancel')) {
        affected.add('payroll');
      }
    }
    if (tag === 'holidays') {
      affected.add('dashboard');
      affected.add('leaves');
    }
    if (tag === 'expenses' || tag === 'announcements') {
      affected.add('dashboard');
    }
    if (tag === 'employees') {
      affected.add('dashboard');
      affected.add('master-data');
      affected.add('reports');
    }
    if (tag === 'recruitment') {
      affected.add('dashboard');
      if (cleanUrl.includes('/convert') || cleanUrl.includes('/status')) {
        affected.add('employees');
        affected.add('master-data');
        affected.add('reports');
      }
    }
    if (tag === 'departments') {
      affected.add('master-data');
      affected.add('departments');
      affected.add('designations');
      affected.add('reports');
    }
    if (tag === 'designations') {
      affected.add('master-data');
      affected.add('designations');
    }
    if (tag === 'branches') {
      affected.add('master-data');
      affected.add('branches');
      affected.add('company');
    }
    if (tag === 'shifts') {
      affected.add('master-data');
      affected.add('shifts');
    }
    if (tag === 'leaveTypes') {
      affected.add('master-data');
      affected.add('leaveTypes');
      affected.add('leaves');
    }
    if (tag === 'company') {
      affected.add('master-data');
    }

    return Array.from(affected);
  }

  /**
   * Retrieves a cached response if unexpired.
   */
  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  /**
   * Executes a request with in-flight deduplication and optional caching.
   * If an identical request is currently in-flight, returns the existing Promise.
   */
  _createCanceledError() {
    const err = new Error('canceled');
    err.name = 'CanceledError';
    err.code = 'ERR_CANCELED';
    return err;
  }

  _ensureMeta() {
    if (!this.tagVersions) this.tagVersions = new Map();
    if (!this.stats) {
      this.stats = {
        hits: 0,
        misses: 0,
        coalesced: 0,
        aborted: 0,
        invalidations: 0,
      };
    }
  }

  bumpTagVersions(tags = []) {
    this._ensureMeta();
    this.stats.invalidations += 1;
    tags.forEach((tag) => {
      this.tagVersions.set(tag, (this.tagVersions.get(tag) || 0) + 1);
    });
  }

  getStats() {
    this._ensureMeta();
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      inFlightSize: this.inFlightRequests.size,
    };
  }

  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      coalesced: 0,
      aborted: 0,
      invalidations: 0,
    };
  }

  async deduplicate(key, requestFn, { ttl = 0, tags = [], signal = null } = {}) {
    this._ensureMeta();

    if (signal?.aborted) {
      this.stats.aborted += 1;
      throw this._createCanceledError();
    }

    // 1. Check if cached
    if (ttl > 0) {
      const cached = this.getCached(key);
      if (cached !== null) {
        this.stats.hits += 1;
        return cached;
      }
    }

    const resolvedTags = tags.length > 0 ? tags : [this.getModuleTag(key)];

    // 2. Check if identical active request is currently in-flight
    let entry = this.inFlightRequests.get(key);
    if (entry && entry.controller && !entry.controller.signal.aborted) {
      this.stats.coalesced += 1;
    } else {
      this.stats.misses += 1;
      const controller = new AbortController();
      const tagVersionSnapshot = new Map(
        resolvedTags.map((tag) => [tag, this.tagVersions.get(tag) || 0])
      );

      entry = {
        controller,
        subscribers: new Set(),
      };

      this.inFlightRequests.set(key, entry);

      // Kick off single shared underlying request immediately while catching synchronous throws
      (() => {
        try {
          return Promise.resolve(requestFn(controller.signal));
        } catch (syncErr) {
          return Promise.reject(syncErr);
        }
      })().then(
          (data) => {
            const isCurrentEntry = this.inFlightRequests.get(key) === entry;
            if (isCurrentEntry) {
              this.inFlightRequests.delete(key);
            }

            const mutatedInFlight = resolvedTags.some(
              (tag) => (this.tagVersions.get(tag) || 0) !== tagVersionSnapshot.get(tag)
            );

            if (ttl > 0 && data && isCurrentEntry && !mutatedInFlight && !controller.signal.aborted) {
              this.cache.set(key, {
                data,
                expiresAt: Date.now() + ttl,
                tags: resolvedTags,
              });
            }

            const subs = Array.from(entry.subscribers);
            entry.subscribers.clear();
            subs.forEach((sub) => sub.resolve(data));
          },
          (err) => {
            if (this.inFlightRequests.get(key) === entry) {
              this.inFlightRequests.delete(key);
            }
            const subs = Array.from(entry.subscribers);
            entry.subscribers.clear();
            subs.forEach((sub) => sub.reject(err));
          }
        );
    }

    // 3. Attach isolated per-caller promise so one caller's abort doesn't cancel sibling callers
    return new Promise((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        entry.subscribers.delete(subscriber);
        this.stats.aborted += 1;
        reject(this._createCanceledError());

        // Defer abort of shared request until current microtask turn completes, so React 18
        // StrictMode immediate remounts coalesce onto the live in-flight request safely.
        queueMicrotask(() => {
          if (
            entry.subscribers.size === 0 &&
            !entry.controller.signal.aborted &&
            this.inFlightRequests.get(key) === entry
          ) {
            this.inFlightRequests.delete(key);
            entry.controller.abort();
          }
        });
      };

      const subscriber = {
        resolve: (data) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          resolve(data);
        },
        reject: (err) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          reject(err);
        },
      };

      entry.subscribers.add(subscriber);
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * Invalidates all cache entries associated with one or more tags.
   */
  invalidateTags(tags = []) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    if (tagList.length === 0) return;

    for (const [key, entry] of this.cache.entries()) {
      const hasMatch = entry.tags?.some((t) => tagList.includes(t));
      if (hasMatch) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Completely purges all cached queries and in-flight promises (used on logout).
   */
  clear() {
    this.cache.clear();
    this.inFlightRequests.clear();
  }
}

export const queryCache = new QueryCache();
export default queryCache;

