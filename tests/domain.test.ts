import { describe, expect, it } from 'vitest';
import { demoLeads } from '../src/lib/demo';
import {
  actionSchema,
  canSend,
  leadSchema,
  qualification,
  retainMessages,
  transition,
} from '../src/lib/domain';
const now = new Date('2026-11-06T18:00:00Z');
const lead = demoLeads(now)[0];
describe('qualification and human control', () => {
  it('requires all three fields before qualification and calls', () => {
    expect(qualification(lead)).toBe(2);
    expect(() => transition(lead, { type: 'move', stage: 'qualified' }, now)).toThrow('Preencha');
    expect(() => transition(lead, { type: 'schedule', at: '2026-11-07T18:00:00Z' }, now)).toThrow(
      'Complete',
    );
    const qualified = transition(
      lead,
      { type: 'qualify', service: 'Vídeos', budget: 0, timeline: 'Em 30 dias' },
      now,
    );
    const booked = transition(qualified, { type: 'schedule', at: '2026-11-07T18:00:00Z' }, now);
    expect(booked.stage).toBe('booked');
    expect(booked.revision).toBe(2);
    expect(lead.revision).toBe(0);
  });
  it('blocks draft on handoff or missing consent', () => {
    for (const changed of [{ human: true }, { consent: false }, { opted_out: true }])
      expect(() => transition({ ...lead, ...changed }, { type: 'draft' }, now)).toThrow('pausada');
    expect(transition(lead, { type: 'draft' }, now).messages.at(-1)?.status).toBe('draft');
  });
  it('revokes consent, freezes AI, records evidence', () => {
    const revoked = transition(
      lead,
      { type: 'consent', consent: false, evidence: 'Lead pediu para parar.' },
      now,
    );
    expect(revoked).toMatchObject({ human: true, consent: false, opted_out: true });
    expect(() => transition(revoked, { type: 'handoff', human: false }, now)).toThrow('opt-out');
    expect(canSend(revoked, now)).toBe(false);
  });
  it('enforces the 24-hour window including exact boundary and future timestamps', () => {
    expect(canSend(lead, now)).toBe(true);
    for (const hours of [-1, 24, 25])
      expect(canSend(lead, new Date(now.getTime() + hours * 3600000))).toBe(false);
    expect(canSend({ ...lead, last_inbound_at: null }, now)).toBe(false);
  });
  it('reserves a send and rejects retries while delivery is uncertain', () => {
    const pending = transition(lead, { type: 'send', text: 'Vamos conversar?' }, now);
    expect(pending.messages.at(-1)?.status).toBe('sending');
    expect(() => transition(pending, { type: 'send', text: 'De novo' }, now)).toThrow('pendente');
    const last = pending.messages.at(-1);
    if (last) last.status = 'uncertain';
    expect(() => transition(pending, { type: 'send', text: 'De novo' }, now)).toThrow('pendente');
  });
  it('requires provider evidence and a cooling-off minute before reconciliation', () => {
    const pending = transition(lead, { type: 'send', text: 'Oi' }, now);
    const messageId = pending.messages.at(-1)?.id ?? '';
    const action = {
      type: 'reconcile' as const,
      messageId,
      delivered: false,
      evidence: 'Provedor confirma que não enviou.',
    };
    expect(() => transition(pending, action, now)).toThrow('minuto');
    const reconciled = transition(pending, action, new Date(now.getTime() + 61000));
    expect(reconciled.messages.find((m) => m.id === messageId)?.status).toBe('note');
    expect(
      transition(
        reconciled,
        { type: 'send', text: 'Nova tentativa' },
        new Date(now.getTime() + 62000),
      ).messages.at(-1)?.status,
    ).toBe('sending');
  });
  it('rejects malformed trust-boundary inputs', () => {
    expect(
      leadSchema.parse({ ...lead, last_inbound_at: '2026-11-06T18:00:00+00:00' }).last_inbound_at,
    ).toContain('+00:00');
    expect(actionSchema.safeParse({ type: 'send', text: '  ' }).success).toBe(false);
    expect(
      actionSchema.safeParse({ type: 'qualify', service: 'x', budget: -1, timeline: 'x' }).success,
    ).toBe(false);
    expect(leadSchema.safeParse({ ...lead, phone: 'not a phone' }).success).toBe(false);
  });
});

it('retains an unresolved send when the conversation exceeds 200 messages', () => {
  const pending = transition(lead, { type: 'send', text: 'Pending' }, now).messages.at(-1);
  if (!pending) throw new Error('Missing pending message');
  const incoming = Array.from({ length: 205 }, (_, i) => ({ ...lead.messages[0], id: `in-${i}` }));
  const kept = retainMessages([pending, ...incoming]);
  expect(kept).toHaveLength(200);
  expect(kept[0].id).toBe(pending.id);
});
