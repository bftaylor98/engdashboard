import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isPast, isToday, differenceInDays, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  try {
    const date = parseISO(dateStr);
    return isPast(date) && !isToday(date);
  } catch {
    return false;
  }
}

export function daysUntilDue(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  try {
    return differenceInDays(parseISO(dateStr), new Date());
  } catch {
    return null;
  }
}

export function materialStatusColor(status: string): string {
  switch (status) {
    case 'arrived': return 'text-green-400';
    case 'ordered': return 'text-yellow-400';
    case 'not-ordered': return 'text-red-400';
    default: return 'text-zinc-400';
  }
}

export function materialStatusLabel(status: string): string {
  switch (status) {
    case 'arrived': return 'Arrived';
    case 'ordered': return 'Ordered';
    case 'not-ordered': return 'Not Ordered';
    default: return status;
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'engineering': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'engineering-completed': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'programming': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'programming-completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'hold': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'completed': return 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30';
    default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'engineering': return 'Engineering';
    case 'engineering-completed': return 'Eng. Comp.';
    case 'programming': return 'Programming';
    case 'programming-completed': return 'Prog. Comp.';
    case 'hold': return 'Hold';
    case 'completed': return 'Completed';
    default: return status;
  }
}

export function erpWorkOrderUrl(woNumber: string): string {
  return `https://est.adionsystems.com/procnc/workorders/${woNumber}`;
}

export function erpPoUrl(poNumber: string): string {
  return `https://est.adionsystems.com/procnc/purchaseorders/${poNumber}`;
}

export function erpQuoteUrl(qn: string): string {
  return `https://est.adionsystems.com/procnc/quotes/2026/${qn}`;
}

/** Assignee (first name) -> badge color classes. Matches Time Tracking / NonConformances. */
const ASSIGNEE_COLORS: Record<string, string> = {
  Alex: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  Damien: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  Rob: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  Thad: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  Brad: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
};

export function assigneeColor(assignee: string | null | undefined): string {
  if (!assignee) return 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30';
  return ASSIGNEE_COLORS[assignee] ?? 'bg-zinc-600/20 text-zinc-400 border border-zinc-500/30';
}

/** Calendar event pill color from title: if title contains an assignee name, use that color; else unused/gray. */
export function calendarEventColor(title: string | null | undefined): string {
  if (!title || typeof title !== 'string') return 'bg-zinc-600/20 text-zinc-400 border border-zinc-500/30';
  const lower = title.toLowerCase();
  for (const name of Object.keys(ASSIGNEE_COLORS)) {
    if (lower.includes(name.toLowerCase())) return ASSIGNEE_COLORS[name];
  }
  return 'bg-zinc-600/20 text-zinc-400 border border-zinc-500/30';
}

export function isAdmin(user: { username: string } | null): boolean {
  return user?.username === 'admin' || user?.username === 'brad';
}

/** Strip HTML tags (e.g. <p>, <b>) from Proshop-sourced notes for plain-text display. */
export function stripHtml(html: string | null | undefined): string {
  if (html == null || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

