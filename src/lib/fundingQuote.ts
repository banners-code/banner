import type { FundingSettings } from './manualFunding'
import type { TimePack } from './pricing'

// Match PostgreSQL round(numeric, 2) for positive two-decimal prices and six-decimal rates.
export function convertedAmount(amount: number, rate: number): number | null {
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(rate) ||
    amount <= 0 ||
    rate <= 0 ||
    amount > 9999999999.99 ||
    rate > 1000000000
  )
    return null
  const cents = BigInt(amount.toFixed(2).replace('.', ''))
  const factor = BigInt(rate.toFixed(6).replace('.', ''))
  const result = (cents * factor + 500000n) / 1000000n
  return result > 0n && result <= 999999999999n ? Number(result) / 100 : null
}
export function manualPackAmount(
  pack: TimePack,
  settings: FundingSettings | null,
): number | null {
  if (!settings) return null
  if (pack.currency === settings.currency) return Number(pack.amount)
  if (
    pack.currency !== settings.exchange_base_currency ||
    !settings.exchange_rate
  )
    return null
  return convertedAmount(Number(pack.amount), Number(settings.exchange_rate))
}
