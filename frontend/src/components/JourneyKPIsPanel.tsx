import { FunnelKPIs } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { formatNumber, formatPercent } from '../lib/utils'

const statusLabels: Record<string, string> = {
  new_cold: 'Neu / Kaltakquise',
  call_scheduled: 'Anruf geplant',
  contact_established: 'Kontakt hergestellt',
  first_appt_pending: 'Ersttermin in Klärung',
  first_appt_scheduled: 'Ersttermin vereinbart',
  first_appt_completed: 'Ersttermin durchgeführt',
  second_appt_scheduled: 'Zweittermin vereinbart',
  second_appt_completed: 'Zweittermin durchgeführt',
  closed_won: 'Abschluss (Won)',
  closed_lost: 'Verloren (Lost)',
}

const statusTimeOrder = [
  'new_cold',
  'call_scheduled',
  'contact_established',
  'first_appt_pending',
  'first_appt_scheduled',
  'first_appt_completed',
  'second_appt_scheduled',
  'second_appt_completed',
  'closed_won',
  'closed_lost',
] as const

const funnelSteps = [
  {
    label: 'Kontakt hergestellt',
    statusKey: 'contact_established',
    rateKey: 'contactRate',
    baseLabel: 'Leads',
  },
  {
    label: 'Ersttermin vereinbart',
    statusKey: 'first_appt_scheduled',
    rateKey: 'firstApptRate',
    baseLabel: 'Kontakte',
  },
  {
    label: 'Ersttermin durchgeführt',
    statusKey: 'first_appt_completed',
    rateKey: 'firstApptShowRate',
    baseLabel: 'Ersttermine',
  },
  {
    label: 'Zweittermin vereinbart',
    statusKey: 'second_appt_scheduled',
    rateKey: 'secondApptRate',
    baseLabel: 'Ersttermine (durchgeführt)',
  },
  {
    label: 'Zweittermin durchgeführt',
    statusKey: 'second_appt_completed',
    rateKey: 'secondApptShowRate',
    baseLabel: 'Zweittermine',
  },
  {
    label: 'Abschluss (Won)',
    statusKey: 'closed_won',
    rateKey: 'closingRate',
    baseLabel: 'Zweittermine (durchgeführt)',
  },
]

const dropOffItems = [
  { key: 'callDeclineRate', label: 'Ablehnung am Call' },
  { key: 'firstApptDeclineRate', label: 'Ablehnung Ersttermin' },
  { key: 'secondApptDeclineRate', label: 'Ablehnung Zweittermin' },
  { key: 'noShowRateFirst', label: 'No-show Ersttermin' },
  { key: 'noShowRateSecond', label: 'No-show Zweittermin' },
  { key: 'rescheduleRateFirst', label: 'Verschiebung Ersttermin' },
  { key: 'rescheduleRateSecond', label: 'Verschiebung Zweittermin' },
]

const timeItems = [
  { key: 'avgTimeToFirstContactHours', label: 'Ø Zeit bis Erstkontakt' },
  { key: 'avgTimeToFirstApptHours', label: 'Ø Zeit bis Ersttermin' },
  { key: 'avgTimeToSecondApptHours', label: 'Ø Zeit bis Zweittermin' },
  { key: 'avgTimeToClosingHours', label: 'Ø Zeit bis Abschluss' },
]

const formatHours = (value?: number) => `${formatNumber(value || 0, 1)} h`

interface JourneyKPIsPanelProps {
  data: FunnelKPIs
  title?: string
}

export default function JourneyKPIsPanel({ data, title = 'Journey-KPIs' }: JourneyKPIsPanelProps) {
  const statusCounts = data.statusCounts || {}
  const leadsCreated = data.leadsCreated || 0
  const statusTimeItems = statusTimeOrder
    .map((status) => {
      const key = `avg_time_in_status_${status}Hours`
      const value = data.timeMetrics?.[key]
      if (value === undefined) return null
      return {
        key,
        label: `Ø Zeit in ${statusLabels[status] || status}`,
        value,
      }
    })
    .filter((item): item is { key: string; label: string; value: number } => item !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-slate-500">Leads im Zeitraum: {formatNumber(leadsCreated)}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-700">Funnel</p>
                <span className="text-xs text-slate-500">
                  Basis: {formatNumber(leadsCreated)} Leads
                </span>
              </div>
              <div className="space-y-3">
                {funnelSteps.map((step) => {
                  const count = statusCounts[step.statusKey] || 0
                  const rate = data.conversions?.[step.rateKey] || 0
                  const baseCount =
                    step.statusKey === 'contact_established'
                      ? leadsCreated
                      : statusCounts[
                          funnelSteps[funnelSteps.findIndex((s) => s.statusKey === step.statusKey) - 1]?.statusKey || ''
                        ] || 0
                  const width = Math.min(rate * 100, 100)
                  return (
                    <div key={step.statusKey} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                          <p className="text-xs text-slate-500">
                            {formatNumber(count)} von {formatNumber(baseCount)} {step.baseLabel}
                          </p>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          {formatPercent(rate)}
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                        <div
                          className="h-1.5 rounded-full bg-sl-red"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-700 mb-3">Tempo</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {timeItems.map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {formatHours(data.timeMetrics?.[item.key])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-700 mb-3">Drop-Offs</p>
              <div className="space-y-2 text-sm">
                {dropOffItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="font-medium text-slate-900">
                      {formatPercent(data.dropOffs?.[item.key] || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {statusTimeItems.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-700 mb-3">Zeit je Status</p>
                <div className="space-y-2 text-sm">
                  {statusTimeItems.map((item) => (
                    <div key={item.key} className="flex items-center justify-between">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-medium text-slate-900">{formatHours(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
