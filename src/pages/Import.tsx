import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Eye, RotateCcw, Download, Database } from 'lucide-react';
import { toast } from 'sonner';
import { uploadFile, confirmImport, importFromProshop, debugProshopWorkOrders, getProshopWorkOrdersCsvUrl } from '@/services/api';
import type { ImportPreview, ImportReport } from '@/types';
import { cn } from '@/lib/utils';

export default function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [dragOver, setDragOver] = useState(false);
  
  // Proshop import state
  const [proshopImporting, setProshopImporting] = useState(false);
  const [proshopResult, setProshopResult] = useState<ImportReport | null>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.match(/\.(xlsx?|xlsm|csv)$/i)) {
      toast.error('Please select an Excel file (.xlsx, .xls, .xlsm) or CSV file (.csv)');
      return;
    }
    setFile(f);
    setResult(null);
    setLoading(true);
    try {
      const res = await uploadFile(f);
      if (res.success) {
        setPreview(res.data);
        toast.success('File parsed successfully');
      } else {
        toast.error('Failed to parse file');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleConfirm = async () => {
    if (!preview?.filePath) return;
    setImporting(true);
    try {
      const res = await confirmImport(preview.filePath, 'replace');
      if (res.success) {
        setResult(res.data);
        toast.success(`Import complete: ${res.data.schedule.imported} imported`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  const handleProshopImport = async () => {
    setProshopImporting(true);
    setProshopResult(null);
    try {
      const res = await importFromProshop();
      if (res.success) {
        setProshopResult(res.data);
        const total = res.data.schedule.imported + res.data.schedule.updated;
        toast.success(`Proshop import complete: ${res.data.schedule.imported} imported, ${res.data.schedule.updated} updated`);
      } else {
        toast.error('Proshop import failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Proshop import failed');
    } finally {
      setProshopImporting(false);
    }
  };

  const resetProshop = () => {
    setProshopResult(null);
    setDebugData(null);
  };

  const handleDebugProshop = async () => {
    setDebugLoading(true);
    setDebugData(null);
    try {
      const res = await debugProshopWorkOrders();
      if (res.success) {
        setDebugData(res.data);
        toast.success('Debug data fetched successfully');
      } else {
        toast.error('Failed to fetch debug data');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch debug data');
    } finally {
      setDebugLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Import Work Orders</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Import work orders from Proshop API or upload an Excel/CSV file</p>
      </div>

      {/* Proshop Import Section */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-6 h-6 text-accent" />
          <div>
            <h2 className="text-lg font-semibold">Import from Proshop</h2>
            <p className="text-xs text-[var(--text-secondary)]">Import active work orders with Engineering work center from Proshop API</p>
          </div>
        </div>

        {!proshopResult && !debugData ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={handleProshopImport}
                disabled={proshopImporting}
                className="btn-primary flex-1"
              >
                {proshopImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Import from Proshop
                  </>
                )}
              </button>
              <button
                onClick={handleDebugProshop}
                disabled={debugLoading}
                className="btn-secondary"
              >
                {debugLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
              <a
                href={getProshopWorkOrdersCsvUrl()}
                download
                className="btn-secondary"
                title="Download Proshop data as CSV"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
            {proshopImporting && (
              <p className="text-xs text-zinc-400 text-center">Fetching and processing work orders...</p>
            )}
            {debugLoading && (
              <p className="text-xs text-[var(--text-secondary)] text-center">Fetching debug data...</p>
            )}
          </div>
        ) : debugData ? (
          <div className="space-y-4 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-md font-semibold">Proshop Data Structure</h3>
                <p className="text-xs text-[var(--text-secondary)]">Total records: {debugData.totalRecords}, Fetched: {debugData.recordsFetched}, Engineering: {debugData.engineeringRecords}</p>
              </div>
              <button onClick={resetProshop} className="btn-ghost text-xs">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {debugData.engineeringSample && debugData.engineeringSample.length > 0 && (
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Sample Engineering Work Orders ({debugData.engineeringSample.length})</h4>
                <details className="text-xs">
                  <summary className="text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] mb-2">View sample data</summary>
                  <pre className="bg-[var(--bg-surface)] p-3 rounded overflow-x-auto text-[var(--text-secondary)] mt-2">
                    {JSON.stringify(debugData.engineeringSample, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {debugData.sampleRecords && debugData.sampleRecords.length > 0 && (
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Sample All Work Orders ({debugData.sampleRecords.length})</h4>
                <details className="text-xs">
                  <summary className="text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] mb-2">View sample data</summary>
                  <pre className="bg-[var(--bg-surface)] p-3 rounded overflow-x-auto text-[var(--text-secondary)] mt-2">
                    {JSON.stringify(debugData.sampleRecords, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            <div className="flex gap-3">
              <a
                href={getProshopWorkOrdersCsvUrl()}
                download
                className="btn-primary flex-1"
              >
                <Download className="w-4 h-4" />
                Download Full CSV
              </a>
              <button onClick={resetProshop} className="btn-secondary">
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
              <div>
                <h3 className="text-md font-semibold text-green-400">Proshop Import Complete</h3>
                <p className="text-xs text-[var(--text-secondary)]">Work orders have been imported and updated</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{proshopResult.schedule.imported}</p>
                <p className="text-xs text-[var(--text-secondary)]">New Work Orders</p>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{proshopResult.schedule.updated || 0}</p>
                <p className="text-xs text-[var(--text-secondary)]">Updated</p>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{proshopResult.schedule.skipped || 0}</p>
                <p className="text-xs text-[var(--text-secondary)]">Skipped</p>
              </div>
            </div>

            {proshopResult.schedule.errors && proshopResult.schedule.errors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-xs font-medium text-red-400 mb-1">Errors ({proshopResult.schedule.errors.length})</p>
                <ul className="text-xs text-red-300/70 space-y-0.5 max-h-32 overflow-y-auto">
                  {proshopResult.schedule.errors.map((e, i) => (
                    <li key={i}>• WO {e.wo}: {e.error}</li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={resetProshop} className="btn-primary w-full">
              <Database className="w-4 h-4" />
              Import Again from Proshop
            </button>
          </div>
        )}
      </div>

      {/* Excel/CSV Import Section */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Import Excel / CSV</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Upload an Engineering Schedule workbook (.xlsx, .xls, .xlsm) or CSV file (.csv) to import or update data</p>
      </div>

      {/* Step 1: Upload */}
      {!result && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-2xl p-12 text-center transition-all',
            dragOver ? 'border-accent bg-accent/5' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]',
          )}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
              <p className="text-[var(--text-secondary)]">Parsing file...</p>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center gap-3">
              <FileSpreadsheet className="w-10 h-10 text-green-400" />
              <p className="text-[var(--text-primary)] font-medium">{file.name}</p>
              <p className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</p>
              <button onClick={reset} className="btn-ghost text-xs mt-2">
                <RotateCcw className="w-3 h-3" /> Choose different file
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-10 h-10 text-[var(--text-muted)]" />
              <p className="text-[var(--text-secondary)]">Drag & drop your Excel or CSV file here</p>
              <p className="text-xs text-[var(--text-muted)]">or</p>
              <label className="btn-primary cursor-pointer">
                <Upload className="w-4 h-4" /> Browse Files
                <input type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {preview && !result && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Eye className="w-5 h-5 text-accent" /> Import Preview
            </h2>

            {/* Sheets detected */}
            <div className="space-y-3">
              {Object.entries(preview.sheets).map(([sheetName, sheet]) => (
                <div key={sheetName} className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-[var(--text-primary)]">{sheetName}</h3>
                    <span className="text-xs text-[var(--text-muted)]">{sheet.rowCount} rows detected</span>
                  </div>

                  {/* Column Mappings */}
                  <div className="text-xs space-y-1">
                    <p className="text-[var(--text-muted)] mb-1">Column Mappings:</p>
                    <div className="grid grid-cols-2 gap-1">
                      {sheet.mappings.filter(m => m.mapped).map(m => (
                        <div key={m.index} className="flex items-center gap-1">
                          <span className="text-[var(--text-secondary)]">{m.original}</span>
                          <span className="text-[var(--text-muted)]">→</span>
                          <span className="text-accent">{m.dbColumn}</span>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const unmapped = sheet.mappings.filter(m => !m.mapped && m.original.trim());
                      return unmapped.length > 0 ? (
                        <p className="text-yellow-400/70 mt-1">
                          Unmapped: {unmapped.map(m => m.original).join(', ')}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* Sample rows */}
                  {sheet.sampleRows.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">View sample rows ({sheet.sampleRows.length})</summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="text-[var(--text-muted)]">
                              {Object.keys(sheet.sampleRows[0]).map(k => (
                                <th key={k} className="text-left px-2 py-1 font-medium">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sheet.sampleRows.map((row, i) => (
                              <tr key={i} className="border-t border-[var(--border-subtle)]">
                                {Object.values(row).map((v, j) => (
                                  <td key={j} className="px-2 py-1 text-[var(--text-secondary)] max-w-[150px] truncate">{String(v ?? '')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Confirm button */}
          <div className="flex items-center gap-3">
            <button onClick={handleConfirm} disabled={importing} className="btn-primary">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {importing ? 'Importing...' : 'Confirm Import'}
            </button>
            <button onClick={reset} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {result && (
        <div className="card animate-scale-in">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <div>
              <h2 className="text-lg font-semibold text-green-400">Import Complete</h2>
              <p className="text-sm text-[var(--text-secondary)]">Data has been loaded into the database</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-green-500/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{result.schedule.imported}</p>
              <p className="text-xs text-[var(--text-secondary)]">Work Orders</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-400">{result.revisions.imported}</p>
              <p className="text-xs text-[var(--text-secondary)]">Revisions</p>
            </div>
            <div className="bg-purple-500/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-purple-400">{result.construction.imported}</p>
              <p className="text-xs text-[var(--text-secondary)]">Construction Metrics</p>
            </div>
          </div>

          {result.schedule.skipped > 0 && (
            <p className="text-xs text-[var(--text-muted)] mb-2">Skipped {result.schedule.skipped} rows (missing WO number)</p>
          )}

          {result.schedule.errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
              <p className="text-xs font-medium text-red-400 mb-1">Errors ({result.schedule.errors.length})</p>
              <ul className="text-xs text-red-300/70 space-y-0.5 max-h-32 overflow-y-auto">
                {result.schedule.errors.map((e, i) => <li key={i}>• WO {e.wo}: {e.error}</li>)}
              </ul>
            </div>
          )}

          <button onClick={reset} className="btn-primary">
            <Upload className="w-4 h-4" /> Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
