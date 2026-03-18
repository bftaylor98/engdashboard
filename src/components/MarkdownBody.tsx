import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownBodyProps {
  content: string;
  className?: string;
}

export default function MarkdownBody({ content, className }: MarkdownBodyProps) {
  return (
    <div
      className={cn(
        'markdown-body prose prose-invert max-w-none',
        'prose-headings:text-[var(--text-primary)] prose-p:text-[var(--text-secondary)] prose-li:text-[var(--text-secondary)]',
        'prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline',
        'prose-code:bg-[var(--bg-elevated)] prose-code:px-1 prose-code:rounded prose-code:text-[var(--text-primary)] prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-[var(--bg-surface)] prose-pre:border prose-pre:border-[var(--border-subtle)]',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
