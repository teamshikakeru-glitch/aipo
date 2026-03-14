import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    if (userId) {
      await supabase.from('profiles').update({ is_pro: true }).eq('id', userId);
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        status: 'active',
        updated_at: new Date(),
      }, { onConflict: 'user_id' });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', sub.id)
      .single();
    if (data?.user_id) {
      await supabase.from('profiles').update({ is_pro: false }).eq('id', data.user_id);
      await supabase.from('subscriptions').update({ status: 'canceled', updated_at: new Date() }).eq('stripe_subscription_id', sub.id);
    }
  }

  res.status(200).json({ received: true });
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const config = { api: { bodyParser: false } };
