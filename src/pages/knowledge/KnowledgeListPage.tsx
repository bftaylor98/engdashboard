import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Paperclip,
  MessageSquare,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Pin,
  HelpCircle,
  Clock,
  Eye,
  Loader2,
} from 'lucide-react';
import { getKbCategories, getKbArticles, getKbFeatured, getKbRecent } from '@/services/api';
import type { KbCategory, KbArticle } from '@/types';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

function buildCategoryTree(categories: KbCategory[]): KbCategory[] {
  const byId = new Map(categories.map((c) => [c.id, { ...c, children: [] as KbCategory[] }]));
  const roots: KbCategory[] = [];
  categories.forEach((c) => {
    const node = byId.get(c.id)!;
    if (c.parentId == null) {
      roots.push(node);
    } else {
      const parent = byId.get(c.parentId);
      if (parent) parent.children!.push(node);
      else roots.push(node);
    }
  });
  roots.sort((a, b) => a.sortOrder - b.sortOrder);
  roots.forEach((r) => r.children?.sort((a, b) => a.sortOrder - b.sortOrder));
  return roots;
}

function CategoryTree({
  categories,
  selectedId,
  onSelect,
}: {
  categories: KbCategory[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set(categories.map((c) => c.id)));
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: KbCategory, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isSelected = selectedId === node.id;
    return (
      <div key={node.id} className="flex flex-col">
        <div
          className={cn(
            'flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer text-sm',
            isSelected ? 'bg-accent/15 text-accent' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
          )}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="p-0.5 -m-0.5 rounded hover:bg-[var(--bg-hover)]"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <button
            type="button"
            className="flex-1 text-left truncate"
            onClick={() => onSelect(node.id)}
          >
            {node.name}
          </button>
        </div>
        {hasChildren && isExpanded && node.children!.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'w-full text-left py-1.5 px-2 rounded-lg text-sm',
          selectedId === null ? 'bg-accent/15 text-accent' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
        )}
      >
        All categories
      </button>
      {tree.map((node) => renderNode(node))}
    </div>
  );
}

function ArticleCard({ article }: { article: KbArticle }) {
  return (
    <Link
      to={`/knowledge/${article.slug}`}
      className="card card-hover block p-4 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[var(--text-primary)] truncate flex-1">{article.title}</h3>
        <span
          className={cn(
            'shrink-0 text-xs px-2 py-0.5 rounded',
            article.status === 'standard' && 'bg-green-500/20 text-green-400',
            article.status === 'reviewed' && 'bg-blue-500/20 text-blue-400',
            article.status === 'draft' && 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
          )}
        >
          {article.status}
        </span>
      </div>
      {article.summary && <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{article.summary}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
        {article.categoryName && <span>{article.categoryName}</span>}
        <span>{formatDistanceToNow(new Date(article.updatedAt), { addSuffix: true })}</span>
        <span>{article.viewsCount} views</span>
        {(article.helpfulYes + article.helpfulNo) > 0 && (
          <span>{article.helpfulYes} helpful</span>
        )}
      </div>
    </Link>
  );
}

export default function KnowledgeListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [featured, setFeatured] = useState<{ pinned: KbArticle[]; faq: KbArticle[] }>({ pinned: [], faq: [] });
  const [recent, setRecent] = useState<KbArticle[]>([]);
  const [list, setList] = useState<KbArticle[]>([]);
  const [mostViewed, setMostViewed] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [debouncedQ, setDebouncedQ] = useState(searchParams.get('q') ?? '');
  const categoryId = searchParams.get('categoryId');
  const status = searchParams.get('status') ?? '';
  const tagsParam = searchParams.get('tags') ?? '';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const setFilter = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (value == null || value === '') p.delete(key);
        else p.set(key, value);
        return p;
      });
    },
    [setSearchParams]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [catRes, featRes, recRes, listRes] = await Promise.all([
          getKbCategories(),
          getKbFeatured(),
          getKbRecent(10),
          getKbArticles({
            q: debouncedQ || undefined,
            categoryId: categoryId || undefined,
            tags: tagsParam || undefined,
            status: status || undefined,
            order: 'recent',
            limit: 20,
          }),
        ]);
        if (cancelled) return;
        if (catRes.success && catRes.data) setCategories(catRes.data);
        if (featRes.success && featRes.data) setFeatured(featRes.data);
        if (recRes.success && recRes.data) setRecent(recRes.data);
        if (listRes.success && listRes.data) setList(listRes.data);
        if (!debouncedQ) {
          const viewedRes = await getKbArticles({ order: 'views', limit: 6 });
          if (!cancelled && viewedRes.success && viewedRes.data) setMostViewed(viewedRes.data);
        }
      } catch (e) {
        if (!cancelled) console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQ, categoryId, tagsParam, status]);

  const showSearchResults = debouncedQ.length > 0;
  const mainList = list;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-accent" />
          Knowledge Base
        </h1>
        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search articles..."
            className="input w-full pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Link to="/knowledge/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Article
          </Link>
          <button type="button" className="btn-secondary flex items-center gap-2" title="Import or attach files to an article">
            <Paperclip className="w-4 h-4" />
            Import/Attach
          </button>
          <span className="text-sm text-[var(--text-muted)]" title="Use Suggest Edit on an article page">
            <MessageSquare className="w-4 h-4 inline mr-1" />
            Suggest Edit
          </span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-6">
        {/* Left sidebar */}
        <aside className="w-56 shrink-0 flex flex-col gap-4">
          <div className="card p-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Categories</h2>
            <CategoryTree
              categories={categories}
              selectedId={categoryId ? parseInt(categoryId, 10) : null}
              onSelect={(id) => setFilter('categoryId', id != null ? String(id) : null)}
            />
          </div>
          <div className="card p-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Filters</h2>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">Status</label>
                <select
                  className="input w-full text-sm"
                  value={status}
                  onChange={(e) => setFilter('status', e.target.value || null)}
                >
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="standard">Standard</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  className="input w-full text-sm"
                  placeholder="e.g. faq, workflow"
                  value={tagsParam}
                  onChange={(e) => setFilter('tags', e.target.value.trim() || null)}
                />
              </div>
            </div>
          </div>
          <div className="card p-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-2 flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Recently Updated
            </h2>
            <ul className="space-y-1">
              {recent.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/knowledge/${a.slug}`}
                    className="text-sm text-[var(--text-secondary)] hover:text-accent truncate block"
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
              {recent.length === 0 && !loading && <p className="text-xs text-[var(--text-muted)]">No articles yet</p>}
            </ul>
          </div>
        </aside>

        {/* Main feed */}
        <main className="flex-1 min-w-0 space-y-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          ) : (
            <>
              {!showSearchResults && (
                <>
                  {featured.pinned.length > 0 && (
                    <section>
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                        <Pin className="w-5 h-5 text-amber-400" />
                        Pinned / Must-read
                      </h2>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {featured.pinned.map((a) => (
                          <ArticleCard key={a.id} article={a} />
                        ))}
                      </div>
                    </section>
                  )}
                  {featured.faq.length > 0 && (
                    <section>
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                        <HelpCircle className="w-5 h-5 text-blue-400" />
                        Common Questions
                      </h2>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {featured.faq.map((a) => (
                          <ArticleCard key={a.id} article={a} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              <section>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                  {showSearchResults ? (
                    <>Search results for &quot;{debouncedQ}&quot;</>
                  ) : (
                    <>
                      <Clock className="w-5 h-5" />
                      Recently Added / Updated
                    </>
                  )}
                </h2>
                {mainList.length === 0 ? (
                  <div className="card p-8 text-center text-[var(--text-muted)]">
                    {showSearchResults ? 'No articles match your search.' : 'No articles yet. Create one with New Article.'}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {mainList.map((a) => (
                      <ArticleCard key={a.id} article={a} />
                    ))}
                  </div>
                )}
              </section>

              {!showSearchResults && (
                <section>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                    <Eye className="w-5 h-5" />
                    Most Viewed / Helpful
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {mostViewed.length > 0 ? (
                      mostViewed.map((a) => <ArticleCard key={a.id} article={a} />)
                    ) : (
                      <div className="card p-6 text-[var(--text-muted)] col-span-2">No view data yet.</div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
