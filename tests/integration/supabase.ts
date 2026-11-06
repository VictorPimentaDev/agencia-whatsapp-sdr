import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET, POST } from '../../src/app/api/crm/route';
import { POST as cloud } from '../../src/app/api/webhooks/cloud/route';
import { POST as evolution } from '../../src/app/api/webhooks/evolution/route';
import { type Action, type Lead } from '../../src/lib/domain';
import { localUrl } from '../../scripts/test-supabase';

async function run() {
  assert(
    /^agency-integration-[a-f0-9-]+$/.test(process.env.AGENCY_INTEGRATION_PROJECT ?? ''),
    'Use npm run test:supabase; this suite requires a disposable local project',
  );
  const url = localUrl(process.env.SUPABASE_URL ?? '');
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  assert(anonKey && serviceKey, 'Local project keys are required');
  const nativeFetch = globalThis.fetch;
  let blockedRequests = 0;
  globalThis.fetch = async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.origin !== url) {
      blockedRequests++;
      throw new Error('Integration blocked a request outside its own local Supabase API');
    }
    return nativeFetch(input, {
      ...init,
      redirect: 'error',
      signal: init?.signal ?? AbortSignal.timeout(10000),
    });
  };
  process.env.DRAFT_PROVIDER = 'rules';
  process.env.META_APP_SECRET = randomUUID();
  process.env.META_PHONE_NUMBER_ID = 'synthetic-number';
  process.env.EVOLUTION_WEBHOOK_SECRET = randomUUID();
  process.env.EVOLUTION_INSTANCE = 'synthetic-instance';
  // No WhatsApp credentials or send-capable provider are configured.
  process.env.WHATSAPP_PROVIDER = 'disabled-integration';
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(url, serviceKey, options);
  const anonymous = createClient(url, anonKey, options);
  const created: string[] = [];
  let checks = 0;
  const pass = (label: string) => console.log(`PASS ${++checks}: ${label}`);
  const checked = <T extends { data: unknown; error: unknown }>(
    result: T,
    label: string,
  ): T['data'] => {
    assert(!result.error, label);
    return result.data;
  };
  async function tenant() {
    const client = createClient(url, anonKey, options);
    const email = `integration-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { user } = checked(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
      'Create synthetic user',
    );
    assert(user);
    created.push(user.id);
    const { session } = checked(
      await client.auth.signInWithPassword({ email, password }),
      'Password login through real Auth',
    );
    assert(session);
    return { client, id: user.id, token: session.access_token };
  }
  function request(token?: string, payload?: object) {
    return new Request('http://127.0.0.1/api/crm', {
      method: payload ? 'POST' : 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
  }
  async function leads(token: string): Promise<Lead[]> {
    const response = await GET(request(token));
    assert.equal(response.status, 200, 'Authenticated CRM read');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return (await response.json()).leads;
  }
  async function action(token: string, lead: Lead, value: Action, expected = 200) {
    const response = await POST(
      request(token, { id: lead.id, revision: lead.revision, action: value }),
    );
    assert.equal(response.status, expected, `CRM ${value.type} status`);
    return response;
  }
  const phone = '550000000001';
  const at = new Date(Date.now() - 5000).toISOString();
  async function inbound(id: string, text: string, timestamp = at, valid = true) {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'synthetic-number' },
                contacts: [{ wa_id: phone, profile: { name: 'Synthetic lead' } }],
                messages: [
                  {
                    id,
                    from: phone,
                    timestamp: String(Math.floor(Date.parse(timestamp) / 1000)),
                    type: 'text',
                    text: { body: text },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature = createHmac('sha256', process.env.META_APP_SECRET!).update(body).digest('hex');
    const response = await cloud(
      new Request('http://127.0.0.1/api/webhooks/cloud', {
        method: 'POST',
        body,
        headers: { 'x-hub-signature-256': `sha256=${valid ? signature : 'invalid'}` },
      }),
    );
    assert.equal(response.status, valid ? 200 : 403, 'Cloud webhook verification/ingestion');
  }
  async function directRows(client: SupabaseClient) {
    const data = checked(
      await client.from('leads').select('*'),
      'PostgREST select without an owner filter',
    );
    assert(data);
    return data;
  }

  try {
    const seed = createClient(url, anonKey, options);
    const seeded = checked(
      await seed.auth.signInWithPassword({
        email: 'operator@example.test',
        password: 'local-demo-only',
      }),
      'Existing seed must log in through Supabase Auth',
    );
    assert.equal(seeded.user?.id, '00000000-0000-4000-8000-000000000100');
    assert.equal((await directRows(seed)).length, 1, 'Seed lead is accessible via real JWT/RLS');
    const a = await tenant();
    const b = await tenant();
    assert.equal((await leads(a.token)).length, 0);
    assert.equal((await leads(b.token)).length, 0);
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request('invalid-token'))).status, 401);
    assert.equal((await POST(request(undefined, {}))).status, 401);
    pass('seed login, two real Auth sessions and unauthenticated CRM rejection');

    process.env.WORKSPACE_OWNER_ID = a.id;
    await inbound('first', 'Olá', at, false);
    assert.equal((await directRows(a.client)).length, 0, 'Invalid signature cannot persist a lead');
    await Promise.all(Array.from({ length: 5 }, () => inbound('first', 'Olá')));
    let lead = (await leads(a.token))[0];
    assert.equal(lead.messages.length, 1, 'Concurrent duplicate delivered once');
    assert.equal(lead.revision, 1);
    checked(
      await admin.rpc('ingest_message', {
        p_owner: b.id,
        p_provider: 'cloud',
        p_event: 'first',
        p_phone: phone,
        p_name: 'Synthetic peer',
        p_text: 'Oi',
        p_at: at,
      }),
      'Ingest same event for second owner',
    );
    const peer = (await leads(b.token))[0];
    assert.notEqual(lead.id, peer.id);
    assert.equal(peer.messages.length, 1, 'Dedupe is tenant scoped');
    pass('signed ingress, concurrent dedupe and independent tenants sharing phone/event IDs');

    assert.deepEqual(
      (await directRows(a.client)).map((row) => row.id),
      [lead.id],
    );
    assert.deepEqual(
      (await directRows(b.client)).map((row) => row.id),
      [peer.id],
    );
    const crossUpdate = checked(
      await b.client.from('leads').update({ company: 'forbidden' }).eq('id', lead.id).select('id'),
      'Cross-tenant update query',
    );
    assert(crossUpdate);
    assert.equal(crossUpdate.length, 0, 'RLS blocks cross-tenant writes');
    assert(
      (await a.client.from('leads').update({ owner_id: b.id }).eq('id', lead.id)).error,
      'Cannot transfer ownership',
    );
    assert(
      (
        await a.client
          .from('leads')
          .insert({ owner_id: a.id, name: 'Forbidden', phone: '550000000002' })
      ).error,
      'No client inserts',
    );
    assert((await a.client.from('leads').delete().eq('id', lead.id)).error, 'Erasure must use RPC');
    assert((await a.client.from('webhook_events').select('*')).error, 'Ledger is service-only');
    assert((await anonymous.from('leads').select('*')).error, 'Anon cannot read CRM');
    assert(
      (
        await a.client.rpc('ingest_message', {
          p_owner: a.id,
          p_provider: 'cloud',
          p_event: 'forged',
          p_phone: phone,
          p_name: 'Forbidden',
          p_text: 'Hi',
          p_at: at,
        })
      ).error,
      'User cannot forge inbound',
    );
    assert(
      (await b.client.rpc('forget_lead', { p_id: lead.id, p_revision: lead.revision })).error,
      'Foreign erasure rejected',
    );
    assert(
      (await b.client.rpc('finish_send', { p_id: lead.id, p_message: 'forged', p_status: 'sent' }))
        .error,
      'Foreign send completion rejected',
    );
    await action(b.token, lead, { type: 'handoff', human: true }, 400);
    assert.equal(
      (await leads(a.token))[0].revision,
      lead.revision,
      'Denied operations leave owner data unchanged',
    );
    pass('unfiltered PostgREST RLS, ownership checks, table privileges and RPC authorization');

    await action(a.token, lead, {
      type: 'consent',
      consent: true,
      evidence: 'Synthetic consent for isolated integration',
    });
    lead = (await leads(a.token))[0];
    await action(a.token, lead, { type: 'draft' });
    lead = (await leads(a.token))[0];
    assert.equal(lead.messages.at(-1)?.status, 'draft');
    const stale = lead;
    await action(a.token, lead, { type: 'handoff', human: true });
    lead = (await leads(a.token))[0];
    assert(lead.human);
    await action(a.token, lead, { type: 'draft' }, 400);
    await action(a.token, stale, { type: 'handoff', human: false }, 400);
    assert.equal((await leads(a.token))[0].revision, lead.revision);
    pass('persisted consent/draft, human handoff blocks AI and stale revisions cannot resume it');

    process.env.WORKSPACE_OWNER_ID = b.id;
    const evolutionBody = JSON.stringify({
      event: 'messages.upsert',
      instance: 'synthetic-instance',
      data: {
        key: { id: 'human-request', remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
        pushName: 'Synthetic peer',
        messageTimestamp: Math.floor(Date.now() / 1000) - 1,
        message: { conversation: 'Quero falar com um humano' },
      },
    });
    for (const secret of ['invalid', process.env.EVOLUTION_WEBHOOK_SECRET!]) {
      const response = await evolution(
        new Request('http://127.0.0.1/api/webhooks/evolution', {
          method: 'POST',
          body: evolutionBody,
          headers: { 'x-webhook-secret': secret },
        }),
      );
      assert.equal(response.status, secret === 'invalid' ? 403 : 200);
    }
    assert((await leads(b.token))[0].human, 'Inbound human request persists handoff');
    assert.equal((await leads(a.token))[0].revision, lead.revision, 'Gateway owner is isolated');
    pass('Evolution secret verification and inbound human handoff');

    let pending = (await leads(b.token))[0];
    await action(b.token, pending, {
      type: 'consent',
      consent: true,
      evidence: 'Synthetic approval for pending-delivery checks',
    });
    pending = (await leads(b.token))[0];
    const pendingMessage = {
      id: 'synthetic-pending',
      role: 'operator',
      text: 'Fixture only; never sent',
      at: new Date(Date.now() - 120000).toISOString(),
      status: 'sending',
    };
    checked(
      await admin
        .from('leads')
        .update({ messages: [...pending.messages, pendingMessage] })
        .eq('id', pending.id),
      'Install synthetic pending-delivery fixture',
    );
    checked(
      await b.client.rpc('finish_send', {
        p_id: pending.id,
        p_message: pendingMessage.id,
        p_status: 'uncertain',
      }),
      'Persist uncertain delivery via authenticated RPC',
    );
    pending = (await leads(b.token))[0];
    assert.equal(pending.messages.at(-1)?.status, 'uncertain');
    await action(b.token, pending, { type: 'send', text: 'Must not retry' }, 400);
    assert.equal((await leads(b.token))[0].revision, pending.revision);
    await action(b.token, pending, {
      type: 'reconcile',
      messageId: pendingMessage.id,
      delivered: false,
      evidence: 'Synthetic fixture: no provider request was made',
    });
    pending = (await leads(b.token))[0];
    assert.equal(
      pending.messages.find((message) => message.id === pendingMessage.id)?.status,
      'note',
    );
    assert(pending.human, 'Reconciliation must preserve human ownership');
    pass(
      'uncertain delivery blocks retry; operator reconciliation preserves handoff without sending',
    );

    const races = await Promise.all(
      [true, false].map((human) =>
        POST(
          request(a.token, {
            id: lead.id,
            revision: lead.revision,
            action: { type: 'handoff', human },
          }),
        ),
      ),
    );
    assert.deepEqual(
      races.map((response) => response.status).sort(),
      [200, 400],
      'Exactly one concurrent revision wins',
    );
    lead = (await leads(a.token))[0];
    process.env.WORKSPACE_OWNER_ID = a.id;
    const beforeStop = lead;
    const old = new Date(Date.now() - 7200000).toISOString();
    await inbound('stop', 'STOP!', old);
    await inbound('stop', 'STOP!', old);
    lead = (await leads(a.token))[0];
    assert(lead.opted_out && lead.human && !lead.consent);
    assert.equal(lead.revision, beforeStop.revision + 1);
    assert.equal(
      lead.last_inbound_at,
      beforeStop.last_inbound_at,
      'Late opt-out cannot regress service window',
    );
    await action(a.token, lead, { type: 'draft' }, 400);
    await action(a.token, lead, { type: 'send', text: 'Must never send' }, 400);
    await action(a.token, lead, { type: 'handoff', human: false }, 400);
    await action(
      a.token,
      beforeStop,
      { type: 'consent', consent: true, evidence: 'Stale approval must fail' },
      400,
    );
    await inbound('after-stop', 'Olá novamente');
    lead = (await leads(a.token))[0];
    assert(
      lead.opted_out && lead.human && !lead.consent,
      'New inbound cannot silently opt back in',
    );
    pass(
      'concurrent revision guard, causal timestamps and sticky opt-out reject send/draft/resume',
    );

    await action(a.token, beforeStop, { type: 'forget' }, 400);
    const peerBefore = await leads(b.token);
    await action(a.token, lead, { type: 'forget' });
    assert.equal((await leads(a.token)).length, 0);
    const events = checked(
      await admin.from('webhook_events').select('lead_id').eq('owner_id', a.id),
      'Read erased event ledger',
    );
    assert(events);
    assert.equal(events.length, 3);
    assert(
      events.every((event) => event.lead_id === null),
      'Erasure unlinks every event',
    );
    await inbound('first', 'Replay');
    await inbound('stop', 'STOP!', old);
    assert.equal(
      (await leads(a.token)).length,
      0,
      'Replayed events cannot resurrect erased contact',
    );
    assert.deepEqual(await leads(b.token), peerBefore, 'Erasure leaves other tenant unchanged');
    assert.equal(blockedRequests, 0, 'No attempted outbound requests');
    pass(
      'revision-safe erasure, unlinked dedupe ledger, replay protection and no outbound requests',
    );
    console.log(
      `PASS: ${checks} live integration groups (real local Auth/PostgREST; route handlers in process).`,
    );
  } finally {
    try {
      for (const id of created)
        checked(await admin.auth.admin.deleteUser(id), 'Delete synthetic Auth user');
    } finally {
      globalThis.fetch = nativeFetch;
    }
  }
}

run().catch((error) => {
  // Avoid dumping SDK responses, session objects or JWTs into test logs.
  console.error(
    `FAIL: ${error instanceof Error ? error.message : 'Supabase integration assertion'}`,
  );
  process.exitCode = 1;
});
