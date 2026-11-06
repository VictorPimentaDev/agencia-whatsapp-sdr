import { equalSecret, readBody, required } from '@/lib/security';
import { parseEvolution } from '@/lib/whatsapp';
import { adminClient, ingest } from '@/lib/store';
export async function POST(request: Request) {
  try {
    if (!equalSecret(request.headers.get('x-webhook-secret'), required('EVOLUTION_WEBHOOK_SECRET')))
      return new Response('Forbidden', { status: 403 });
    const messages = parseEvolution(
      JSON.parse(await readBody(request)),
      required('EVOLUTION_INSTANCE'),
    );
    const client = adminClient();
    for (const message of messages)
      await ingest(client, required('WORKSPACE_OWNER_ID'), 'evolution', message);
    return Response.json({ received: messages.length });
  } catch {
    return Response.json(
      { error: 'Webhook not accepted; retry after checking configuration or payload.' },
      { status: 503 },
    );
  }
}
