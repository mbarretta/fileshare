# TODO

Outstanding work items not yet captured as formal GSD milestones.

---

## UI / UX

- **Admin: force-delete any file** — admin file detail page has expiry and token regen but no delete action; needs a delete button with confirmation.

- **Admin navigation overlap** — the top-right nav menu floats over the admin breadcrumb/sub-nav (e.g. "Users →"), obscuring it. Admin navigation layout needs to be reworked so the two don't collide.

- **Upload progress bars** — two distinct bars needed:
  1. After file is picked (pre-upload): show file size / readiness indicator
  2. During actual upload to server: show transfer progress against total file size

## Auth / Security

- **`/logout` route** — navigating to `/logout` should sign the user out; currently has no effect or 404s.

- **`/[md5]` input validation** — any string is currently accepted as an MD5 path segment and hits the DB. Should validate the segment matches a 32-char hex pattern before querying, and return 404 immediately on a malformed value.

## Infrastructure / Performance

- **Large file support** — current streaming path likely hits Cloud Run request timeout (default 60s) for large files. Options to investigate:
  - Increase Cloud Run timeout (max 3600s)
  - Switch to resumable/signed GCS uploads so the browser uploads directly to GCS (bypasses Cloud Run for the data path)
  - Chunked upload with client-side reassembly
