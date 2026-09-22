import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const authorization = request.headers.get('Authorization') || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
      return json({ error: 'Servizio pagamenti non configurato' }, 503);
    }
    if (!accessToken) return json({ error: 'Autenticazione richiesta' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ error: 'Sessione non valida' }, 401);

    const { data: settings, error: settingsError } = await admin
      .from('money_system_settings')
      .select('provider_mode,deposits_enabled,deposit_cents')
      .eq('singleton', true)
      .single();
    if (settingsError) throw settingsError;
    if (settings.provider_mode !== 'stripe_test' || !settings.deposits_enabled) {
      return json({ error: 'Depositi non ancora abilitati' }, 409);
    }
    if (Number(settings.deposit_cents) !== 1000) {
      return json({ error: 'Configurazione deposito non valida' }, 500);
    }

    const payload = await request.json().catch(() => ({}));
    const clientRequestId = String(payload?.client_request_id || crypto.randomUUID())
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80);
    const returnBase = Deno.env.get('MOTRICE_WALLET_RETURN_URL') || 'https://motrice.app/wallet/credit';
    const separator = returnBase.includes('?') ? '&' : '?';
    const stripe = new Stripe(stripeSecretKey);
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: authData.user.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: 1000,
          product_data: { name: 'Riserva partecipazione Motrice' }
        }
      }],
      payment_intent_data: {
        description: 'Riserva partecipazione Motrice',
        metadata: {
          motrice_user_id: authData.user.id,
          flow: 'motrice_reserve_deposit_v1'
        }
      },
      metadata: {
        motrice_user_id: authData.user.id,
        flow: 'motrice_reserve_deposit_v1'
      },
      success_url: `${returnBase}${separator}deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}${separator}deposit=cancelled`
    }, {
      idempotencyKey: `motrice-deposit-${authData.user.id}-${clientRequestId}`
    });

    return json({
      checkout_url: checkout.url,
      checkout_session_id: checkout.id,
      amount_cents: 1000,
      currency: 'eur',
      provider_mode: 'stripe_test'
    });
  } catch (error) {
    console.error('create-wallet-deposit', error);
    return json({ error: 'Impossibile inizializzare il deposito' }, 500);
  }
});
