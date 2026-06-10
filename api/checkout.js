// /api/checkout?plan=basic|pro|lifetime
// Creates a Stripe Checkout Session on the server and 302-redirects the buyer
// to Stripe's hosted payment page. The browser never sees a secret.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map your plan slugs to Stripe Price IDs (create these in the Stripe dashboard:
// Products > add product > pricing. Recurring for basic/pro, one-time for lifetime).
const PRICES = {
  basic:    { price: process.env.PRICE_BASIC,    mode: 'subscription' },
  pro:      { price: process.env.PRICE_PRO,      mode: 'subscription' },
  lifetime: { price: process.env.PRICE_LIFETIME, mode: 'payment' },
};

export default async function handler(req, res) {
  try {
    const plan = String(req.query.plan || '').toLowerCase();
    const cfg = PRICES[plan];
    if (!cfg || !cfg.price) {
      res.status(400).send('Unknown plan');
      return;
    }

    const origin = `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: cfg.mode,
      line_items: [{ price: cfg.price, quantity: 1 }],
      // session_id is swapped in by Stripe so /api/success can verify it.
      success_url: `${origin}/api/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/ghost-unlock.html`,
      allow_promotion_codes: true,
      // Store the plan so the webhook/success handler knows what was bought.
      metadata: { plan },
    });

    res.writeHead(302, { Location: session.url });
    res.end();
  } catch (err) {
    console.error('checkout error', err);
    res.status(500).send('Could not start checkout.');
  }
}
