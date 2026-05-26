import { Router } from 'express'
import Stripe from 'stripe'
import { requireStringField } from '@soteria-forge/shared'
import { env } from '../config/env.js'
import { asyncHandler } from '../middleware/errors.js'
import { MarketplaceOrderModel, ProductPackageModel } from '../models/index.js'
import { createMarketplaceTenantAndBuyer, ensureMarketplaceCatalog } from '../utils/marketplace.js'
import { serializeMarketplaceOrder } from '../utils/serialize.js'

export const checkoutRouter = Router()

function stripeClient() {
  if (!env.stripeSecretKey) return null
  return new Stripe(env.stripeSecretKey, { apiVersion: '2026-02-25.clover' as any })
}

checkoutRouter.post(
  '/session',
  asyncHandler(async (req, res) => {
    await ensureMarketplaceCatalog()
    const packageSlug = requireStringField(req.body, 'packageSlug')
    const buyerName = requireStringField(req.body, 'buyerName')
    const buyerEmail = requireStringField(req.body, 'buyerEmail').toLowerCase()
    const buyerType = req.body.buyerType === 'company' ? 'company' : 'individual'
    const seatCount = Math.max(1, Number(req.body.seatCount ?? 1))
    const productPackage = await ProductPackageModel.findOne({ slug: packageSlug, status: 'active' })

    if (!productPackage) {
      res.status(404).json({ error: 'Package not found' })
      return
    }

    const { tenant, user } = await createMarketplaceTenantAndBuyer({
      packageSlug,
      packageId: productPackage._id,
      buyerType,
      buyerName,
      buyerEmail,
      companyName: req.body.companyName,
      seatCount,
      successUrl: req.body.successUrl,
      cancelUrl: req.body.cancelUrl,
    })

    const order = await MarketplaceOrderModel.create({
      tenantId: tenant._id,
      packageId: productPackage._id,
      buyerEmail,
      buyerName,
      buyerType,
      companyName: req.body.companyName,
      seatCount,
      status: 'pending',
    })

    const stripe = stripeClient()
    if (!stripe || !productPackage.stripePriceId) {
      res.status(201).json({
        checkoutUrl: `${req.body.successUrl ?? '/'}?checkout=configuration-required&order=${order.id}`,
        mode: 'configuration-required',
        order: serializeMarketplaceOrder(order),
      })
      return
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: buyerEmail,
      line_items: [{ price: productPackage.stripePriceId, quantity: 1 }],
      success_url: req.body.successUrl ?? env.billingSuccessUrl,
      cancel_url: req.body.cancelUrl ?? env.billingCancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          orderId: order.id,
          tenantId: tenant.id,
          buyerUserId: user.id,
          packageId: productPackage.id,
        },
      },
      metadata: {
        orderId: order.id,
        tenantId: tenant.id,
        buyerUserId: user.id,
        packageId: productPackage.id,
      },
    })

    order.status = 'checkout-created'
    order.stripeCheckoutSessionId = session.id
    await order.save()

    res.status(201).json({
      checkoutUrl: session.url,
      mode: 'stripe',
      order: serializeMarketplaceOrder(order),
    })
  }),
)
