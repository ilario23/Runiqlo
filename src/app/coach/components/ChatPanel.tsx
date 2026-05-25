'use client';

import {useEffect, useRef, useState, useCallback} from 'react';
import {useChat, type UIMessage} from '@ai-sdk/react';
import {DefaultChatTransport} from 'ai';
import {useSettings} from '@/contexts/SettingsContext';
import {motion, AnimatePresence} from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {COMMANDS, findCommand} from '../lib/chatCommands';
import {MENTION_DEFS, resolveAtMentions} from '../lib/atMentions';
import {SessionHistoryDrawer} from './SessionHistoryDrawer';

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
  setGoal: 'Saving your goal',
  getPeakWeeklyKm: 'Calculating peak weekly km',
  updateAthleteNotes: 'Updating athlete notes',
  linkCompletedActivity: 'Linking Strava activity',
  askQuestion: 'Asking a question',
};

// ── Command palette ────────────────────────────────────────────────────────────

function CommandPalette({query, onSelect}: {query: string; onSelect: (name: string) => void}) {
  const filtered = COMMANDS.filter(c => c.name.startsWith(query.toLowerCase()));
  if (!filtered.length) return null;
  return (
    <div className="absolute bottom-full left-0 mb-2 w-full bg-gray-900 border border-white/[0.12] rounded-2xl overflow-hidden shadow-2xl z-50">
      <div className="px-3 py-1.5 border-b border-white/[0.06]">
        <span className="text-xs text-white/30 font-medium">Commands</span>
      </div>
      {filtered.map(cmd => (
        <button
          key={cmd.name}
          onClick={() => onSelect(cmd.name)}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors"
        >
          <span className="text-sm font-mono text-accent-blue">/{cmd.name}</span>
          <span className="text-xs text-white/30">{cmd.argsHint}</span>
          <span className="text-xs text-white/50 ml-auto truncate">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

// ── @ mention dropdown ─────────────────────────────────────────────────────────

function MentionDropdown({query, onSelect}: {query: string; onSelect: (example: string) => void}) {
  const filtered = MENTION_DEFS.filter(m =>
    m.prefix.startsWith(query.toLowerCase()) || m.description.toLowerCase().includes(query.toLowerCase()),
  );
  if (!filtered.length) return null;
  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-gray-900 border border-white/[0.12] rounded-2xl overflow-hidden shadow-2xl z-50">
      <div className="px-3 py-1.5 border-b border-white/[0.06]">
        <span className="text-xs text-white/30 font-medium">References</span>
      </div>
      {filtered.map(m => (
        <button
          key={m.prefix}
          onClick={() => onSelect(m.example)}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.06] text-left transition-colors"
        >
          <span className="text-sm font-mono text-emerald-400">@{m.prefix}</span>
          <span className="text-xs text-white/50">{m.description}</span>
        </button>
      ))}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
                  : "bg-accent-blue/10 border-accent-blue/40 text-accent-blue hover:bg-accent-blue/20 hover:border-accent-blue/70 cursor-pointer",
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
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-green" strokeWidth="2.5">
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
        <div className="w-7 h-7 rounded-full bg-accent-blue/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue" strokeWidth="1.5">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          </svg>
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          role === 'user'
            ? 'bg-accent-blue text-white rounded-tr-md'
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

// ── ChatInner — loading shell; remounts on session switch ─────────────────────
// Fetches history first, then hands loaded messages to ChatContent.
// This ensures useChat in ChatContent is ALWAYS initialized with the real history,
// not with undefined (which would cause the hook to ignore the later prop update).

interface ChatInnerProps {
  athleteId: number;
  /** Captured at mount and never changes within a single ChatInner lifetime. */
  sessionId: string | null | undefined;
  initialMessage?: string;
  onPlanSaved?: () => void;
  onSessionResolved?: (id: string | null) => void;
}

function ChatInner({athleteId, sessionId: sessionIdProp, initialMessage, onPlanSaved, onSessionResolved}: ChatInnerProps) {
  const [sessionId] = useState(sessionIdProp);
  const [historyMessages, setHistoryMessages] = useState<UIMessage[] | undefined>(undefined);

  const sessionParam =
    sessionId === undefined
      ? ''
      : `&sessionId=${sessionId === null ? 'null' : sessionId}`;

  useEffect(() => {
    fetch(`/api/coach/chat?athleteId=${athleteId}${sessionParam}`)
      .then(r => r.json())
      .then((data: {sessionId: string | null; messages: UIMessage[]}) => {
        setHistoryMessages(data.messages ?? []);
        onSessionResolved?.(data.sessionId);
      })
      .catch(() => setHistoryMessages([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (historyMessages === undefined) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  return (
    <ChatContent
      athleteId={athleteId}
      sessionId={sessionId}
      historyMessages={historyMessages}
      initialMessage={initialMessage}
      onPlanSaved={onPlanSaved}
    />
  );
}

// ── ChatContent — actual chat UI; useChat is initialized with loaded history ───

interface ChatContentProps {
  athleteId: number;
  sessionId: string | null | undefined;
  historyMessages: UIMessage[];
  initialMessage?: string;
  onPlanSaved?: () => void;
}

function ChatContent({athleteId, sessionId, historyMessages, initialMessage, onPlanSaved}: ChatContentProps) {
  const {settings} = useSettings();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  // useChat is initialized here with the already-loaded historyMessages.
  // ChatContent only mounts after the history fetch completes, so this is always correct.
  const {messages, sendMessage, status} = useChat({
    transport: new DefaultChatTransport({
      api: '/api/coach/chat',
      body: {athleteId, model: settings.coachModel ?? null, sessionId},
    }),
    messages: historyMessages,
    onFinish: () => { onPlanSaved?.(); },
    onError: (error) => { setErrorMsg(error.message); },
  });

  const isLoading = status === 'submitted' || status === 'streaming' || resolving;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  const sentInitial = useRef(false);
  useEffect(() => {
    if (
      initialMessage &&
      !sentInitial.current &&
      historyMessages.length === 0 &&
      messages.length === 0
    ) {
      sentInitial.current = true;
      sendMessage({text: initialMessage});
    }
  }, [initialMessage, historyMessages.length, messages.length, sendMessage]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);

    if (value.startsWith('/')) {
      const spaceIdx = value.indexOf(' ');
      if (spaceIdx === -1) {
        setCommandQuery(value.slice(1));
        setShowCommands(true);
        setShowMentions(false);
        return;
      }
    }
    setShowCommands(false);

    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(' ')) {
        setMentionQuery(afterAt.split(':')[0]);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  }, []);

  const selectCommand = useCallback((name: string) => {
    setInput(`/${name} `);
    setShowCommands(false);
    setCommandQuery('');
    inputRef.current?.focus();
  }, []);

  const selectMention = useCallback((example: string) => {
    const lastAt = input.lastIndexOf('@');
    const newInput = lastAt !== -1 ? input.slice(0, lastAt) + example : input + example;
    setInput(newInput);
    setShowMentions(false);
    inputRef.current?.focus();
  }, [input]);

  const doSend = useCallback(async (rawText: string) => {
    if (!rawText.trim() || isLoading) return;
    setResolving(true);
    try {
      let enriched = rawText;
      const cmd = findCommand(rawText);
      if (cmd) {
        enriched = await cmd.command.resolve(cmd.args, athleteId);
        if (!enriched.trim()) return;
      } else {
        enriched = await resolveAtMentions(rawText, athleteId);
      }
      setInput('');
      setShowCommands(false);
      setShowMentions(false);
      sendMessage({text: enriched});
    } finally {
      setResolving(false);
    }
  }, [isLoading, athleteId, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setShowCommands(false); setShowMentions(false); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showCommands || showMentions) { setShowCommands(false); setShowMentions(false); return; }
      doSend(input);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSend(input);
  };

  const hasMessages = messages.length > 0;
  const lastAssistantIdx = messages.reduce((last, m, i) => (m.role === 'assistant' ? i : last), -1);

  return (
    <>
      {/* Loading indicator row — rendered inside the header slot via a portal-free trick:
          we pass isLoading up via a callback, but instead just show it inline here.
          The outer ChatPanel header always shows; this loading area is in the messages flow. */}
      {isLoading && (
        <div className="flex-shrink-0 flex items-center justify-end gap-1.5 px-4 py-1 text-xs text-white/40 border-b border-white/[0.04]">
          <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {resolving ? 'Resolving…' : 'Thinking'}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent-blue/15 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-white/60 mb-1">Talk to your coach</p>
              <p className="text-xs text-white/30 max-w-[200px]">Ask about your training, request a weekly plan, or share how you're feeling</p>
            </div>
            <div className="flex flex-col gap-1.5 w-full mt-2">
              {['Create my training plan', 'Generate my plan for this week', 'How is my fitness trending?'].map(s => (
                <button
                  key={s}
                  onClick={() => doSend(s)}
                  className="text-xs text-white/50 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl px-3 py-2 transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {['/modify', '/week', '/status'].map(cmd => (
                <button
                  key={cmd}
                  onClick={() => { setInput(cmd + ' '); setShowCommands(false); inputRef.current?.focus(); }}
                  className="text-xs font-mono text-accent-blue/60 hover:text-accent-blue bg-accent-blue/[0.06] hover:bg-accent-blue/[0.12] border border-accent-blue/20 rounded-lg px-2 py-1 transition-colors"
                >
                  {cmd}
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
                          onSelect={(label) => doSend(label)}
                        />
                      );
                    }
                    const isDone = toolPart.state === 'output-available' || toolPart.state === 'output-error';
                    return <ToolCallBubble key={partIdx} name={toolName} status={isDone ? 'done' : 'running'} />;
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
            <div className="w-7 h-7 rounded-full bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue" strokeWidth="1.5">
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

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-white/[0.07]">
        <div className="relative">
          <AnimatePresence>
            {showCommands && (
              <motion.div
                key="cmd-palette"
                initial={{opacity: 0, y: 4}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: 4}}
                transition={{duration: 0.12}}
              >
                <CommandPalette query={commandQuery} onSelect={selectCommand} />
              </motion.div>
            )}
            {showMentions && (
              <motion.div
                key="mention-dropdown"
                initial={{opacity: 0, y: 4}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: 4}}
                transition={{duration: 0.12}}
              >
                <MentionDropdown query={mentionQuery} onSelect={selectMention} />
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your coach… or type / for commands, @ for references"
              rows={1}
              disabled={resolving}
              className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent-blue/50 resize-none disabled:opacity-50 max-h-32 overflow-y-auto"
              style={{fieldSizing: 'content' as React.CSSProperties['fieldSizing']}}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 rounded-xl bg-accent-blue flex items-center justify-center hover:bg-accent-blue/90 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
          <p className="text-xs text-white/20 mt-1.5 text-center">Enter to send · Shift+Enter for new line · / commands · @ references</p>
        </div>
      </div>
    </>
  );
}

// ── ChatPanel — outer shell, manages session state and history drawer ──────────

interface ChatPanelProps {
  athleteId: number;
  initialMessage?: string;
  onPlanSaved?: () => void;
}

export function ChatPanel({athleteId, initialMessage, onPlanSaved}: ChatPanelProps) {
  // undefined = auto-resolve latest; string | null = specific session
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null | undefined>(undefined);
  // desiredSessionId drives which session ChatInner loads (same type)
  const [desiredSessionId, setDesiredSessionId] = useState<string | null | undefined>(undefined);
  // Bumping this key remounts ChatInner, triggering a fresh history load
  const [sessionKey, setSessionKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const switchSession = (id: string | null) => {
    setDesiredSessionId(id);
    setResolvedSessionId(id);
    setSessionKey(k => k + 1);
    setShowHistory(false);
  };

  const newSession = () => {
    // A fresh timestamp string creates a new session in the backend on first send
    const freshId = String(Date.now());
    setDesiredSessionId(freshId);
    setResolvedSessionId(freshId);
    setSessionKey(k => k + 1);
    setShowHistory(false);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue" strokeWidth="1.5">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white">Your Coach</div>
            <div className="text-xs text-white/30 truncate">AI-powered running coach</div>
          </div>
          {/* New chat button */}
          <button
            onClick={newSession}
            title="New conversation"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {/* History button */}
          <button
            onClick={() => setShowHistory(true)}
            title="Conversation history"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </div>

      {/* History drawer — overlays the entire panel including header */}
      <AnimatePresence>
        {showHistory && (
          <SessionHistoryDrawer
            athleteId={athleteId}
            currentSessionId={resolvedSessionId}
            onSelect={switchSession}
            onClose={() => setShowHistory(false)}
          />
        )}
      </AnimatePresence>

      {/* Chat inner — remounts when sessionKey changes */}
      <ChatInner
        key={sessionKey}
        athleteId={athleteId}
        sessionId={desiredSessionId}
        initialMessage={initialMessage}
        onPlanSaved={onPlanSaved}
        onSessionResolved={(id) => {
          // Only update if we haven't switched to a specific session yet
          setResolvedSessionId(prev => prev === undefined ? id : prev);
        }}
      />
    </div>
  );
}
