import type {ModelMessage, UIMessage, AssistantContent} from 'ai';
import type {coachMessages} from '@/db/schema';

// Remove tool call / result pairs that are incomplete or out of order.
// This handles rows that were persisted with wrong timestamps (pre-fix) which
// could be reloaded in an order that breaks Anthropic's tool_use → tool_result invariant.
// Uses pendingStart to splice only the bad block rather than sweeping back to the nearest user.
export function sanitizeHistory(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  const pending = new Set<string>(); // tool call IDs awaiting results
  let pendingStart = -1; // index in `out` where the current pending block begins

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      if (pending.size > 0) {
        // Previous assistant had unfulfilled tool calls — drop only that block
        out.splice(pendingStart);
        pending.clear();
      }
      pendingStart = out.length;
      const parts = Array.isArray(msg.content)
        ? (msg.content as Array<{type: string; toolCallId?: string}>)
        : [];
      parts.filter(p => p.type === 'tool-call' && p.toolCallId).forEach(p => pending.add(p.toolCallId!));
      out.push(msg);
    } else if (msg.role === 'tool') {
      if (pending.size === 0) {
        // Orphaned tool result — drop it, leave preceding messages intact
        continue;
      }
      const parts = Array.isArray(msg.content)
        ? (msg.content as Array<{type: string; toolCallId?: string}>)
        : [];
      const resultIds = parts.filter(p => p.type === 'tool-result' && p.toolCallId).map(p => p.toolCallId!);
      const unmatched = resultIds.filter(id => !pending.has(id));
      if (unmatched.length > 0) {
        // Results don't match pending calls — drop only the pending block
        out.splice(pendingStart);
        pending.clear();
        continue;
      }
      resultIds.forEach(id => pending.delete(id));
      out.push(msg);
    } else {
      // user message: pending calls will never get results — drop only that block
      if (pending.size > 0) {
        out.splice(pendingStart);
        pending.clear();
      }
      pendingStart = -1;
      out.push(msg);
    }
  }

  // Trailing unfulfilled tool calls
  if (pending.size > 0) {
    out.splice(pendingStart);
  }

  return out;
}

export function rowsToUIMessages(rows: (typeof coachMessages.$inferSelect)[]): UIMessage[] {
  return rows.flatMap(r => {
    if (r.role === 'tool') return [];
    let content = r.content;
    if (r.role === 'assistant') {
      try {
        const parsed = JSON.parse(r.content);
        if (Array.isArray(parsed)) {
          const text = parsed
            .filter((p): p is {type: 'text'; text: string} => p.type === 'text')
            .map(p => p.text)
            .join('');
          if (!text) return [];
          content = text;
        }
      } catch {}
    }
    if (!content) return [];
    return [{
      id: String(r.id),
      role: r.role as 'user' | 'assistant',
      parts: [{type: 'text' as const, text: content}],
      createdAt: new Date(r.createdAt),
    }];
  });
}

export function loadAssistantContent(raw: string): AssistantContent | string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migrated = parsed.map((part: Record<string, unknown>) => {
        if (part.type === 'tool-call' && 'args' in part && !('input' in part)) {
          const {args, ...rest} = part;
          return {...rest, input: args};
        }
        return part;
      });
      return migrated as unknown as AssistantContent;
    }
  } catch {}
  return raw;
}
