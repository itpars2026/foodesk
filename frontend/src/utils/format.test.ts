import { describe, expect, it } from 'vitest'
import { formatDigits, formatMoney, formatNumber } from './format'

describe('Persian number formatting', () => {
  it('groups integers in sets of three', () => {
    expect(formatNumber(1234567)).toBe('۱٬۲۳۴٬۵۶۷')
  })

  it('formats zero correctly', () => {
    expect(formatNumber(0)).toBe('۰')
  })

  it('formats negative values', () => {
    expect(formatNumber(-123456)).toBe('‎−۱۲۳٬۴۵۶')
  })

  it('formats money with Toman', () => {
    expect(formatMoney(250000)).toBe('۲۵۰٬۰۰۰ تومان')
  })

  it('preserves ungrouped Jalali year digits', () => {
    expect(formatDigits(1405)).toBe('۱۴۰۵')
  })
})
