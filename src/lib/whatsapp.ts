import { z } from 'zod';
import { required } from './security';

export interface Inbound {
  id: string;
  phone: string;
  name: string;
  text: string;
  at: string;
}
const textMessage = z.object({
  id: z.string().min(1).max(200),
  from: z.string().regex(/^\d{10,15}$/),
  timestamp: z.string().regex(/^\d+$/),
  type: z.literal('text'),
  text: z.object({ body: z.string().min(1).max(4000) }),
});
const cloudSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }),
            messages: z.array(z.unknown()).optional(),
            contacts: z
              .array(
                z.object({ wa_id: z.string(), profile: z.object({ name: z.string().max(100) }) }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});
export function parseCloud(input: unknown, phoneId: string): Inbound[] {
  const payload = cloudSchema.parse(input);
  return payload.entry.flatMap((entry) =>
    entry.changes.flatMap(({ value }) => {
      if (value.metadata.phone_number_id !== phoneId) throw new Error('Wrong WhatsApp number');
      return (value.messages ?? []).flatMap((raw) => {
        const parsed = textMessage.safeParse(raw);
        if (!parsed.success) return [];
        const m = parsed.data;
        const at = new Date(Number(m.timestamp) * 1000);
        if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60000)
          throw new Error('Invalid message timestamp');
        return [
          {
            id: m.id,
            phone: m.from,
            name: value.contacts?.find((c) => c.wa_id === m.from)?.profile.name ?? 'WhatsApp lead',
            text: m.text.body,
            at: at.toISOString(),
          },
        ];
      });
    }),
  );
}
const evolutionSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z
    .object({
      key: z.object({ id: z.string().min(1).max(200), remoteJid: z.string(), fromMe: z.boolean() }),
      pushName: z.string().max(100).optional(),
      messageTimestamp: z.number().int().positive(),
      message: z
        .object({
          conversation: z.string().max(4000).optional(),
          extendedTextMessage: z.object({ text: z.string().max(4000) }).optional(),
        })
        .optional(),
    })
    .optional(),
});
export function parseEvolution(input: unknown, instance: string): Inbound[] {
  const p = evolutionSchema.parse(input);
  if (p.instance !== instance) throw new Error('Wrong Evolution instance');
  if (!['messages.upsert', 'MESSAGES_UPSERT'].includes(p.event) || !p.data || p.data.key.fromMe)
    return [];
  const d = p.data;
  if (!/^\d{10,15}@s\.whatsapp\.net$/.test(d.key.remoteJid)) return [];
  const text = d.message?.conversation ?? d.message?.extendedTextMessage?.text;
  if (!text) return [];
  const at = new Date(d.messageTimestamp * 1000);
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60000)
    throw new Error('Invalid message timestamp');
  return [
    {
      id: d.key.id,
      phone: d.key.remoteJid.split('@')[0],
      name: d.pushName ?? 'WhatsApp lead',
      text,
      at: at.toISOString(),
    },
  ];
}
export async function sendWhatsApp(phone: string, text: string) {
  if (!/^\d{10,15}$/.test(phone) || phone.startsWith('550000'))
    throw new Error('Invalid or demo recipient');
  const provider = required('WHATSAPP_PROVIDER');
  let url: string;
  let headers: Record<string, string>;
  let body: object;
  if (provider === 'cloud') {
    const version = required('META_GRAPH_VERSION');
    if (!/^v\d+\.0$/.test(version)) throw new Error('Invalid Graph API version');
    url = `https://graph.facebook.com/${version}/${encodeURIComponent(required('META_PHONE_NUMBER_ID'))}/messages`;
    headers = { Authorization: `Bearer ${required('META_ACCESS_TOKEN')}` };
    body = { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } };
  } else if (provider === 'evolution') {
    const base = new URL(required('EVOLUTION_URL'));
    if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname))
      throw new Error('Evolution requires HTTPS outside localhost');
    url = `${base.href.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(required('EVOLUTION_INSTANCE'))}`;
    headers = { apikey: required('EVOLUTION_API_KEY') };
    body = { number: phone, text };
  } else throw new Error('Unknown WhatsApp provider');
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`WhatsApp rejected request (${response.status})`);
  const raw: unknown = await response.json();
  const result =
    provider === 'cloud'
      ? z.object({ messages: z.array(z.object({ id: z.string() })).min(1) }).parse(raw).messages[0]
          .id
      : z.object({ key: z.object({ id: z.string() }) }).parse(raw).key.id;
  return result;
}
