'use client';

import {useState} from 'react';
import {useAthleteNotes} from '@/hooks/useStrava';
import type {InjuryEntry} from '@/hooks/useStrava';
import {COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';

const SEVERITY_OPTIONS = ['mild', 'moderate', 'severe'] as const;

const SEVERITY_COLORS: Record<string, string> = {
  mild: COLORS.yellow,
  moderate: COLORS.orange,
  severe: COLORS.red,
};

export default function AthleteNotesCard() {
  const {notes, isLoading, saveNotes, isSaving} = useAthleteNotes();

  const [editing, setEditing] = useState(false);
  const [freeformDraft, setFreeformDraft] = useState('');
  const [injuriesDraft, setInjuriesDraft] = useState<InjuryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setFreeformDraft(notes?.freeformNotes ?? '');
    setInjuriesDraft(notes?.injuryHistory ? [...notes.injuryHistory] : []);
    setError(null);
    setEditing(true);
  };

  const cancel = () => { setEditing(false); setError(null); };

  const save = async () => {
    setError(null);
    try {
      await saveNotes({freeformNotes: freeformDraft || null, injuryHistory: injuriesDraft});
      setEditing(false);
    } catch {
      setError('Failed to save. Please try again.');
    }
  };

  const addInjury = () =>
    setInjuriesDraft(d => [...d, {bodyPart: '', severity: 'mild', resolved: false}]);

  const removeInjury = (i: number) =>
    setInjuriesDraft(d => d.filter((_, idx) => idx !== i));

  const updateInjury = <K extends keyof InjuryEntry>(i: number, key: K, val: InjuryEntry[K]) =>
    setInjuriesDraft(d => d.map((entry, idx) => idx === i ? {...entry, [key]: val} : entry));

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-[var(--text)]">Athlete Notes</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <button onClick={cancel} className="text-xs text-[var(--faint)] hover:text-[var(--dim)] transition-colors px-2 py-1">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={isSaving}
              className="text-xs bg-accent-blue text-[var(--text)] font-semibold px-3 py-1.5 rounded-lg hover:bg-accent-blue/85 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs text-[var(--faint)] hover:text-[var(--text)] bg-[var(--panel)] hover:bg-[var(--panel)] px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit notes
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : editing ? (
        <div className="space-y-4">
          {/* Injury History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-[var(--faint)] uppercase tracking-wide">Injury History</p>
              <button
                onClick={addInjury}
                className="text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors flex items-center gap-0.5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add
              </button>
            </div>
            {injuriesDraft.length === 0 ? (
              <p className="text-[11px] text-[var(--faint)] py-1">No injuries logged</p>
            ) : (
              <div className="space-y-2">
                {injuriesDraft.map((inj, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Body part…"
                      value={inj.bodyPart}
                      onChange={e => updateInjury(i, 'bodyPart', e.target.value)}
                      className="flex-1 bg-[var(--panel)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none focus:border-accent-blue/50 transition-colors"
                    />
                    <select
                      value={inj.severity}
                      onChange={e => updateInjury(i, 'severity', e.target.value as InjuryEntry['severity'])}
                      className="bg-[var(--panel)] border border-[var(--line)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text)] focus:outline-none focus:border-accent-blue/50 transition-colors appearance-none"
                    >
                      {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-[var(--faint)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={inj.resolved}
                        onChange={e => updateInjury(i, 'resolved', e.target.checked)}
                        className="accent-accent-green"
                      />
                      Resolved
                    </label>
                    <button onClick={() => removeInjury(i)} className="text-[var(--faint)] hover:text-accent-red transition-colors flex-shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Freeform Notes */}
          <div>
            <p className="text-[10px] font-medium text-[var(--faint)] uppercase tracking-wide mb-2">Free-form Notes</p>
            <textarea
              value={freeformDraft}
              onChange={e => setFreeformDraft(e.target.value)}
              placeholder="Anything the coach should know: training preferences, lifestyle constraints, goals…"
              rows={5}
              className="w-full bg-[var(--panel)] border border-[var(--line)] rounded-xl px-3 py-2.5 text-[12px] text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none focus:border-accent-blue/40 transition-colors resize-none leading-relaxed"
            />
          </div>

          {error && <p className="text-[11px] text-accent-red">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {notes?.injuryHistory && notes.injuryHistory.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-[var(--faint)] uppercase tracking-wide mb-2">Injury History</p>
              <div className="flex flex-wrap gap-1.5">
                {notes.injuryHistory.map((inj, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border"
                    style={{
                      borderColor: `${SEVERITY_COLORS[inj.severity]}30`,
                      color: inj.resolved ? 'rgba(26,24,20,0.3)' : SEVERITY_COLORS[inj.severity],
                      background: `${SEVERITY_COLORS[inj.severity]}10`,
                    }}
                  >
                    <span className={inj.resolved ? 'line-through' : ''}>{inj.bodyPart}</span>
                    <span className="opacity-50 text-[10px]">{inj.severity}</span>
                    {inj.resolved && <span className="opacity-40 text-[10px]">✓</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {notes?.freeformNotes ? (
            <div>
              <p className="text-[10px] font-medium text-[var(--faint)] uppercase tracking-wide mb-2">Notes</p>
              <p className="text-[12px] text-[var(--dim)] leading-relaxed whitespace-pre-wrap">{notes.freeformNotes}</p>
            </div>
          ) : null}

          {(!notes || (!notes.freeformNotes && (!notes.injuryHistory || notes.injuryHistory.length === 0))) && (
            <p className="text-xs text-[var(--faint)] py-2">
              No notes yet. Add context the AI coach should know about you.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
