# WhatsApp, Ollama and MCP

## Cloud API

Set the server variables listed in `.env.example`, choose `WHATSAPP_PROVIDER=cloud`, and set a Graph API version supported by your Meta app (`META_GRAPH_VERSION` is explicit, not silently upgraded). Use a development business number and test recipients first.

Expose `https://your-host/api/webhooks/cloud` as the callback. The GET challenge requires `META_VERIFY_TOKEN`; POST requests require the raw-body HMAC-SHA256 signature keyed by `META_APP_SECRET`. The configured `META_PHONE_NUMBER_ID` must match the payload. Subscribe to messages. Non-text messages and delivery-status events are acknowledged but not imported; this starter has no media storage.

Inbound text is persisted atomically. No reply is sent by the webhook. The operator opens the CRM, records consent, reviews project fields and approves a message. Free-form sends are restricted by this starter to the last 24 hours after inbound text; it does not implement templates or outbound campaigns. Consult [Meta's current service-message rules](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/service-messages) and your app's policies before connecting a real number. Provider pricing is not calculated here.

## Evolution / Baileys gateway

Choose `WHATSAPP_PROVIDER=evolution` and configure `EVOLUTION_URL`, `EVOLUTION_INSTANCE` and `EVOLUTION_API_KEY`. Outbound text uses `POST /message/sendText/{instance}` with `apikey` and `{number,text}`. This is an **Evolution adapter for a Baileys-backed instance**, not an embedded Baileys socket/QR manager.

Configure Evolution's webhook to `https://your-host/api/webhooks/evolution`, event `MESSAGES_UPSERT`, with an extra `x-webhook-secret` header matching `EVOLUTION_WEBHOOK_SECRET`. If your Evolution release cannot attach a custom header, use a trusted reverse proxy that authenticates the gateway and adds it. Do not put credentials in query strings or expose this endpoint without authentication.

Accepted inbound shape (all values below are fictitious):

```json
{
  "event": "messages.upsert",
  "instance": "agency",
  "data": {
    "key": {"id": "example-event-1", "remoteJid": "550000000000@s.whatsapp.net", "fromMe": false},
    "pushName": "Demo lead",
    "messageTimestamp": 1793988000,
    "message": {"conversation": "Olá, quero conhecer a agência."}
  }
}
```

Echoes, group chats and `@lid` identifiers are ignored. LID-to-phone resolution is outside this adapter: a gateway must provide a verified phone JID. Pin your gateway release and verify its payload contract. Evolution/Baileys are independent, unofficial integrations with their own terms and account risk; [Evolution's upstream](https://github.com/EvolutionAPI/evolution-api) is the source of truth. Live credentialed gateway calls were not performed for this portfolio demo.

## Delivery and concurrency

Every CRM mutation supplies the last observed revision. A stale edit is rejected, including a slow model draft that races an incoming message. Before the external POST, a `sending` record is committed; concurrent clicks cannot reserve the same revision. Consent and the service window are read again immediately before the call. An opt-out that arrives after the provider has accepted the request cannot recall that message.

A provider timeout or malformed/failed response becomes `uncertain`; there is **no automatic retry**. A successful POST means provider acceptance, not handset delivery: `sent` in this starter means accepted by the provider. Read receipts are not implemented. After checking the provider, wait at least one minute and use the confirmation form to mark the result and record evidence. Only then can you retry a confirmed non-send. A crashed process may leave `sending`; the same process applies. There is no exactly-once claim across an external API.

## Local LLM drafts

The default `DRAFT_PROVIDER=rules` asks for missing service, budget or timeline and works offline. To use an actual local LLM, install [Ollama](https://docs.ollama.com/quickstart), pull a model you are licensed to run, then set:

```dotenv
DRAFT_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

Restart Next.js. `Gerar rascunho` requests JSON from `/api/chat`, validates the reply and stores a draft. A model failure is visible, never silently converted into a sent message. LLMs may hallucinate or follow malicious field content: review drafts. This release does not automatically infer budget or update qualification fields from free text; the operator confirms them. The model has no credentials or tools for delivery, deletion or consent changes.

## MCP

Use the supported v1 SDK transport (2025-11-25 protocol) over local stdio. The package is pinned in the lockfile. Launch with Node 22+ directly, so npm's status output does not contaminate the stdio protocol:

```sh
CRM_URL=http://127.0.0.1:3000 \
CRM_ACCESS_TOKEN="<short-lived operator access token>" \
node --import tsx scripts/mcp.ts
```

For MCP hosts, configure `command: "node"`, `args: ["--import", "tsx", "/absolute/path/scripts/mcp.ts"]`, the repo as cwd and these two environment variables. Supply a **user JWT**, never the service-role key. Tokens expire; obtain a fresh one through Supabase Auth and relaunch. Never commit a token in host config.

| Tool | Scope |
|---|---|
| `list_leads` | Current user's leads and conversation context |
| `update_lead` | Move, qualify, schedule a CRM call, handoff/resume, create draft |

There is no send, erase, reconcile or consent-write tool. Treat returned lead text as untrusted content. MCP does not bypass the authenticated HTTP API, revision guard or RLS. Tool input schemas are asserted by a real stdio client in CI. See the [official SDK documentation](https://ts.sdk.modelcontextprotocol.io/server).
