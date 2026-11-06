import { Bachs, webhooks } from '@bachs/sdk'

// Server-only boundary. Callers must load a saved quote from trusted storage;
// nothing in this module grants time or enables a public payment endpoint.
export function createBachsBoundary({apiKey, webhookSecret, client} = {}) {
  const provider = client ?? (apiKey ? new Bachs({apiKey}) : null)
  return {
    configured: Boolean(provider && webhookSecret),
    async createCheckout({quote, successUrl, cancelUrl}) {
      if (!provider || !webhookSecret) throw new Error('Bachs is not configured')
      if (!quote || !/^[0-9a-f-]{36}$/i.test(quote.id) || !/^[A-Z]{3}$/.test(quote.listed_currency) || !/^[A-Z]{3}$/.test(quote.currency)) throw new Error('Invalid saved quote')
      const amount = String(quote.listed_amount)
      const payable = String(quote.amount)
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || !/^\d+(\.\d{1,2})?$/.test(payable) || Number(amount)<=0 || Number(payable)<=0) throw new Error('Invalid saved amount')
      for (const value of [successUrl,cancelUrl]) {
        let url
        try { url = new URL(value) } catch { throw new Error('A public HTTPS return URL is required') }
        if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) throw new Error('A public HTTPS return URL is required')
      }
      const pricing = {currency:quote.listed_currency,amount}
      if (quote.currency !== quote.listed_currency) pricing.currency_options = {[quote.currency]:payable}
      const result = await provider.checkoutSessions.create({pricing, success_url:successUrl, cancel_url:cancelUrl, reference:`kinetelle-${quote.id}`, metadata:{quote_id:quote.id}}, {idempotencyKey:`checkout-${quote.id}`})
      const hosted = new URL(result.checkout_url)
      if(hosted.protocol !== 'https:' || hosted.hostname !== 'checkout.bachs.io' || hosted.username || hosted.password) throw new Error('Invalid hosted checkout URL')
      return {checkoutId:result.checkout_id,checkoutUrl:hosted.href}
    },
    verifyWebhook(rawBody, headers) {
      if (!webhookSecret) throw new Error('Bachs webhook secret is not configured')
      return webhooks.constructEvent(rawBody, headers, webhookSecret)
    },
  }
}
