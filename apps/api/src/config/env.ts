import 'dotenv/config'

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/soteria_forge_template',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-soteria-forge-secret-change-me',
  cookieName: process.env.SESSION_COOKIE_NAME ?? 'soteria_session',
  rootDomain: process.env.ROOT_DOMAIN,
  objectStorageBaseUrl: process.env.OBJECT_STORAGE_BASE_URL ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  stripePriceStarter: process.env.STRIPE_PRICE_STARTER ?? '',
  stripePriceFieldTeam: process.env.STRIPE_PRICE_FIELD_TEAM ?? '',
  stripePriceCompliance: process.env.STRIPE_PRICE_COMPLIANCE ?? '',
  stripePriceDedicated: process.env.STRIPE_PRICE_DEDICATED ?? '',
  billingSuccessUrl: process.env.BILLING_SUCCESS_URL ?? '',
  billingCancelUrl: process.env.BILLING_CANCEL_URL ?? '',
  vimeoAllowedDomains: (process.env.VIMEO_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5180,http://localhost:5181,http://localhost:5179')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}
