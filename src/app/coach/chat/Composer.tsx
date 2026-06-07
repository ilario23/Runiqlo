'use client';

import {useRef, useEffect, useCallback, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {COMMANDS, findCommand} from '../lib/chatCommands';
import {MENTION_DEFS, resolveAtMentions} from '../lib/atMentions';

// ── Command palette popover ────────────────────────────────────────────────────

function CommandPalette({
  query,
  onSelect,
  activeIdx,
}: {
  query: string;
  onSelect: (name: string) => void;
  activeIdx: number;
}) {
  const filtered = COMMANDS.filter(c => c.name.startsWith(query.toLowerCase()));
  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-2xl z-50 bg-[var(--color-surface-1)]">
      <div className="px-3.5 py-2 border-b border-[var(--color-border)]">
        <span className="text-[11px] text-[var(--color-text-2)] font-medium uppercase tracking-wider">Commands</span>
      </div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          onClick={() => onSelect(cmd.name)}
          className={[
            'w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
            i === activeIdx ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface-2)]',
          ].join(' ')}
        >
          <span className="text-sm font-mono text-[var(--color-accent)] min-w-[90px]">/{cmd.name}</span>
          <span className="text-xs text-[var(--color-text-2)] font-mono opacity-60">{cmd.argsHint}</span>
          <span className="text-xs text-[var(--color-text-2)] ml-auto truncate">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

// ── @ mention dropdown ─────────────────────────────────────────────────────────

function MentionDropdown({
  query,
  onSelect,
  activeIdx,
}: {
  query: string;
  onSelect: (example: string) => void;
  activeIdx: number;
}) {
  const filtered = MENTION_DEFS.filter(
    m => m.prefix.startsWith(query.toLowerCase()) || m.description.toLowerCase().includes(query.toLowerCase()),
  );
  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-2xl z-50 bg-[var(--color-surface-1)]">
      <div className="px-3.5 py-2 border-b border-[var(--color-border)]">
        <span className="text-[11px] text-[var(--color-text-2)] font-medium uppercase tracking-wider">References</span>
      </div>
      {filtered.map((m, i) => (
        <button
          key={m.prefix}
          onClick={() => onSelect(m.example)}
          className={[
            'w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
            i === activeIdx ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface-2)]',
          ].join(' ')}
        >
          <span className="text-sm font-mono text-[var(--color-accent)]">@{m.prefix}</span>
          <span className="text-xs text-[var(--color-text-2)]">{m.description}</span>
        </button>
      ))}
    </div>
  );
}

// ── Composer ───────────────────────────────────────────────────────────────────

interface ComposerProps {
  athleteId: number;
  isLoading: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: (text: string) => Promise<void>;
  onStop?: () => void;
}

export function Composer({athleteId, isLoading, input, setInput, onSend, onStop}: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [resolving, setResolving] = useState(false);

  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandActiveIdx, setCommandActiveIdx] = useState(0);

  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionActiveIdx, setMentionActiveIdx] = useState(0);

  const isBusy = isLoading || resolving;

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    setCommandActiveIdx(0);
    setMentionActiveIdx(0);

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
  }, [setInput]);

  const selectCommand = useCallback((name: string) => {
    setInput(`/${name} `);
    setShowCommands(false);
    setCommandQuery('');
    setCommandActiveIdx(0);
    inputRef.current?.focus();
  }, [setInput]);

  const selectMention = useCallback((example: string) => {
    const lastAt = input.lastIndexOf('@');
    const newInput = lastAt !== -1 ? input.slice(0, lastAt) + example : input + example;
    setInput(newInput);
    setShowMentions(false);
    setMentionActiveIdx(0);
    inputRef.current?.focus();
  }, [input, setInput]);

  const doSend = useCallback(async (rawText: string) => {
    if (!rawText.trim() || isBusy) return;
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
      await onSend(enriched);
    } finally {
      setResolving(false);
    }
  }, [isBusy, athleteId, onSend, setInput]);

  // Filtered lists for keyboard navigation
  const filteredCommands = COMMANDS.filter(c => c.name.startsWith(commandQuery.toLowerCase()));
  const filteredMentions = MENTION_DEFS.filter(
    m => m.prefix.startsWith(mentionQuery.toLowerCase()) || m.description.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setShowCommands(false);
      setShowMentions(false);
      return;
    }

    // Navigate commands
    if (showCommands && filteredCommands.length) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setCommandActiveIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCommandActiveIdx(i => Math.min(filteredCommands.length - 1, i + 1)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectCommand(filteredCommands[commandActiveIdx]?.name ?? filteredCommands[0].name);
        return;
      }
    }

    // Navigate mentions
    if (showMentions && filteredMentions.length) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionActiveIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionActiveIdx(i => Math.min(filteredMentions.length - 1, i + 1)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(filteredMentions[mentionActiveIdx]?.example ?? filteredMentions[0].example);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend(input);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSend(input);
  };

  const canSend = !!input.trim() && !isBusy;

  return (
    <div className="flex-shrink-0 px-4 pb-5 pt-2">
      {/* Floating pill container */}
      <div className="relative">
        {/* Popovers */}
        <AnimatePresence>
          {showCommands && (
            <motion.div
              key="cmd"
              initial={{opacity: 0, y: 6, scale: 0.98}}
              animate={{opacity: 1, y: 0, scale: 1}}
              exit={{opacity: 0, y: 6, scale: 0.98}}
              transition={{duration: 0.1, ease: 'easeOut'}}
            >
              <CommandPalette
                query={commandQuery}
                onSelect={selectCommand}
                activeIdx={commandActiveIdx}
              />
            </motion.div>
          )}
          {showMentions && (
            <motion.div
              key="mention"
              initial={{opacity: 0, y: 6, scale: 0.98}}
              animate={{opacity: 1, y: 0, scale: 1}}
              exit={{opacity: 0, y: 6, scale: 0.98}}
              transition={{duration: 0.1, ease: 'easeOut'}}
            >
              <MentionDropdown
                query={mentionQuery}
                onSelect={selectMention}
                activeIdx={mentionActiveIdx}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input pill */}
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 focus-within:border-[var(--color-rule)] transition-colors shadow-lg">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 160) + 'px';
              }}
              placeholder="Ask your coach… type / for commands, @ for references"
              rows={1}
              disabled={resolving}
              className="flex-1 bg-transparent text-sm text-[var(--color-text-1)] placeholder-[var(--color-text-3)] focus:outline-none resize-none disabled:opacity-50 max-h-40 overflow-y-auto leading-relaxed"
            />

            {/* Stop button — shown while loading */}
            {isLoading && onStop && (
              <button
                type="button"
                onClick={onStop}
                title="Stop generating"
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border border-[var(--color-border)] text-[var(--color-text-3)] hover:text-[var(--color-ink)] hover:border-[var(--color-rule)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            )}

            {/* Send button */}
            {!isLoading && (
              <button
                type="submit"
                disabled={!canSend}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                style={{background: canSend ? 'var(--color-accent)' : 'var(--color-surface-2)'}}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Hint */}
        <p className="hidden md:block text-[11px] text-[var(--color-text-2)] mt-1.5 text-center">
          Enter to send · Shift+Enter for new line · <span className="font-mono">/</span> commands · <span className="font-mono">@</span> references
        </p>
      </div>
    </div>
  );
}
