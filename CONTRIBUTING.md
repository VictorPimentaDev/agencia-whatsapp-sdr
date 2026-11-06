# Contributing

Keep the default demo offline and fictitious. Use Node 22+ and a disposable PostgreSQL 17 database.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:db
npx playwright install chromium
npm run test:e2e
npm run build
```

`test:db` starts and removes an isolated local database when PostgreSQL tools are installed. Alternatively set `PG_TEST_URL` to a **fresh disposable** database. The bootstrap creates Supabase-like auth roles/tables; it must never run on an existing project. CI executes the same migration, seed and SQL assertions on PostgreSQL 17.

Good first contributions: additional Brazilian opt-out phrasing with regression tests, an accessible keyboard shortcut for contact search, and a documented Evolution fixture from a pinned release. Discuss calendar-provider integration before adding dependencies.

New delivery code needs tests for authentication, duplicate ingress, concurrent edits, provider timeouts and opt-out. Preserve human approval. Never paste real phone numbers, lead conversations, credentials or provider responses into issues, fixtures or screenshots.

The board intentionally uses a select for stage changes, so keyboard and touch users have the same controls. Avoid adding drag-only actions. Fonts are vendored with their OFL licenses; no font request leaves the browser.
