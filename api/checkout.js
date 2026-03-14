const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: 'price_1TAkcgRzgQ2yKTeQP3xbpPhn', quantity: 1 }],
      client_reference_id: userId,
      success_url: 'https://aipo-tau.vercel.app/?upgraded=true',
      cancel_url: 'https://aipo-tau.vercel.app/',
      locale: 'ja',
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
