import { useMemo } from 'react'
import Button from './ui/Button'
import { CalendarEntry, LeadStatus } from '../types'

interface CalendarPanelProps {
  entries: CalendarEntry[]
  isEditable?: boolean
  onStatusUpdate?: (leadId: number, status: LeadStatus, meta?: Record<string, unknown>) => void
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
  })

const completionMap: Record<LeadStatus, LeadStatus> = {
  call_scheduled: 'contact_established',
  first_appt_scheduled: 'first_appt_completed',
  second_appt_scheduled: 'second_appt_completed',
  new_cold: 'contact_established',
  contact_established: 'first_appt_scheduled',
  first_appt_pending: 'first_appt_scheduled',
  first_appt_completed: 'second_appt_scheduled',
  second_appt_completed: 'closed_won',
  closed_won: 'closed_won',
  closed_lost: 'closed_lost',
}

export default function CalendarPanel({ entries, isEditable = false, onStatusUpdate }: CalendarPanelProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    entries.forEach((entry) => {
      const key = formatDate(entry.scheduledFor)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(entry)
    })
    return map
  }, [entries])

  const sortedDates = Array.from(grouped.keys()).sort((a, b) => {
    const aDate = new Date(grouped.get(a)?.[0]?.scheduledFor || 0)
    const bDate = new Date(grouped.get(b)?.[0]?.scheduledFor || 0)
    return aDate.getTime() - bDate.getTime()
  })

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        Keine geplanten Termine oder Callbacks in diesem Zeitraum.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sortedDates.map((date) => (
        <div key={date} className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            {date}
          </div>
          <div className="divide-y divide-slate-100">
            {grouped.get(date)?.map((entry) => (
              <div
                key={`${entry.leadId}-${entry.scheduledFor}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                  <p className="text-xs text-slate-500">{entry.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-slate-700">{formatTime(entry.scheduledFor)}</div>
                  {isEditable && onStatusUpdate && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onStatusUpdate(entry.leadId, completionMap[entry.status])}
                    >
                      Als erledigt
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
