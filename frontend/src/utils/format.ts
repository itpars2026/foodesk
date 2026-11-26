const groupedNumberFormatter = new Intl.NumberFormat('fa-IR', {
  useGrouping: true,
  maximumFractionDigits: 0,
})

const digitFormatter = new Intl.NumberFormat('fa-IR', {
  useGrouping: false,
  maximumFractionDigits: 0,
})

export function formatNumber(value: number): string {
  return groupedNumberFormatter.format(value)
}

export function formatDigits(value: number): string {
  return digitFormatter.format(value)
}

export function formatMoney(amount: number): string {
  return `${formatNumber(amount)} تومان`
}
