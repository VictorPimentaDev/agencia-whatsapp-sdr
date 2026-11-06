import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { equalSecret, verifySignature, readBody } from '../src/lib/security';
import { parseCloud, parseEvolution, sendWhatsApp } from '../src/lib/whatsapp';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('WhatsApp ingress', () => {
  it('checks the raw body HMAC and fails closed for missing or malformed signatures', () => {
    const body = '{"hello":"world"}';
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifySignature(body, signature, 'secret')).toBe(true);
    expect(verifySignature(body + ' ', signature, 'secret')).toBe(false);
    expect(verifySignature(body, null, 'secret')).toBe(false);
    expect(equalSecret('', '')).toBe(false);
  });
  it('caps untrusted payload size', async () => {
    await expect(
      readBody(new Request('https://example.test', { method: 'POST', body: 'x'.repeat(262145) })),
    ).rejects.toThrow('large');
  });
  it('normalizes Cloud text and ignores status updates', () => {
    const value = {
      metadata: { phone_number_id: '123' },
      messages: [
        {
          id: 'm1',
          from: '5511999999999',
          timestamp: '1793988000',
          type: 'text',
          text: { body: 'Olá' },
        },
      ],
    };
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value }] }] };
    expect(parseCloud(payload, '123')[0]).toMatchObject({
      id: 'm1',
      text: 'Olá',
      phone: '5511999999999',
    });
    expect(() => parseCloud(payload, 'other')).toThrow('number');
    expect(
      parseCloud(
        {
          object: 'whatsapp_business_account',
          entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, statuses: [] } }] }],
        },
        '123',
      ),
    ).toEqual([]);
  });
  it('rejects Evolution group chats, echoes and wrong instances', () => {
    const data = {
      key: { id: 'a', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
      messageTimestamp: 1793988000,
      message: { conversation: 'Oi' },
    };
    expect(
      parseEvolution({ event: 'messages.upsert', instance: 'agency', data }, 'agency'),
    ).toHaveLength(1);
    for (const key of [
      { ...data.key, fromMe: true },
      { ...data.key, remoteJid: '123@g.us' },
      { ...data.key, remoteJid: '123@lid' },
    ])
      expect(
        parseEvolution(
          { event: 'messages.upsert', instance: 'agency', data: { ...data, key } },
          'agency',
        ),
      ).toEqual([]);
    expect(() =>
      parseEvolution({ event: 'messages.upsert', instance: 'other', data }, 'agency'),
    ).toThrow('instance');
  });
});
describe('outbound adapters', () => {
  it('sends Cloud text with timeout and authorization; never sends fixture numbers', async () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'cloud');
    vi.stubEnv('META_GRAPH_VERSION', 'v23.0');
    vi.stubEnv('META_PHONE_NUMBER_ID', '123');
    vi.stubEnv('META_ACCESS_TOKEN', 'test-only');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: 'provider-1' }] }));
    vi.stubGlobal('fetch', fetcher);
    expect(await sendWhatsApp('5511999999999', 'Olá')).toBe('provider-1');
    expect(fetcher.mock.calls[0][0]).toBe('https://graph.facebook.com/v23.0/123/messages');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      to: '5511999999999',
      type: 'text',
    });
    await expect(sendWhatsApp('550000000000', 'Olá')).rejects.toThrow('demo');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses the Evolution Baileys gateway payload', async () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'evolution');
    vi.stubEnv('EVOLUTION_URL', 'http://127.0.0.1:8080');
    vi.stubEnv('EVOLUTION_INSTANCE', 'agency');
    vi.stubEnv('EVOLUTION_API_KEY', 'test-only');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ key: { id: 'evo-1' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await sendWhatsApp('5511999999999', 'Oi')).toBe('evo-1');
    expect(fetcher.mock.calls[0][0]).toContain('/message/sendText/agency');
    expect(fetcher.mock.calls[0][1].headers.apikey).toBe('test-only');
  });
});
