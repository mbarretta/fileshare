export const runtime = 'nodejs';

import { type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { listGroups, insertGroup, isValidSlug } from '@/lib/db';
import { getIsAdmin } from '@/lib/admin-auth';
import { hashPassword } from '@/lib/token';
import { auth } from '@/auth';

export async function GET(_request: NextRequest): Promise<Response> {
  let phase = 'auth';
  try {
    if (!(await getIsAdmin())) {
      return Response.json({ error: 'Forbidden', phase: 'auth' }, { status: 403 });
    }

    phase = 'db-list';
    const groups = listGroups();

    console.log('[admin] action=list-groups count=%d', groups.length);
    return Response.json(groups);
  } catch (err) {
    console.error('[admin] phase=%s error=%s', phase, String(err));
    return Response.json({ error: 'Internal server error', phase }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let phase = 'auth';
  try {
    if (!(await getIsAdmin())) {
      return Response.json({ error: 'Forbidden', phase: 'auth' }, { status: 403 });
    }

    phase = 'body-parse';
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body', phase: 'body-parse' }, { status: 400 });
    }

    const { name, slug, expires_in } = body as Record<string, unknown>;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'name is required', phase: 'body-parse' }, { status: 400 });
    }
    if (!slug || typeof slug !== 'string') {
      return Response.json({ error: 'slug is required', phase: 'body-parse' }, { status: 400 });
    }
    if (!isValidSlug(slug)) {
      return Response.json(
        { error: 'slug must be lowercase alphanumeric and hyphens, 1–64 chars', phase: 'body-parse' },
        { status: 400 },
      );
    }

    // Optional expiry
    let expires_at: number | null = null;
    if (expires_in && typeof expires_in === 'string') {
      const match = expires_in.match(/^(\d+)(h|d)$/);
      if (!match) {
        return Response.json({ error: 'expires_in must be e.g. "7d" or "24h"', phase: 'body-parse' }, { status: 400 });
      }
      const n = parseInt(match[1], 10);
      const unit = match[2] === 'h' ? 3600 : 86400;
      expires_at = Math.floor(Date.now() / 1000) + n * unit;
    }

    phase = 'token-gen';
    const token = randomBytes(32).toString('hex');
    const token_hash = await hashPassword(token);

    phase = 'session';
    const session = await auth();
    const created_by = session?.user?.name ?? session?.user?.email ?? null;

    phase = 'db-create';
    const group = insertGroup({ name: name.trim(), slug, token_hash, expires_at, created_by });

    console.log('[admin] action=create-group slug=%s', slug);
    // Return token once — not stored in plaintext
    return Response.json({ ...group, token }, { status: 201 });
  } catch (err) {
    console.error('[admin] phase=%s error=%s', phase, String(err));
    if (String(err).includes('UNIQUE constraint failed')) {
      return Response.json({ error: 'Slug already exists', phase }, { status: 409 });
    }
    return Response.json({ error: 'Internal server error', phase }, { status: 500 });
  }
}
