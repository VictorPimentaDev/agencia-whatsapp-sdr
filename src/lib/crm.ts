import type { SupabaseClient } from '@supabase/supabase-js';
import { canSend, transition, type Action } from './domain';
import { getLead, saveLead } from './store';
import { draftReply } from './draft';
import { sendWhatsApp } from './whatsapp';

export async function executeAction(
  client: SupabaseClient,
  owner: string,
  id: string,
  revision: number,
  action: Action,
) {
  const lead = await getLead(client, owner, id);
  if (lead.revision !== revision) throw new Error('Conversation changed. Refresh before retrying.');
  if (action.type === 'forget') {
    const { error } = await client.rpc('forget_lead', { p_id: id, p_revision: revision });
    if (error) throw new Error('Could not erase lead. Refresh and retry.');
    return;
  }
  const next = transition(lead, action);
  if (action.type === 'draft')
    next.messages[next.messages.length - 1].text = await draftReply(lead);
  await saveLead(client, owner, lead, next);
  if (action.type !== 'send') return;
  const message = next.messages[next.messages.length - 1];
  // Reserve before the external side effect; uncertain sends must never retry automatically.
  let status: 'sent' | 'uncertain' = 'uncertain';
  try {
    const current = await getLead(client, owner, id);
    if (!canSend(current)) throw new Error('Consent or service window changed');
    await sendWhatsApp(lead.phone, action.text);
    status = 'sent';
  } catch {
    /* The provider may have accepted the request before the timeout. */
  }
  const { error } = await client.rpc('finish_send', {
    p_id: id,
    p_message: message.id,
    p_status: status,
  });
  if (error || status === 'uncertain')
    throw new Error('Delivery is uncertain. Check the WhatsApp provider; do not resend.');
}
