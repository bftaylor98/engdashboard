import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Schedule from '@/pages/Schedule';
import Kanban from '@/pages/Kanban';
import Analytics from '@/pages/Analytics';
import Revisions from '@/pages/RevisionAlerts';
import ImportPage from '@/pages/Import';
import Calendar from '@/pages/Calendar';
import Versions from '@/pages/Versions';
import Completed from '@/pages/Completed';
import Settings from '@/pages/Settings';
import Tools from '@/pages/Tools';
import Machines from '@/pages/Machines';
import TimeTracking from '@/pages/TimeTracking';
import CostAnalysis from '@/pages/CostAnalysis';
import NonConformances from '@/pages/NonConformances';
import Projects from '@/pages/Projects';
import KnowledgeListPage from '@/pages/knowledge/KnowledgeListPage';
import KnowledgeArticlePage from '@/pages/knowledge/KnowledgeArticlePage';
import KnowledgeNewPage from '@/pages/knowledge/KnowledgeNewPage';
import KnowledgeEditPage from '@/pages/knowledge/KnowledgeEditPage';
import TVDashboard from '@/pages/TVDashboard';
import TVConfig from '@/pages/TVConfig';
import { Loader2 } from 'lucide-react';
import { isAdmin } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function ToasterWithTheme() {
  const { theme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={theme === 'light' ? 'light' : 'dark'}
      toastOptions={{
        style: {
          background: theme === 'light' ? '#ffffff' : '#18181b',
          border: theme === 'light' ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
          color: theme === 'light' ? '#18181b' : '#fafafa',
        },
      }}
    />
  );
}

function AppRoutes() {
  const location = useLocation();
  const { user, loading } = useAuth();

  // TV dashboard is public (no login required) for display screens
  if (location.pathname.toLowerCase() === '/tv') {
    return (
      <>
        <ToasterWithTheme />
        <TVDashboard />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-400 gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <ToasterWithTheme />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/machines" element={<Machines />} />
          <Route path="/kanban" element={isAdmin(user) ? <Kanban /> : <Navigate to="/" replace />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/revisions" element={isAdmin(user) ? <Revisions /> : <Navigate to="/" replace />} />
          <Route path="/non-conformances" element={<NonConformances />} />
          <Route path="/import" element={isAdmin(user) ? <ImportPage /> : <Navigate to="/" replace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/versions" element={isAdmin(user) ? <Versions /> : <Navigate to="/" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/knowledge" element={isAdmin(user) ? <KnowledgeListPage /> : <Navigate to="/" replace />} />
          <Route path="/knowledge/new" element={isAdmin(user) ? <KnowledgeNewPage /> : <Navigate to="/" replace />} />
          <Route path="/knowledge/:slug/edit" element={isAdmin(user) ? <KnowledgeEditPage /> : <Navigate to="/" replace />} />
          <Route path="/knowledge/:slug" element={isAdmin(user) ? <KnowledgeArticlePage /> : <Navigate to="/" replace />} />
          <Route path="/time-tracking" element={<TimeTracking />} />
          <Route path="/cost-analysis" element={<CostAnalysis />} />
          <Route path="/projects" element={isAdmin(user) ? <Projects /> : <Navigate to="/" replace />} />
          <Route path="/completed" element={isAdmin(user) ? <Completed /> : <Navigate to="/" replace />} />
          <Route path="/tv-config" element={isAdmin(user) ? <TVConfig /> : <Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <AppRoutes />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
