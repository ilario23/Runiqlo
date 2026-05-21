import {streamText} from 'ai';
import type {CoreMessage} from 'ai';
import {NextRequest} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, asc, desc, lt, and, inArray} from 'drizzle-orm';
import {getLLMModel, isAnthropicProvider} from '@/lib/llm';
import {getCoachTools} from '@/lib/coachTools';
import {buildCoachSystemPrompt} from '@/lib/coachContext';

const MAX_HISTORY = 40;
const PRUNE_ABOVE = 80;

async function loadHistory(athleteId: number): Promise<CoreMessage[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.coachMessages)
    .where(eq(schema.coachMessages.athleteId, athleteId))
    .orderBy(asc(schema.coachMessages.createdAt))
    .limit(MAX_HISTORY);

  return rows.map(r => {
    if (r.role === 'tool') {
      return {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: r.toolCallId ?? '',
            toolName: r.toolName ?? '',
            result: (() => { try { return JSON.parse(r.content); } catch { return r.content; } })(),
          },
        ],
      };
    }
    if (r.role === 'assistant') {
      // Content may be a JSON-serialised content array (when tool calls were made)
      try {
        const parsed = JSON.parse(r.content);
        if (Array.isArray(parsed)) {
          return {role: 'assistant' as const, content: parsed};
        }
      } catch {}
    }
    return {
      role: r.role as 'user' | 'assistant',
      content: r.content,
    };
  });
}

async function persistMessages(athleteId: number, messages: CoreMessage[]): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const toInsert = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      toInsert.push({
        id: now + Math.floor(Math.random() * 1000),
        athleteId,
        role: 'user',
        content,
        toolCallId: null,
        toolName: null,
        createdAt: now,
      });
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        if (msg.content) {
          toInsert.push({
            id: now + Math.floor(Math.random() * 1000),
            athleteId,
            role: 'assistant',
            content: msg.content,
            toolCallId: null,
            toolName: null,
            createdAt: now + 1,
          });
        }
      } else if (Array.isArray(msg.content)) {
        const hasToolCalls = msg.content.some(p => p.type === 'tool-call');
        if (hasToolCalls) {
          // Serialise the full content array so tool-call/text parts are preserved
          toInsert.push({
            id: now + Math.floor(Math.random() * 1000),
            athleteId,
            role: 'assistant',
            content: JSON.stringify(msg.content),
            toolCallId: null,
            toolName: null,
            createdAt: now + 1,
          });
        } else {
          const textParts = msg.content
            .filter((p): p is {type: 'text'; text: string} => p.type === 'text')
            .map(p => p.text)
            .join('');
          if (textParts) {
            toInsert.push({
              id: now + Math.floor(Math.random() * 1000),
              athleteId,
              role: 'assistant',
              content: textParts,
              toolCallId: null,
              toolName: null,
              createdAt: now + 1,
            });
          }
        }
      }
    } else if (msg.role === 'tool') {
      const parts = Array.isArray(msg.content) ? msg.content : [];
      for (const part of parts) {
        if (part.type === 'tool-result') {
          toInsert.push({
            id: now + Math.floor(Math.random() * 1000),
            athleteId,
            role: 'tool',
            content: JSON.stringify(part.result),
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            createdAt: now + 2,
          });
        }
      }
    }
  }

  if (toInsert.length > 0) {
    const seen = new Set<number>();
    let offset = 0;
    const deduped = toInsert.map(m => {
      while (seen.has(m.id + offset)) offset++;
      const id = m.id + offset;
      seen.add(id);
      offset++;
      return {...m, id};
    });
    await db.insert(schema.coachMessages).values(deduped);
  }

  // Prune old messages, keeping the newest PRUNE_ABOVE
  const countRows = await db
    .select({id: schema.coachMessages.id, createdAt: schema.coachMessages.createdAt})
    .from(schema.coachMessages)
    .where(eq(schema.coachMessages.athleteId, athleteId))
    .orderBy(desc(schema.coachMessages.createdAt))
    .limit(PRUNE_ABOVE + 1);

  if (countRows.length > PRUNE_ABOVE) {
    const cutoff = countRows[PRUNE_ABOVE - 1]?.createdAt;
    if (cutoff) {
      await db
        .delete(schema.coachMessages)
        .where(
          and(
            eq(schema.coachMessages.athleteId, athleteId),
            lt(schema.coachMessages.createdAt, cutoff),
          ),
        );
    }
  }
}

// GET — return UI-ready message history (user + assistant text only)
export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return Response.json({error: 'athleteId required'}, {status: 400});

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.coachMessages)
    .where(and(
      eq(schema.coachMessages.athleteId, athleteId),
      inArray(schema.coachMessages.role, ['user', 'assistant']),
    ))
    .orderBy(asc(schema.coachMessages.createdAt))
    .limit(MAX_HISTORY);

  const messages = rows.flatMap(r => {
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
    return [{id: String(r.id), role: r.role as 'user' | 'assistant', content, createdAt: new Date(r.createdAt)}];
  });

  return Response.json(messages);
}

export async function POST(req: NextRequest) {
  const {messages, athleteId} = await req.json() as {messages: CoreMessage[]; athleteId: number};

  if (!athleteId) {
    return new Response(JSON.stringify({error: 'athleteId required'}), {status: 400});
  }

  const [history, system] = await Promise.all([
    loadHistory(athleteId),
    buildCoachSystemPrompt(athleteId),
  ]);

  const newUserMsg = messages[messages.length - 1];
  const allMessages: CoreMessage[] = [...history, newUserMsg];

  // Use Anthropic prompt caching when available — the large system prompt is sent
  // every turn, so caching it cuts cost ~90% and reduces TTFT significantly.
  const systemMessages: CoreMessage[] = isAnthropicProvider()
    ? [{
        role: 'system' as const,
        content: system,
        experimental_providerMetadata: {
          anthropic: {cacheControl: {type: 'ephemeral'}},
        },
      }]
    : [];

  const result = streamText({
    model: getLLMModel(),
    ...(isAnthropicProvider() ? {} : {system}),
    messages: [...systemMessages, ...allMessages],
    tools: getCoachTools(athleteId),
    maxSteps: 10,
    onFinish: async ({response}) => {
      await persistMessages(athleteId, [newUserMsg, ...response.messages]);
    },
  });

  return result.toDataStreamResponse();
}
