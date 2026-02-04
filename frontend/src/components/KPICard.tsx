import { Card, CardContent } from './ui/Card'
import { cn } from '../lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: number // percentage change
  trendLabel?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export default function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  variant = 'default'
}: KPICardProps) {
  const variantStyles = {
    default: 'bg-slate-200',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
  }

  const TrendIcon = trend && trend > 0 ? TrendingUp : trend && trend < 0 ? TrendingDown : Minus
  const trendColor = trend && trend > 0 ? 'text-green-600' : trend && trend < 0 ? 'text-red-600' : 'text-slate-500'
  const variantLabel =
    variant === 'success' ? 'Gut' : variant === 'warning' ? 'Warnung' : variant === 'danger' ? 'Kritisch' : null
  const variantBadgeStyles: Record<'success' | 'warning' | 'danger', string> = {
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
  }

  return (
    <Card className="relative overflow-hidden">
      <div className={cn('h-1 w-full', variantStyles[variant])} />
      <CardContent className="py-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </p>
          {variantLabel && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                variantBadgeStyles[variant as 'success' | 'warning' | 'danger']
              )}
            >
              {variantLabel}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          {trend !== undefined && (
            <span className={cn('flex items-center text-sm font-medium', trendColor)}>
              <TrendIcon className="h-4 w-4 mr-0.5" />
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        {(subtitle || trendLabel) && (
          <p className="mt-1 text-xs text-slate-500">
            {subtitle || trendLabel}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
