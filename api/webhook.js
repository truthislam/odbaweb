// /api/webhook
// Stripe's signed event stream — the real source of truth for access state.
// The redirect can be faked; webhook events are signed by Stripe and cannot be.
// For a simple build this can just log; wire it to a store (KV / database) when
// you want cancellations to actually revoke access before the cookie expires.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Vercel needs the raw body to verify the Stripe signature.
export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(
      buf,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('webhook signature failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      // New paid customer. Persist event.data.object.customer as active.
      console.log('paid:', event.data.object.id);
      break;
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed':
      // Subscription ended / lapsed. Mark the customer inactive in your store.
      console.log('revoke:', event.data.object.customer);
      break;
    default:
      break;
  }

  res.json({ received: true });
}
