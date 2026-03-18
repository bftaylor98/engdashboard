import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, RotateCcw, Trash2, Save, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { getVersions, createVersion, restoreVersion, deleteVersion } from '@/services/api';
import type { Version } from '@/types';
import { useSSE } from '@/hooks/useSSE';
import { cn, formatDate } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Versions() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState<Version | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<Version | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDesc, setNewVersionDesc] = useState('');

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getVersions();
      if (res.success) {
        setVersions(res.data);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Listen for version restore events
  useSSE(useCallback((eventName) => {
    if (eventName === 'version:restored') {
      toast.info('A version restore was performed. Please refresh the page.');
      fetchVersions();
    }
  }, [fetchVersions]));

  const openSaveAsNewVersion = () => {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10);
    setNewVersionName(`Snapshot ${dateStr}`);
    setNewVersionDesc('');
    setShowCreateDialog(true);
  };

  const handleCreate = async () => {
    if (!newVersionName.trim()) {
      toast.error('Version name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await createVersion(newVersionName.trim(), newVersionDesc.trim() || undefined);
      if (res.success) {
        toast.success(`Version ${res.data.versionNumber} created: ${res.data.name}`);
        setShowCreateDialog(false);
        setNewVersionName('');
        setNewVersionDesc('');
        await fetchVersions();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create version');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (version: Version) => {
    setRestoring(true);
    try {
      const res = await restoreVersion(version.versionNumber);
      if (res.success) {
        toast.success(res.data.message || `Restored to version ${version.versionNumber}`);
        if (res.data.warning) {
          toast.warning(res.data.warning);
        }
        setShowRestoreDialog(null);
        // Note: Server will need restart after restore
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore version');
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (version: Version) => {
    setDeleting(true);
    try {
      const res = await deleteVersion(version.versionNumber);
      if (res.success) {
        toast.success(res.data.message || `Version ${version.versionNumber} deleted`);
        setShowDeleteDialog(null);
        await fetchVersions();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete version');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Version Management</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Create snapshots and restore previous database states
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSaveAsNewVersion}
            className="btn-secondary flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Save as new version
          </button>
          <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <Dialog.Trigger asChild>
              <button className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create Version
              </button>
            </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60]" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-lg p-6 z-[61] min-w-[400px]">
              <Dialog.Title className="text-lg font-bold text-[var(--text-primary)] mb-2">Create New Version</Dialog.Title>
              <Dialog.Description className="text-sm text-[var(--text-secondary)] mb-4">
                Create a snapshot of the current database state and customer abbreviations.
              </Dialog.Description>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5">Name *</label>
                  <input
                    type="text"
                    value={newVersionName}
                    onChange={e => setNewVersionName(e.target.value)}
                    placeholder="e.g., Before major import"
                    className="input w-full"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5">Description</label>
                  <textarea
                    value={newVersionDesc}
                    onChange={e => setNewVersionDesc(e.target.value)}
                    placeholder="Optional description of this version..."
                    rows={3}
                    className="input w-full resize-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6">
                <Dialog.Close asChild>
                  <button className="btn-secondary text-xs" disabled={creating}>Cancel</button>
                </Dialog.Close>
                <button onClick={handleCreate} disabled={creating || !newVersionName.trim()} className="btn-primary text-xs">
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Create
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        </div>
      </div>

      {/* Versions Table */}
      {versions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--text-secondary)]">No versions created yet</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">Create your first version to get started</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  <th className="text-left px-4 py-3 text-caption font-semibold uppercase">Version</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold uppercase">Description</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold uppercase">Created</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold uppercase">By</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold uppercase">Records</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold uppercase">Size</th>
                  <th className="text-right px-4 py-3 text-caption font-semibold uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-bold text-accent">v{v.versionNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--text-primary)]">{v.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--text-secondary)]">{v.description || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[var(--text-muted)]">{formatDate(v.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[var(--text-muted)]">{v.createdByName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[var(--text-muted)]">{v.recordCount?.toLocaleString() || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[var(--text-muted)]">{formatFileSize(v.fileSize)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setShowRestoreDialog(v)}
                          className="btn-secondary text-xs flex items-center gap-1.5"
                          title="Restore this version"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                        <button
                          onClick={() => setShowDeleteDialog(v)}
                          className="btn-secondary text-xs flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          title="Delete this version"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      {showRestoreDialog && (
        <Dialog.Root open={!!showRestoreDialog} onOpenChange={(open) => !open && setShowRestoreDialog(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60]" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-lg p-6 z-[61] min-w-[400px]">
              <Dialog.Title className="text-lg font-bold text-[var(--text-primary)] mb-2">Restore Version</Dialog.Title>
              <Dialog.Description className="text-sm text-[var(--text-secondary)] mb-4">
                Are you sure you want to restore to <span className="font-bold text-accent">Version {showRestoreDialog.versionNumber}: {showRestoreDialog.name}</span>?
                <br />
                <span className="text-[var(--text-muted)]">This will replace the current database with the snapshot. A safety backup will be created automatically.</span>
              </Dialog.Description>
              <div className="flex items-center justify-end gap-3">
                <Dialog.Close asChild>
                  <button className="btn-secondary text-xs" disabled={restoring}>Cancel</button>
                </Dialog.Close>
                <button onClick={() => handleRestore(showRestoreDialog)} disabled={restoring} className="btn-primary text-xs bg-orange-600 hover:bg-orange-700">
                  {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Restore
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <Dialog.Root open={!!showDeleteDialog} onOpenChange={(open) => !open && setShowDeleteDialog(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60]" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-lg p-6 z-[61] min-w-[400px]">
              <Dialog.Title className="text-lg font-bold text-[var(--text-primary)] mb-2">Delete Version</Dialog.Title>
              <Dialog.Description className="text-sm text-[var(--text-secondary)] mb-4">
                Are you sure you want to delete <span className="font-bold text-accent">Version {showDeleteDialog.versionNumber}: {showDeleteDialog.name}</span>?
                <br />
                <span className="text-[var(--text-muted)]">This action cannot be undone.</span>
              </Dialog.Description>
              <div className="flex items-center justify-end gap-3">
                <Dialog.Close asChild>
                  <button className="btn-secondary text-xs" disabled={deleting}>Cancel</button>
                </Dialog.Close>
                <button onClick={() => handleDelete(showDeleteDialog)} disabled={deleting} className="btn-primary text-xs bg-red-600 hover:bg-red-700">
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Delete
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}


