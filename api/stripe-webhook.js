const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FOUNDER_PRICE_ID = 'price_1TAnVaRzgQ2yKTeQdRvZ4ll8';
const ADMIN_UUID = '7f3162ec-c281-435f-8e8e-3b6d65b8b1c9';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const customerEmail = session.customer_details?.email;

    console.log('checkout.session.completed', { userId, customerEmail, mode: session.mode });

    if (!userId && !customerEmail) {
      console.error('No userId or email in session');
      return res.status(200).json({ received: true });
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const priceId = lineItems.data[0]?.price?.id;
    const amount = session.amount_total;

    const isFounderPurchase = priceId === FOUNDER_PRICE_ID || (session.mode === 'payment' && amount === 980);
    const isProPurchase = session.mode === 'subscription';

    // userIdがない場合はemailからUUIDを取得
    let resolvedUserId = userId;
    if (!resolvedUserId && customerEmail) {
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email === customerEmail);
      resolvedUserId = user?.id;
      console.log('Resolved userId from email:', resolvedUserId);
    }

    // ── ユーザーが見つからない場合はpending_foundersに保存 ──
    if (!resolvedUserId && customerEmail) {
      const plan = isFounderPurchase ? 'founder' : isProPurchase ? 'pro' : null;
      if (plan) {
        const { error } = await supabase.from('pending_founders').upsert({
          email: customerEmail,
          plan,
          stripe_session_id: session.id,
        }, { onConflict: 'email' });
        if (error) {
          console.error('pending_founders upsert error:', error);
        } else {
          console.log(`⏳ Saved to pending_founders: ${customerEmail} (${plan})`);
        }
      }
      return res.status(200).json({ received: true });
    }

    if (!resolvedUserId) {
      console.error('Could not resolve userId');
      return res.status(200).json({ received: true });
    }

    await applyPlan(resolvedUserId, isFounderPurchase, isProPurchase, session);
  }

  // Proキャンセル
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', sub.id)
      .single();

    if (data?.user_id) {
      await supabase.from('profiles')
        .update({ is_pro: false })
        .eq('id', data.user_id);

      await supabase.from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date() })
        .eq('stripe_subscription_id', sub.id);

      console.log(`✅ Pro canceled for userId: ${data.user_id}`);
    }
  }

  res.status(200).json({ received: true });
};

async function applyPlan(resolvedUserId, isFounderPurchase, isProPurchase, session) {
  if (isFounderPurchase) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_founder', true)
      .neq('id', ADMIN_UUID);
    const founderNumber = (count || 0) + 1;

    const { error } = await supabase.from('profiles').upsert({
      id: resolvedUserId,
      is_founder: true,
      is_pro: true,
      founder_number: founderNumber,
    }, { onConflict: 'id' });

    if (error) {
      console.error('Founder upsert error:', error);
    } else {
      console.log(`✅ Founder #${founderNumber} set for userId: ${resolvedUserId}`);
    }

  } else if (isProPurchase) {
    const { error } = await supabase.from('profiles').upsert({
      id: resolvedUserId,
      is_pro: true,
    }, { onConflict: 'id' });

    if (error) {
      console.error('Pro upsert error:', error);
    } else {
      console.log(`✅ Pro set for userId: ${resolvedUserId}`);
    }

    await supabase.from('subscriptions').upsert({
      user_id: resolvedUserId,
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription,
      status: 'active',
      updated_at: new Date(),
    }, { onConflict: 'user_id' });
  }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports.config = { api: { bodyParser: false } };
