const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHARGE_BONUS_MAP = { 500: 0, 1000: 50, 3000: 300 };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const mode = session.metadata?.mode;

    if (mode === 'charge' && userId) {
      const chargeAmount = parseInt(session.metadata?.charge_amount || '0');
      const bonus = CHARGE_BONUS_MAP[chargeAmount] ?? 0;
      const total = chargeAmount + bonus;
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', userId).single();
      const newBalance = (profile?.balance ?? 0) + total;
      await supabase.from('profiles').update({ balance: newBalance }).eq('id', userId);
      await supabase.from('charge_history').insert({ user_id: userId, amount: chargeAmount, bonus, total, stripe_session_id: session.id });
      return res.json({ received: true, mode: 'charge', total });
    }

    const priceId = session.metadata?.price_id;
    if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
      await supabase.from('profiles').update({ is_pro: true }).eq('id', userId);
    }
    if (priceId === process.env.STRIPE_FOUNDER_PRICE_ID) {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_founder', true);
      await supabase.from('profiles').update({ is_founder: true, is_pro: true, founder_number: String(count).padStart(2, '0') }).eq('id', userId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const customerId = event.data.object.customer;
    const { data: profiles } = await supabase.from('profiles').select('id').eq('stripe_customer_id', customerId);
    if (profiles?.length) {
      await supabase.from('profiles').update({ is_pro: false }).eq('id', profiles[0].id);
    }
  }

  res.json({ received: true });
};
