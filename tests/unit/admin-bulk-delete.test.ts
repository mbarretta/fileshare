/**
 * Unit tests for DELETE /api/admin/files (bulk delete handler)
 *
 * Uses vi.mock hoisting so that all imported modules are mocked before the
 * route handler is imported.  Pattern mirrors download-route.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — hoisted by Vitest before any imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/admin-auth', () => ({
  getIsAdmin: vi.fn(),
}));

vi.mock('@/lib/gcs', () => ({
  deleteFromGCS: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  listFiles: vi.fn(),
  getFileById: vi.fn(),
  deleteFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/files', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRecord(id: number) {
  return {
    id,
    filename: `file${id}.pdf`,
    original_name: `File ${id}.pdf`,
    sha256: `sha256${id}`.padEnd(64, '0'),
    size: 1024,
    content_type: 'application/pdf',
    gcs_key: `keys/file${id}.pdf`,
    token_hash: `hash${id}`,
    expires_at: null,
    uploaded_by: null,
    created_at: 1700000000,
    uploaded_at: 1700000000,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/files — bulk delete handler', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    // Re-apply safe defaults after reset
    vi.mocked((await import('@/lib/admin-auth')).getIsAdmin).mockResolvedValue(true);
    vi.mocked((await import('@/lib/gcs')).deleteFromGCS).mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/db')).deleteFile).mockReturnValue(undefined);
    vi.mocked((await import('@/lib/db')).getFileById).mockReturnValue(undefined);
  });

  it('returns 403 when not admin', async () => {
    vi.mocked((await import('@/lib/admin-auth')).getIsAdmin).mockResolvedValue(false);

    const { DELETE } = await import('@/app/api/admin/files/route');
    const res = await DELETE(makeRequest({ ids: [1] }) as never);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('returns 400 for invalid body (ids is not an array)', async () => {
    vi.mocked((await import('@/lib/admin-auth')).getIsAdmin).mockResolvedValue(true);

    const { DELETE } = await import('@/app/api/admin/files/route');
    const res = await DELETE(makeRequest({ ids: 'notanarray' }) as never);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/ids must be/);
  });

  it('returns partial failure when GCS throws for one id', async () => {
    vi.mocked((await import('@/lib/admin-auth')).getIsAdmin).mockResolvedValue(true);

    const db = await import('@/lib/db');
    vi.mocked(db.getFileById)
      .mockReturnValueOnce(makeRecord(1))
      .mockReturnValueOnce(makeRecord(2));

    const gcs = await import('@/lib/gcs');
    vi.mocked(gcs.deleteFromGCS)
      .mockRejectedValueOnce(new Error('GCS unavailable'))
      .mockResolvedValueOnce(undefined);

    const { DELETE } = await import('@/app/api/admin/files/route');
    const res = await DELETE(makeRequest({ ids: [1, 2] }) as never);

    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: 1, ok: false });
    expect(results[0].error).toBeDefined();
    expect(results[1]).toMatchObject({ id: 2, ok: true });

    // DB delete should NOT have been called for id=1 (GCS failed)
    expect(vi.mocked(db.deleteFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.deleteFile)).toHaveBeenCalledWith(2);
  });

  it('returns all-ok when all succeed', async () => {
    vi.mocked((await import('@/lib/admin-auth')).getIsAdmin).mockResolvedValue(true);

    const db = await import('@/lib/db');
    vi.mocked(db.getFileById)
      .mockReturnValueOnce(makeRecord(10))
      .mockReturnValueOnce(makeRecord(20));

    vi.mocked((await import('@/lib/gcs')).deleteFromGCS).mockResolvedValue(undefined);

    const { DELETE } = await import('@/app/api/admin/files/route');
    const res = await DELETE(makeRequest({ ids: [10, 20] }) as never);

    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: 10, ok: true });
    expect(results[1]).toMatchObject({ id: 20, ok: true });

    expect(vi.mocked(db.deleteFile)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(db.deleteFile)).toHaveBeenCalledWith(10);
    expect(vi.mocked(db.deleteFile)).toHaveBeenCalledWith(20);
  });
});
