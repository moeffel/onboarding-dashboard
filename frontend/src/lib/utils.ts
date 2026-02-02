import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return 'N/A'
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
