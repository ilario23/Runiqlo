import {describe, it, expect} from 'vitest';
import {sanitizeHistory, rowsToUIMessages} from '../chatUtils';
import type {ModelMessage} from 'ai';

// ── helpers ──────────────────────────────────────────────────────────────────

function user(text = 'hi'): ModelMessage {
  return {role: 'user', content: text};
}

function assistant(text?: string, toolCallIds: string[] = []): ModelMessage {
  if (toolCallIds.length > 0) {
    return {
      role: 'assistant',
      content: toolCallIds.map(id => ({
        type: 'tool-call' as const,
        toolCallId: id,
        toolName: 'someTool',
        input: {},
      })),
    };
  }
  return {role: 'assistant', content: text ?? 'ok'};
}

function toolResult(toolCallId: string): ModelMessage {
  return {
    role: 'tool',
    content: [{type: 'tool-result', toolCallId, toolName: 'someTool', output: 'done'}],
  };
}

function makeRow(overrides: Partial<{
  id: number;
  athleteId: number;
  sessionId: string | null;
  role: string;
  content: string;
  toolCallId: string | null;
  toolName: string | null;
  createdAt: number;
}> = {}) {
  return {
    id: 1,
    athleteId: 42,
    sessionId: null,
    role: 'user',
    content: 'hello',
    toolCallId: null,
    toolName: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── sanitizeHistory ───────────────────────────────────────────────────────────

describe('sanitizeHistory', () => {
  it('returns empty array unchanged', () => {
    expect(sanitizeHistory([])).toEqual([]);
  });

  it('passes clean user → assistant → tool chain through unchanged', () => {
    const msgs = [user(), assistant('', ['tc1']), toolResult('tc1')];
    expect(sanitizeHistory(msgs)).toEqual(msgs);
  });

  it('passes plain user/assistant exchange through unchanged', () => {
    const msgs = [user(), assistant()];
    expect(sanitizeHistory(msgs)).toEqual(msgs);
  });

  it('drops orphaned tool-result but preserves the preceding clean assistant', () => {
    const msgs = [user('q1'), assistant(), toolResult('ghost')];
    // assistant() has no tool calls → pending is empty → tool-result is just dropped
    const result = sanitizeHistory(msgs);
    expect(result).toEqual([user('q1'), assistant()]);
  });

  it('strips assistant with unfulfilled tool call when next assistant arrives', () => {
    const msgs = [user('q1'), assistant('', ['tc1']), assistant('second')];
    // tc1 was never resolved, then a second assistant comes in
    const result = sanitizeHistory(msgs);
    // first assistant should be dropped, second assistant kept with the user
    expect(result.map(m => m.role)).toEqual(['user', 'assistant']);
    expect((result[1] as {role: string; content: string}).content).toBe('second');
  });

  it('strips assistant with pending call when user interrupts', () => {
    const msgs = [user('q1'), assistant('', ['tc1']), user('q2')];
    const result = sanitizeHistory(msgs);
    expect(result.map(m => m.role)).toEqual(['user', 'user']);
  });

  it('strips trailing unfulfilled tool calls', () => {
    const msgs = [user('q1'), assistant('', ['tc1'])];
    const result = sanitizeHistory(msgs);
    expect(result).toEqual([user('q1')]);
  });

  it('strips mismatched tool call ID in result', () => {
    const msgs = [user('q1'), assistant('', ['tc1']), toolResult('wrong-id')];
    const result = sanitizeHistory(msgs);
    expect(result).toEqual([user('q1')]);
  });

  it('passes multiple tool calls all fulfilled', () => {
    const msgs = [
      user('q1'),
      assistant('', ['tc1', 'tc2']),
      toolResult('tc1'),
      toolResult('tc2'),
    ];
    expect(sanitizeHistory(msgs)).toEqual(msgs);
  });

  it('splices only the bad block, preserving prior clean exchanges', () => {
    // clean segment: user → assistant (no tool calls)
    // bad segment: assistant with tc1, result with wrong-id → drops only asst_tc1
    const clean = [user('q1'), assistant()];
    const bad = [assistant('', ['tc1']), toolResult('wrong')];
    const after = [user('q2')];
    const result = sanitizeHistory([...clean, ...bad, ...after]);
    expect(result.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});

// ── rowsToUIMessages ──────────────────────────────────────────────────────────

describe('rowsToUIMessages', () => {
  it('converts a user row to a UIMessage', () => {
    const rows = [makeRow({id: 1, role: 'user', content: 'hello'})];
    const result = rowsToUIMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].parts).toEqual([{type: 'text', text: 'hello'}]);
    expect(result[0].id).toBe('1');
  });

  it('converts a plain assistant row to a UIMessage', () => {
    const rows = [makeRow({id: 2, role: 'assistant', content: 'sure'})];
    const result = rowsToUIMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].parts[0]).toMatchObject({type: 'text', text: 'sure'});
  });

  it('extracts text from assistant JSON-array content', () => {
    const content = JSON.stringify([
      {type: 'text', text: 'here is my answer'},
    ]);
    const rows = [makeRow({id: 3, role: 'assistant', content})];
    const result = rowsToUIMessages(rows);
    expect(result).toHaveLength(1);
    expect(result[0].parts[0]).toMatchObject({type: 'text', text: 'here is my answer'});
  });

  it('skips assistant row with only tool-call parts (no text)', () => {
    const content = JSON.stringify([
      {type: 'tool-call', toolCallId: 'tc1', toolName: 'foo', input: {}},
    ]);
    const rows = [makeRow({id: 4, role: 'assistant', content})];
    expect(rowsToUIMessages(rows)).toHaveLength(0);
  });

  it('skips tool role rows entirely', () => {
    const rows = [makeRow({id: 5, role: 'tool', content: '{"result": 1}'})];
    expect(rowsToUIMessages(rows)).toHaveLength(0);
  });

  it('skips rows with empty content', () => {
    const rows = [makeRow({id: 6, role: 'user', content: ''})];
    expect(rowsToUIMessages(rows)).toHaveLength(0);
  });

  it('handles multiple rows in order', () => {
    const rows = [
      makeRow({id: 10, role: 'user', content: 'hello'}),
      makeRow({id: 11, role: 'assistant', content: 'hi there'}),
    ];
    const result = rowsToUIMessages(rows);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
  });
});
