import { equalSecret, readBody, required, verifySignature } from '@/lib/security';
import { parseCloud } from '@/lib/whatsapp';
import { adminClient, ingest } from '@/lib/store';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (
    q.get('hub.mode') !== 'subscribe' ||
    !equalSecret(q.get('hub.verify_token'), process.env.META_VERIFY_TOKEN ?? '')
  )
    return new Response('Forbidden', { status: 403 });
  return new Response(q.get('hub.challenge'), { headers: { 'Content-Type': 'text/plain' } });
}
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (
      !verifySignature(
        body,
        request.headers.get('x-hub-signature-256'),
        required('META_APP_SECRET'),
      )
    )
      return new Response('Forbidden', { status: 403 });
    const messages = parseCloud(JSON.parse(body), required('META_PHONE_NUMBER_ID'));
    const client = adminClient();
    for (const message of messages)
      await ingest(client, required('WORKSPACE_OWNER_ID'), 'cloud', message);
    return Response.json({ received: messages.length });
  } catch {
    return Response.json(
      { error: 'Webhook not accepted; retry after checking configuration or payload.' },
      { status: 503 },
    );
  }
}
