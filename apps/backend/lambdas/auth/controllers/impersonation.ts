import { json, parseBody } from '@branch/lambda-http';
import type { RouteHandler } from '@branch/lambda-http';
import { DIRECTOR_ROLES } from '@branch/lambda-auth';
import type { ImpersonationMode } from '@branch/lambda-auth';
import { db, endImpersonationSession, startImpersonationSession } from '@branch/store';

export const SESSION_TTL_MS = 60 * 60 * 1000;

const MODES: readonly ImpersonationMode[] = ['read_only', 'full'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_LIMIT = 200;

export const handleListTargets: RouteHandler = async ({ event }) => {
  const search = String(event.queryStringParameters?.search ?? '').trim();

  let query = db
    .selectFrom('branch.users')
    .where('is_staff', 'is not', true)
    .select(['user_id', 'name', 'email', 'is_admin', 'cognito_sub'])
    .orderBy('name')
    .limit(TARGET_LIMIT);
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    query = query.where((eb) =>
      eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]),
    );
  }
  const users = await query.execute();

  const ids = users.map((u) => u.user_id);
  const memberships = ids.length
    ? await db
        .selectFrom('branch.project_memberships')
        .where('user_id', 'in', ids)
        .select(['user_id', 'role'])
        .execute()
    : [];

  const counts = new Map<number, { directs: number; member: number }>();
  for (const m of memberships) {
    const c = counts.get(m.user_id) ?? { directs: 0, member: 0 };
    c.member += 1;
    if ((DIRECTOR_ROLES as readonly string[]).includes(m.role)) c.directs += 1;
    counts.set(m.user_id, c);
  }

  return json(200, {
    users: users.map((u) => ({
      userId: u.user_id,
      name: u.name,
      email: u.email,
      isAdmin: u.is_admin === true,
      pending: u.cognito_sub === null,
      directorProjectCount: counts.get(u.user_id)?.directs ?? 0,
      memberProjectCount: counts.get(u.user_id)?.member ?? 0,
    })),
  });
};

export const handleStartImpersonation: RouteHandler = async ({ event, auth }) => {
  const body = parseBody(event);
  const targetUserId = Number(body?.targetUserId);
  const mode = body?.mode as ImpersonationMode;
  if (!Number.isInteger(targetUserId) || !MODES.includes(mode)) {
    return json(400, { message: "targetUserId and mode ('read_only' | 'full') are required" });
  }

  const target = await db
    .selectFrom('branch.users')
    .where('user_id', '=', targetUserId)
    .where('is_staff', 'is not', true)
    .select(['user_id', 'name', 'email'])
    .executeTakeFirst();
  // 404 for a staff target too: the console must not confirm one exists.
  if (!target) return json(404, { message: 'User not found' });

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + SESSION_TTL_MS);
  const sessionId = await startImpersonationSession({
    staffUserId: auth.subject.userId!,
    targetUserId: target.user_id,
    mode,
    startedAt,
    expiresAt,
  });

  return json(201, {
    sessionId,
    mode,
    expiresAt: expiresAt.toISOString(),
    target: { userId: target.user_id, name: target.name, email: target.email },
  });
};

// Called as the staff account, without the impersonation header, so a read-only session can always be left.
export const handleEndImpersonation: RouteHandler = async ({ params, auth }) => {
  if (!UUID.test(params.sessionId)) return json(404, { message: 'Session not found' });

  await endImpersonationSession(params.sessionId, auth.subject.userId!);

  return json(200, { ended: true });
};
