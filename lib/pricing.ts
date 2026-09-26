export type Tier = '15d' | '30d' | 'lifetime'

export const PRODUCT = 'nosginal' as const

export type PricingTier = {
  id: Tier
  label: string
  priceCents: number
  currency: 'usd'
  durationDays: number | null
  description: string
  highlight?: boolean
}

export const PRICING: Record<Tier, PricingTier> = {
  '15d': {
    id: '15d',
    label: '15 Days',
    priceCents: 299,
    currency: 'usd',
    durationDays: 15,
    description: 'Try Nosginal for two weeks.',
  },
  '30d': {
    id: '30d',
    label: '30 Days',
    priceCents: 699,
    currency: 'usd',
    durationDays: 30,
    description: 'A full month of access.',
    highlight: true,
  },
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    priceCents: 1099,
    currency: 'usd',
    durationDays: null,
    description: 'Buy once, use forever.',
  },
}

export const TIERS: PricingTier[] = [PRICING['15d'], PRICING['30d'], PRICING.lifetime]

export function isTier(v: string): v is Tier {
  return v === '15d' || v === '30d' || v === 'lifetime'
}

export function formatPrice(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}
