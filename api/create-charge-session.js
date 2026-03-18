// api/create-charge-session.js
// フロントからPOSTされたチャージ額でStripe Checkoutセッションを作成する

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const VALID_AMOUNTS = [500, 1000, 3000];

const BONUS_MAP = {
  500:  0,
  1000: 50,
  3000: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount, userId } = req.body;

  if (!VALID_AMOUNTS.includes(amount)) {
    return res.status(400).json({ error: '無効なチャージ額です' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'ログインが必要です' });
  }

  const bonus = BONUS_MAP[amount];
  const total = amount + bonus;
  const bonusText = bonus > 0 ? `（+${bonus}円ボーナス付き / 合計${total}円分）` : '';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: `あいぽ残高チャージ ¥${amount.toLocaleString()}${bonusText}`,
              description: `票・上場枠の購入に使えます`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        mode: 'charge',
        user_id: userId,
        charge_amount: String(amount),
      },
      success_url: `${process.env.NEXT_PUBLIC_URL || 'https://aipo-tau.vercel.app'}/?charge=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL || 'https://aipo-tau.vercel.app'}/?charge=cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
