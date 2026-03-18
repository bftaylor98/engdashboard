import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, Plus, Pencil, Trash2, Check, X, FolderKanban, Calendar, User } from 'lucide-react';
import { format as dateFnsFormat } from 'date-fns';
import { toast } from 'sonner';
import { getProjects, createProject, updateProject, deleteProject } from '@/services/api';
import type { SideProject } from '@/types';
import { ASSIGNEES } from '@/types';
import { cn } from '@/lib/utils';

const emptyForm = { title: '', description: '', assignee: '', dueDate: '' };

export default function Projects() {
  const [list, setList] = useState<SideProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; description: string; assignee: string; dueDate: string }>(emptyForm);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getProjects();
      if (res.success) setList(res.data);
      else setList([]);
    } catch (err) {
      toast.error('Failed to load projects');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleAdd = useCallback(async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!form.assignee.trim()) {
      toast.error('Assignee is required');
      return;
    }
    try {
      const res = await createProject({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assignee: form.assignee.trim(),
        dueDate: form.dueDate.trim() || undefined,
      });
      if (res.success) {
        setList((prev) => [res.data, ...prev]);
        setForm(emptyForm);
        setAdding(false);
        toast.success('Project added');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add project');
    }
  }, [form]);

  const startEdit = useCallback((p: SideProject) => {
    setEditingId(p.id);
    setEditForm({
      title: p.title,
      description: p.description ?? '',
      assignee: p.assignee,
      dueDate: p.dueDate ?? '',
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm(emptyForm);
  }, []);

  const handleUpdate = useCallback(
    async (id: number) => {
      const p = list.find((x) => x.id === id);
      if (!p) return;
      try {
        const res = await updateProject(id, {
          title: editForm.title.trim(),
          description: editForm.description.trim() || undefined,
          assignee: editForm.assignee.trim(),
          dueDate: editForm.dueDate.trim() || null,
        });
        if (res.success) {
          setList((prev) => prev.map((x) => (x.id === id ? res.data : x)));
          setEditingId(null);
          setEditForm(emptyForm);
          toast.success('Project updated');
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to update project');
      }
    },
    [list, editForm]
  );

  const handleMarkDone = useCallback(
    async (p: SideProject) => {
      try {
        const res = await updateProject(p.id, { status: 'done' });
        if (res.success) {
          setList((prev) => prev.map((x) => (x.id === p.id ? res.data : x)));
          toast.success('Marked as done');
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to update');
      }
    },
    []
  );

  const handleMarkActive = useCallback(
    async (p: SideProject) => {
      try {
        const res = await updateProject(p.id, { status: 'active' });
        if (res.success) {
          setList((prev) => prev.map((x) => (x.id === p.id ? res.data : x)));
          toast.success('Marked as active');
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to update');
      }
    },
    []
  );

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('Delete this project?')) return;
    try {
      await deleteProject(id);
      setList((prev) => prev.filter((x) => x.id !== id));
      if (editingId === id) setEditingId(null);
      toast.success('Project deleted');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    }
  }, [editingId]);

  const activeList = list.filter((p) => p.status === 'active');
  const doneList = list.filter((p) => p.status === 'done');

  // Group active projects by assignee (order by ASSIGNEES)
  const activeByAssignee = useMemo(() => {
    const map = new Map<string, SideProject[]>();
    for (const p of activeList) {
      const arr = map.get(p.assignee) ?? [];
      arr.push(p);
      map.set(p.assignee, arr);
    }
    return ASSIGNEES.filter((a) => map.has(a)).map((assignee) => ({
      assignee,
      projects: map.get(assignee)!,
    }));
  }, [activeList]);

  const formatDate = (isoOrYmd: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrYmd)) {
      return dateFnsFormat(new Date(isoOrYmd + 'T12:00:00'), 'MMM d, yyyy');
    }
    return dateFnsFormat(new Date(isoOrYmd), 'MMM d, yyyy');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-[var(--text-muted)]" />
            Side Projects
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Simple tasks like &quot;buy a tool&quot; — assign to a team member; they see them on their dashboard.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add project
          </button>
        )}
      </div>

      {adding && (
        <div className="card p-4 space-y-3">
          <h3 className="font-medium text-[var(--text-primary)]">New project</h3>
          <input
            type="text"
            placeholder="Title (e.g. Buy a tool)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="input w-full"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="input w-full"
          />
          <select
            value={form.assignee}
            onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
            className="select"
          >
            <option value="">Assign to…</option>
            {ASSIGNEES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Due date (optional)</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="input w-full"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd} className="btn-primary flex items-center gap-1">
              <Check className="w-4 h-4" /> Save
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setForm(emptyForm); }}
              className="btn-ghost flex items-center gap-1"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : (
        <>
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Active — by assignee</h2>
            {activeList.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm py-4">No active projects. Add one above.</p>
            ) : (
              <div className="space-y-6">
                {activeByAssignee.map(({ assignee, projects }) => (
                  <div key={assignee}>
                    <h3 className="text-sm font-medium text-[var(--text-secondary)] flex items-center gap-2 mb-2">
                      <User className="w-4 h-4" /> {assignee}
                    </h3>
                    <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                      {projects.map((p) => (
                        <li key={p.id} className="py-3 px-3 flex items-start justify-between gap-4 bg-[var(--bg-elevated)]">
                          {editingId === p.id ? (
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={editForm.title}
                                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                                className="input w-full"
                              />
                              <input
                                type="text"
                                placeholder="Description"
                                value={editForm.description}
                                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                                className="input w-full"
                              />
                              <select
                                value={editForm.assignee}
                                onChange={(e) => setEditForm((f) => ({ ...f, assignee: e.target.value }))}
                                className="select"
                              >
                                {ASSIGNEES.map((a) => (
                                  <option key={a} value={a}>{a}</option>
                                ))}
                              </select>
                              <div>
                                <label className="block text-xs text-[var(--text-muted)] mb-1">Due date</label>
                                <input
                                  type="date"
                                  value={editForm.dueDate}
                                  onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                                  className="input w-full"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => handleUpdate(p.id)} className="btn-primary text-sm">
                                  Save
                                </button>
                                <button type="button" onClick={cancelEdit} className="btn-ghost text-sm">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="min-w-0">
                                <p className="font-medium text-[var(--text-primary)]">{p.title}</p>
                                {p.description && (
                                  <p className="text-sm text-[var(--text-muted)] mt-0.5">{p.description}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-[var(--text-muted)]">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Assigned {formatDate(p.assignedAt)}
                                  </span>
                                  {p.dueDate && (
                                    <span className="flex items-center gap-1">
                                      Due {formatDate(p.dueDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => startEdit(p)}
                                  className="p-2 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                  title="Edit"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDone(p)}
                                  className="p-2 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
                                  title="Mark done"
                                >
                                  Done
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(p.id)}
                                  className="p-2 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {doneList.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-3 text-[var(--text-secondary)]">Done</h2>
              <ul className="divide-y divide-[var(--border-subtle)]">
                {doneList.map((p) => (
                  <li key={p.id} className="py-3 flex items-center justify-between gap-4 opacity-80">
                    <div>
                      <p className="font-medium text-[var(--text-secondary)] line-through">{p.title}</p>
                      {p.description && (
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">{p.description}</p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {p.assignee}
                        {p.dueDate && ` · Due ${formatDate(p.dueDate)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMarkActive(p)}
                        className="text-xs text-accent hover:underline"
                      >
                        Mark active
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="p-2 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
