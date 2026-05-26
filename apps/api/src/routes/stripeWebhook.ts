import { Router } from 'express'
import Stripe from 'stripe'
import { env } from '../config/env.js'
import { asyncHandler } from '../middleware/errors.js'
import { MarketplaceOrderModel, SubscriptionModel, TenantModel } from '../models/index.js'
import { applyEntitlement } from '../utils/marketplace.js'

export const stripeWebhookRouter = Router()

function stripeClient() {
  if (!env.stripeSecretKey) return null
  return new Stripe(env.stripeSecretKey, { apiVersion: '2026-02-25.clover' as any })
}

function eventFromRequest(req: any) {
  const stripe = stripeClient()
  if (stripe && env.stripeWebhookSecret) {
    return stripe.webhooks.constructEvent(req.body, req.header('stripe-signature') ?? '', env.stripeWebhookSecret)
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body)
  return JSON.parse(raw)
}

stripeWebhookRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const event = eventFromRequest(req)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.orderId
      const tenantId = session.metadata?.tenantId
      const buyerUserId = session.metadata?.buyerUserId
      const packageId = session.metadata?.packageId

      if (orderId && tenantId && buyerUserId && packageId) {
        const order = await MarketplaceOrderModel.findById(orderId)
        if (order) {
          order.status = 'completed'
          order.stripeCheckoutSessionId = session.id
          await order.save()
        }

        await applyEntitlement({
          tenantId,
          buyerUserId,
          packageId,
          source: 'stripe',
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
          status: 'active',
        })
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription & { current_period_end?: number }
      const saved = await SubscriptionModel.findOneAndUpdate(
        { stripeSubscriptionId: subscription.id },
        {
          $set: {
            status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : undefined,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        },
        { returnDocument: 'after' },
      )

      if (saved) {
        await TenantModel.findByIdAndUpdate(saved.tenantId, {
          $set: {
            billingStatus: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
          },
        })
      }
    }

    res.json({ received: true })
  }),
)
