import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Save, Loader2, Trash2, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import type { WorkOrder } from '@/types';
import { ASSIGNEES, STATUS_OPTIONS, MATERIAL_OPTIONS, PRIORITY_LABELS, PRIORITY_COLORS, CUSTOMERS } from '@/types';
import { cn, formatDate, erpWorkOrderUrl, erpQuoteUrl, isAdmin, stripHtml } from '@/lib/utils';
import { deleteWorkOrder } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  workOrder: WorkOrder | null;
  isCreating?: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<WorkOrder>) => void;
  onCreate?: (data: Partial<WorkOrder>) => void;
  onDelete?: (id: string) => void;
  onCopyProperty?: (field: keyof WorkOrder, value: any) => void;
}

export default function WorkOrderDrawer({ workOrder, isCreating = false, onClose, onUpdate, onCreate, onDelete, onCopyProperty }: Props) {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [editState, setEditState] = useState<Partial<WorkOrder>>({
    priority: 0,
    isHotJob: false,
    materialStatus: 'not-ordered',
    currentStatus: 'engineering',
    comments: [],
    metadata: {},
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const drawerPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workOrder || isCreating) {
      drawerPanelRef.current?.focus({ preventScroll: true });
    }
  }, [workOrder?.id, isCreating]);

  useEffect(() => {
    if (workOrder) {
      setEditState({});
    } else if (isCreating) {
      // Initialize with defaults for new work order
      setEditState({
        priority: 0,
        isHotJob: false,
        materialStatus: 'not-ordered',
        currentStatus: 'engineering',
        comments: [],
        metadata: {},
      });
    }
  }, [workOrder?.id, isCreating]);

  if (!workOrder && !isCreating) return null;

  const val = <K extends keyof WorkOrder>(key: K): WorkOrder[K] | undefined => {
    if (isCreating) {
      return editState[key] as WorkOrder[K] | undefined;
    }
    return (editState[key] !== undefined ? editState[key] : workOrder?.[key]) as WorkOrder[K] | undefined;
  };

  const set = <K extends keyof WorkOrder>(key: K, value: WorkOrder[K] | null | undefined) => {
    setEditState(prev => ({ ...prev, [key]: value }));
  };

  const hasChanges = isCreating ? true : Object.keys(editState).length > 0;

  const handleSave = async () => {
    if (isCreating) {
      // Validate required fields
      if (!editState.woNumber || !editState.partNumber || !editState.partName || !editState.customer) {
        toast.error('Please fill in all required fields: WO Number, Part Number, Part Name, and Customer');
        return;
      }
      setSaving(true);
      try {
        if (onCreate) {
          await onCreate(editState);
        }
      } finally {
        setSaving(false);
      }
    } else if (workOrder && hasChanges) {
      setSaving(true);
      try {
        await onUpdate(workOrder.id, editState);
        setEditState({});
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!workOrder) return;
    setDeleting(true);
    try {
      const res = await deleteWorkOrder(workOrder.id);
      if (res.success) {
        toast.success('Work order deleted');
        setShowDeleteConfirm(false);
        if (onDelete) {
          onDelete(workOrder.id);
        }
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete work order');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} />

      {/* Drawer - tabIndex and ref so we can focus without scrolling the page */}
      <div
        ref={drawerPanelRef}
        tabIndex={-1}
        className="fixed top-0 right-0 bottom-0 w-full max-w-lg z-50 bg-zinc-900 border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {isCreating ? 'Create Work Order' : `WO ${workOrder?.woNumber}`}
              {!isCreating && workOrder?.isHotJob && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">HOT</span>}
            </h2>
            {!isCreating && <p className="text-sm text-zinc-400">{workOrder?.partName}</p>}
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {isCreating ? 'Create' : 'Save'}
              </button>
            )}
            {!isCreating && workOrder && (
              <Dialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <Dialog.Trigger asChild>
                  <button className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-red-400 hover:text-red-300">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60]" />
                  <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 border border-white/10 rounded-lg shadow-2xl p-6 z-[61] min-w-[400px]">
                    <Dialog.Title className="text-lg font-bold text-white mb-2">Delete Work Order</Dialog.Title>
                    <Dialog.Description className="text-sm text-zinc-400 mb-4">
                      Are you sure you want to delete work order <span className="font-mono text-accent">{workOrder.woNumber}</span>?
                      <br />
                      <span className="text-zinc-500">This action cannot be undone.</span>
                    </Dialog.Description>
                    <div className="flex items-center justify-end gap-3">
                      <Dialog.Close asChild>
                        <button className="btn-secondary text-xs" disabled={deleting}>Cancel</button>
                      </Dialog.Close>
                      <button onClick={handleDelete} disabled={deleting} className="btn-primary text-xs bg-red-600 hover:bg-red-700">
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Delete
                      </button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            )}
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Links */}
          {!isCreating && (
            <div className="flex gap-2">
              {workOrder?.woNumber && (
                <a href={erpWorkOrderUrl(workOrder.woNumber)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                  <ExternalLink className="w-3 h-3" /> Open in ERP
                </a>
              )}
              {workOrder?.qn && (
                <a href={erpQuoteUrl(workOrder.qn)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                  <ExternalLink className="w-3 h-3" /> View Quote
                </a>
              )}
            </div>
          )}

          {/* Inline fields */}
          <div className="space-y-4">
            <FieldGroup title="Identification">
              {isCreating ? (
                <>
                  <EditableField label="WO Number *" type="text" value={val('woNumber') || ''} onChange={v => set('woNumber', v)} />
                  <EditableField label="Part Number *" type="text" value={val('partNumber') || ''} onChange={v => set('partNumber', v)} />
                  <EditableField label="Part Name *" type="text" value={val('partName') || ''} onChange={v => set('partName', v)} />
                  <EditableField label="Customer *" type="select" value={val('customer') || ''} onChange={v => set('customer', v)}
                    options={[{ value: '', label: 'Select...' }, ...CUSTOMERS.map(c => ({ value: c, label: c }))]} />
                  <EditableField label="Project" type="text" value={val('project') || ''} onChange={v => set('project', v || null)} />
                  <EditableField label="Quote Number" type="text" value={val('qn') || ''} onChange={v => set('qn', v || null)} />
                </>
              ) : (
                <>
                  <EditableField label="WO Number" type="text" value={val('woNumber') || ''} onChange={v => set('woNumber', v)} />
                  <EditableField label="Part Number" type="text" value={val('partNumber') || ''} onChange={v => set('partNumber', v)} />
                  <EditableField label="Part Name" type="text" value={val('partName') || ''} onChange={v => set('partName', v)} />
                  <EditableFieldWithCopy label="Customer" type="select" value={val('customer') || ''} onChange={v => set('customer', v)}
                    options={[{ value: '', label: 'Select...' }, ...CUSTOMERS.map(c => ({ value: c, label: c }))]}
                    onCopy={() => onCopyProperty && val('customer') && onCopyProperty('customer', val('customer'))} />
                  <EditableFieldWithCopy label="Project" type="text" value={val('project') || ''} onChange={v => set('project', v || null)}
                    onCopy={() => onCopyProperty && val('project') && onCopyProperty('project', val('project'))} />
                  <EditableFieldWithCopy label="Quote Number" type="text" value={val('qn') || ''} onChange={v => set('qn', v || null)}
                    onCopy={() => onCopyProperty && val('qn') && onCopyProperty('qn', val('qn'))} />
                </>
              )}
            </FieldGroup>

            <FieldGroup title="Schedule">
              <EditableField label="Priority" type="select" value={String(val('priority') ?? 0)} onChange={v => {
                const priority = Number(v);
                set('priority', priority);
                set('isHotJob', priority === 11);
              }}
                options={Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: PRIORITY_LABELS[i] }))} />
              <div className="flex items-center gap-2 py-1">
                <span className="text-xs text-zinc-500 w-32 shrink-0">Hot Job</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={val('isHotJob') ?? false}
                    onChange={e => {
                      const isHot = e.target.checked;
                      set('isHotJob', isHot);
                      if (isHot) {
                        set('priority', 11);
                      } else if (val('priority') === 11) {
                        set('priority', 0);
                      }
                    }}
                    className="w-4 h-4 rounded border-white/20 bg-zinc-800 text-accent focus:ring-2 focus:ring-accent/50"
                  />
                  <span className="text-sm text-zinc-200">Mark as hot job</span>
                </label>
              </div>
              <EditableFieldWithCopy label="Due Date" type="date" value={val('dueDate') || ''} onChange={v => set('dueDate', v || null)}
                onCopy={() => onCopyProperty && val('dueDate') && onCopyProperty('dueDate', val('dueDate'))} />
              <EditableFieldWithCopy label="Status" type="select" value={val('currentStatus') || 'engineering'} onChange={v => {
                const newStatus = v as WorkOrder['currentStatus'];
                set('currentStatus', newStatus);
                // Clear assignee if status doesn't allow assignments
                if (newStatus !== 'engineering' && newStatus !== 'programming') {
                  set('currentBox', null);
                }
              }}
                options={admin ? STATUS_OPTIONS : STATUS_OPTIONS.filter(s => s.value !== 'completed')}
                onCopy={() => onCopyProperty && val('currentStatus') && onCopyProperty('currentStatus', val('currentStatus'))} />
              {(val('currentStatus') === 'engineering' || val('currentStatus') === 'programming') && (
                <EditableFieldWithCopy label="Assignee" type="select" value={val('currentBox') || ''} onChange={v => set('currentBox', v || null)}
                  options={[{ value: '', label: '(None)' }, ...ASSIGNEES.map(a => ({ value: a, label: a }))]}
                  onCopy={() => onCopyProperty && val('currentBox') && onCopyProperty('currentBox', val('currentBox'))} />
              )}
              {admin && !isCreating && workOrder && (val('currentStatus') === 'engineering-completed' || val('currentStatus') === 'programming-completed') && (
                <div className="flex items-center gap-2 py-1">
                  <span className="text-xs text-zinc-500 w-32 shrink-0"></span>
                  <button
                    onClick={async () => {
                      if (!workOrder) return;
                      setMarkingComplete(true);
                      try {
                        await onUpdate(workOrder.id, { currentStatus: 'completed' });
                        toast.success('Work order marked as completed');
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to mark as completed');
                      } finally {
                        setMarkingComplete(false);
                      }
                    }}
                    disabled={markingComplete}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    {markingComplete ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Mark as Complete
                  </button>
                </div>
              )}
              <EditableFieldWithCopy label="Machine Scheduled" type="text" value={val('machineScheduled') || ''} onChange={v => set('machineScheduled', v || null)}
                onCopy={() => onCopyProperty && val('machineScheduled') && onCopyProperty('machineScheduled', val('machineScheduled'))} />
            </FieldGroup>

            <FieldGroup title="Material & Hours">
              <EditableField label="Material Status" type="select" value={val('materialStatus') || 'not-ordered'} onChange={v => set('materialStatus', v as WorkOrder['materialStatus'])}
                options={MATERIAL_OPTIONS} />
              <EditableField label="Est. Programming Hours" type="number" value={String(val('estProgrammingHours') ?? '')} onChange={v => set('estProgrammingHours', v ? Number(v) : null)} />
              <EditableField label="Est. Engineering Hours" type="number" value={String(val('estEngineeringHours') ?? '')} onChange={v => set('estEngineeringHours', v ? Number(v) : null)} />
            </FieldGroup>

            <FieldGroup title="Notes">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zinc-500">Engineering notes</label>
                  {!isCreating && onCopyProperty && val('notes') && (
                    <button
                      onClick={() => onCopyProperty('notes', val('notes'))}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Copy Notes"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <textarea
                  rows={3}
                  className="input w-full resize-none"
                  value={stripHtml(val('notes') ?? '') || ''}
                  onChange={e => set('notes', e.target.value)}
                />
              </div>
            </FieldGroup>

            {!isCreating && (
              <FieldGroup title="Work order notes">
                <p className="text-xs text-zinc-500 mb-1">From Proshop; not shown in table.</p>
                <textarea
                  rows={10}
                  className="input w-full resize-none bg-zinc-800/80"
                  placeholder="No work order notes"
                  value={stripHtml(val('workOrderNotes') ?? '') || ''}
                  onChange={e => set('workOrderNotes', e.target.value)}
                />
              </FieldGroup>
            )}

            {!isCreating && (
              <FieldGroup title="Metadata">
                <ReadOnlyField label="ID" value={workOrder?.id} />
                <ReadOnlyField label="Created" value={workOrder?.createdAt} />
                <ReadOnlyField label="Updated" value={workOrder?.updatedAt} />
                <ReadOnlyField label="Version" value={String(workOrder?.version)} />
              </FieldGroup>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-zinc-500 w-32 shrink-0">{label}</span>
      <span className="text-sm text-zinc-200">{value || '—'}</span>
    </div>
  );
}

function EditableField({ label, type, value, onChange, options }: {
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  value: string;
  onChange: (v: string) => void;
  options?: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-zinc-500 w-32 shrink-0">{label}</span>
      {type === 'select' && options ? (
        <select value={value} onChange={e => onChange(e.target.value)} className="select flex-1 text-sm">
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="input flex-1 text-sm"
        />
      )}
    </div>
  );
}

function EditableFieldWithCopy({ label, type, value, onChange, options, onCopy }: {
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  value: string;
  onChange: (v: string) => void;
  options?: readonly { readonly value: string; readonly label: string }[];
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-zinc-500 w-32 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1">
        {type === 'select' && options ? (
          <select value={value} onChange={e => onChange(e.target.value)} className="select flex-1 text-sm">
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="input flex-1 text-sm"
          />
        )}
        {onCopy && value && (
          <button
            onClick={onCopy}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            title={`Copy ${label}`}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

