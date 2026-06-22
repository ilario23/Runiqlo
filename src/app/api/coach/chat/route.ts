import {streamText, stepCountIs, convertToModelMessages} from 'ai';
import type {ModelMessage, UIMessage} from 'ai';
import {NextRequest} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, asc, desc, lt, and, inArray, isNull, sql} from 'drizzle-orm';
import {getLLMModel, isAnthropicProvider} from '@/lib/llm';
import {getCoachTools} from '@/lib/coachTools';
import {buildCoachSystemPrompt} from '@/lib/coachContext';
import {sanitizeHistory, rowsToUIMessages, loadAssistantContent} from '@/lib/chatUtils';
import {requireAthlete} from '@/lib/apiAuth';
import {rateLimit} from '@/lib/rateLimit';

const MAX_HISTORY = 40;
const PRUNE_ABOVE = 80;

// Monotonic, collision-free bigint id generator. Date.now()*1000 leaves room
// for many ids per ms; strictly increasing within the process so concurrent
// turns in the same millisecond never collide on the primary key.
let lastMessageId = 0;
function nextMessageId(): number {
  const id = Math.max(Date.now() * 1000, lastMessageId + 1);
  lastMessageId = id;
  return id;
}

export interface SessionSummary {
  id: string | null;
  createdAt: number;
  preview: string;
  messageCount: number;
}

// Resolve the active session ID: most recent session, or null for legacy messages
async function resolveCurrentSessionId(athleteId: number): Promise<string | null> {
  const db = getDb();
  // Find the most recently updated session (by max createdAt in that session)
  const rows = await db
    .select({sessionId: schema.coachMessages.sessionId, maxCreatedAt: sql<number>`max(${schema.coachMessages.createdAt})`})
    .from(schema.coachMessages)
    .where(eq(schema.coachMessages.athleteId, athleteId))
    .groupBy(schema.coachMessages.sessionId)
    .orderBy(desc(sql<number>`max(${schema.coachMessages.createdAt})`))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].sessionId;
}


async function loadHistory(athleteId: number, sessionId: string | null | undefined): Promise<ModelMessage[]> {
  const db = getDb();

  const whereClause = sessionId === undefined
    ? eq(schema.coachMessages.athleteId, athleteId)
    : sessionId === null
      ? and(eq(schema.coachMessages.athleteId, athleteId), isNull(schema.coachMessages.sessionId))
      : and(eq(schema.coachMessages.athleteId, athleteId), eq(schema.coachMessages.sessionId, sessionId));

  // Load the most recent MAX_HISTORY rows descending, then reverse for chronological order
  const rows = (await db
    .select()
    .from(schema.coachMessages)
    .where(whereClause)
    .orderBy(desc(schema.coachMessages.createdAt))
    .limit(MAX_HISTORY)).reverse();

  return sanitizeHistory(rows.map(r => {
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
      const parsed = loadAssistantContent(r.content);
      if (typeof parsed !== 'string') {
        return {role: 'assistant' as const, content: parsed};
      }
    }
    return {
      role: r.role as 'user' | 'assistant',
      content: r.content,
    };
  }));
}

async function persistMessages(athleteId: number, sessionId: string | null, messages: ModelMessage[]): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const toInsert = [];
  let timeOffset = 0;

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
        id: nextMessageId(),
        athleteId,
        sessionId,
        role: 'user',
        content,
        toolCallId: null,
        toolName: null,
        createdAt: now + timeOffset++,
      });
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        if (msg.content) {
          toInsert.push({
            id: nextMessageId(),
            athleteId,
            sessionId,
            role: 'assistant',
            content: msg.content,
            toolCallId: null,
            toolName: null,
            createdAt: now + timeOffset++,
          });
        }
      } else if (Array.isArray(msg.content)) {
        const hasToolCalls = msg.content.some(p => (p as {type: string}).type === 'tool-call');
        if (hasToolCalls) {
          toInsert.push({
            id: nextMessageId(),
            athleteId,
            sessionId,
            role: 'assistant',
            content: JSON.stringify(msg.content),
            toolCallId: null,
            toolName: null,
            createdAt: now + timeOffset++,
          });
        } else {
          const textParts = (msg.content as Array<{type: string; text?: string}>)
            .filter(p => p.type === 'text')
            .map(p => p.text ?? '')
            .join('');
          if (textParts) {
            toInsert.push({
              id: nextMessageId(),
              athleteId,
              sessionId,
              role: 'assistant',
              content: textParts,
              toolCallId: null,
              toolName: null,
              createdAt: now + timeOffset++,
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
            id: nextMessageId(),
            athleteId,
            sessionId,
            role: 'tool',
            content: JSON.stringify(part.output),
            toolCallId: part.toolCallId ?? null,
            toolName: part.toolName ?? null,
            createdAt: now + timeOffset++,
          });
        }
      }
    }
  }

  if (toInsert.length > 0) {
    await db.insert(schema.coachMessages).values(toInsert);
  }

  // Prune old messages scoped to this session only
  const sessionWhereClause = sessionId === null
    ? and(eq(schema.coachMessages.athleteId, athleteId), isNull(schema.coachMessages.sessionId))
    : and(eq(schema.coachMessages.athleteId, athleteId), eq(schema.coachMessages.sessionId, sessionId));

  const countRows = await db
    .select({id: schema.coachMessages.id, createdAt: schema.coachMessages.createdAt})
    .from(schema.coachMessages)
    .where(sessionWhereClause)
    .orderBy(desc(schema.coachMessages.createdAt))
    .limit(PRUNE_ABOVE + 1);

  if (countRows.length > PRUNE_ABOVE) {
    const cutoff = countRows[PRUNE_ABOVE - 1]?.createdAt;
    if (cutoff) {
      await db
        .delete(schema.coachMessages)
        .where(
          and(
            sessionWhereClause,
            lt(schema.coachMessages.createdAt, cutoff),
          ),
        );
    }
  }
}

// GET — supports ?sessionId=X, ?listSessions=1, or default (current session)
export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return Response.json({error: 'athleteId required'}, {status: 400});
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  const db = getDb();

  // List all sessions
  if (req.nextUrl.searchParams.get('listSessions') === '1') {
    const sessionGroups = await db
      .select({
        sessionId: schema.coachMessages.sessionId,
        lastActiveAt: sql<number>`max(${schema.coachMessages.createdAt})`,
        messageCount: sql<number>`count(*)`,
      })
      .from(schema.coachMessages)
      .where(and(
        eq(schema.coachMessages.athleteId, athleteId),
        inArray(schema.coachMessages.role, ['user', 'assistant']),
      ))
      .groupBy(schema.coachMessages.sessionId)
      .orderBy(desc(sql<number>`max(${schema.coachMessages.createdAt})`));

    // Fetch first user message for each session as preview
    const sessions: SessionSummary[] = await Promise.all(
      sessionGroups.map(async sg => {
        const whereClause = sg.sessionId === null
          ? and(
              eq(schema.coachMessages.athleteId, athleteId),
              isNull(schema.coachMessages.sessionId),
              eq(schema.coachMessages.role, 'user'),
            )
          : and(
              eq(schema.coachMessages.athleteId, athleteId),
              eq(schema.coachMessages.sessionId, sg.sessionId),
              eq(schema.coachMessages.role, 'user'),
            );
        const firstMsg = await db
          .select()
          .from(schema.coachMessages)
          .where(whereClause)
          .orderBy(asc(schema.coachMessages.createdAt))
          .limit(1);
        const preview = firstMsg[0]?.content?.slice(0, 80) ?? 'Chat session';
        return {
          id: sg.sessionId,
          createdAt: Number(sg.lastActiveAt),
          preview,
          messageCount: Number(sg.messageCount),
        };
      }),
    );

    return Response.json(sessions);
  }

  // Specific session or current session
  const sessionIdParam = req.nextUrl.searchParams.get('sessionId');
  let resolvedSessionId: string | null;

  if (sessionIdParam !== null) {
    // 'null' string means explicitly legacy null session
    resolvedSessionId = sessionIdParam === 'null' ? null : sessionIdParam;
  } else {
    // Default: most recent session
    resolvedSessionId = await resolveCurrentSessionId(athleteId);
  }

  const whereClause = resolvedSessionId === null
    ? and(
        eq(schema.coachMessages.athleteId, athleteId),
        isNull(schema.coachMessages.sessionId),
        inArray(schema.coachMessages.role, ['user', 'assistant']),
      )
    : and(
        eq(schema.coachMessages.athleteId, athleteId),
        eq(schema.coachMessages.sessionId, resolvedSessionId),
        inArray(schema.coachMessages.role, ['user', 'assistant']),
      );

  const rows = await db
    .select()
    .from(schema.coachMessages)
    .where(whereClause)
    .orderBy(asc(schema.coachMessages.createdAt))
    .limit(MAX_HISTORY);

  return Response.json({
    sessionId: resolvedSessionId,
    messages: rowsToUIMessages(rows),
  });
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 'coach-chat', 20, 60_000);
  if (limited) return limited;

  const {messages, athleteId, sessionId: rawSessionId, model: modelOverride} = await req.json() as {
    messages: UIMessage[];
    athleteId: number;
    sessionId?: string | null;
    model?: string | null;
  };

  if (!athleteId) {
    return new Response(JSON.stringify({error: 'athleteId required'}), {status: 400});
  }
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  // Determine session: use provided ID, or fall back to current session
  let sessionId: string | null;
  if (rawSessionId !== undefined) {
    sessionId = rawSessionId === 'null' ? null : (rawSessionId ?? null);
  } else {
    sessionId = await resolveCurrentSessionId(athleteId);
  }

  const lastUIMessage = messages[messages.length - 1];
  let newModelMsg: ModelMessage;
  let history: ModelMessage[];
  let system: string;
  try {
    const [modelMessages, loadedHistory, builtSystem] = await Promise.all([
      convertToModelMessages([lastUIMessage]),
      loadHistory(athleteId, sessionId),
      buildCoachSystemPrompt(athleteId),
    ]);
    newModelMsg = modelMessages[0];
    history = loadedHistory;
    system = builtSystem;
  } catch (e) {
    console.error('[coach/chat] setup error:', e);
    return new Response(JSON.stringify({error: 'Coach setup failed'}), {status: 500});
  }

  const allMessages: ModelMessage[] = [...history, newModelMsg];

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
    model: getLLMModel(modelOverride),
    ...(isAnthropicProvider() ? {} : {system}),
    messages: [...systemMessages, ...allMessages],
    tools: getCoachTools(athleteId),
    stopWhen: stepCountIs(14),
    onFinish: async ({response}) => {
      await persistMessages(athleteId, sessionId, [newModelMsg, ...response.messages] as ModelMessage[]);
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

export async function DELETE(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  const sessionIdParam = req.nextUrl.searchParams.get('sessionId');
  if (!athleteId || sessionIdParam === null) {
    return Response.json({error: 'athleteId and sessionId required'}, {status: 400});
  }
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;
  const db = getDb();
  const sessionId = sessionIdParam === 'null' ? null : sessionIdParam;
  const where = sessionId === null
    ? and(eq(schema.coachMessages.athleteId, athleteId), isNull(schema.coachMessages.sessionId))
    : and(eq(schema.coachMessages.athleteId, athleteId), eq(schema.coachMessages.sessionId, sessionId));
  await db.delete(schema.coachMessages).where(where);
  return Response.json({ok: true});
}
