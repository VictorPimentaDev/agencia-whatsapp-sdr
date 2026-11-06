# Verification ledger

Verified locally on 2026-11-06, Node 24 / PostgreSQL 17:

- `npm run lint` and `npm run typecheck`: pass.
- `npm test`: 17 tests passing (domain, provider contracts, bounded ingress, Ollama draft contract and real MCP stdio negotiation).
- `npm run test:db`: migrations + seed execute on actual PostgreSQL; RLS, cross-owner updates, webhook permissions, duplicate delivery, stale timestamps, opt-out, completion, erasure and replay checks pass. A 205-message sequence verifies unresolved sends survive trimming.
- `npm run test:e2e`: operator workflow and unauthenticated endpoint checks pass on Chromium desktop and mobile emulation. The final browser suite has 10 passing checks, including cross-contact draft clearing and late HTTP responses across logout/new login. Supabase Auth and CRM HTTP responses are controlled in those session tests; they test browser state isolation, not the live Auth service.
- `npm run build`: production compilation and TypeScript check pass.
- `npm audit`: 0 vulnerabilities after pinning the development-only minimatch override used by TypeScript ESLint.
- The screenshot is captured from the running app, not a mockup. Fonts are local, with bundled OFL notices.

The `CI` workflow is the repeatable source of truth for the checked-in revision.

## Local Supabase integration follow-up — 2026-11-06

Added `npm run test:supabase`: a disposable-project runner and eight assertion groups
using real Auth/PostgREST with the CRM/webhook handlers in process. It includes seed
password login, two synthetic tenants, direct RLS checks, concurrent dedupe/revisions,
opt-out, human handoff, uncertain-send reconciliation and erasure/replay. It never
sends to WhatsApp. See [execution, boundaries and cleanup](supabase-integration.md).

Current result: **BLOCKED, exit 1; zero live assertion groups executed**. The local
Docker context is `default`; `/var/run/docker.sock` does not exist. No local Supabase
project was started and no hosted project was contacted. The READY report's live
Auth/PostgREST gap remains open. No production defect was reproduced or patched.

Follow-up gates: lint/typecheck/build pass; `npm test` has 20 passing tests (the original
17 plus three harness safety checks); `npm run test:db` passes against isolated
PostgreSQL; `npm run test:e2e` has 10 passing Chromium desktop/mobile checks. Those
browser session checks still control Auth/HTTP and are not evidence of live Supabase.

## Public-repository scan — 2026-11-06

The maintainer explicitly changed the portfolio repositories to public during this
workstream; this workstream did not change visibility. Before the follow-up push,
Gitleaks 8.30.1 scanned Git history and the working directory with `--redact=100`.
History had no findings. The first directory scan found ten generated Next preview /
Server Action keys under ignored `.next` and `.next-e2e` artifacts. Those local build
artifacts were removed after the passing build/E2E gates; no source credential or
pushed history needed rewriting. Both scans were then repeated before pushing.

## Not exercised against external services

Docker was not running in the development environment. The full local Supabase stack and its Auth/PostgREST integration were not started; SQL was executed against an isolated PostgreSQL cluster with an auth-role shim matching `auth.uid()`. The Supabase seed's password and identities shape are intended for local Supabase, but a full-stack smoke remains necessary before connecting real contacts.

No real WhatsApp message was sent. Cloud/Evolution adapters have deterministic request-contract tests; they still need a credentialed smoke against your app/gateway release. Ollama was not started and no model weights were downloaded; the JSON API contract and data minimization are tested with a controlled transport. No production deployment was made.

## Intentional scope

- Assisted qualification and human-approved text delivery, not an unattended sales bot.
- CRM calls, not external-calendar booking or availability checks.
- Single operator per workspace; no shared-team RBAC, billing or SaaS tenancy management.
- Text-only inbox. Media, groups, LID resolution, templates and receipts are not implemented.
- Bounded history, not a durable audit system. Configure retention and evidence preservation for real operations.
- Short-lived login state in memory; re-authenticate after expiry/reload. No background token persistence.
- Successful provider POST is acceptance, not confirmed delivery. Reconcile uncertain sends manually.

## Social preview

`docs/social-preview.png` is a ready-to-upload 1200×630 card. GitHub does not offer an initial social-preview upload for a new private repository; upload it after deciding to publish. Existing private repositories with a previous image are an exception. See [GitHub's documented restriction](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview). The repository is now public by the maintainer’s explicit decision; this workstream made no visibility changes.
