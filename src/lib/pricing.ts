import { supabase } from './supabase'
export type Pricing = {
  id: number
  currency: string
  price_per_minute: number
  enabled: boolean
  default_validity_days: number
  updated_at: string
}
export type CostEstimate = {
  id: number
  provider_usd_per_second: number
  currency_units_per_usd: number
  payment_fee_percent: number
  other_cost_per_minute: number
}
export type TimePack = {
  id: string
  name: string
  currency: string
  amount: number
  credit_seconds: number
  enabled: boolean
  sort_order: number
  validity_days: number
  use_standard_rate: boolean
  updated_at?: string
}
export type PriceQuote = {
  id: string
  currency: string
  amount: number
  credit_seconds: number
  price_per_minute: number
  pack_name: string | null
  validity_days: number
  expires_at: string
  listed_currency?: string
  listed_amount?: number
  payment_exchange_rate?: number
  payment_details?: {
    bank_name?: string
    account_name?: string
    account_number?: string
    payment_instructions?: string
    reference_instructions?: string
    review_notice?: string
  }
}
const client = () => {
  if (!supabase) throw new Error('Pricing services are unavailable.')
  return supabase
}
export async function loadPricing() {
  const { data, error } = await client()
    .from('billing_pricing')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data as Pricing | null
}
export async function loadCostEstimate() {
  const { data, error } = await client()
    .from('billing_cost_estimates')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data as CostEstimate
}
export async function loadTimePacks() {
  const { data, error } = await client()
    .from('pricing_time_packs')
    .select('*')
    .order('sort_order')
    .order('credit_seconds')
  if (error) throw error
  return (data ?? []) as TimePack[]
}
export async function savePricing(p: Pricing, c: CostEstimate) {
  const { error } = await client().rpc('admin_save_pricing', {
    p_currency: p.currency.trim().toUpperCase(),
    p_price_per_minute: Number(p.price_per_minute),
    p_enabled: p.enabled,
    p_provider_cost: Number(c.provider_usd_per_second),
    p_fx: Number(c.currency_units_per_usd),
    p_fee: Number(c.payment_fee_percent),
    p_other_cost: Number(c.other_cost_per_minute),
    p_validity_days: p.default_validity_days,
  })
  if (error) throw error
}
export async function saveTimePack(pack: TimePack) {
  const { error } = await client()
    .from('pricing_time_packs')
    .upsert({ ...pack, updated_at: new Date().toISOString() })
  if (error) throw error
}
export async function createPriceQuote(amount: number, packId: string | null) {
  const { data, error } = await client().rpc('create_funding_price_quote', {
    p_amount: amount,
    p_pack_id: packId,
  })
  if (error) throw error
  return data as PriceQuote
}
export function estimatedSeconds(amount: string, rate: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || !/^\d+(\.\d{1,4})?$/.test(rate))
    return 0
  const units = (s: string, places: number) => {
    const [whole, decimal = ''] = s.split('.')
    return (
      BigInt(whole) * 10n ** BigInt(places) +
      BigInt(decimal.padEnd(places, '0'))
    )
  }
  const price = units(rate, 4)
  if (price <= 0n) return 0
  const result = (units(amount, 2) * 6000n) / price
  return result <= 31536000n ? Number(result) : 0
}
export function costPreview(p: Pricing, c: CostEstimate) {
  const revenue = Number(p.price_per_minute),
    provider =
      Number(c.provider_usd_per_second) *
      60 *
      (p.currency === 'USD' ? 1 : Number(c.currency_units_per_usd)),
    fees = (revenue * Number(c.payment_fee_percent)) / 100,
    other = Number(c.other_cost_per_minute)
  return {
    revenue,
    provider,
    fees,
    other,
    difference: revenue - provider - fees - other,
  }
}

export async function loadOpenPriceQuote() {
  const { data, error } = await client().rpc('get_open_funding_quote')
  if (error) throw error
  return data as PriceQuote | null
}
