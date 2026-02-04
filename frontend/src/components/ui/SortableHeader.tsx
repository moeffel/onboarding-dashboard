import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '../../lib/utils'

type SortDirection = 'asc' | 'desc'

interface SortableHeaderProps {
  label: string
  sortKey: string
  activeKey: string
  direction: SortDirection
  onSort: (key: string) => void
  align?: 'left' | 'right'
}

export default function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = 'left',
}: SortableHeaderProps) {
  const isActive = activeKey === sortKey
  const Icon = !isActive ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 text-slate-500 hover:text-red-700 transition-colors',
        align === 'right' && 'justify-end w-full'
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</span>
      <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-red-600' : 'text-slate-300')} />
    </button>
  )
}
