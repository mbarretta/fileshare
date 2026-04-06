# TODO

Outstanding work items not yet captured as formal GSD milestones.

---

## UI / UX

- **Admin: force-delete any file** — admin file detail page has expiry and token regen but no delete action; needs a delete button with confirmation.

- **Admin navigation overlap** — the top-right nav menu floats over the admin breadcrumb/sub-nav (e.g. "Users →"), obscuring it. Admin navigation layout needs to be reworked so the two don't collide.

## Auth / Security

- **`/[sha256]` input validation** — any string is currently accepted as a sha256 path segment and hits the DB. Should validate the segment matches a 64-char hex pattern before querying, and return 404 immediately on a malformed value.
