// /api/success?session_id=cs_...
// Stripe redirects here after payment. We DO NOT trust the redirect alone —
// we re-fetch the session from Stripe's API and confirm it's actually paid,
// THEN mint a signed, httpOnly access cookie and send the buyer into Ghost.

import Stripe from 'stripe';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// HMAC-signed token: payload.signature. Tamper with the payload and the
// signature stops matching, so a user can't forge their own "paid" cookie.
function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export default async function handler(req, res) {
  try {
    const id = String(req.query.session_id || '');
    if (!id) return res.status(400).send('Missing session.');

    const session = await stripe.checkout.sessions.retrieve(id);

    // The actual proof of payment.
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    if (!paid) {
      res.writeHead(302, { Location: '/ghost-unlock.html' });
      return res.end();
    }

    const token = sign({
      plan: session.metadata?.plan || 'unknown',
      cust: session.customer || null,
      sub: session.subscription || null,
      iat: Date.now(),
      // 30-day access window; the webhook can revoke earlier on cancellation.
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    res.setHeader('Set-Cookie', [
      `ghost_access=${token}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      `Max-Age=${30 * 24 * 60 * 60}`,
    ].join('; '));

    res.writeHead(302, { Location: '/ghost-unlock.html?unlocked=1' });
    res.end();
  } catch (err) {
    console.error('success error', err);
    res.status(500).send('Could not verify payment.');
  }
}
