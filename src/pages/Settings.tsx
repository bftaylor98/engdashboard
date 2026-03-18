import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getUserPreferences, updateUserPreferences } from '@/services/api';
import { Loader2, Sun, Moon, User, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme, loading: themeLoading } = useTheme();
  const [saving, setSaving] = useState(false);

  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    setSaving(true);
    try {
      await setTheme(newTheme);
      toast.success(`Theme changed to ${newTheme} mode`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update theme');
    } finally {
      setSaving(false);
    }
  };

  if (themeLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          Settings
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Manage your account preferences</p>
      </div>

      {/* User Info */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Account Information</h2>
            <p className="text-sm text-[var(--text-secondary)]">Your account details</p>
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-sm text-[var(--text-secondary)]">Username</label>
            <p className="text-[var(--text-primary)] font-mono">{user?.username}</p>
          </div>
          <div>
            <label className="text-sm text-[var(--text-secondary)]">Display Name</label>
            <p className="text-[var(--text-primary)]">{user?.displayName}</p>
          </div>
        </div>
      </div>

      {/* Theme Settings */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/30 flex items-center justify-center">
            {theme === 'light' ? (
              <Sun className="w-5 h-5 text-yellow-400" />
            ) : (
              <Moon className="w-5 h-5 text-blue-400" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold">Appearance</h2>
            <p className="text-sm text-[var(--text-secondary)]">Choose your preferred theme</p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleThemeChange('light')}
            disabled={saving || theme === 'light'}
            className={`
              w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all
              ${theme === 'light'
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)]'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <Sun className="w-5 h-5" />
            <div className="flex-1 text-left">
              <div className="font-medium">Light Mode</div>
              <div className="text-xs opacity-75">Bright and clean interface</div>
            </div>
            {theme === 'light' && (
              <div className="w-2 h-2 rounded-full bg-blue-400" />
            )}
          </button>

          <button
            onClick={() => handleThemeChange('dark')}
            disabled={saving || theme === 'dark'}
            className={`
              w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all
              ${theme === 'dark'
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)]'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <Moon className="w-5 h-5" />
            <div className="flex-1 text-left">
              <div className="font-medium">Dark Mode</div>
              <div className="text-xs opacity-75">Easy on the eyes</div>
            </div>
            {theme === 'dark' && (
              <div className="w-2 h-2 rounded-full bg-blue-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


