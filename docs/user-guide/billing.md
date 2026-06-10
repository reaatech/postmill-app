# Billing

The billing system at `/billing` manages subscription plans, payment methods, and invoicing when
Stripe is configured. Billing is entirely optional — Postmill works with all features available
without Stripe.

## When Stripe is not configured

If no Stripe integration is set up (no `STRIPE_SECRET_KEY` environment variable, or Stripe is
otherwise unreachable):

- All features are available to all users without restriction.
- The `/billing` page may redirect or show a "billing not configured" state.
- No subscription checks gate any functionality.

## When Stripe is configured

### Subscription plans

Subscription tiers define feature access, team member limits, and usage caps. Available plans and
their features are determined by your Postmill instance administrator. Common tier differentiators
include:

| Feature | Typical FREE tier | Typical paid tiers |
|---------|-------------------|---------------------|
| Posts per month | Limited | Higher or unlimited |
| Channels | 3–5 | All available |
| Team members | None | 3–10+ |
| Webhooks | No | Yes |
| Auto Post (RSS) | No | Yes |
| Sets & Signatures | No | Yes |
| Public API access | No | Yes |
| Analytics retention | 30 days | 18+ months |

### Managing your subscription

`GET /user/subscription` returns your current subscription status, including the active plan,
billing period, and next renewal date.

`GET /user/subscription/tiers` returns all available plans for your organisation.

The billing interface (`/billing`) lets you:

- View your current plan and its features.
- Upgrade or downgrade between available plans.
- Manage your payment method (add, update, or remove cards).
- View invoice history with download links.

### Payment methods

Add and manage credit/debit cards through Stripe's hosted payment form. Card details are
tokenised by Stripe and never touch Postmill's servers. You can:

- Add a new payment method.
- Set a default payment method for recurring charges.
- Remove saved payment methods.

### Invoice history

A list of past invoices with:

- Invoice date and number.
- Amount charged.
- Payment status (paid, pending, failed).
- Downloadable PDF receipt.

## Lifetime plan

`/billing/lifetime` offers a one-time payment option for lifetime access when configured by the
instance administrator:

- A single upfront payment grants permanent access at the lifetime tier.
- No recurring charges or subscription management is needed.
- Lifetime plans may have feature limits defined by the administrator.

If the lifetime deal is not available on your instance, this page may redirect or display an
"unavailable" message.

## Cancellation and plan changes

- **Upgrade** — takes effect immediately. You are charged the prorated difference for the
  remainder of the billing period.
- **Downgrade** — takes effect at the end of the current billing period. You retain current-tier
  features until then.
- **Cancel** — your subscription remains active until the end of the current billing period,
  then reverts to the FREE tier. No data is lost on cancellation — your posts, channels, and
  settings are preserved.

> Verified against v3.7.0
