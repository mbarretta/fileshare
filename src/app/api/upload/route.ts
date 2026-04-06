export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { generateSignedUploadUrl } from '@/lib/gcs';
import { getFileBySha256, updateFileTokenHash, updateFileExpiry } from '@/lib/db';
import { generateToken, hashToken } from '@/lib/token';
import { parseExpiresAt, parseExpiresIn } from '@/lib/expiry';
import { auth } from '@/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify session has upload or admin permission
  const session = await auth();
  const permissions: string[] = session?.user?.permissions ?? [];
  if (!permissions.includes('upload') && !permissions.includes('admin')) {
    console.log('[upload] phase=prepare result=forbidden user=%s', session?.user?.username ?? 'unauthenticated');
    return NextResponse.json({ error: 'Forbidden', phase: 'prepare' }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      sha256?: string;
      filename?: string;
      contentType?: string;
      size?: number;
      expires_in?: string;
      expires_at?: string;
    };

    const { sha256, filename, contentType, size, expires_in, expires_at } = body;

    // Validate sha256
    if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
      return NextResponse.json({ error: 'Invalid sha256', phase: 'prepare' }, { status: 400 });
    }
    if (!filename || !contentType || size == null) {
      return NextResponse.json({ error: 'Missing required fields', phase: 'prepare' }, { status: 400 });
    }

    const resolveExpiry = (fallback: number | null) =>
      expires_in
        ? parseExpiresIn(expires_in)
        : expires_at
          ? parseExpiresAt(expires_at)
          : fallback;

    // Collision check — file with this SHA-256 already uploaded
    const existing = getFileBySha256(sha256);
    if (existing) {
      const token = generateToken();
      const tokenHash = await hashToken(token);
      const expiresAtTs = resolveExpiry(existing.expires_at);
      updateFileTokenHash(existing.id, tokenHash);
      updateFileExpiry(existing.id, expiresAtTs);
      console.log('[upload] phase=prepare collision file=%d sha256=%s', existing.id, sha256);
      return NextResponse.json({
        type: 'collision',
        url: `/${existing.sha256}`,
        token,
        expires_at: expiresAtTs,
      });
    }

    // Derive GCS key from sha256 + extension from filename
    const rawExt = path.extname(filename).replace('.', '') || 'bin';
    const ext = rawExt.toLowerCase();
    const gcsKey = `${sha256}.${ext}`;

    const signedUrl = await generateSignedUploadUrl(gcsKey, contentType);

    console.log('[upload] phase=prepare new sha256=%s gcsKey=%s', sha256, gcsKey);
    return NextResponse.json({
      type: 'upload',
      signedUrl,
      gcsKey,
      contentType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload] phase=prepare error=%s', message);
    return NextResponse.json({ error: message, phase: 'prepare' }, { status: 500 });
  }
}
