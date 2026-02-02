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
    default: 'border-l-slate-400',
    success: 'border-l-green-500',
    warning: 'border-l-yellow-500',
    danger: 'border-l-red-500',
  }

  const TrendIcon = trend && trend > 0 ? TrendingUp : trend && trend < 0 ? TrendingDown : Minus
  const trendColor = trend && trend > 0 ? 'text-green-600' : trend && trend < 0 ? 'text-red-600' : 'text-slate-500'

  return (
    <Card className={cn('border-l-4', variantStyles[variant])}>
      <CardContent className="py-5">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <p className="text-2xl font-bold text-slate-900">{value}</p>
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
