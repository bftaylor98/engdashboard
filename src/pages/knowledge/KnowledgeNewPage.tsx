import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getKbCategories, createKbArticle } from '@/services/api';
import type { KbCategory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/lib/utils';
import { KB_ARTICLE_TEMPLATE_BODY } from './knowledgeTemplate';
import { toast } from 'sonner';

export default function KnowledgeNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [tagsStr, setTagsStr] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState(KB_ARTICLE_TEMPLATE_BODY);
  const [status, setStatus] = useState<'draft' | 'reviewed' | 'standard'>('draft');
  const isEditor = user && isAdmin(user);

  useEffect(() => {
    getKbCategories()
      .then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          setCategories(res.data);
          setCategoryId(res.data[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    const cat = categoryId === '' ? categories[0]?.id : Number(categoryId);
    if (!cat) {
      toast.error('Category is required');
      return;
    }
    setSaving(true);
    try {
      const tags = tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await createKbArticle({
        title: title.trim(),
        categoryId: cat,
        tags,
        summary: summary.trim() || undefined,
        body: body || KB_ARTICLE_TEMPLATE_BODY,
        status: isEditor ? status : 'draft',
      });
      if (res.success && res.data) {
        toast.success('Article created');
        navigate(`/knowledge/${res.data.slug}`);
      } else {
        toast.error(res.error || 'Failed to create');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create article');
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

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/knowledge" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">New Article</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Title *</label>
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
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Category *</label>
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
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              className="input w-full"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. faq, workflow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Summary</label>
            <input
              type="text"
              className="input w-full"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief summary"
            />
          </div>
          {isEditor && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Status</label>
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
          )}
        </div>

        <div className="card p-4">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Body (Markdown)</label>
          <textarea
            className="input w-full min-h-[320px] font-mono text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Use the template sections: Summary, When to use this, Step-by-step, Gotchas, Examples, Related links, Attachments"
          />
        </div>

        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Creating...
              </>
            ) : (
              'Create Article'
            )}
          </button>
          <Link to="/knowledge" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
