# Soteria Forge Marketplace Billing

Soteria Forge now supports a self-service course marketplace alongside dedicated tenant implementations.

## Modes

- `marketplace`: self-service monthly buyer workspace. Courses are unlocked through package entitlements and seat limits are enforced.
- `dedicated`: implementation/customer tenant with subdomain, branding, manual billing override support, and broader admin controls.

## Stripe Setup

Create monthly Stripe Products/Prices for:

- Starter
- Field Team
- Compliance
- Safety FORGE 10 Hour
- Dedicated Implementation

Configure these environment variables on the API project:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_FIELD_TEAM=
STRIPE_PRICE_COMPLIANCE=
STRIPE_PRICE_SAFETY_FORGE_10_HOUR=
STRIPE_PRICE_DEDICATED=
BILLING_SUCCESS_URL=https://soteria-forge-lms.vercel.app/?checkout=success
BILLING_CANCEL_URL=https://soteria-forge-lms.vercel.app/catalog?checkout=cancelled
```

The webhook endpoint is:

```text
POST https://soteria-forge-api.vercel.app/api/stripe/webhook
```

Subscribe the webhook to:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Apple Pay Readiness

Soteria FORGE uses Stripe-hosted Checkout for v1 marketplace payments. Apple Pay is not rendered by the app directly; Stripe shows it when all wallet requirements are met.

Before launch:

- Enable Apple Pay and dynamic payment methods in the Stripe Dashboard.
- Register the production LMS domain as a Stripe payment method domain.
- Keep checkout on HTTPS.
- Use live-mode Stripe keys and live-mode Price IDs for production purchases.
- Test Apple Pay on Safari with an Apple device, Wallet card, and matching Stripe live/test mode.
- Keep coupon/promo support enabled through Checkout Sessions.

If Apple Pay does not appear, verify the Stripe payment method domain, Safari/device eligibility, Wallet setup, and payment method settings before changing app code.

## Behavior

- Catalog APIs are public and do not require a tenant.
- Checkout creates a buyer workspace tenant and admin learner account, then waits for Stripe webhook confirmation before applying course entitlements.
- If Stripe keys or Price IDs are not configured, checkout returns `configuration-required` so the storefront can demo without taking payment.
- Marketplace tenants only see entitled courses.
- Dedicated tenants keep the existing tenant-scoped course behavior.
- Superadmin can convert a marketplace tenant to dedicated mode without duplicating data.
