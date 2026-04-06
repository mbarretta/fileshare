/**
 * Route-handler unit tests for POST /api/upload (prepare) and
 * POST /api/upload/complete.
 *
 * Both handlers are tested in isolation with all external dependencies
 * mocked (gcs, db, token, auth).  Vitest module isolation ensures that
 * mocks are applied before any route handler module is imported.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — hoisted by Vitest before any imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/gcs', () => ({
  generateSignedUploadUrl: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getFileBySha256: vi.fn(),
  insertFile: vi.fn(),
  updateFileTokenHash: vi.fn(),
  updateFileExpiry: vi.fn(),
}));

vi.mock('@/lib/token', () => ({
  generateToken: vi.fn().mockReturnValue('tok_test'),
  hashToken: vi.fn().mockResolvedValue('hashed_token'),
}));

vi.mock('@/lib/expiry', () => ({
  parseExpiresIn: vi.fn().mockReturnValue(9999),
  parseExpiresAt: vi.fn().mockReturnValue(9999),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SHA256 = 'd8e8fca2dc0f896fd7cb4cb0031ba249d8e8fca2dc0f896fd7cb4cb0031ba249';

function makeFileRecord(overrides: Partial<{
  id: number;
  filename: string;
  original_name: string;
  sha256: string;
  size: number;
  content_type: string;
  gcs_key: string;
  token_hash: string;
  expires_at: number | null;
  uploaded_at: number;
  uploaded_by: string | null;
}> = {}) {
  return {
    id: 42,
    filename: `${VALID_SHA256}.pdf`,
    original_name: 'document.pdf',
    sha256: VALID_SHA256,
    size: 1024,
    content_type: 'application/pdf',
    gcs_key: `${VALID_SHA256}.pdf`,
    token_hash: '$2b$10$fakehash',
    expires_at: null,
    uploaded_at: 1700000000,
    uploaded_by: 'testuser',
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCompleteRequest(body: unknown): Request {
  return new Request('http://localhost/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPrepareBody = {
  sha256: VALID_SHA256,
  filename: 'document.pdf',
  contentType: 'application/pdf',
  size: 1024,
};

const validCompleteBody = {
  sha256: VALID_SHA256,
  gcsKey: `${VALID_SHA256}.pdf`,
  filename: 'document.pdf',
  contentType: 'application/pdf',
  size: 1024,
};

// ---------------------------------------------------------------------------
// Tests: POST /api/upload (prepare phase)
// ---------------------------------------------------------------------------

describe('POST /api/upload — prepare phase', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked((await import('@/lib/token')).generateToken).mockReturnValue('tok_test');
    vi.mocked((await import('@/lib/token')).hashToken).mockResolvedValue('hashed_token');
    vi.mocked((await import('@/auth')).auth).mockResolvedValue({
      user: { username: 'testuser', permissions: ['upload'] },
    } as any);
    vi.mocked((await import('@/lib/gcs')).generateSignedUploadUrl).mockResolvedValue(
      'https://storage.googleapis.com/bucket/signed-url',
    );
    vi.mocked((await import('@/lib/db')).getFileBySha256).mockReturnValue(undefined);
    vi.mocked((await import('@/lib/db')).updateFileTokenHash).mockImplementation(() => undefined);
    vi.mocked((await import('@/lib/db')).updateFileExpiry).mockImplementation(() => undefined);
  });

  it('returns 403 when user has no upload/admin permission', async () => {
    vi.mocked((await import('@/auth')).auth).mockResolvedValue({
      user: { permissions: [] },
    } as any);

    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeRequest(validPrepareBody) as any);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toMatchObject({ error: 'Forbidden', phase: 'prepare' });
  });

  it('returns 400 when sha256 is not 64 hex chars', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeRequest({ ...validPrepareBody, sha256: 'bad' }) as any);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ error: 'Invalid sha256', phase: 'prepare' });
  });

  it('returns 400 when required fields (filename/contentType/size) are missing', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(
      makeRequest({ sha256: VALID_SHA256 }) as any,
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ error: 'Missing required fields', phase: 'prepare' });
  });

  it('returns collision response when file with same sha256 already exists', async () => {
    vi.mocked((await import('@/lib/db')).getFileBySha256).mockReturnValue(makeFileRecord());

    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeRequest(validPrepareBody) as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe('collision');
    expect(json.url).toBe(`/${VALID_SHA256}`);
    expect(json.token).toBe('tok_test');
    expect(json).not.toHaveProperty('signedUrl');

    // DB update functions should be called for the collision path
    const { updateFileTokenHash, updateFileExpiry } = await import('@/lib/db');
    expect(vi.mocked(updateFileTokenHash)).toHaveBeenCalledWith(42, 'hashed_token');
    expect(vi.mocked(updateFileExpiry)).toHaveBeenCalledWith(42, null);
  });

  it('returns upload response with signedUrl and gcsKey for a new file', async () => {
    vi.mocked((await import('@/lib/db')).getFileBySha256).mockReturnValue(undefined);
    vi.mocked((await import('@/lib/gcs')).generateSignedUploadUrl).mockResolvedValue(
      'https://storage.googleapis.com/bucket/signed-url',
    );

    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(makeRequest(validPrepareBody) as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe('upload');
    expect(json.signedUrl).toBe('https://storage.googleapis.com/bucket/signed-url');
    expect(json.gcsKey).toBe(`${VALID_SHA256}.pdf`);
    expect(json.contentType).toBe('application/pdf');

    // generateSignedUploadUrl must be called with correct key and contentType
    const { generateSignedUploadUrl } = await import('@/lib/gcs');
    expect(vi.mocked(generateSignedUploadUrl)).toHaveBeenCalledWith(
      `${VALID_SHA256}.pdf`,
      'application/pdf',
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/upload/complete
// ---------------------------------------------------------------------------

describe('POST /api/upload/complete', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked((await import('@/lib/token')).generateToken).mockReturnValue('tok_test');
    vi.mocked((await import('@/lib/token')).hashToken).mockResolvedValue('hashed_token');
    vi.mocked((await import('@/auth')).auth).mockResolvedValue({
      user: { username: 'testuser', permissions: ['upload'] },
    } as any);
    vi.mocked((await import('@/lib/db')).insertFile).mockReturnValue(
      makeFileRecord({ sha256: VALID_SHA256, expires_at: null }),
    );
  });

  it('returns 403 when user has no upload/admin permission', async () => {
    vi.mocked((await import('@/auth')).auth).mockResolvedValue({
      user: { permissions: [] },
    } as any);

    const { POST } = await import('@/app/api/upload/complete/route');
    const res = await POST(makeCompleteRequest(validCompleteBody) as any);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toMatchObject({ error: 'Forbidden', phase: 'complete' });
  });

  it('returns 400 when sha256 is invalid', async () => {
    const { POST } = await import('@/app/api/upload/complete/route');
    const res = await POST(
      makeCompleteRequest({ ...validCompleteBody, sha256: 'notvalid' }) as any,
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ error: 'Invalid sha256', phase: 'complete' });
  });

  it('returns 400 when gcsKey/filename/contentType/size is missing', async () => {
    const { POST } = await import('@/app/api/upload/complete/route');
    const res = await POST(
      makeCompleteRequest({ sha256: VALID_SHA256 }) as any,
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ error: 'Missing required fields', phase: 'complete' });
  });

  it('returns 200 with url and token, and calls insertFile with correct params', async () => {
    const { POST } = await import('@/app/api/upload/complete/route');
    const res = await POST(makeCompleteRequest(validCompleteBody) as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe(`/${VALID_SHA256}`);
    expect(json.token).toBe('tok_test');
    expect(json).toHaveProperty('expires_at');

    const { insertFile } = await import('@/lib/db');
    expect(vi.mocked(insertFile)).toHaveBeenCalledWith(
      expect.objectContaining({
        sha256: VALID_SHA256,
        gcs_key: `${VALID_SHA256}.pdf`,
        filename: `${VALID_SHA256}.pdf`,
        original_name: 'document.pdf',
        content_type: 'application/pdf',
        size: 1024,
        token_hash: 'hashed_token',
        uploaded_by: 'testuser',
      }),
    );
  });
});
