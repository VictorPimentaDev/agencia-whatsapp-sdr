import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { leadSchema, type Lead } from './domain';
import { required } from './security';
import type { Inbound } from './whatsapp';

export function adminClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {auth: {persistSession: false, autoRefreshToken: false}});
}
export async function authenticatedClient(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) throw new Error('Unauthorized');
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {global: {headers: {Authorization: `Bearer ${token}`}}, auth: {persistSession: false, autoRefreshToken: false}});
  const {data, error} = await client.auth.getUser(token);
  if (error || !data.user) throw new Error('Unauthorized');
  return {client, owner: data.user.id};
}
export async function listLeads(client: SupabaseClient, owner: string) {
  const {data, error} = await client.from('leads').select('*').eq('owner_id', owner).order('updated_at', {ascending: false});
  if (error) throw new Error('Could not load CRM');
  return (data ?? []).map(row => leadSchema.parse(row));
}
export async function getLead(client: SupabaseClient, owner: string, id: string) {
  const {data, error} = await client.from('leads').select('*').eq('owner_id', owner).eq('id', id).single();
  if (error) throw new Error('Lead not found');
  return leadSchema.parse(data);
}
export async function saveLead(client: SupabaseClient, owner: string, previous: Lead, next: Lead) {
  const {data, error} = await client.from('leads').update({...next, updated_at: new Date().toISOString()}).eq('owner_id', owner).eq('id', previous.id).eq('revision', previous.revision).select('id');
  if (error) throw new Error('Could not save CRM');
  if (data?.length !== 1) throw new Error('Conversation changed. Refresh before retrying.');
}
export async function ingest(client: SupabaseClient, owner: string, provider: string, message: Inbound) {
  const {error} = await client.rpc('ingest_message', {p_owner: owner, p_provider: provider, p_event: message.id, p_phone: message.phone, p_name: message.name, p_text: message.text, p_at: message.at});
  if (error) throw new Error('Could not persist webhook');
}
