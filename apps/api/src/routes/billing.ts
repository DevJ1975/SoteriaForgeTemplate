import { Router } from 'express'
import Stripe from 'stripe'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errors.js'
import { EntitlementModel, ProductPackageModel, SubscriptionModel, UserModel } from '../models/index.js'
import { serializeEntitlement, serializeProductPackage, serializeSubscription } from '../utils/serialize.js'
import { tenantQuery } from '../utils/tenantScope.js'

export const billingRouter = Router()

function stripeClient() {
  if (!env.stripeSecretKey) return null
  return new Stripe(env.stripeSecretKey, { apiVersion: '2026-02-25.clover' as any })
}

billingRouter.get(
  '/subscription',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [subscription, entitlement, learnerSeats] = await Promise.all([
      SubscriptionModel.findOne(tenantQuery(req)).sort({ updatedAt: -1 }),
      EntitlementModel.findOne(tenantQuery(req)).sort({ updatedAt: -1 }),
      UserModel.countDocuments(tenantQuery(req, { roles: 'learner' })),
    ])
    const productPackage = subscription ? await ProductPackageModel.findById(subscription.packageId) : null

    res.json({
      subscription: subscription ? serializeSubscription(subscription) : null,
      entitlement: entitlement ? serializeEntitlement(entitlement) : null,
      package: productPackage ? serializeProductPackage(productPackage) : null,
      seatUsage: {
        used: learnerSeats,
        limit: entitlement?.seatLimit ?? req.tenant?.seatLimit ?? 1,
      },
    })
  }),
)

billingRouter.post(
  '/portal-session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const subscription = await SubscriptionModel.findOne(tenantQuery(req)).sort({ updatedAt: -1 })
    const stripe = stripeClient()

    if (!stripe || !subscription?.stripeCustomerId) {
      res.json({
        mode: 'configuration-required',
        portalUrl: null,
      })
      return
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: req.body.returnUrl ?? env.billingSuccessUrl,
    })

    res.json({
      mode: 'stripe',
      portalUrl: session.url,
    })
  }),
)
