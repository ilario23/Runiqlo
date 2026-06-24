'use client';

import {useEffect, useRef, useState, useCallback} from 'react';
import {useChat, type UIMessage} from '@ai-sdk/react';
import {DefaultChatTransport} from 'ai';
import {useSettings} from '@/contexts/SettingsContext';
import {motion, AnimatePresence} from 'framer-motion';
import {SessionHistoryDrawer} from './SessionHistoryDrawer';
import {MessageUser} from '../chat/MessageUser';
import {MessageAssistant} from '../chat/MessageAssistant';
import {EmptyState} from '../chat/EmptyState';
import {Composer} from '../chat/Composer';

// ── Thinking dots ──────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex gap-3 px-5 py-4">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{background: 'var(--color-accent-dim)', color: 'var(--color-accent)'}}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
        </svg>
      </div>
      <div
        className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{background: 'var(--color-surface-1)', border: '1px solid var(--color-border)'}}
      >
        {[0, 0.18, 0.36].map((delay, i) => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full"
            style={{background: 'var(--color-text-3)'}}
            animate={{opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85]}}
            transition={{duration: 1.2, repeat: Infinity, delay}}
          />
        ))}
      </div>
    </div>
  );
}

// ── Scroll-to-bottom pill ──────────────────────────────────────────────────────

function ScrollPill({onClick}: {onClick: () => void}) {
  return (
    <motion.button
      initial={{opacity: 0, y: 6}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: 6}}
      transition={{duration: 0.15}}
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-text-2)] hover:text-[var(--color-ink)] hover:border-[var(--color-rule)] shadow-lg transition-colors z-10"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="6 9 12 15 18 9" />
      </svg>
      Scroll to bottom
    </motion.button>
  );
}

// ── ChatInner — loads history then mounts ChatContent ─────────────────────────

interface ChatInnerProps {
  athleteId: number;
  sessionId: string | null | undefined;
  initialMessage?: string;
  prefillInput?: string;
  onPlanSaved?: () => void;
  onSessionResolved?: (id: string | null) => void;
}

function ChatInner({
  athleteId,
  sessionId: sessionIdProp,
  initialMessage,
  prefillInput,
  onPlanSaved,
  onSessionResolved,
}: ChatInnerProps) {
  const [sessionId] = useState(sessionIdProp);
  const [historyMessages, setHistoryMessages] = useState<UIMessage[] | undefined>(undefined);
  const [historyError, setHistoryError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const sessionParam =
    sessionId === undefined
      ? ''
      : `&sessionId=${sessionId === null ? 'null' : sessionId}`;

  useEffect(() => {
    setHistoryError(false);
    setHistoryMessages(undefined);
    const controller = new AbortController();
    fetch(`/api/coach/chat?athleteId=${athleteId}${sessionParam}`, {signal: controller.signal})
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: {sessionId: string | null; messages: UIMessage[]}) => {
        setHistoryMessages(data.messages ?? []);
        onSessionResolved?.(data.sessionId);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHistoryError(true);
        setHistoryMessages([]);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  if (historyMessages === undefined) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-[var(--color-rule)] border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent-red/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-red">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm text-[var(--color-ink-2)]">Couldn&apos;t load conversation.</p>
        <button
          onClick={() => setRetryCount(c => c + 1)}
          className="text-xs text-brand hover:underline transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <ChatContent
      athleteId={athleteId}
      sessionId={sessionId}
      historyMessages={historyMessages}
      initialMessage={initialMessage}
      prefillInput={prefillInput}
      onPlanSaved={onPlanSaved}
    />
  );
}

// ── ChatContent — main chat UI ─────────────────────────────────────────────────

interface ChatContentProps {
  athleteId: number;
  sessionId: string | null | undefined;
  historyMessages: UIMessage[];
  initialMessage?: string;
  prefillInput?: string;
  onPlanSaved?: () => void;
}

function ChatContent({
  athleteId,
  sessionId,
  historyMessages,
  initialMessage,
  prefillInput,
  onPlanSaved,
}: ChatContentProps) {
  const {settings} = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Auto-scroll: true when user is at the bottom
  const [autoScroll, setAutoScroll] = useState(true);

  const {messages, sendMessage, status, stop} = useChat({
    transport: new DefaultChatTransport({
      api: '/api/coach/chat',
      body: {athleteId, model: settings.coachModel ?? null, sessionId},
    }),
    messages: historyMessages,
    onFinish: () => { onPlanSaved?.(); },
    onError: (error) => { setErrorMsg(error.message); },
  });

  const isLoading = status === 'submitted' || status === 'streaming';
  const isStreaming = status === 'streaming';

  // ── Auto-scroll sentinel via IntersectionObserver ──────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAutoScroll(entry.isIntersecting),
      {root: scrollRef.current, threshold: 0.1},
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    sentinelRef.current?.scrollIntoView({behavior: 'smooth'});
  }, []);

  // Scroll to bottom on new messages when auto-scroll is on
  useEffect(() => {
    if (autoScroll) {
      sentinelRef.current?.scrollIntoView({behavior: 'smooth'});
    }
  }, [messages, autoScroll]);

  // Send initial message once on mount
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

  // Prefill input
  const prefillSet = useRef(false);
  useEffect(() => {
    if (prefillInput && !prefillSet.current) {
      prefillSet.current = true;
      setInput(prefillInput);
    }
  }, [prefillInput]);

  const doSend = useCallback(async (enrichedText: string) => {
    sendMessage({text: enrichedText});
  }, [sendMessage]);

  const hasMessages = messages.length > 0;
  const lastAssistantIdx = messages.reduce((last, m, i) => (m.role === 'assistant' ? i : last), -1);

  // Show thinking dots when submitted but no assistant message yet streaming
  const showThinking =
    isLoading &&
    !messages.some((m, i) => m.role === 'assistant' && i === messages.length - 1 && m.parts.some(p => p.type === 'text'));

  return (
    <>
      {/* Messages scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="min-h-full flex flex-col">
          {!hasMessages ? (
            <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
              <EmptyState
                onSend={async (text) => { sendMessage({text}); }}
                onPrefill={setInput}
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-2">
              {messages.map((msg, msgIdx) => {
                if (msg.role === 'user') {
                  return <MessageUser key={msg.id} msg={msg} />;
                }
                if (msg.role === 'assistant') {
                  return (
                    <MessageAssistant
                      key={msg.id}
                      msg={msg}
                      isLatest={msgIdx === lastAssistantIdx}
                      isLoading={isLoading}
                      isStreaming={isStreaming}
                      onSelectAnswer={async (label) => { sendMessage({text: label}); }}
                    />
                  );
                }
                return null;
              })}

              {showThinking && <ThinkingDots />}

              {status === 'error' && (
                <div className="flex justify-start px-5 py-2">
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-accent-red/10 border border-accent-red/20 text-accent-red">
                    {errorMsg ?? 'Something went wrong. Please try again.'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sentinel for IntersectionObserver */}
          <div ref={sentinelRef} className="h-px" />
        </div>

        {/* Scroll-to-bottom pill */}
        <AnimatePresence>
          {!autoScroll && (
            <ScrollPill onClick={scrollToBottom} />
          )}
        </AnimatePresence>
      </div>

      {/* Composer — same centred column as messages */}
      <div className="max-w-3xl mx-auto w-full">
        <Composer
          athleteId={athleteId}
          isLoading={isLoading}
          input={input}
          setInput={setInput}
          onSend={doSend}
          onStop={stop}
        />
      </div>
    </>
  );
}

// ── ChatPanel — outer shell, manages session state ────────────────────────────

interface ChatPanelProps {
  athleteId: number;
  initialMessage?: string;
  prefillInput?: string;
  onPlanSaved?: () => void;
}

export function ChatPanel({
  athleteId,
  initialMessage,
  prefillInput,
  onPlanSaved,
}: ChatPanelProps) {
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null | undefined>(undefined);
  const [desiredSessionId, setDesiredSessionId] = useState<string | null | undefined>(undefined);
  const [sessionKey, setSessionKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const switchSession = (id: string | null) => {
    setDesiredSessionId(id);
    setResolvedSessionId(id);
    setSessionKey(k => k + 1);
    setShowHistory(false);
  };

  const newSession = () => {
    const freshId = String(Date.now());
    setDesiredSessionId(freshId);
    setResolvedSessionId(freshId);
    setSessionKey(k => k + 1);
    setShowHistory(false);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center flex-shrink-0 mono"
            style={{width: 34, height: 34, borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15, boxShadow: '0 0 14px var(--accent-glow)'}}
          >
            C
          </div>
          <div className="flex-1 min-w-0">
            <div style={{fontWeight: 600, fontSize: 15, color: 'var(--text)', lineHeight: 1.1}}>Coach</div>
            <div className="lbl truncate" style={{marginTop: 2}}>AI Training Director</div>
          </div>

          {/* New chat */}
          <button
            onClick={newSession}
            title="New conversation"
            aria-label="Start new conversation"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* History */}
          <button
            onClick={() => setShowHistory(true)}
            title="Conversation history"
            aria-label="View conversation history"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </div>

      {/* History drawer */}
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

      {/* Chat content — remounts on session switch */}
      <ChatInner
        key={sessionKey}
        athleteId={athleteId}
        sessionId={desiredSessionId}
        initialMessage={initialMessage}
        prefillInput={prefillInput}
        onPlanSaved={onPlanSaved}
        onSessionResolved={(id) => {
          setResolvedSessionId(prev => prev === undefined ? id : prev);
        }}
      />
    </div>
  );
}
