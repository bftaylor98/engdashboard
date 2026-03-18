import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getWorkOrders, updateWorkOrder } from '@/services/api';
import { useSSE } from '@/hooks/useSSE';
import type { WorkOrder } from '@/types';
import { ASSIGNEES } from '@/types';
import { cn } from '@/lib/utils';
import WorkOrderDrawer from '@/components/WorkOrderDrawer';

const KANBAN_COLUMNS = [
  { id: 'engineering', label: 'Engineering', color: 'bg-blue-500' },
  { id: 'engineering-completed', label: 'Eng. Comp.', color: 'bg-yellow-500' },
  { id: 'programming', label: 'Programming', color: 'bg-purple-500' },
  { id: 'programming-completed', label: 'Prog. Comp.', color: 'bg-green-500' },
  { id: 'hold', label: 'Hold', color: 'bg-orange-500' },
];

const ASSIGNMENT_COLUMNS = ASSIGNEES.map((name, index) => {
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-yellow-500'];
  return {
    id: name,
    label: name,
    color: colors[index % colors.length],
  };
});

function KanbanCard({ 
  wo, 
  onClick, 
  onSelect, 
  isSelected, 
  index 
}: { 
  wo: WorkOrder; 
  onClick: () => void;
  onSelect: (e: React.MouseEvent, index: number) => void;
  isSelected: boolean;
  index: number;
}) {
  const {
    attributes, listeners, setNodeRef, isDragging,
  } = useDraggable({ 
    id: wo.id, 
    data: { type: 'card', workOrder: wo },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      onSelect(e, index);
    }
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        'kanban-card group cursor-grab active:cursor-grabbing select-none transition-all',
        isDragging && 'opacity-30',
        wo.isHotJob && 'border-l-2 border-l-orange-500',
        isSelected && 'ring-2 ring-accent ring-offset-1 ring-offset-[var(--bg-elevated)]',
      )}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isDragging) {
          onClick();
        }
      }}
    >
      <div className="font-mono text-xs text-accent">{wo.woNumber}</div>
      <div className="text-sm text-[var(--text-primary)] font-medium truncate">{wo.partName}</div>
    </div>
  );
}

function KanbanColumn({ 
  columnId, 
  label, 
  color, 
  items, 
  onCardClick, 
  onCardSelect, 
  selectedIds, 
  flatData 
}: {
  columnId: string; 
  label: string; 
  color: string; 
  items: WorkOrder[]; 
  onCardClick: (wo: WorkOrder) => void;
  onCardSelect: (e: React.MouseEvent, index: number) => void;
  selectedIds: Set<string>;
  flatData: WorkOrder[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div className="flex flex-col flex-1 min-w-[280px] max-w-[360px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn('w-2.5 h-2.5 rounded-full', color)} />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h3>
        <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-1.5 p-2 rounded-xl min-h-[200px] transition-colors',
          isOver ? 'bg-accent/5 ring-1 ring-accent/30' : 'bg-[var(--bg-elevated)]',
        )}
      >
        {items.map(wo => {
          const index = flatData.findIndex(d => d.id === wo.id);
          // If index not found, use a safe fallback (shouldn't happen, but prevents crashes)
          const safeIndex = index >= 0 ? index : flatData.length;
          return (
            <KanbanCard 
              key={wo.id} 
              wo={wo} 
              onClick={() => onCardClick(wo)}
              onSelect={onCardSelect}
              isSelected={selectedIds.has(wo.id)}
              index={safeIndex}
            />
          );
        })}
        {items.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)] text-xs">Drop items here</div>
        )}
      </div>
    </div>
  );
}

export default function Kanban() {
  const [data, setData] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<WorkOrder | null>(null);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'status' | 'assignment'>('status');
  const [draggingSelected, setDraggingSelected] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { 
        distance: 5
      } 
    }),
  );

  // Create flat list of all work orders for index tracking
  const flatData = useMemo(() => {
    return data;
  }, [data]);

  const toggleSelect = useCallback((id: string, index: number, shiftKey: boolean = false) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      
      if (shiftKey && lastSelectedIndex !== null && flatData.length > 0) {
        // Range selection - select all cards from lastSelectedIndex to index (inclusive)
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        
        for (let i = start; i <= end; i++) {
          if (i >= 0 && i < flatData.length) {
            next.add(flatData[i].id);
          }
        }
      } else {
        // Single selection
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        // Only set lastSelectedIndex if index is valid
        if (index >= 0 && index < flatData.length) {
          setLastSelectedIndex(index);
        }
      }
      
      return next;
    });
  }, [lastSelectedIndex, flatData]);

  const fetchData = useCallback(async () => {
    try {
      const res = await getWorkOrders({ limit: 'all', sortBy: 'priority', sortOrder: 'desc', currentBox: filterAssignee || undefined, currentStatus: '!completed' });
      if (res.success) setData(res.data);
    } catch (err) {
      toast.error('Failed to load Kanban data');
    } finally {
      setLoading(false);
    }
  }, [filterAssignee]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Silently refresh on real-time events (no loading spinner)
  useSSE(useCallback(() => {
    getWorkOrders({ limit: 'all', sortBy: 'priority', sortOrder: 'desc', currentBox: filterAssignee || undefined, currentStatus: '!completed' }).then(res => {
      if (res.success) setData(res.data);
    }).catch(err => console.error('SSE refresh failed:', err));
  }, [filterAssignee]));

  const columns = useMemo(() => {
    try {
      return viewMode === 'status' ? KANBAN_COLUMNS : ASSIGNMENT_COLUMNS;
    } catch (err) {
      console.error('Error creating columns:', err);
      return KANBAN_COLUMNS; // Fallback to status columns
    }
  }, [viewMode]);

  const grouped = useMemo(() => {
    const result: Record<string, WorkOrder[]> = {};
    
    if (!data || data.length === 0) {
      // Initialize empty columns
      columns.forEach(col => {
        result[col.id] = [];
      });
      return result;
    }
    
    columns.forEach(col => {
      if (viewMode === 'status') {
        result[col.id] = data.filter(wo => wo && wo.currentStatus === col.id);
      } else {
        result[col.id] = data.filter(wo => wo && wo.currentBox === col.id);
      }
    });
    
    // Add unassigned column for Assignment view
    if (viewMode === 'assignment') {
      const unassigned = data.filter(wo => wo && (!wo.currentBox || wo.currentBox === ''));
      if (unassigned.length > 0) {
        result['unassigned'] = unassigned;
      }
    }
    
    return result;
  }, [data, viewMode, columns]);

  const handleDragStart = (e: DragStartEvent) => {
    const wo = data.find(d => d.id === e.active.id);
    if (!wo) return;
    
    // Check if dragged card is in selected set
    if (selectedIds.has(wo.id)) {
      // Track all selected cards
      const selectedCards = data.filter(d => selectedIds.has(d.id));
      setDraggingSelected(new Set(selectedIds));
      setActiveCard(wo); // Show first selected card in overlay
    } else {
      // Single card drag
      setDraggingSelected(new Set());
      setActiveCard(wo);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = e;
    if (!over) {
      setDraggingSelected(new Set());
      return;
    }

    const woId = active.id as string;
    const isBulkDrag = draggingSelected.size > 0;
    const cardsToUpdate = isBulkDrag ? Array.from(draggingSelected) : [woId];
    
    let targetId: string;
    const currentColumns = viewMode === 'status' ? KANBAN_COLUMNS : ASSIGNMENT_COLUMNS;

    // Check if dropped on a column
    if (currentColumns.some(c => c.id === over.id) || over.id === 'unassigned') {
      targetId = over.id as string;
    } else {
      // Dropped on another card — find that card's column
      const targetWO = data.find(d => d.id === over.id);
      if (!targetWO) {
        setDraggingSelected(new Set());
        return;
      }
      targetId = viewMode === 'status' ? targetWO.currentStatus : (targetWO.currentBox || 'unassigned');
    }

    // Get all cards to update
    const cards = data.filter(d => cardsToUpdate.includes(d.id));
    if (cards.length === 0) {
      setDraggingSelected(new Set());
      return;
    }

    // Check if any card actually needs updating
    const needsUpdate = cards.some(wo => {
      if (viewMode === 'status') {
        return wo.currentStatus !== targetId;
      } else {
        return (wo.currentBox || 'unassigned') !== targetId;
      }
    });

    if (!needsUpdate) {
      setDraggingSelected(new Set());
      return;
    }

    // Optimistic update
    const originalCards = [...cards];
    setData(prev => prev.map(d => {
      if (cardsToUpdate.includes(d.id)) {
        if (viewMode === 'status') {
          return { ...d, currentStatus: targetId as WorkOrder['currentStatus'] };
        } else {
          return { ...d, currentBox: targetId === 'unassigned' ? null : targetId };
        }
      }
      return d;
    }));

    try {
      // Update all cards
      const updatePromises = cards.map(wo => {
        if (viewMode === 'status') {
          return updateWorkOrder(wo.id, { currentStatus: targetId as WorkOrder['currentStatus'] });
        } else {
          return updateWorkOrder(wo.id, { currentBox: targetId === 'unassigned' ? null : targetId });
        }
      });

      const results = await Promise.all(updatePromises);
      const successful = results.filter(r => r.success);
      
      if (successful.length > 0) {
        // Update with server responses
        setData(prev => prev.map(d => {
          const result = successful.find(r => r.success && r.data.id === d.id);
          return result ? result.data : d;
        }));

        const targetLabel = viewMode === 'status' 
          ? KANBAN_COLUMNS.find(c => c.id === targetId)?.label || targetId
          : targetId === 'unassigned' ? 'Unassigned' : targetId;
        
        toast.success(isBulkDrag 
          ? `Moved ${successful.length} card(s) to ${targetLabel}`
          : `Moved to ${targetLabel}`
        );
      }

      // Clear selection after successful drag
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
    } catch (err: any) {
      // Revert
      setData(prev => prev.map(d => {
        const original = originalCards.find(c => c.id === d.id);
        return original ? original : d;
      }));
      toast.error(err.message || 'Move failed');
    } finally {
      setDraggingSelected(new Set());
    }
  };

  const handleUpdate = useCallback(async (id: string, updates: Partial<WorkOrder>) => {
    try {
      const res = await updateWorkOrder(id, updates);
      if (res.success) {
        setData(prev => prev.map(wo => wo.id === id ? res.data : wo));
        if (selectedWO?.id === id) setSelectedWO(res.data);
        toast.success('Updated');
      }
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  }, [selectedWO]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      setData(prev => prev.filter(wo => wo.id !== id));
      if (selectedWO?.id === id) {
        setSelectedWO(null);
      }
      await fetchData();
    } catch (err) {
      console.error('Delete handler error:', err);
    }
  }, [selectedWO, fetchData]);

  // Clear selection when clicking outside cards (but not on buttons or inputs)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't clear if clicking on cards, buttons, selects, or drawers
      if (target.closest('.kanban-card') || 
          target.closest('button') || 
          target.closest('select') ||
          target.closest('[role="dialog"]')) {
        return;
      }
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kanban Board</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {viewMode === 'status' ? 'Drag work orders between stages' : 'Drag work orders between assignees'}
            {selectedIds.size > 0 && (
              <span className="ml-2 text-accent">({selectedIds.size} selected)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setLastSelectedIndex(null);
              }}
              className="btn-ghost text-sm"
            >
              Clear Selection
            </button>
          )}
          <button
            onClick={() => {
              setViewMode(m => m === 'status' ? 'assignment' : 'status');
              setSelectedIds(new Set());
              setLastSelectedIndex(null);
            }}
            className={cn(
              'btn-secondary text-sm',
              viewMode === 'status' ? 'bg-accent/20 text-accent' : ''
            )}
          >
            {viewMode === 'status' ? 'Status' : 'Assignment'}
          </button>
          {viewMode === 'status' && (
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="select max-w-[160px]"
            >
              <option value="">All Assignees</option>
              {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns && columns.length > 0 ? columns.map(col => (
            <KanbanColumn
              key={col.id}
              columnId={col.id}
              label={col.label}
              color={col.color}
              items={grouped[col.id] || []}
              onCardClick={wo => setSelectedWO(wo)}
              onCardSelect={(e, index) => {
                if (index >= 0 && index < flatData.length) {
                  toggleSelect(flatData[index].id, index, e.shiftKey);
                }
              }}
              selectedIds={selectedIds}
              flatData={flatData}
            />
          )) : (
            <div className="text-center py-8 text-[var(--text-secondary)]">No columns available</div>
          )}
          {viewMode === 'assignment' && grouped['unassigned'] && (
            <KanbanColumn
              key="unassigned"
              columnId="unassigned"
              label="Unassigned"
              color="bg-gray-500"
              items={grouped['unassigned']}
              onCardClick={wo => setSelectedWO(wo)}
              onCardSelect={(e, index) => {
                if (index >= 0 && index < flatData.length) {
                  toggleSelect(flatData[index].id, index, e.shiftKey);
                }
              }}
              selectedIds={selectedIds}
              flatData={flatData}
            />
          )}
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="kanban-card ring-2 ring-accent shadow-2xl rotate-2 scale-105 relative">
              <div className="font-mono text-xs text-accent">{activeCard.woNumber}</div>
              <div className="text-sm text-[var(--text-primary)] font-medium truncate">{activeCard.partName}</div>
              {draggingSelected.size > 1 && (
                <div className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                  {draggingSelected.size}
                </div>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <WorkOrderDrawer
        workOrder={selectedWO}
        onClose={() => setSelectedWO(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}

