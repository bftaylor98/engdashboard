/**
 * Centralized in-memory cache store.
 * All ProShop and external data caches live here.
 * Warm functions write via set(). Routes read via get().
 */
import { cacheLog } from './cacheLogger.js';

const store = new Map();

/**
 * Set a cache entry.
 * @param {string} key - Cache key (e.g., 'tooling-expenses', 'ncrs', 'material-status')
 * @param {any} data - The cached response data
 * @param {object} [meta] - Optional metadata (error info, cache key variants, etc.)
 */
export function setCache(key, data, meta = {}) {
  store.set(key, {
    data,
    timestamp: Date.now(),
    error: null,
    ...meta,
  });
  cacheLog.info('cache-store', `Updated: ${key}`);
}

/**
 * Record a cache error (cache data unchanged, but track that the last refresh failed).
 * @param {string} key - Cache key
 * @param {object} error - Error info (e.g., { reason: 'rate_limited', message: '...' })
 */
export function setCacheError(key, error) {
  const existing = store.get(key);
  if (existing) {
    existing.error = error;
    existing.lastErrorAt = Date.now();
  } else {
    store.set(key, {
      data: null,
      timestamp: null,
      error,
      lastErrorAt: Date.now(),
    });
  }
}

/**
 * Get a cache entry.
 * @param {string} key
 * @returns {{ data: any, timestamp: number|null, error: any } | null}
 */
export function getCache(key) {
  return store.get(key) || null;
}

/**
 * Get just the cached data (convenience).
 * @param {string} key
 * @returns {any|null}
 */
export function getCacheData(key) {
  const entry = store.get(key);
  return entry?.data ?? null;
}

/**
 * Get the last error for a cache key (null if no error or if last refresh succeeded).
 * @param {string} key
 * @returns {object|null}
 */
export function getCacheError(key) {
  const entry = store.get(key);
  return entry?.error ?? null;
}

/**
 * Clear the error for a cache key (e.g. after successful refresh).
 * @param {string} key
 */
export function clearCacheError(key) {
  const entry = store.get(key);
  if (entry) entry.error = null;
}

/**
 * Get a status summary of all caches (for debug endpoint).
 * @returns {object}
 */
export function getCacheStatus() {
  const status = {};
  for (const [key, entry] of store.entries()) {
    status[key] = {
      hasData: entry.data != null,
      lastUpdated: entry.timestamp ? new Date(entry.timestamp).toISOString() : null,
      ageMs: entry.timestamp ? Date.now() - entry.timestamp : null,
      error: entry.error,
      lastErrorAt: entry.lastErrorAt ? new Date(entry.lastErrorAt).toISOString() : null,
    };
  }
  return status;
}
