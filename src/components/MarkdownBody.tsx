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
        'prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-li:text-zinc-300',
        'prose-a:text-accent prose-a:no-underline hover:prose-a:underline',
        'prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded prose-code:text-zinc-200 prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-white/10',
        'light:prose-invert light:prose-headings:text-zinc-900 light:prose-p:text-zinc-700 light:prose-li:text-zinc-700 light:prose-code:bg-zinc-200 light:prose-code:text-zinc-900',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
