import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
} from 'date-fns';
import { getCalendarEvents } from '@/services/api';
import type { CalendarEvent } from '@/types';
import { cn, calendarEventColor } from '@/lib/utils';

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = format(calStart, 'yyyy-MM-dd');
      const endStr = format(calEnd, 'yyyy-MM-dd');
      const res = await getCalendarEvents(startStr, endStr);
      if (res.success) setEvents(res.data);
      else toast.error(res.error || 'Failed to load calendar');
    } catch (err) {
      toast.error('Failed to load calendar');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [calStart.getTime(), calEnd.getTime()]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const start = parseISO(ev.start);
      const end = parseISO(ev.end);
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      let d = startDay.getTime();
      const endMs = endDay.getTime();
      while (d <= endMs) {
        const key = format(d, 'yyyy-MM-dd');
        const list = map.get(key) || [];
        list.push(ev);
        map.set(key, list);
        d += 24 * 60 * 60 * 1000;
      }
    }
    return map;
  }, [events]);

  const formatEventTime = (ev: CalendarEvent) => {
    if (ev.allDay) return null;
    const start = parseISO(ev.start);
    return format(start, 'h:mm a');
  };

  if (loading && events.length === 0) {
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
          <h1 className="text-2xl font-bold">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn-ghost">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-lg font-semibold min-w-[180px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn-ghost">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentMonth(new Date())} className="btn-secondary text-xs ml-2">
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="card p-0 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="px-2 py-2 text-xs font-medium text-[var(--text-muted)] text-center">
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDate.get(key) || [];
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <div
                key={key}
                className={cn(
                  'min-h-[110px] border-b border-r border-[var(--border-subtle)] p-1.5 transition-colors',
                  !inMonth && 'bg-[var(--bg-surface)] opacity-40',
                  today && 'bg-accent/[0.03]',
                )}
              >
                <div className={cn(
                  'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                  today ? 'bg-accent text-white' : 'text-[var(--text-muted)]',
                )}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
                  {dayEvents.slice(0, 4).map(ev => {
                    const timeStr = formatEventTime(ev);
                    const pillColor = calendarEventColor(ev.title);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        className={cn(
                          'w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate transition-colors hover:ring-1 hover:ring-white/20 border',
                          pillColor,
                        )}
                        title={ev.title + (timeStr ? ` • ${timeStr}` : '')}
                      >
                        {timeStr && <span className="opacity-80 mr-1">{timeStr}</span>}
                        {ev.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 4 && (
                    <div className="text-[10px] text-[var(--text-muted)] px-1">+{dayEvents.length - 4} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event detail dialog */}
      <Dialog.Root open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            {selectedEvent && (
              <>
                <div className="flex items-start justify-between gap-2">
                  <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
                    {selectedEvent.title}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                      <X className="w-4 h-4" />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                  {selectedEvent.allDay ? (
                    <p>
                      {format(parseISO(selectedEvent.start), 'EEE, MMM d, yyyy')}
                      {selectedEvent.start !== selectedEvent.end &&
                        ` – ${format(parseISO(selectedEvent.end), 'EEE, MMM d, yyyy')}`}
                    </p>
                  ) : (
                    <p>
                      {format(parseISO(selectedEvent.start), 'EEE, MMM d, yyyy • h:mm a')} –{' '}
                      {format(parseISO(selectedEvent.end), 'h:mm a')}
                    </p>
                  )}
                  {selectedEvent.description && (
                    <p className="mt-2 text-[var(--text-primary)] whitespace-pre-wrap">{selectedEvent.description}</p>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
