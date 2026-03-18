import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  Edit,
  Clock,
  User,
  Tag,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  History,
  Paperclip,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow, differenceInDays, parseISO } from 'date-fns';
import {
  getKbArticleBySlug,
  getKbComments,
  getKbRevisions,
  postKbHelpful,
  postKbComment,
  getKbAttachmentUrl,
} from '@/services/api';
import type { KbArticle, KbComment, KbRevision } from '@/types';
import { cn, isAdmin } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import MarkdownBody from '@/components/MarkdownBody';
import { toast } from 'sonner';

const KB_STALE_DAYS = 365;

export default function KnowledgeArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [article, setArticle] = useState<KbArticle | null>(null);
  const [comments, setComments] = useState<KbComment[]>([]);
  const [revisions, setRevisions] = useState<KbRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [helpfulSubmitted, setHelpfulSubmitted] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentType, setCommentType] = useState<'comment' | 'edit_suggestion'>('comment');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getKbArticleBySlug(slug);
        if (cancelled) return;
        if (!res.success || !res.data) {
          setArticle(null);
          return;
        }
        setArticle(res.data);
        const [comRes, revRes] = await Promise.all([
          getKbComments(res.data.id),
          getKbRevisions(res.data.id),
        ]);
        if (cancelled) return;
        if (comRes.success && comRes.data) setComments(comRes.data);
        if (revRes.success && revRes.data) setRevisions(revRes.data);
      } catch (e) {
        if (!cancelled) {
          setArticle(null);
          console.error(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const handleHelpful = async (helpful: boolean) => {
    if (!article || helpfulSubmitted) return;
    try {
      await postKbHelpful(article.id, helpful);
      setHelpfulSubmitted(true);
      setArticle((prev) =>
        prev
          ? {
              ...prev,
              helpfulYes: prev.helpfulYes + (helpful ? 1 : 0),
              helpfulNo: prev.helpfulNo + (helpful ? 0 : 1),
            }
          : null
      );
    } catch (e) {
      toast.error('Could not record feedback');
    }
  };

  const handleSubmitComment = async () => {
    if (!article || !commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await postKbComment(article.id, commentType, commentBody.trim());
      if (res.success && res.data) {
        setComments((prev) => [...prev, res.data!]);
        setCommentBody('');
        toast.success('Comment added');
      }
    } catch (e) {
      toast.error('Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const isStale =
    article &&
    differenceInDays(new Date(), parseISO(article.updatedAt)) > KB_STALE_DAYS;
  const canEdit = article && user && (isAdmin(user) || article.ownerUserId === user.id);

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
        <p className="text-[var(--text-secondary)]">Article not found.</p>
        <Link to="/knowledge" className="text-accent hover:underline mt-2 inline-block">
          Back to Knowledge Base
        </Link>
      </div>
    );
  }

  return (
    <article className="animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{article.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-[var(--text-secondary)]">
            {article.categoryName && (
              <span className="flex items-center gap-1">
                <Tag className="w-4 h-4" />
                {article.categoryName}
              </span>
            )}
            {article.ownerDisplayName && (
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                {article.ownerDisplayName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Updated {formatDistanceToNow(new Date(article.updatedAt), { addSuffix: true })}
            </span>
            {article.reviewDueAt && (
              <span>Review due: {new Date(article.reviewDueAt).toLocaleDateString()}</span>
            )}
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium',
                article.status === 'standard' && 'bg-green-500/20 text-green-400',
                article.status === 'reviewed' && 'bg-blue-500/20 text-blue-400',
                article.status === 'draft' && 'bg-zinc-500/20 text-[var(--text-secondary)]'
              )}
            >
              {article.status}
            </span>
            {isStale && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs">
                <AlertCircle className="w-3 h-3" />
                Stale
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <Link
            to={`/knowledge/${article.slug}/edit`}
            className="btn-secondary flex items-center gap-2 shrink-0"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        )}
      </div>

      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {article.tags.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="card p-6 mb-6">
        <MarkdownBody content={article.body} />
      </div>

      {article.attachments.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-2 mb-2">
            <Paperclip className="w-4 h-4" />
            Attachments
          </h3>
          <ul className="space-y-1">
            {article.attachments.map((att, i) => (
              <li key={i}>
                <a
                  href={att.url || getKbAttachmentUrl(article.id, att.path || att.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline text-sm"
                >
                  {att.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-4 mb-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Was this helpful?</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleHelpful(true)}
            disabled={helpfulSubmitted}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
              helpfulSubmitted
                ? 'border-[var(--border-default)] text-[var(--text-muted)] cursor-default'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-400'
            )}
          >
            <ThumbsUp className="w-4 h-4" />
            Yes {article.helpfulYes > 0 && `(${article.helpfulYes})`}
          </button>
          <button
            type="button"
            onClick={() => handleHelpful(false)}
            disabled={helpfulSubmitted}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
              helpfulSubmitted
                ? 'border-[var(--border-default)] text-[var(--text-muted)] cursor-default'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
            )}
          >
            <ThumbsDown className="w-4 h-4" />
            No {article.helpfulNo > 0 && `(${article.helpfulNo})`}
          </button>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <button
          type="button"
          onClick={() => setShowRevisions(!showRevisions)}
          className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <History className="w-4 h-4" />
          Revision history ({revisions.length})
        </button>
        {showRevisions && (
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            {revisions.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span>{r.userDisplayName ?? 'Unknown'}</span>
                <span>{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                {r.note && <span className="text-[var(--text-muted)]">— {r.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4" />
          Comments
        </h3>
        <ul className="space-y-3 mb-4">
          {comments.map((c) => (
            <li key={c.id} className="border-b border-[var(--border-subtle)] pb-3 last:border-0">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
                <span>{c.userDisplayName ?? 'Unknown'}</span>
                <span>{c.type === 'edit_suggestion' ? 'Suggested edit' : 'Comment'}</span>
                <span>{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
          {comments.length === 0 && <p className="text-sm text-[var(--text-muted)]">No comments yet.</p>}
        </ul>
        <div className="space-y-2">
          <select
            className="input text-sm w-full max-w-xs"
            value={commentType}
            onChange={(e) => setCommentType(e.target.value as 'comment' | 'edit_suggestion')}
          >
            <option value="comment">Comment</option>
            <option value="edit_suggestion">Suggest edit</option>
          </select>
          <textarea
            className="input w-full min-h-[80px] text-sm"
            placeholder="Add a comment or suggest an edit..."
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
          />
          <button
            type="button"
            onClick={handleSubmitComment}
            disabled={!commentBody.trim() || submittingComment}
            className="btn-primary text-sm"
          >
            {submittingComment ? 'Sending...' : 'Post'}
          </button>
        </div>
      </div>
    </article>
  );
}
