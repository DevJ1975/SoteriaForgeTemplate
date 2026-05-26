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
- Dedicated Implementation

Configure these environment variables on the API project:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_FIELD_TEAM=
STRIPE_PRICE_COMPLIANCE=
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

## Behavior

- Catalog APIs are public and do not require a tenant.
- Checkout creates a buyer workspace tenant and admin learner account, then waits for Stripe webhook confirmation before applying course entitlements.
- If Stripe keys or Price IDs are not configured, checkout returns `configuration-required` so the storefront can demo without taking payment.
- Marketplace tenants only see entitled courses.
- Dedicated tenants keep the existing tenant-scoped course behavior.
- Superadmin can convert a marketplace tenant to dedicated mode without duplicating data.
