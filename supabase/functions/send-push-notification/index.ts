import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type NotificationRecord = {
  id: number;
  user_id: string;
  event_id?: string | null;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
};

const encoder = new TextEncoder();

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToPkcs8(pem: string) {
  const clean = pem
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(clean);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function getGoogleAccessToken(clientEmail: string, privateKey: string) {
  // Google rejects assertions whose iat is even slightly ahead of its clock.
  // Prefer Google's own Date header so edge-runtime clock drift cannot break
  // notifications, then backdate by one minute for normal network latency.
  let trustedNow = Date.now();
  try {
    const clockResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'HEAD' });
    const googleDate = Date.parse(clockResponse.headers.get('date') || '');
    if (Number.isFinite(googleDate)) trustedNow = googleDate;
  } catch {
    // Date.now() remains a safe fallback on correctly synchronized runtimes.
  }
  const issuedAt = Math.floor(trustedNow / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Autenticazione Firebase non riuscita');
  return String(payload.access_token);
}

function categoryFor(type: string) {
  const value = String(type || '').toLowerCase();
  if (value.includes('chat') || value.includes('message') || value === 'friend_request' || value === 'event_invite') return 'chat_social';
  if (value.startsWith('wallet_') || value.startsWith('profile_') || value.startsWith('xp_')) return 'wallet_account';
  if (
    value.startsWith('event_') ||
    value.startsWith('rsvp_') ||
    value.startsWith('participant_') ||
    value.startsWith('attendance_') ||
    value === 'cancel_late'
  ) return 'event_security';
  return 'promotions';
}

function channelFor(category: string) {
  if (category === 'chat_social') return 'motrice_chat';
  if (category === 'wallet_account') return 'motrice_wallet';
  if (category === 'promotions') return 'motrice_promotions';
  return 'motrice_events';
}

function actionPath(record: NotificationRecord) {
  const explicit = record.payload?.action_path;
  if (typeof explicit === 'string' && explicit.startsWith('/')) return explicit;
  if (record.event_id && categoryFor(record.type) === 'chat_social') return `/chat/event_${record.event_id}`;
  if (record.event_id) return `/events/${record.event_id}`;
  if (record.type.startsWith('wallet_')) return '/wallet/credit';
  if (record.type.startsWith('profile_')) return '/verify-profile';
  return '/notifications';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
  const suppliedSecret = request.headers.get('x-motrice-push-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!webhookSecret || suppliedSecret !== webhookSecret) return new Response('Unauthorized', { status: 401 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') || '';
  const firebaseClientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL') || '';
  const firebasePrivateKey = Deno.env.get('FIREBASE_PRIVATE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey || !firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
    return Response.json({ error: 'Configurazione push incompleta' }, { status: 503 });
  }

  const webhook = await request.json().catch(() => null);
  const record = (webhook?.record || webhook) as NotificationRecord | null;
  if (!record?.id || !record?.user_id || !record?.type) return Response.json({ error: 'Notifica non valida' }, { status: 400 });

  const category = categoryFor(record.type);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const [{ data: preferences }, { data: devices, error: deviceError }] = await Promise.all([
    supabase.from('notification_preferences').select('*').eq('user_id', record.user_id).maybeSingle(),
    supabase.from('push_devices').select('id,token,platform').eq('user_id', record.user_id).eq('active', true)
  ]);
  if (deviceError) return Response.json({ error: deviceError.message }, { status: 500 });
  if (category !== 'event_security' && preferences?.[category] === false) {
    return Response.json({ skipped: 'preference_disabled' });
  }
  if (!devices?.length) return Response.json({ delivered: 0 });

  const accessToken = await getGoogleAccessToken(firebaseClientEmail, firebasePrivateKey);
  const path = actionPath(record);
  let delivered = 0;
  let failed = 0;

  await Promise.all(devices.filter((device) => device.platform === 'android').map(async (device) => {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title: record.title, body: record.body || 'Apri Motrice per i dettagli.' },
          data: {
            notificationId: String(record.id),
            type: record.type,
            eventId: String(record.event_id || ''),
            actionPath: path
          },
          android: {
            priority: category === 'event_security' || category === 'wallet_account' ? 'HIGH' : 'NORMAL',
            notification: {
              channel_id: channelFor(category),
              color: '#CCFF00',
              tag: `motrice-${record.id}`
            }
          }
        }
      })
    });
    if (response.ok) {
      delivered += 1;
      await supabase.from('push_devices').update({ last_error: '', last_seen_at: new Date().toISOString() }).eq('id', device.id);
      return;
    }
    failed += 1;
    const errorBody = await response.text();
    const invalid = response.status === 404 || errorBody.includes('UNREGISTERED') || errorBody.includes('INVALID_ARGUMENT');
    await supabase.from('push_devices').update({
      last_error: errorBody.slice(0, 500),
      active: !invalid,
      disabled_at: invalid ? new Date().toISOString() : null
    }).eq('id', device.id);
  }));

  return Response.json({ delivered, failed, category });
});
