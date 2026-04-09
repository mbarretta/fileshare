export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getExpiredFiles, deleteFile } from '@/lib/db';
import { deleteFromGCS } from '@/lib/gcs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CLEANUP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  // Use constant-time comparison to prevent timing oracle attacks on the secret.
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (
    tokenBuf.length !== secretBuf.length ||
    !crypto.timingSafeEqual(tokenBuf, secretBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expired = getExpiredFiles();
  const results = await Promise.allSettled(
    expired.map(async (record) => {
      await deleteFromGCS(record.gcs_key);
      deleteFile(record.id);
    }),
  );

  let deleted = 0;
  const errors: string[] = [];
  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      deleted++;
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error('[cleanup] phase=gcs-delete key=%s error=%s', expired[i].gcs_key, msg);
      errors.push(`${expired[i].gcs_key}: ${msg}`);
    }
  }

  console.log('[cleanup] deleted=%d errors=%d', deleted, errors.length);
  return NextResponse.json({ deleted, errors });
}
