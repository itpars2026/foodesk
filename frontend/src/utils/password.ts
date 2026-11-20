export function isNumericOnlyPassword(value: string): boolean {
  return /^[0-9۰-۹٠-٩]+$/.test(value)
}
