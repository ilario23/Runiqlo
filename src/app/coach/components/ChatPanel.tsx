'use client';

import {useEffect, useRef, useState} from 'react';
import {useChat, type UIMessage} from '@ai-sdk/react';
import {DefaultChatTransport} from 'ai';
import {motion} from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const TOOL_LABELS: Record<string, string> = {
  getFitnessSummary: 'Checking fitness metrics',
  getRecentActivities: 'Looking up recent activities',
  getZoneDistribution: 'Analysing zone distribution',
  getBestEfforts: 'Fetching personal bests',
  getTrainingPlan: 'Reading training plan',
  getWeeklyPlan: 'Checking weekly schedule',
  getAthleteNotes: 'Reviewing athlete notes',
  saveTrainingPlan: 'Saving training plan',
  saveWeeklyPlan: 'Saving weekly plan',
  updateAthleteNotes: 'Updating athlete notes',
  linkCompletedActivity: 'Linking Strava activity',
  askQuestion: 'Asking a question',
};

function AskQuestionCard({
  question,
  options,
  disabled,
  onSelect,
}: {
  question: string;
  options: Array<{value: string; label: string}>;
  disabled: boolean;
  onSelect: (label: string) => void;
}) {
  return (
    <div className="flex justify-start my-1">
      <div className="max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 bg-white/[0.06] border border-white/[0.10] space-y-3">
        <p className="text-sm text-white/90 leading-snug">{question}</p>
        <div className="flex flex-wrap gap-2">
          {options.map(opt => (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => onSelect(opt.label)}
              className={[
                "px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
                disabled
                  ? "bg-white/[0.04] border-white/[0.08] text-white/30 cursor-not-allowed"
                  : "bg-[#0a84ff]/10 border-[#0a84ff]/40 text-[#0a84ff] hover:bg-[#0a84ff]/20 hover:border-[#0a84ff]/70 cursor-pointer",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolCallBubble({name, status}: {name: string; status: 'running' | 'done'}) {
  const label = TOOL_LABELS[name] ?? name;

  return (
    <div className="flex justify-start my-1">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs text-white/50">
        {status === 'running' ? (
          <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({children}) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({children}) => <em className="italic">{children}</em>,
  ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
  ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
  li: ({children}) => <li className="text-white/90">{children}</li>,
  h1: ({children}) => <h1 className="font-bold text-white text-base mb-1 mt-2">{children}</h1>,
  h2: ({children}) => <h2 className="font-semibold text-white text-sm mb-1 mt-2">{children}</h2>,
  h3: ({children}) => <h3 className="font-semibold text-white/90 text-sm mb-0.5 mt-1.5">{children}</h3>,
  code: ({children, className}) => {
    const isBlock = className?.includes('language-');
    return isBlock
      ? <code className="block bg-white/[0.06] rounded-lg px-3 py-2 text-xs font-mono text-white/80 my-2 overflow-x-auto">{children}</code>
      : <code className="bg-white/[0.10] rounded px-1 py-0.5 text-xs font-mono text-white/80">{children}</code>;
  },
  hr: () => <hr className="border-white/[0.10] my-2" />,
  blockquote: ({children}) => <blockquote className="border-l-2 border-white/20 pl-3 text-white/60 my-2">{children}</blockquote>,
  table: ({children}) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
  th: ({children}) => <th className="border border-white/[0.15] px-2 py-1 text-left font-semibold text-white/80">{children}</th>,
  td: ({children}) => <td className="border border-white/[0.10] px-2 py-1 text-white/70">{children}</td>,
};

function MessageBubble({role, content}: {role: 'user' | 'assistant'; content: string}) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
      {role === 'assistant' && (
        <div className="w-7 h-7 rounded-full bg-[#0a84ff]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          </svg>
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          role === 'user'
            ? 'bg-[#0a84ff] text-white rounded-tr-md'
            : 'bg-white/[0.06] border border-white/[0.08] text-white/90 rounded-tl-md'
        }`}
      >
        {role === 'assistant' ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

interface ChatPanelProps {
  athleteId: number;
  initialMessage?: string;
  onPlanSaved?: () => void;
}

export function ChatPanel({athleteId, initialMessage, onPlanSaved}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [historyMessages, setHistoryMessages] = useState<UIMessage[] | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/coach/chat?athleteId=${athleteId}`)
      .then(r => r.json())
      .then((msgs: UIMessage[]) => setHistoryMessages(msgs))
      .catch(() => setHistoryMessages([]));
  }, [athleteId]);

  const {messages, sendMessage, status} = useChat({
    transport: new DefaultChatTransport({
      api: '/api/coach/chat',
      body: {athleteId},
    }),
    messages: historyMessages,
    onFinish: () => {
      onPlanSaved?.();
    },
    onError: (error) => {
      setErrorMsg(error.message);
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  const sentInitial = useRef(false);
  useEffect(() => {
    if (initialMessage && !sentInitial.current && historyMessages !== undefined && messages.length === (historyMessages?.length ?? 0)) {
      sentInitial.current = true;
      sendMessage({text: initialMessage});
    }
  }, [initialMessage, historyMessages, messages.length, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        sendMessage({text: input});
        setInput('');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage({text: input});
      setInput('');
    }
  };

  if (historyMessages === undefined) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  const hasMessages = messages.length > 0;
  const lastAssistantIdx = messages.reduce(
    (last, m, i) => (m.role === 'assistant' ? i : last),
    -1,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#0a84ff]/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Your Coach</div>
            <div className="text-xs text-white/30">AI-powered running coach</div>
          </div>
          {isLoading && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-white/40">
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Thinking
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0a84ff]/15 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-white/60 mb-1">Talk to your coach</p>
              <p className="text-xs text-white/30 max-w-[200px]">Ask about your training, request a weekly plan, or share how you're feeling</p>
            </div>
            <div className="flex flex-col gap-1.5 w-full mt-2">
              {[
                'Create my training plan',
                'Generate my plan for this week',
                'How is my fitness trending?',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage({text: suggestion})}
                  className="text-xs text-white/50 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl px-3 py-2 transition-colors text-left"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, msgIdx) => {
          if (msg.role === 'user') {
            const textPart = msg.parts.find((p): p is {type: 'text'; text: string} => p.type === 'text');
            return textPart?.text ? <MessageBubble key={msg.id} role="user" content={textPart.text} /> : null;
          }

          if (msg.role === 'assistant') {
            const isLatest = msgIdx === lastAssistantIdx;
            return (
              <div key={msg.id} className="space-y-2">
                {msg.parts.map((part, partIdx) => {
                  if (part.type === 'step-start') return null;

                  if (part.type === 'text') {
                    const text = (part as {type: 'text'; text: string}).text;
                    return text ? <MessageBubble key={partIdx} role="assistant" content={text} /> : null;
                  }

                  // Tool parts: type is 'tool-{toolName}'
                  if (part.type.startsWith('tool-')) {
                    const toolName = part.type.slice('tool-'.length);
                    const toolPart = part as {type: string; state: string; input?: unknown};

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
                          onSelect={(label) => sendMessage({text: label})}
                        />
                      );
                    }

                    const isDone = toolPart.state === 'output-available' || toolPart.state === 'output-error';
                    return (
                      <ToolCallBubble
                        key={partIdx}
                        name={toolName}
                        status={isDone ? 'done' : 'running'}
                      />
                    );
                  }

                  return null;
                })}
              </div>
            );
          }

          return null;
        })}

        {isLoading && !messages.some((m, i) => m.role === 'assistant' && i === messages.length - 1) && (
          <div className="flex justify-start gap-2">
            <div className="w-7 h-7 rounded-full bg-[#0a84ff]/20 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
              </svg>
            </div>
            <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <motion.span className="w-1.5 h-1.5 rounded-full bg-white/40" animate={{opacity: [0.3, 1, 0.3]}} transition={{duration: 1.2, repeat: Infinity, delay: 0}} />
                <motion.span className="w-1.5 h-1.5 rounded-full bg-white/40" animate={{opacity: [0.3, 1, 0.3]}} transition={{duration: 1.2, repeat: Infinity, delay: 0.2}} />
                <motion.span className="w-1.5 h-1.5 rounded-full bg-white/40" animate={{opacity: [0.3, 1, 0.3]}} transition={{duration: 1.2, repeat: Infinity, delay: 0.4}} />
              </div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 text-sm bg-red-500/10 border border-red-500/20 text-red-400">
              {errorMsg ?? 'Something went wrong. Please try again.'}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-white/[0.07]">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach anything…"
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#0a84ff]/50 resize-none disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{fieldSizing: 'content' as React.CSSProperties['fieldSizing']}}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-xl bg-[#0a84ff] flex items-center justify-center hover:bg-[#0a84ff]/90 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="text-xs text-white/20 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
