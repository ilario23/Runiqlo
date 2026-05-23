import {streamText, stepCountIs, convertToModelMessages} from 'ai';
import type {ModelMessage, UIMessage, AssistantContent} from 'ai';
import {NextRequest} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, asc, desc, lt, and, inArray} from 'drizzle-orm';
import {getLLMModel, isAnthropicProvider} from '@/lib/llm';
import {getCoachTools} from '@/lib/coachTools';
import {buildCoachSystemPrompt} from '@/lib/coachContext';

const MAX_HISTORY = 40;
const PRUNE_ABOVE = 80;

async function loadHistory(athleteId: number): Promise<ModelMessage[]> {
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
            output: (() => { try { return JSON.parse(r.content); } catch { return r.content; } })(),
          },
        ],
      };
    }
    if (r.role === 'assistant') {
      try {
        const parsed = JSON.parse(r.content);
        if (Array.isArray(parsed)) {
          // Migrate v4 format: tool-call parts used 'args', v6 uses 'input'
          const migrated = parsed.map((part: Record<string, unknown>) => {
            if (part.type === 'tool-call' && 'args' in part && !('input' in part)) {
              const {args, ...rest} = part;
              return {...rest, input: args};
            }
            return part;
          });
          return {role: 'assistant' as const, content: migrated as unknown as AssistantContent};
        }
      } catch {}
    }
    return {
      role: r.role as 'user' | 'assistant',
      content: r.content,
    };
  });
}

async function persistMessages(athleteId: number, messages: ModelMessage[]): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const toInsert = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      let content: string;
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = (msg.content as Array<{type: string; text?: string}>)
          .filter(p => p.type === 'text')
          .map(p => p.text ?? '')
          .join('');
      } else {
        content = '';
      }
      if (!content) continue;
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
        const hasToolCalls = msg.content.some(p => (p as {type: string}).type === 'tool-call');
        if (hasToolCalls) {
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
          const textParts = (msg.content as Array<{type: string; text?: string}>)
            .filter(p => p.type === 'text')
            .map(p => p.text ?? '')
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
      const parts = Array.isArray(msg.content)
        ? (msg.content as Array<{type: string; toolCallId?: string; toolName?: string; output?: unknown}>)
        : [];
      for (const part of parts) {
        if (part.type === 'tool-result') {
          toInsert.push({
            id: now + Math.floor(Math.random() * 1000),
            athleteId,
            role: 'tool',
            content: JSON.stringify(part.output),
            toolCallId: part.toolCallId ?? null,
            toolName: part.toolName ?? null,
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

// GET — return UI-ready message history as UIMessage format
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
    return [{
      id: String(r.id),
      role: r.role as 'user' | 'assistant',
      parts: [{type: 'text' as const, text: content}],
      createdAt: new Date(r.createdAt),
    }];
  });

  return Response.json(messages);
}

export async function POST(req: NextRequest) {
  const {messages, athleteId} = await req.json() as {messages: UIMessage[]; athleteId: number};

  if (!athleteId) {
    return new Response(JSON.stringify({error: 'athleteId required'}), {status: 400});
  }

  const lastUIMessage = messages[messages.length - 1];
  const [modelMessages, history, system] = await Promise.all([
    convertToModelMessages([lastUIMessage]),
    loadHistory(athleteId),
    buildCoachSystemPrompt(athleteId),
  ]);
  const newModelMsg = modelMessages[0];

  const allMessages: ModelMessage[] = [...history, newModelMsg];

  // Anthropic prompt caching on the large system prompt cuts cost ~90% and reduces TTFT
  const systemMessages: ModelMessage[] = isAnthropicProvider()
    ? [{
        role: 'system' as const,
        content: system,
        providerOptions: {
          anthropic: {cacheControl: {type: 'ephemeral'}},
        },
      }]
    : [];

  const result = streamText({
    model: getLLMModel(),
    ...(isAnthropicProvider() ? {} : {system}),
    messages: [...systemMessages, ...allMessages],
    tools: getCoachTools(athleteId),
    stopWhen: stepCountIs(10),
    onFinish: async ({response}) => {
      await persistMessages(athleteId, [newModelMsg, ...response.messages] as ModelMessage[]);
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[coach/chat] stream error:', msg);
      return msg;
    },
  });
}
