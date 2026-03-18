import { useState } from 'react';
import { Search, Loader2, Package, DollarSign, MapPin, AlertCircle, ArrowLeft } from 'lucide-react';
import { lookupCID, searchByDescription } from '@/services/api';
import type { ComponentInfo } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SearchMode = 'cid' | 'description';

export default function Tools() {
  const [searchMode, setSearchMode] = useState<SearchMode>('cid');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [componentInfo, setComponentInfo] = useState<ComponentInfo | null>(null);
  const [searchResults, setSearchResults] = useState<ComponentInfo[]>([]);
  const [selectedFromSearch, setSelectedFromSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    const trimmed = searchInput.trim();
    if (!trimmed) {
      setError(searchMode === 'cid' ? 'Please enter a C-ID.' : 'Please enter a search term.');
      setComponentInfo(null);
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setComponentInfo(null);
    setSearchResults([]);
    setSelectedFromSearch(false);

    try {
      if (searchMode === 'cid') {
        // C-ID search - single result
        const info = await lookupCID(trimmed);
        setComponentInfo(info);
        toast.success(`Found C-ID: ${info.cid}`);
      } else {
        // Description search - multiple results
        const results = await searchByDescription(trimmed);
        if (results.length === 0) {
          setError(`No components found matching "${trimmed}"`);
          toast.info('No results found');
        } else {
          setSearchResults(results);
          toast.success(`Found ${results.length} component(s)`);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      setComponentInfo(null);
      setSearchResults([]);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectComponent = async (component: ComponentInfo) => {
    // Fetch full details for the selected component
    setLoading(true);
    setError(null);
    setSelectedFromSearch(true);

    try {
      const fullInfo = await lookupCID(component.cid);
      setComponentInfo(fullInfo);
      toast.success(`Loaded details for ${fullInfo.cid}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load component details.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToResults = () => {
    setComponentInfo(null);
    setSelectedFromSearch(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleLookup();
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Tools</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Look up component information from the ZOLLER database
        </p>
      </div>

      {/* Component Lookup Widget */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-accent" />
          Component Lookup
        </h2>

        {/* Search Mode Toggle */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => {
              setSearchMode('cid');
              setSearchInput('');
              setComponentInfo(null);
              setSearchResults([]);
              setError(null);
              setSelectedFromSearch(false);
            }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              searchMode === 'cid'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-white/10 hover:bg-zinc-800 hover:text-zinc-200'
            )}
          >
            Search by C-ID
          </button>
          <button
            onClick={() => {
              setSearchMode('description');
              setSearchInput('');
              setComponentInfo(null);
              setSearchResults([]);
              setError(null);
              setSelectedFromSearch(false);
            }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              searchMode === 'description'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-white/10 hover:bg-zinc-800 hover:text-zinc-200'
            )}
          >
            Search by Description
          </button>
        </div>

        {/* Input Section */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                searchMode === 'cid'
                  ? 'Enter C-ID (e.g., C-214 or 214)'
                  : 'Enter description (e.g., end mill, drill bit)'
              }
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-colors"
              disabled={loading}
            />
          </div>
          <button
            onClick={handleLookup}
            disabled={loading || !searchInput.trim()}
            className={cn(
              'px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center gap-2'
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search
              </>
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Description Search Results List */}
        {searchMode === 'description' && searchResults.length > 0 && !componentInfo && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">
                Found {searchResults.length} component{searchResults.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {searchResults.map((result) => (
                <button
                  key={result.cid}
                  onClick={() => handleSelectComponent(result)}
                  className={cn(
                    'w-full text-left p-4 bg-zinc-800/50 border border-white/10 rounded-lg',
                    'hover:bg-zinc-800 hover:border-accent/30 transition-all cursor-pointer',
                    'flex items-start gap-4'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Package className="w-4 h-4 text-accent shrink-0" />
                      <span className="font-semibold text-zinc-100">{result.cid}</span>
                      {result.stockQty > 0 && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                          {result.stockQty} in stock
                        </span>
                      )}
                      {result.stockQty === 0 && (
                        <span className="px-2 py-0.5 bg-zinc-700 text-zinc-400 text-xs rounded">
                          Out of stock
                        </span>
                      )}
                    </div>
                    {result.description && (
                      <p className="text-sm text-zinc-300 mb-1 line-clamp-2">
                        {result.description}
                      </p>
                    )}
                    {result.partNo && (
                      <p className="text-xs text-zinc-500 font-mono">{result.partNo}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Full Component Details Display */}
        {componentInfo && (
          <div className="bg-zinc-800/50 border border-white/10 rounded-lg p-6 space-y-4">
            {/* Header with Back Button (if from description search) */}
            <div className="pb-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-accent" />
                {componentInfo.cid}
              </h3>
              {selectedFromSearch && (
                <button
                  onClick={handleBackToResults}
                  className={cn(
                    'px-3 py-1.5 text-sm bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded-lg',
                    'border border-white/10 hover:border-white/20 transition-colors',
                    'flex items-center gap-2'
                  )}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Results
                </button>
              )}
            </div>

            {/* Component Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Description */}
              {componentInfo.description && (
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Description</p>
                  <p className="text-sm text-zinc-200">{componentInfo.description}</p>
                </div>
              )}

              {/* Part Number */}
              {componentInfo.partNo && (
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Part Number</p>
                  <p className="text-sm text-zinc-200 font-mono">{componentInfo.partNo}</p>
                </div>
              )}

              {/* Unit Price */}
              {componentInfo.unitPrice !== null && componentInfo.unitPrice !== undefined && (
                <div>
                  <p className="text-xs text-zinc-400 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Unit Price
                  </p>
                  <p className="text-sm text-zinc-200">
                    ${parseFloat(componentInfo.unitPrice.toString()).toFixed(2)}
                  </p>
                </div>
              )}

              {/* Storage Location */}
              {componentInfo.storageLocation && (
                <div>
                  <p className="text-xs text-zinc-400 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Storage Location
                  </p>
                  <p className="text-sm text-zinc-200">{componentInfo.storageLocation}</p>
                </div>
              )}
            </div>

            {/* Stock Information */}
            <div className="pt-4 border-t border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stock Quantity */}
                <div className="bg-zinc-900/50 rounded-lg p-4">
                  <p className="text-xs text-zinc-400 mb-2">Stock Quantity</p>
                  <p className="text-2xl font-bold text-green-400">{componentInfo.stockQty || 0}</p>
                  <p className="text-xs text-zinc-500 mt-1">Available in stock</p>
                </div>

                {/* Circulation Quantity */}
                <div className="bg-zinc-900/50 rounded-lg p-4">
                  <p className="text-xs text-zinc-400 mb-2">Circulation</p>
                  <p className="text-2xl font-bold text-yellow-400">{componentInfo.circulationQty || 0}</p>
                  <p className="text-xs text-zinc-500 mt-1">Checked out / in use</p>
                </div>
              </div>

              {/* Min/Max Stock (if available) */}
              {(componentInfo.minStock !== null && componentInfo.minStock !== undefined) ||
              (componentInfo.maxStock !== null && componentInfo.maxStock !== undefined) ? (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {componentInfo.minStock !== null && componentInfo.minStock !== undefined && (
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">Minimum Stock</p>
                        <p className="text-sm text-zinc-200">{componentInfo.minStock}</p>
                      </div>
                    )}
                    {componentInfo.maxStock !== null && componentInfo.maxStock !== undefined && (
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">Maximum Stock</p>
                        <p className="text-sm text-zinc-200">{componentInfo.maxStock}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!componentInfo && !error && !loading && searchResults.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {searchMode === 'cid'
                ? 'Enter a C-ID above to look up component information'
                : 'Enter a description above to search for components'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

