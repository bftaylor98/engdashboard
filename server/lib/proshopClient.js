/**
 * Shared Proshop API client: auth and GraphQL execution.
 * Used by routes/proshop.js and routes/timeTracking.js.
 */
import { cacheLog } from './cacheLogger.js';

export const PROSHOP_CONFIG = {
  ROOT_URL: process.env.PROSHOP_ROOT_URL || 'https://est.adionsystems.com',
  USERNAME: process.env.PROSHOP_USERNAME || '',
  PASSWORD: process.env.PROSHOP_PASSWORD || '',
  SCOPE: process.env.PROSHOP_SCOPE || 'nonconformancereports:r workorders:r parts:r users:r toolpots:r purchaseorders:r contacts:r customerPo:r estimates:r',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;
const RETRY_DELAY_429_MS = 12000; // 429 Too Many Requests: wait longer before retry

/** Token cache: reuse token until close to expiry to reduce beginsession calls */
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_VALID_BUFFER_MS = 2 * 60 * 1000; // consider valid if at least 2 min left
let tokenCache = null; // { token, expiresAt }

/** Global throttle: one ProShop operation at a time, small delay between to avoid bursts */
const PROSHOP_THROTTLE_DELAY_MS = 300;
let throttleLastDone = 0;
const throttleQueue = [];
let throttleRunning = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a function through the ProShop throttle (one at a time, with delay between).
 */
async function runWithThrottle(fn) {
  return new Promise((resolve, reject) => {
    throttleQueue.push({ fn, resolve, reject });
    drainThrottleQueue();
  });
}

async function drainThrottleQueue() {
  if (throttleRunning || throttleQueue.length === 0) return;
  throttleRunning = true;
  while (throttleQueue.length > 0) {
    const now = Date.now();
    const wait = Math.max(0, throttleLastDone + PROSHOP_THROTTLE_DELAY_MS - now);
    if (wait > 0) await delay(wait);
    const { fn, resolve, reject } = throttleQueue.shift();
    try {
      const result = await fn();
      throttleLastDone = Date.now();
      resolve(result);
    } catch (err) {
      throttleLastDone = Date.now();
      reject(err);
    }
  }
  throttleRunning = false;
}

/**
 * Retry an async function on transient failures (network, 5xx, 429).
 * Do not retry on 4xx (e.g. 401 auth failure), except 429.
 * On 429, uses Retry-After header if present for wait time.
 */
async function withRetry(fn, { isRetryable } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) break;
      if (isRetryable && !isRetryable(err)) break;
      let waitMs = (err.status === 429) ? RETRY_DELAY_429_MS : RETRY_DELAY_MS;
      if (err.status === 429 && err.retryAfter != null) {
        const sec = parseInt(err.retryAfter, 10);
        if (!isNaN(sec)) waitMs = Math.max(1000, Math.min(sec * 1000, 60000));
      }
      await delay(waitMs);
    }
  }
  throw lastError;
}

/**
 * Check if error is from ProShop rate limit (429) or bad request (400).
 */
export function isProshopRateLimitError(err) {
  if (!err || typeof err.status !== 'number') return false;
  return err.status === 429 || err.status === 400;
}

/**
 * Authenticate with Proshop API and get session token (with retries).
 * Reuses cached token if still valid (expiry > 2 min from now).
 */
export async function getProshopToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + TOKEN_VALID_BUFFER_MS) {
    return tokenCache.token;
  }
  return runWithThrottle(() =>
    withRetry(async () => {
      const response = await fetch(`${PROSHOP_CONFIG.ROOT_URL}/api/beginsession`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: PROSHOP_CONFIG.USERNAME,
          password: PROSHOP_CONFIG.PASSWORD,
          scope: PROSHOP_CONFIG.SCOPE,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let detail = text;
        try {
          const parsed = JSON.parse(text);
          detail = parsed.message || parsed.error || JSON.stringify(parsed);
        } catch (_) {}
        cacheLog.error('proshop-client', 'beginsession failed:', response.status, detail);
        const e = new Error(`Proshop authentication failed: ${response.status}`);
        e.status = response.status;
        if (response.status === 429 || response.status === 400) {
          e.isRateLimit = true;
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) e.retryAfter = retryAfter;
        }
        throw e;
      }

      const data = await response.json();
      const token = data.authorizationResult.token;
      tokenCache = {
        token,
        expiresAt: now + TOKEN_CACHE_TTL_MS,
      };
      return token;
    }, {
      isRetryable(err) {
        const msg = err.message || '';
        if (msg.includes('401') || msg.includes('403')) return false;
        return true;
      },
    })
  );
}

/**
 * Execute GraphQL query against Proshop API (with retries).
 * Runs through global throttle to avoid bursts.
 */
export async function executeGraphQLQuery(query, variables, token) {
  return runWithThrottle(() =>
    withRetry(async () => {
      const response = await fetch(`${PROSHOP_CONFIG.ROOT_URL}/api/graphql`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const text = await response.text();
        let detail = text;
        try {
          const parsed = JSON.parse(text);
          detail = parsed.message || parsed.error || JSON.stringify(parsed);
        } catch (_) {}
        cacheLog.error('proshop-client', 'GraphQL non-OK:', response.status, detail);
        const e = new Error(`GraphQL request failed: ${response.status}`);
        e.status = response.status;
        e.detail = detail;
        if (response.status === 429 || response.status === 400) {
          e.isRateLimit = true;
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) e.retryAfter = retryAfter;
        }
        throw e;
      }

      const body = await response.json();

      if (body.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
      }

      return body.data;
    }, {
      isRetryable(err) {
        const status = err.status;
        if (status != null && status >= 400 && status < 500 && status !== 429) return false;
        return true;
      },
    })
  );
}
