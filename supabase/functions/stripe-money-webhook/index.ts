import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_MONEY_WEBHOOK_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !webhookSecret) {
    return json({ error: 'Webhook non configurato' }, 503);
  }

  const signature = request.headers.get('Stripe-Signature');
  if (!signature) return json({ error: 'Firma Stripe mancante' }, 400);

  try {
    const stripe = new Stripe(stripeSecretKey);
    const rawBody = await request.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);

    if (event.livemode) return json({ error: 'Eventi live non accettati in beta' }, 409);
    if (event.type !== 'payment_intent.succeeded') return json({ received: true });

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const userId = paymentIntent.metadata?.motrice_user_id;
    if (!userId || paymentIntent.currency !== 'eur' || paymentIntent.amount_received !== 1000) {
      return json({ error: 'Pagamento non riconducibile a un deposito Motrice' }, 422);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await admin.rpc('apply_stripe_test_deposit', {
      target_user_id: userId,
      amount_cents: 1000,
      provider_event_id: event.id,
      provider_payment_intent: paymentIntent.id,
      provider_payload: {
        customer: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : null,
        payment_method: typeof paymentIntent.payment_method === 'string' ? paymentIntent.payment_method : null,
        created: event.created,
        livemode: event.livemode
      }
    });
    if (error) throw error;
    return json({ received: true });
  } catch (error) {
    console.error('stripe-money-webhook', error);
    return json({ error: 'Firma o accredito non validi' }, 400);
  }
});
