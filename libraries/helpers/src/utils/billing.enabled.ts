// Billing is on when any web payment provider is configured: Stripe, or
// YooKassa for Russian deployments where Stripe is unavailable.
export const isYooKassaEnabled = () =>
  !!process.env.YOOKASSA_SHOP_ID && !!process.env.YOOKASSA_SECRET_KEY;

export const isBillingEnabled = () =>
  !!process.env.STRIPE_PUBLISHABLE_KEY || isYooKassaEnabled();

// Web provider new subscriptions go through: PAYMENT_PROVIDER wins, then YooKassa when configured
export const webPaymentProvider = () =>
  process.env.PAYMENT_PROVIDER || (isYooKassaEnabled() ? 'yookassa' : 'stripe');
