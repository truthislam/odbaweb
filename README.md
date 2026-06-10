# Ghost paywall — Stripe + Vercel, real auth

The app (`ghost-v5.html`) is never a public file. It lives in `/private` and is
served ONLY by `/api/ghost`, which checks a signed cookie that can only be minted
after Stripe confirms a real payment. Typing `?unlocked=1` no longer grants access —
that flag is now cosmetic. The lock is the cookie + HMAC verification.

## Flow
1. `ghost-unlock.html` → Unlock button → `/api/checkout?plan=…`
2. `/api/checkout` creates a Stripe Checkout Session, redirects to Stripe.
3. Buyer pays on Stripe's hosted page.
4. Stripe redirects to `/api/success?session_id=…`.
5. `/api/success` re-verifies the session with Stripe, sets a signed httpOnly cookie,
   redirects to `/ghost-unlock.html?unlocked=1` (shows "You're in").
6. "Open Ghost" → `/ghost` → `/api/ghost` verifies the cookie and serves the app.
7. `/api/webhook` receives Stripe's signed events (cancellations, failures).

## One-time setup

### 1. Stripe dashboard
- Create 3 products with prices:
  - Basic — recurring monthly, $49 → copy the **Price ID** (`price_...`)
  - Pro — recurring monthly, $99 → Price ID
  - Lifetime — one-time, $499 → Price ID
- Developers → API keys → copy your **Secret key** (`sk_live_...` or `sk_test_...`).
- Developers → Webhooks → Add endpoint → URL `https://YOURDOMAIN/api/webhook`,
  events: `checkout.session.completed`, `customer.subscription.deleted`,
  `invoice.payment_failed` → copy the **Signing secret** (`whsec_...`).

### 2. Vercel env vars (Project → Settings → Environment Variables)
```
STRIPE_SECRET_KEY      = sk_live_...        (or sk_test_... while testing)
STRIPE_WEBHOOK_SECRET  = whsec_...
SESSION_SECRET         = (run: openssl rand -base64 32)
PRICE_BASIC            = price_...
PRICE_PRO              = price_...
PRICE_LIFETIME         = price_...
```

### 3. Deploy
```
npm install
vercel --prod
```

## Test before going live
- Use Stripe **test mode** keys + test prices.
- Card `4242 4242 4242 4242`, any future expiry, any CVC.
- Confirm: paying lands you on "You're in" → `/ghost` loads the app.
- Confirm the lock: open an incognito window, go straight to `/ghost` →
  you must be bounced to `/ghost-unlock.html`. If the app loads, the gate is broken.

## Notes / where to harden later
- **Revocation:** right now access lasts 30 days from purchase regardless of
  cancellation. To revoke immediately, have the webhook write active/inactive
  status to Vercel KV (or any DB) keyed by `customer`, and have `/api/ghost`
  check it in addition to the cookie.
- **Per-plan limits** (20 drafts, voice profiles, etc.) are enforced inside the
  app, not here. The cookie carries `plan` so you can read it client-side or in
  a future API.
- Keep `SESSION_SECRET` private and stable — rotating it invalidates every cookie.
