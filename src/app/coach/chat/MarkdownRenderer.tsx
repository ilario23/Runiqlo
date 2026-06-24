'use client';

import {MarkdownTextPrimitive} from '@assistant-ui/react-markdown';
import {TextMessagePartProvider} from '@assistant-ui/react';
import {parseStructuredSteps} from '@/lib/workoutUtils';
import {StructuredWorkoutDisplay} from '@/components/StructuredWorkoutDisplay';
import type {Components} from 'react-markdown';

const markdownComponents: Components = {
  p: ({children}) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({children}) => <strong className="font-semibold text-[var(--text)]">{children}</strong>,
  em: ({children}) => <em className="italic">{children}</em>,
  ul: ({children}) => <ul className="list-disc list-outside pl-4 mb-2 space-y-1">{children}</ul>,
  ol: ({children}) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-1">{children}</ol>,
  li: ({children}) => <li className="text-[var(--color-text-2)] leading-relaxed">{children}</li>,
  h1: ({children}) => <h1 className="font-bold text-[var(--text)] text-base mb-2 mt-4 first:mt-0">{children}</h1>,
  h2: ({children}) => <h2 className="font-semibold text-[var(--text)] text-sm mb-1.5 mt-3 first:mt-0">{children}</h2>,
  h3: ({children}) => <h3 className="font-medium text-[var(--text)] text-sm mb-1 mt-2 first:mt-0">{children}</h3>,
  pre: ({children}) => {
    const child = Array.isArray(children) ? children[0] : children;
    const codeEl = child as React.ReactElement<{className?: string; children?: unknown}> | null;
    if (codeEl?.props?.className?.includes('language-structured-workout')) {
      try {
        const raw = String(codeEl.props.children ?? '').trim();
        const blocks = parseStructuredSteps(JSON.parse(raw));
        if (blocks) {
          return (
            <div className="my-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-2)] font-semibold mb-3">Session Breakdown</div>
              <StructuredWorkoutDisplay blocks={blocks} />
            </div>
          );
        }
      } catch {
        // fall through
      }
    }
    return (
      <pre className="bg-[var(--color-surface-2)] rounded-xl px-4 py-3 text-xs font-mono text-[var(--color-text-2)] my-3 overflow-x-auto border border-[var(--color-border)]">
        {children}
      </pre>
    );
  },
  code: ({children, className}) => {
    const isBlock = className?.includes('language-');
    return isBlock
      ? <code className="text-xs font-mono">{children}</code>
      : <code className="bg-[var(--color-surface-2)] rounded px-1.5 py-0.5 text-[11px] font-mono text-[var(--color-text-2)] border border-[var(--color-border)]">{children}</code>;
  },
  hr: () => <hr className="border-[var(--color-border)] my-3" />,
  blockquote: ({children}) => (
    <blockquote className="border-l-2 border-[var(--color-accent)]/40 pl-4 text-[var(--color-text-2)] my-2 italic">
      {children}
    </blockquote>
  ),
  table: ({children}) => (
    <div className="overflow-x-auto my-3 rounded-xl border border-[var(--color-border)]">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({children}) => (
    <th className="border-b border-[var(--color-border)] px-3 py-2 text-left font-semibold text-[var(--text)] bg-[var(--color-surface-2)]">
      {children}
    </th>
  ),
  td: ({children}) => (
    <td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-text-2)] last:border-0">
      {children}
    </td>
  ),
};

export function MarkdownRenderer({text, isRunning}: {text: string; isRunning?: boolean}) {
  return (
    <TextMessagePartProvider text={text} isRunning={isRunning}>
      <MarkdownTextPrimitive
        smooth
        components={markdownComponents}
        className="text-sm text-[var(--color-text-1)] leading-relaxed"
      />
    </TextMessagePartProvider>
  );
}
