import { z } from 'zod';
import { actionSchema } from '@/lib/domain';
import { executeAction } from '@/lib/crm';
import { authenticatedClient, listLeads } from '@/lib/store';
import { readBody } from '@/lib/security';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { client, owner } = await authenticatedClient(request);
    return Response.json(
      { leads: await listLeads(client, owner) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'Authentication or CRM unavailable' }, { status: 401 });
  }
}
export async function POST(request: Request) {
  try {
    const { client, owner } = await authenticatedClient(request);
    const { id, revision, action } = z
      .object({ id: z.uuid(), revision: z.number().int().nonnegative(), action: actionSchema })
      .parse(JSON.parse(await readBody(request)));
    await executeAction(client, owner, id, revision, action);
    return Response.json({ leads: await listLeads(client, owner) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return Response.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 });
  }
}
