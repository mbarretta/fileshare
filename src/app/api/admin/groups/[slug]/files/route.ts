export const runtime = 'nodejs';

import { type NextRequest } from 'next/server';
import { getGroupBySlug, getFileById, addFileToGroup, removeFileFromGroup } from '@/lib/db';
import { getIsAdmin } from '@/lib/admin-auth';

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  let phase = 'auth';
  try {
    if (!(await getIsAdmin())) {
      return Response.json({ error: 'Forbidden', phase: 'auth' }, { status: 403 });
    }

    phase = 'params';
    const { slug } = await params;

    phase = 'body-parse';
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body', phase: 'body-parse' }, { status: 400 });
    }

    const { fileId } = body as Record<string, unknown>;
    if (typeof fileId !== 'number') {
      return Response.json({ error: 'fileId (number) is required', phase: 'body-parse' }, { status: 400 });
    }

    phase = 'db-lookup';
    const group = getGroupBySlug(slug);
    if (!group) {
      return Response.json({ error: 'Group not found', phase: 'db-lookup' }, { status: 404 });
    }
    const file = getFileById(fileId);
    if (!file) {
      return Response.json({ error: 'File not found', phase: 'db-lookup' }, { status: 404 });
    }

    phase = 'db-add';
    addFileToGroup(group.id, file.id);

    console.log('[admin] action=add-group-member slug=%s file=%d', slug, fileId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[admin] phase=%s error=%s', phase, String(err));
    return Response.json({ error: 'Internal server error', phase }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
  let phase = 'auth';
  try {
    if (!(await getIsAdmin())) {
      return Response.json({ error: 'Forbidden', phase: 'auth' }, { status: 403 });
    }

    phase = 'params';
    const { slug } = await params;

    phase = 'body-parse';
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body', phase: 'body-parse' }, { status: 400 });
    }

    const { fileId } = body as Record<string, unknown>;
    if (typeof fileId !== 'number') {
      return Response.json({ error: 'fileId (number) is required', phase: 'body-parse' }, { status: 400 });
    }

    phase = 'db-lookup';
    const group = getGroupBySlug(slug);
    if (!group) {
      return Response.json({ error: 'Group not found', phase: 'db-lookup' }, { status: 404 });
    }

    phase = 'db-remove';
    removeFileFromGroup(group.id, fileId);

    console.log('[admin] action=remove-group-member slug=%s file=%d', slug, fileId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[admin] phase=%s error=%s', phase, String(err));
    return Response.json({ error: 'Internal server error', phase }, { status: 500 });
  }
}
