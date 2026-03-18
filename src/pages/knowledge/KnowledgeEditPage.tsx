import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { getKbArticleBySlug, getKbCategories, updateKbArticle } from '@/services/api';
import type { KbArticle, KbCategory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/lib/utils';
import { toast } from 'sonner';

export default function KnowledgeEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [article, setArticle] = useState<KbArticle | null>(null);
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [tagsStr, setTagsStr] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'draft' | 'reviewed' | 'standard'>('draft');
  const [reviewDueAt, setReviewDueAt] = useState('');
  const isEditor = user && isAdmin(user);

  useEffect(() => {
    if (!slug) return;
    Promise.all([getKbArticleBySlug(slug), getKbCategories()])
      .then(([artRes, catRes]) => {
        if (artRes.success && artRes.data) {
          const a = artRes.data;
          setArticle(a);
          setTitle(a.title);
          setCategoryId(a.categoryId);
          setTagsStr(a.tags.join(', '));
          setSummary(a.summary ?? '');
          setBody(a.body);
          setStatus(a.status);
          setReviewDueAt(a.reviewDueAt ? a.reviewDueAt.slice(0, 10) : '');
        }
        if (catRes.success && catRes.data) setCategories(catRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const canEdit = article && user && (isAdmin(user) || article.ownerUserId === user.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!article || !title.trim()) return;
    if (!canEdit) {
      toast.error('You cannot edit this article');
      return;
    }
    setSaving(true);
    try {
      const tags = tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const payload: Parameters<typeof updateKbArticle>[1] = {
        title: title.trim(),
        categoryId: categoryId === '' ? article.categoryId : Number(categoryId),
        tags,
        summary: summary.trim() || undefined,
        body,
        reviewDueAt: reviewDueAt.trim() || null,
      };
      if (isEditor) payload.status = status;
      const res = await updateKbArticle(article.id, payload);
      if (res.success && res.data) {
        toast.success('Article updated');
        navigate(`/knowledge/${res.data.slug}`);
      } else {
        toast.error(res.error || 'Failed to update');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update article');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }
  if (!article) {
    return (
      <div className="card p-8 text-center">
        <p className="text-zinc-400">Article not found.</p>
        <Link to="/knowledge" className="text-accent hover:underline mt-2 inline-block">
          Back to Knowledge Base
        </Link>
      </div>
    );
  }
  if (!canEdit) {
    return (
      <div className="card p-8 text-center">
        <p className="text-zinc-400">You do not have permission to edit this article.</p>
        <Link to={`/knowledge/${article.slug}`} className="text-accent hover:underline mt-2 inline-block">
          View article
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/knowledge/${article.slug}`} className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100">Edit: {article.title}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Title *</label>
            <input
              type="text"
              className="input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Category *</label>
            <select
              className="input w-full"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              className="input w-full"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. faq, workflow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Summary</label>
            <input
              type="text"
              className="input w-full"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief summary"
            />
          </div>
          {isEditor && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Status</label>
                <select
                  className="input w-full"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'reviewed' | 'standard')}
                >
                  <option value="draft">Draft</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="standard">Standard</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Review due (optional)</label>
                <input
                  type="date"
                  className="input w-full"
                  value={reviewDueAt}
                  onChange={(e) => setReviewDueAt(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="card p-4">
          <label className="block text-sm font-medium text-zinc-300 mb-2">Body (Markdown)</label>
          <textarea
            className="input w-full min-h-[320px] font-mono text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
          <Link to={`/knowledge/${article.slug}`} className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
