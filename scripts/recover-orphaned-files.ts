#!/usr/bin/env tsx
/**
 * recover-orphaned-files.ts
 *
 * Reconstructs DB records for GCS objects that exist in the file bucket
 * but have no corresponding row in the files table. This happens when the
 * SQLite WAL was lost on container shutdown before GCS FUSE flushed it.
 *
 * For each orphaned GCS object:
 *   - Derives sha256, gcs_key, content_type, size, uploaded_at from GCS metadata
 *   - Generates a fresh download token (shown once here; regeneratable via admin UI)
 *   - Inserts the row into files
 *
 * Usage:
 *   GCS_BUCKET=pubsec-fileshare DATABASE_PATH=/path/to/fileshare.db npx tsx scripts/recover-orphaned-files.ts
 *
 * Or against the live GCS-FUSE-mounted DB (inside Cloud Run):
 *   DATABASE_PATH=/data/fileshare.db GCS_BUCKET=pubsec-fileshare npx tsx scripts/recover-orphaned-files.ts
 */

import { Storage } from '@google-cloud/storage';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const BUCKET = process.env.GCS_BUCKET;
const DB_PATH = process.env.DATABASE_PATH ?? './data/fileshare.db';

if (!BUCKET) {
  console.error('ERROR: GCS_BUCKET env var is required');
  process.exit(1);
}

void (async function main() {
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET!);

  // ── Open DB ────────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  // ── Get all sha256 keys currently in the DB ─────────────────────────────
  const existing = new Set(
    (db.prepare('SELECT sha256 FROM files').all() as { sha256: string }[]).map(r => r.sha256)
  );
  console.log(`DB has ${existing.size} file record(s).`);

  // ── List all objects in GCS bucket ──────────────────────────────────────
  const [objects] = await bucket.getFiles();
  console.log(`GCS bucket has ${objects.length} object(s).`);

  const orphans = objects.filter(obj => {
    const sha256 = obj.name.replace(/\.[^.]+$/, ''); // strip extension
    return !existing.has(sha256);
  });

  if (orphans.length === 0) {
    console.log('No orphaned objects found — nothing to recover.');
    return;
  }

  console.log(`\nFound ${orphans.length} orphaned GCS object(s):\n`);

  const insert = db.prepare(`
    INSERT INTO files (filename, original_name, sha256, size, content_type, gcs_key, token_hash, expires_at, uploaded_at, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'recovered')
  `);

  for (const obj of orphans) {
    const [meta] = await obj.getMetadata();
    const gcsKey = obj.name;
    const sha256 = gcsKey.replace(/\.[^.]+$/, '');
    const contentType = (meta.contentType as string) ?? 'application/octet-stream';
    const size = parseInt(meta.size as string, 10);
    const uploadedAt = Math.floor(new Date(meta.timeCreated as string).getTime() / 1000);

    // Generate a fresh token — shown once here, regeneratable via admin UI
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);

    insert.run(gcsKey, gcsKey, sha256, size, contentType, gcsKey, tokenHash, uploadedAt);

    console.log(`  ✅ Recovered: ${gcsKey}`);
    console.log(`     size: ${(size / 1e6).toFixed(1)} MB | type: ${contentType}`);
    console.log(`     ⚠️  Download token (one-time): ${rawToken}`);
    console.log(`     Regenerate via Admin → Files → file detail if needed.\n`);
  }

  console.log(`Recovery complete. ${orphans.length} record(s) inserted.`);
  db.close();
})();
