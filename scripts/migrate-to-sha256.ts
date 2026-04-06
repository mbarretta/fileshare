/**
 * One-time migration: rename GCS objects and update DB records from MD5 → SHA-256.
 *
 * Records with length(sha256) = 32 still hold old MD5 values — they are unmigrated.
 * Records with length(sha256) = 64 are already migrated — they are skipped.
 *
 * Run dry-run first:
 *   DRY_RUN=1 npx tsx scripts/migrate-to-sha256.ts
 *
 * Then run for real:
 *   npx tsx scripts/migrate-to-sha256.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Resolve project root so DATABASE_PATH matches the app default
const __dirname_compat = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname_compat, '..');

// Set DATABASE_PATH to project-root-relative data/fileshare.db unless already set
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(projectRoot, 'data', 'fileshare.db');
}

// GCS_BUCKET must be set (loaded from .env by the caller or inherited from shell)
if (!process.env.GCS_BUCKET) {
  console.error('[migrate] ERROR: GCS_BUCKET env var is required');
  process.exit(1);
}

const DRY_RUN = Boolean(process.env.DRY_RUN);
if (DRY_RUN) {
  console.log('[migrate] DRY_RUN mode — no changes will be made');
}

interface FileRow {
  id: number;
  sha256: string;
  gcs_key: string;
  filename: string;
}

void (async function main() {
  // Dynamic imports keep this ESM-compatible with tsx
  const { getDb } = await import('../src/lib/db.js');
  const { getGCSReadStream, renameInGCS } = await import('../src/lib/gcs.js');

  const db = getDb();

  // Fetch all records — separate into unmigrated (len=32) and already done (len=64)
  const allRows = db
    .prepare<[], FileRow>('SELECT id, sha256, gcs_key, filename FROM files ORDER BY id')
    .all();

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of allRows) {
    if (row.sha256.length === 64) {
      console.log(`[migrate] SKIP id=${row.id} already migrated`);
      skipped++;
      continue;
    }

    // Unmigrated: sha256 column still holds old 32-char MD5 value
    const oldKey = row.gcs_key; // e.g. "4dc2835a9228799980179ae9b3ae9551.txt"
    const ext = path.extname(oldKey); // e.g. ".txt"

    // Stream the GCS object and compute SHA-256
    let sha256: string;
    try {
      const stream = getGCSReadStream(oldKey);
      sha256 = await new Promise<string>((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        stream.on('data', (chunk: Buffer) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[migrate] WARN id=${row.id} GCS read failed: ${msg}`);
      errors++;
      continue;
    }

    const newKey = `${sha256}${ext}`;

    if (DRY_RUN) {
      console.log(`[migrate-dry] id=${row.id} old=${oldKey} would-become=${newKey}`);
      continue;
    }

    // Rename in GCS — non-fatal on error
    let gcsOk = true;
    try {
      await renameInGCS(oldKey, newKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[migrate] WARN id=${row.id} GCS rename failed: ${msg}`);
      errors++;
      // If the source object is already gone (prior partial run renamed it), treat as OK
      // For other hard errors (auth, network), skip the DB update to avoid inconsistency
      if (!msg.includes('No such object') && !msg.includes('404')) {
        gcsOk = false;
      }
    }

    if (!gcsOk) {
      continue;
    }

    // Update DB: set sha256, gcs_key, and filename to the new values
    db.prepare<[string, string, string, number]>(
      'UPDATE files SET sha256=?, gcs_key=?, filename=? WHERE id=?',
    ).run(sha256, newKey, newKey, row.id);

    console.log(`[migrate] id=${row.id} old=${row.sha256} new=${sha256}`);
    migrated++;
  }

  console.log(`Done. Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`);
})();
