/**
 * Archived: Schedule status column and filter.
 * Re-wire into Schedule.tsx when restoring status UI.
 */
import { useEffect, useState, useRef } from 'react';
import type { WorkOrder } from '@/types';
import { STATUS_OPTIONS } from '@/types';
import { cn, statusColor, statusLabel } from '@/lib/utils';

export function StatusCell({
  wo,
  onUpdate,
  isAdminUser,
}: {
  wo: WorkOrder;
  onUpdate: (id: string, data: Partial<WorkOrder>) => void;
  isAdminUser: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn('badge cursor-pointer hover:ring-2 hover:ring-white/20 transition-all', statusColor(wo.currentStatus))}
      >
        {statusLabel(wo.currentStatus)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-zinc-800 border border-white/10 rounded-lg shadow-2xl p-1 min-w-[160px]"
            style={{ top: `${position.top}px`, right: `${position.right}px` }}
          >
            {STATUS_OPTIONS.filter((s) => isAdminUser || s.value !== 'completed').map((s) => (
              <button
                key={s.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(wo.id, { currentStatus: s.value as WorkOrder['currentStatus'] });
                  setOpen(false);
                }}
                className={cn(
                  'block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-zinc-700 transition-colors',
                  wo.currentStatus === s.value ? 'bg-zinc-700 text-white' : 'text-zinc-300'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Archived status filter dropdown JSX for Schedule filters bar:
<select value={filters.currentStatus ?? ''} onChange={e => setFilters(f => ({ ...f, currentStatus: e.target.value }))} className="select max-w-[150px]">
  <option value="">All Statuses</option>
  {STATUS_OPTIONS.filter(s => s.value !== 'completed').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
</select>
*/
