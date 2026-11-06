# Privacy and LGPD notes

This is engineering guidance for the starter, not a legal opinion or compliance certification. The operator is responsible for choosing and documenting an appropriate legal basis, privacy notice, retention schedule and process for exercising rights. The ANPD explains [data-subject rights](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares), including access, correction, revocation and applicable erasure requests.

## What the starter does

- A new inbound contact starts without recorded consent. An operator records the evidence before drafting, scheduling or sending.
- `STOP`, `SAIR`, `PARAR`, `CANCELAR`, `não quero` and `nao quero` pause assistance and revoke sending permission. Matching is conservative; an operator can review false positives. A human/attendant/person request pauses AI drafts. Nothing automatically re-enables a contact.
- Each authenticated user sees their own rows under PostgreSQL RLS. This is a single-operator workspace model, not shared-team authorization. The webhook's configured `WORKSPACE_OWNER_ID` receives inbound contacts.
- Supabase service credentials stay on the server. The browser receives only the URL and anon key, which still require an authenticated user's JWT and RLS policies. Login state stays in memory and expires; reload returns to the synthetic demo.
- The optional local Ollama model sees only service, budget and timeline fields. Names, numbers and transcripts are not sent by this implementation. Fields can still contain personal information if an operator types it there: minimize them.
- History is limited to 200 entries per contact. Unresolved outbound records survive trimming. This is an operational conversation window, not a complete audit archive. Consent evidence is part of this bounded history: preserve required proof separately before pruning or extend the schema for production.
- Erasure deletes the contact and its messages. Deduplication event IDs remain **without a lead link or message content** so a delayed retry cannot recreate erased data. These are operational identifiers, not claimed to be anonymous. Define and document their retention; deleting them permits old replay. A genuinely new inbound event can create a fresh consent-pending contact.

## Before using real contacts

Replace the local demo user, establish HTTPS and access control at your host, set an explicit retention period and backup lifecycle, and disclose the virtual assistant and processors. Avoid recording special-category information. Plan access/correction/export requests through authenticated operator processes. A database delete does not erase copies retained by WhatsApp, Evolution, provider logs or backups; manage those separately.

The starter neither bulk-imports contacts nor starts cold outbound conversations. Do not upload client data to this repository. Fictitious `550000…` phone numbers in fixtures are blocked by the sending adapter.

Read [Supabase's RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security) before changing policies. A service-role key bypasses RLS and must never be used as an MCP or browser credential.
