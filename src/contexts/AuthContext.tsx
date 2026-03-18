import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface User {
  id: string;
  username: string;
  displayName: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_BASE = '/api';
const TOKEN_KEY = 'auth_token';
const AUTH_ME_TIMEOUT_MS = 15000; // Stop blocking the whole app if backend is slow or unreachable

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  // On mount (or token change), validate the stored token (with timeout so app never spins forever)
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('invalid');
        const text = await r.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          throw new Error('invalid');
        }
      })
      .then((body) => {
        if (cancelled) return;
        if (body?.data) {
          setUser(body.data);
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.name === 'AbortError') {
          // Timeout: backend didn't respond in time; clear session so user can retry
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [token]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const text = await res.text();
    let body: { success?: boolean; error?: string; data?: { token: string; user: User } };
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.ok ? 'Invalid response from server' : `Login failed (${res.status}). Check that the API is running and reachable.`);
    }

    if (!res.ok || !body.success) {
      throw new Error(body.error || 'Login failed');
    }

    if (!body.data?.token || !body.data?.user) {
      throw new Error('Invalid response from server');
    }

    localStorage.setItem(TOKEN_KEY, body.data.token);
    setToken(body.data.token);
    setUser(body.data.user);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore network errors on logout
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}




