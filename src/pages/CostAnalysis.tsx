import { useState, useMemo } from 'react';
import { DollarSign, Loader2, Clock, Package, User } from 'lucide-react';
import { toast } from 'sonner';
import { getCostAnalysis, type CostAnalysisData } from '@/services/api';
import { cn } from '@/lib/utils';

function formatMinutesAsHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins} min`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

/** Compute cost without material and price per hour from raw analysis data (used when API omits them or as single source of truth). */
function deriveCostMetrics(d: CostAnalysisData | null): { costWithoutMaterial: number | null; pricePerHour: number | null } {
  if (!d) return { costWithoutMaterial: null, pricePerHour: null };
  const quoted = d.quotedPrice != null ? Number(d.quotedPrice) : null;
  const material = d.materialCost != null ? Number(d.materialCost) : 0;
  const hours = d.estimatedHours != null ? Number(d.estimatedHours) : null;
  let costWithoutMaterial: number | null = d.costWithoutMaterial ?? null;
  if (costWithoutMaterial == null && quoted != null && !isNaN(quoted)) {
    const materialVal = typeof material === 'number' && !isNaN(material) ? material : 0;
    costWithoutMaterial = Math.round((quoted - materialVal) * 100) / 100;
  }
  let pricePerHour: number | null = d.pricePerHour ?? null;
  if (pricePerHour == null && costWithoutMaterial != null && hours != null && !isNaN(hours) && hours > 0) {
    pricePerHour = Math.round((costWithoutMaterial / hours) * 100) / 100;
  }
  return { costWithoutMaterial, pricePerHour };
}

export default function CostAnalysis() {
  const [woNumber, setWoNumber] = useState('26-0310');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CostAnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const derived = useMemo(() => deriveCostMetrics(data), [data]);

  async function handleAnalyze() {
    const trimmed = woNumber.trim();
    if (!trimmed) {
      toast.error('Enter a work order number');
      return;
    }
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const res = await getCostAnalysis(trimmed);
      if (!res.success) {
        setError(res.error || 'Failed to get cost analysis');
        return;
      }
      if (res.data) {
        setData(res.data);
      } else {
        setError('No data returned');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 border-b border-[var(--border-subtle)]">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Cost Analysis</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          Estimated amount and material cost from ProShop; hours from target. Cost without material = estimated − material; price per hour = cost without material ÷ hours.
        </p>
      </div>

      <div className="p-6 flex flex-col gap-6 max-w-2xl">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Work order number</span>
            <input
              type="text"
              value={woNumber}
              onChange={(e) => setWoNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="e.g. 26-0310"
              className={cn(
                'input rounded-lg min-w-[12rem] font-mono'
              )}
            />
          </label>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading}
            className={cn(
              'rounded-lg px-4 py-2 font-medium transition-colors',
              'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none',
              'inline-flex items-center gap-2'
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              'Analyze'
            )}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <span className="font-mono font-semibold text-[var(--text-primary)]">{data.woNumber}</span>
              {(data.partNumber || data.partName || data.customer) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-[var(--text-secondary)]">
                  {data.partNumber && (
                    <span className="inline-flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" />
                      {data.partNumber}
                    </span>
                  )}
                  {data.partName && <span>{data.partName}</span>}
                  {data.customer && (
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {data.customer}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[var(--bg-surface)] p-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Material cost</div>
                  <div className="text-lg font-semibold text-[var(--text-primary)] mt-0.5">
                    {data.materialCost != null ? formatCurrency(data.materialCost) : '—'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">From ProShop PO line items for this WO</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[var(--bg-surface)] p-2">
                  <DollarSign className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Estimated amount</div>
                  <div className="text-lg font-semibold text-[var(--text-primary)] mt-0.5">
                    {data.quotedPrice != null ? formatCurrency(data.quotedPrice) : '—'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">Quoted / Customer PO (ProShop)</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[var(--bg-surface)] p-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Estimated time</div>
                  <div className="text-lg font-semibold text-[var(--text-primary)] mt-0.5">
                    {data.estimatedTotalMinutes != null ? (
                      <>
                        {data.estimatedTotalMinutes} min
                        {data.estimatedTotalMinutes >= 60 && (
                          <span className="text-[var(--text-secondary)] font-normal ml-1">
                            ({formatMinutesAsHoursMinutes(data.estimatedTotalMinutes)})
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                  {data.estimatedHours != null && (
                    <div className="text-sm text-[var(--text-muted)] mt-0.5">{data.estimatedHours} hours</div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3 sm:col-span-2 border-t border-[var(--border-subtle)] pt-4 mt-1">
                <div className="rounded-lg bg-[var(--bg-surface)] p-2">
                  <DollarSign className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Cost without material</div>
                  <div className="text-lg font-semibold text-[var(--text-primary)] mt-0.5">
                    {derived.costWithoutMaterial != null ? formatCurrency(derived.costWithoutMaterial) : '—'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">Estimated amount − material cost</div>
                </div>
                <div className="text-[var(--text-muted)] font-mono text-sm self-center">÷</div>
                <div className="flex-1">
                  <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Price per hour</div>
                  <div className="text-lg font-semibold text-cyan-400 mt-0.5">
                    {derived.pricePerHour != null ? formatCurrency(derived.pricePerHour) + '/hr' : '—'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">Cost without material ÷ hours</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <p className="text-sm text-[var(--text-muted)]">Enter a work order number and click Analyze to see estimated amount, material cost, estimated time, and price per hour (cost without material ÷ hours).</p>
        )}
      </div>
    </div>
  );
}
