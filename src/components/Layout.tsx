import { createContext, useContext, useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Table2,
  Kanban as KanbanIcon,
  BarChart3,
  AlertTriangle,
  AlertCircle,
  Upload,
  CalendarDays,
  Download,
  Search,
  Menu,
  X,
  ChevronLeft,
  LogOut,
  User,
  GitBranch,
  CheckCircle2,
  Wrench,
  Clock,
  FolderKanban,
  BookOpen,
  Tv,
  SlidersHorizontal,
  Cpu,
  DollarSign,
} from 'lucide-react';
import { cn, isAdmin } from '@/lib/utils';
import {
  getExportUrl,
  getToolingExpenses,
  getOpenPurchaseOrders,
  getNcrsRecent,
  getNcrsLast24h,
  getNcrsByAssignee,
  getTimeTracking,
  getTimeTrackingStats,
  getProshopMaterialStatus,
  getMachinesData,
} from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

/** Set to true when a full-screen overlay (e.g. work order drawer) is open so Layout can lock main scroll. */
export const MainScrollLockContext = createContext<((locked: boolean) => void) | null>(null);

function getGreeting(): string {
  const hour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
    10
  );
  if (hour < 12) return 'Good Morning!';
  if (hour < 16) return 'Good Afternoon!';
  return 'Good Evening!';
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mainScrollLocked, setMainScrollLocked] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const admin = isAdmin(user);

  // Preload Proshop data in the background so Analytics, Non-conformances, Time Tracking, Schedule load faster (best-effort, no UI on failure)
  useEffect(() => {
    if (!user) return;
    getToolingExpenses().catch(() => {});
    getOpenPurchaseOrders().catch(() => {});
    getNcrsRecent(10).catch(() => {});
    getNcrsLast24h().catch(() => {});
    getNcrsByAssignee().catch(() => {});
    const today = new Date().toISOString().slice(0, 10);
    getTimeTracking(today).catch(() => {});
    getTimeTrackingStats().catch(() => {});
    getProshopMaterialStatus().catch(() => {});
    getMachinesData().catch(() => {});
  }, [user]);

  const NAV_ITEMS = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/schedule', label: 'Schedule', icon: Table2 },
    { path: '/tools', label: 'Tools', icon: Wrench },
    { path: '/machines', label: 'Machines', icon: Cpu },
    { path: '/calendar', label: 'Calendar', icon: CalendarDays },
    { path: '/non-conformances', label: 'NCRs', icon: AlertCircle },
    { path: '/time-tracking', label: 'Time Tracking', icon: Clock },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/cost-analysis', label: 'Cost Analysis', icon: DollarSign },
    ...(admin
      ? [
          { path: '/kanban', label: 'Kanban', icon: KanbanIcon },
          { path: '/revisions', label: 'Revisions', icon: AlertTriangle },
          { path: '/import', label: 'Import', icon: Upload },
          { path: '/knowledge', label: 'Knowledge', icon: BookOpen },
          { path: '/projects', label: 'Projects', icon: FolderKanban },
          { path: '/versions', label: 'Versions', icon: GitBranch },
          { path: '/completed', label: 'Completed', icon: CheckCircle2 },
          { path: '/tv', label: 'TV', icon: Tv },
          { path: '/tv-config', label: 'TV Config', icon: SlidersHorizontal },
        ]
      : []),
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-zinc-900 border-r border-white/[0.06] transition-all duration-200',
          collapsed ? 'w-16' : 'w-56',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo area */}
        <div className={cn('flex items-center h-14 px-4 border-b border-white/[0.06]', collapsed && 'justify-center px-2')}>
          {!collapsed && (
            <span className="text-sm font-semibold text-zinc-100 truncate">{getGreeting()}</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex ml-auto p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden ml-auto p-1 rounded hover:bg-zinc-800 text-zinc-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
            return (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
                )}
                title={collapsed ? label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom section: export (admin only) + user */}
        <div className={cn('border-t border-white/[0.06]', collapsed && 'px-1')}>
          {admin && (
            <div className={cn('p-2 space-y-1', collapsed && 'px-1')}>
              <a
                href={getExportUrl('xlsx')}
                download
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors',
                  collapsed && 'justify-center px-2'
                )}
                title="Export XLSX"
              >
                <Download className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Export XLSX</span>}
              </a>
            </div>
          )}

          {/* User info + logout */}
          {user && (
            <div className={cn('p-2 border-t border-white/[0.06]', collapsed && 'px-1')}>
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg',
                  collapsed && 'justify-center px-2'
                )}
              >
                <div className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-blue-400" />
                </div>
                {!collapsed && (
                  <button
                    onClick={() => navigate('/settings')}
                    className="text-sm text-zinc-300 truncate flex-1 text-left hover:text-zinc-100 transition-colors"
                    title="Account settings"
                  >
                    {user.displayName}
                  </button>
                )}
                <button
                  onClick={logout}
                  className={cn(
                    'p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors',
                    collapsed && 'ml-0'
                  )}
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center h-14 px-4 lg:px-6 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-zinc-800 text-zinc-400"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 ml-2 lg:ml-0 flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search work orders..."
              className="bg-transparent border-none outline-none text-sm text-zinc-200 placeholder:text-zinc-500 w-full"
            />
          </div>
        </header>

        {/* Page content - overflow hidden when drawer/overlay is open to prevent scroll-to-top */}
        <main className={cn('flex-1 p-6 lg:p-8', mainScrollLocked ? 'overflow-hidden' : 'overflow-y-auto')}>
          <MainScrollLockContext.Provider value={setMainScrollLocked}>
            <Outlet />
          </MainScrollLockContext.Provider>
        </main>
      </div>
    </div>
  );
}
