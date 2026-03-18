import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Save, Tv, GripVertical, ArrowDownRight } from 'lucide-react';
import { toast } from 'sonner';
import { getTvConfig, saveTvConfig } from '@/services/api';
import type { TvConfig, TvWidgetLayoutItem } from '@/types';
import {
  TV_WIDGETS,
  DEFAULT_TV_CONFIG,
  TV_GRID_COLS,
  TV_GRID_ROWS,
  type TvWidgetMeta,
} from '@/constants/tvWidgets';
function getWidgetName(widgetId: string): string {
  return TV_WIDGETS.find((w) => w.id === widgetId)?.name ?? widgetId;
}

/** Placeholder box for a widget on the canvas (native draggable + resize handle) */
function WidgetPlaceholder({
  widgetId,
  gridCol,
  gridRow,
  gridColSpan,
  gridRowSpan,
  onResizeStart,
}: {
  widgetId: string;
  gridCol: number;
  gridRow: number;
  gridColSpan: number;
  gridRowSpan: number;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('widgetId', widgetId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart(e);
  };
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="rounded-lg border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-2 flex items-center justify-center text-center text-sm font-medium text-[var(--text-secondary)] cursor-grab active:cursor-grabbing select-none relative"
      style={{
        gridColumn: `${gridCol} / span ${gridColSpan}`,
        gridRow: `${gridRow} / span ${gridRowSpan}`,
      }}
    >
      {getWidgetName(widgetId)}
      <div
        role="button"
        tabIndex={0}
        draggable={false}
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-0 right-0 w-4 h-4 flex items-center justify-center rounded-tl bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] cursor-se-resize text-[var(--text-muted)]"
        aria-label="Resize widget"
      >
        <ArrowDownRight className="w-3 h-3" />
      </div>
    </div>
  );
}

/** Single grid cell (visual only; canvas is the drop target) */
function GridCell({ col, row }: { col: number; row: number }) {
  return (
    <div
      className="min-h-[32px] rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
      data-cell={`cell-${col}-${row}`}
    />
  );
}

type ResizingState = {
  widgetId: string;
  gridCol: number;
  gridRow: number;
  gridColSpan: number;
  gridRowSpan: number;
};

export default function TVConfig() {
  const [config, setConfig] = useState<TvConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resizing, setResizing] = useState<ResizingState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<ResizingState | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTvConfig();
      if (res.success && res.data) {
        setConfig(res.data);
      } else {
        setConfig(DEFAULT_TV_CONFIG);
      }
    } catch {
      setConfig(DEFAULT_TV_CONFIG);
      toast.error('Failed to load TV config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleResizeStart = useCallback((widgetId: string, gridCol: number, gridRow: number, gridColSpan: number, gridRowSpan: number) => {
    setResizing({ widgetId, gridCol, gridRow, gridColSpan, gridRowSpan });
  }, []);

  useEffect(() => {
    resizingRef.current = resizing;
  }, [resizing]);

  useEffect(() => {
    if (!resizing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvasRect = canvas.getBoundingClientRect();
      const cellWidth = canvasRect.width / TV_GRID_COLS;
      const cellHeight = canvasRect.height / TV_GRID_ROWS;
      const cur = resizingRef.current;
      if (!cur) return;
      const rightEdgeCol = Math.round((e.clientX - canvasRect.left) / cellWidth);
      const bottomEdgeRow = Math.round((e.clientY - canvasRect.top) / cellHeight);
      const newW = rightEdgeCol - (cur.gridCol - 1) + 1;
      const newH = bottomEdgeRow - (cur.gridRow - 1) + 1;
      const gridColSpan = Math.max(1, Math.min(newW, TV_GRID_COLS - cur.gridCol + 1));
      const gridRowSpan = Math.max(1, Math.min(newH, TV_GRID_ROWS - cur.gridRow + 1));
      const next = { ...cur, gridColSpan, gridRowSpan };
      resizingRef.current = next;
      setResizing(next);
    };

    const handleMouseUp = () => {
      const cur = resizingRef.current;
      setConfig((prev) => {
        if (!prev || !cur) return prev;
        const layout = prev.layout.map((item) =>
          item.widgetId === cur.widgetId
            ? { ...item, gridColSpan: cur.gridColSpan, gridRowSpan: cur.gridRowSpan }
            : item
        );
        return { ...prev, layout };
      });
      resizingRef.current = null;
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const toggleWidget = (widgetId: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const active = new Set(prev.activeWidgetIds);
      if (active.has(widgetId)) {
        active.delete(widgetId);
        const layout = prev.layout.filter((l) => l.widgetId !== widgetId);
        return { activeWidgetIds: [...active], layout };
      }
      active.add(widgetId);
      const layout = [...prev.layout];
      const maxRow = layout.reduce((m, l) => Math.max(m, l.gridRow + l.gridRowSpan - 1), 0);
      layout.push({
        widgetId,
        gridCol: 1,
        gridRow: Math.min(maxRow + 1, TV_GRID_ROWS),
        gridColSpan: 1,
        gridRowSpan: 1,
      });
      return { activeWidgetIds: [...active], layout };
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await saveTvConfig(config);
      if (res.success) {
        toast.success('TV layout saved');
      } else {
        toast.error(res.error ?? 'Failed to save');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const widgetId = e.dataTransfer.getData('widgetId');
    if (!widgetId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const cellWidth = canvasRect.width / TV_GRID_COLS;
    const cellHeight = canvasRect.height / TV_GRID_ROWS;
    const x = Math.floor((e.clientX - canvasRect.left) / cellWidth);
    const y = Math.floor((e.clientY - canvasRect.top) / cellHeight);
    const col = Math.max(1, Math.min(x + 1, TV_GRID_COLS));
    const row = Math.max(1, Math.min(y + 1, TV_GRID_ROWS));

    setConfig((prev) => {
      if (!prev) return prev;
      const inLayout = prev.layout.some((item) => item.widgetId === widgetId);
      const activeSet = new Set(prev.activeWidgetIds);
      if (inLayout) {
        const layout = prev.layout.map((item) =>
          item.widgetId === widgetId
            ? { ...item, gridCol: col, gridRow: row, gridColSpan: 1, gridRowSpan: 1 }
            : item
        );
        return { ...prev, layout };
      }
      if (!activeSet.has(widgetId)) {
        activeSet.add(widgetId);
      }
      const layout = [...prev.layout.filter((l) => l.widgetId !== widgetId), { widgetId, gridCol: col, gridRow: row, gridColSpan: 1, gridRowSpan: 1 }];
      return { activeWidgetIds: [...activeSet], layout };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const activeSet = new Set(config?.activeWidgetIds ?? []);
  const layoutMap = new Map<string, TvWidgetLayoutItem>();
  for (const item of config?.layout ?? []) {
    layoutMap.set(item.widgetId, item);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tv className="w-6 h-6" />
            TV Config
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Choose widgets and arrange them on the TV dashboard. Only active widgets appear on /tv.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !config}
          className="btn-primary inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save layout
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Widget library */}
        <div className="card">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Widget library</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Toggle widgets on/off. Active widgets appear on the canvas and on the TV.</p>
          <ul className="space-y-3">
            {TV_WIDGETS.map((widget) => (
              <WidgetLibraryRow
                key={widget.id}
                widget={widget}
                active={activeSet.has(widget.id)}
                onToggle={() => toggleWidget(widget.id)}
              />
            ))}
          </ul>
        </div>

        {/* Layout editor */}
        <div className="card">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Layout (16:9)</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Drag widgets on the canvas to position them. They snap to the grid.</p>
            <div
              className="w-full max-w-4xl rounded-xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-surface)] relative"
              style={{ aspectRatio: '16/9' }}
            >
              <div
                ref={canvasRef}
                className="w-full h-full grid gap-1 p-2 absolute inset-0"
                style={{
                  gridTemplateColumns: `repeat(${TV_GRID_COLS}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${TV_GRID_ROWS}, minmax(0, 1fr))`,
                }}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
              >
                {/* Grid cells (visual) */}
                {Array.from({ length: TV_GRID_ROWS }, (_, row) =>
                  Array.from({ length: TV_GRID_COLS }, (_, col) => (
                    <GridCell key={`cell-${col + 1}-${row + 1}`} col={col + 1} row={row + 1} />
                  ))
                ).flat()}
                {/* Widget placeholders (positioned on same grid, can span) */}
                {config?.layout
                  .filter((item) => activeSet.has(item.widgetId))
                  .map((item) => {
                    const isResizing = resizing?.widgetId === item.widgetId;
                    const displayColSpan = isResizing ? resizing.gridColSpan : item.gridColSpan;
                    const displayRowSpan = isResizing ? resizing.gridRowSpan : item.gridRowSpan;
                    return (
                      <WidgetPlaceholder
                        key={item.widgetId}
                        widgetId={item.widgetId}
                        gridCol={item.gridCol}
                        gridRow={item.gridRow}
                        gridColSpan={displayColSpan}
                        gridRowSpan={displayRowSpan}
                        onResizeStart={() => handleResizeStart(item.widgetId, item.gridCol, item.gridRow, item.gridColSpan, item.gridRowSpan)}
                      />
                    );
                  })}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}

function WidgetLibraryRow({
  widget,
  active,
  onToggle,
}: {
  widget: TvWidgetMeta;
  active: boolean;
  onToggle: () => void;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('widgetId', widget.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <li className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
      <div
        draggable
        onDragStart={handleDragStart}
        className="w-12 h-12 shrink-0 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-muted)] cursor-grab active:cursor-grabbing"
        title="Drag to canvas"
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-[var(--text-primary)]">{widget.name}</span>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={active}
              onChange={onToggle}
              className="sr-only peer"
            />
            <span className="relative block w-9 h-5 rounded-full bg-[var(--bg-hover)] peer-focus:ring-2 peer-focus:ring-accent/50 peer-checked:bg-accent after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-200 peer-checked:after:translate-x-4" />
          </label>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{widget.description}</p>
      </div>
    </li>
  );
}
