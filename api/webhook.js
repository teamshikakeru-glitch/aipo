const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 創設メンバーの料金ID（Stripeで確認）
const FOUNDER_PRICE_ID = 'price_founder'; // ← 実際のPriceIDに変更が必要

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

    // userIdがない場合はemailからUUIDを取得
    let resolvedUserId = userId;
    if (!resolvedUserId && customerEmail) {
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email === customerEmail);
      resolvedUserId = user?.id;
      console.log('Resolved userId from email:', resolvedUserId);
    }

    if (!resolvedUserId) {
      console.error('Could not resolve userId');
      return res.status(200).json({ received: true });
    }

    // セッションの明細からどの商品か判定
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const priceId = lineItems.data[0]?.price?.id;
    const amount = session.amount_total; // 円単位

    console.log('priceId:', priceId, 'amount:', amount, 'mode:', session.mode);

    // 創設メンバー判定：一括払い(payment mode)かつ¥980
    const isFounderPurchase = session.mode === 'payment' && amount === 980;
    // Pro判定：サブスク
    const isProPurchase = session.mode === 'subscription';

    if (isFounderPurchase) {
      // 創設メンバー番号を採番
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_founder', true);
      const founderNumber = (count || 0) + 1;

      // profilesレコードがなければ作成、あれば更新
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
      // Proプラン
      const { error } = await supabase.from('profiles').upsert({
        id: resolvedUserId,
        is_pro: true,
      }, { onConflict: 'id' });

      if (error) {
        console.error('Pro upsert error:', error);
      } else {
        console.log(`✅ Pro set for userId: ${resolvedUserId}`);
      }

      // subscriptionsテーブルも更新
      await supabase.from('subscriptions').upsert({
        user_id: resolvedUserId,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        status: 'active',
        updated_at: new Date(),
      }, { onConflict: 'user_id' });
    }
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

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports.config = { api: { bodyParser: false } };
