'use client';

import {useState} from 'react';
import type {UIMessage} from '@ai-sdk/react';
import {MarkdownRenderer} from './MarkdownRenderer';
import {ToolCallRow} from './ToolCallRow';
import {AskQuestionCard} from './AskQuestionCard';

// Bot avatar
function BotAvatar() {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{background: 'var(--color-accent-dim)', color: 'var(--color-accent)'}}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
      </svg>
    </div>
  );
}

// Copy button — shown on hover
function CopyButton({text}: {text: string}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copy"
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

interface MessageAssistantProps {
  msg: UIMessage;
  isLatest: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  onSelectAnswer: (label: string) => void;
}

export function MessageAssistant({msg, isLatest, isLoading, isStreaming, onSelectAnswer}: MessageAssistantProps) {
  // Collect all text for copy
  const allText = msg.parts
    .filter((p): p is {type: 'text'; text: string} => p.type === 'text')
    .map(p => p.text)
    .join('\n\n');

  return (
    <div className="group flex gap-3 px-4 py-4">
      <BotAvatar />
      <div className="flex-1 min-w-0">
        {msg.parts.map((part, partIdx) => {
          // Skip step markers
          if (part.type === 'step-start') return null;

          // Text part → markdown
          if (part.type === 'text') {
            const text = (part as {type: 'text'; text: string}).text;
            if (!text) return null;
            return (
              <MarkdownRenderer
                key={partIdx}
                text={text}
                isRunning={isStreaming && isLatest}
              />
            );
          }

          // Tool parts
          if (part.type.startsWith('tool-')) {
            const toolName = part.type.slice('tool-'.length);
            const toolPart = part as {
              type: string;
              state: string;
              toolCallId?: string;
              input?: unknown;
              output?: unknown;
            };

            // askQuestion renders inline as a card
            if (toolName === 'askQuestion') {
              if (toolPart.state === 'input-streaming') return null;
              const inp = toolPart.input as Partial<{question: string; options: Array<{value: string; label: string}>}>;
              if (!inp?.question || !inp?.options?.length) return null;
              return (
                <AskQuestionCard
                  key={partIdx}
                  question={inp.question}
                  options={inp.options}
                  disabled={isLoading || !isLatest}
                  onSelect={onSelectAnswer}
                />
              );
            }

            // All other tool calls → collapsible row
            const isDone =
              toolPart.state === 'output-available' || toolPart.state === 'output-error';
            return (
              <ToolCallRow
                key={partIdx}
                name={toolName}
                status={isDone ? 'done' : 'running'}
                input={isDone ? toolPart.input : undefined}
                output={isDone ? toolPart.output : undefined}
              />
            );
          }

          return null;
        })}

        {/* Action bar — copy button, only shown when there's text */}
        {allText && (
          <div className="flex items-center gap-1 mt-1 -ml-1.5">
            <CopyButton text={allText} />
          </div>
        )}
      </div>
    </div>
  );
}
