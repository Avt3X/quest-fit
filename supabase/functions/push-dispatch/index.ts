// Delivers in-app notifications as push notifications through the Expo Push API.
//
// Wiring (see docs/SETUP.md): create a Database Webhook on INSERT into public.notifications that
// calls this function with header `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`. The function runs
// with the service role (provided by the Edge runtime) and is the only component that reads push
// tokens across users. In-app notifications work without it.
import { createClient } from 'npm:@supabase/supabase-js@2';

interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: NotificationRecord | null;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!webhookSecret || req.headers.get('x-webhook-secret') !== webhookSecret) return json(401, { error: 'unauthorized' });

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json(400, { error: 'invalid json' });
  }
  const record = payload.record;
  if (payload.type !== 'INSERT' || payload.table !== 'notifications' || !record) return json(200, { skipped: true });

  const { data: settings } = await admin.from('user_settings').select('notify_push').eq('user_id', record.user_id).maybeSingle();
  if (!settings?.notify_push) return json(200, { skipped: 'push disabled' });

  const { data: tokens, error } = await admin.from('push_tokens').select('token').eq('user_id', record.user_id);
  if (error) return json(500, { error: error.message });
  if (!tokens?.length) return json(200, { skipped: 'no tokens' });

  // Only identifiers needed for navigation are forwarded; never location data.
  const data: Record<string, unknown> = {};
  for (const key of ['activity_id', 'challenge_id', 'expedition_id', 'user_id', 'journey_slug']) {
    if (record.data && typeof record.data[key] === 'string') data[key] = record.data[key];
  }

  const messages = tokens.map((t) => ({ to: t.token, title: record.title, body: record.body, data, sound: 'default' }));
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(expoAccessToken ? { authorization: `Bearer ${expoAccessToken}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) return json(502, { error: `expo push failed with ${response.status}` });

  const result = (await response.json()) as { data?: ExpoTicket[] };
  const stale = (result.data ?? [])
    .map((ticket, i) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter((t): t is string => t !== null);
  if (stale.length) await admin.from('push_tokens').delete().in('token', stale);

  return json(200, { sent: messages.length, removed: stale.length });
});
