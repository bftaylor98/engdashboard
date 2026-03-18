import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getUserPreferences, updateUserPreferences } from '@/services/api';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  toggleTheme: () => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>('dark');
  const [loading, setLoading] = useState(true);

  // Load theme from user preferences on mount
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getUserPreferences()
      .then((response) => {
        if (!cancelled && response.success) {
          const preferences = response.data;
          if (preferences.theme && (preferences.theme === 'light' || preferences.theme === 'dark')) {
            setThemeState(preferences.theme);
            applyTheme(preferences.theme);
          } else {
            // Default to dark if no preference
            applyTheme('dark');
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load theme preferences:', err);
        if (!cancelled) {
          applyTheme('dark');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Apply theme class to document root
  const applyTheme = useCallback((newTheme: Theme) => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(newTheme);
  }, []);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);

    // Save to database
    try {
      await updateUserPreferences({ theme: newTheme });
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }
  }, [applyTheme]);

  const toggleTheme = useCallback(async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    await setTheme(newTheme);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}


