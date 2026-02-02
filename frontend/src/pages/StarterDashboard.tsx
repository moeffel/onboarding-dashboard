import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import KPICard from '../components/KPICard'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { formatPercent, formatNumber } from '../lib/utils'
import { TimePeriod, KPIs } from '../types'
import { Phone, Calendar, Target, Plus } from 'lucide-react'

async function fetchKPIs(period: TimePeriod): Promise<KPIs> {
  const response = await fetch(`/api/kpis/me?period=${period}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('KPIs konnten nicht geladen werden')
  return response.json()
}

export default function StarterDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('week')

  const { data: kpis, isLoading, error } = useQuery({
    queryKey: ['kpis', 'me', period],
    queryFn: () => fetchKPIs(period),
  })

  const periodOptions = [
    { value: 'today', label: 'Heute' },
    { value: 'week', label: 'Diese Woche' },
    { value: 'month', label: 'Dieser Monat' },
  ]

  // Determine KPI variants based on thresholds (example thresholds)
  const getPickupVariant = (rate: number) => {
    if (rate >= 0.3) return 'success'
    if (rate >= 0.2) return 'warning'
    return 'danger'
  }

  const getApptVariant = (rate: number) => {
    if (rate >= 0.15) return 'success'
    if (rate >= 0.1) return 'warning'
    return 'danger'
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        Fehler beim Laden der KPIs: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mein Dashboard</h1>
          <p className="text-slate-500">Deine Kennzahlen im Überblick</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value as TimePeriod)}
            className="w-40"
          />
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Aktivität erfassen
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-5">
                <div className="h-4 bg-slate-200 rounded w-20 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : kpis ? (
        <div className="space-y-6">
          {/* Calls Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-700">Telefonate</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPICard
                title="Anrufe getätigt"
                value={formatNumber(kpis.callsMade)}
              />
              <KPICard
                title="Anrufe angenommen"
                value={formatNumber(kpis.callsAnswered)}
              />
              <KPICard
                title="Pickup-Rate"
                value={formatPercent(kpis.pickupRate)}
                variant={getPickupVariant(kpis.pickupRate)}
              />
            </div>
          </div>

          {/* Appointments Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-700">Termine</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                title="Ersttermine vereinbart"
                value={formatNumber(kpis.firstAppointmentsSet)}
              />
              <KPICard
                title="Ersttermin-Rate"
                value={formatPercent(kpis.firstApptRate)}
                variant={getApptVariant(kpis.firstApptRate)}
              />
              <KPICard
                title="Zweittermine vereinbart"
                value={formatNumber(kpis.secondAppointmentsSet)}
              />
              <KPICard
                title="Zweittermin-Rate"
                value={formatPercent(kpis.secondApptRate)}
                variant={getApptVariant(kpis.secondApptRate)}
              />
            </div>
          </div>

          {/* Closings Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-700">Abschlüsse</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPICard
                title="Abschlüsse"
                value={formatNumber(kpis.closings)}
              />
              <KPICard
                title="Units gesamt"
                value={formatNumber(kpis.unitsTotal, 1)}
              />
              <KPICard
                title="Ø Units pro Abschluss"
                value={formatNumber(kpis.avgUnitsPerClosing, 2)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Schnellerfassung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="secondary" className="justify-start h-auto py-4">
              <Phone className="h-5 w-5 mr-3 text-primary-600" />
              <div className="text-left">
                <p className="font-medium">Anruf erfassen</p>
                <p className="text-xs text-slate-500">Telefonate dokumentieren</p>
              </div>
            </Button>
            <Button variant="secondary" className="justify-start h-auto py-4">
              <Calendar className="h-5 w-5 mr-3 text-primary-600" />
              <div className="text-left">
                <p className="font-medium">Termin erfassen</p>
                <p className="text-xs text-slate-500">Erst- oder Zweittermin</p>
              </div>
            </Button>
            <Button variant="secondary" className="justify-start h-auto py-4">
              <Target className="h-5 w-5 mr-3 text-primary-600" />
              <div className="text-left">
                <p className="font-medium">Abschluss erfassen</p>
                <p className="text-xs text-slate-500">Verkauf dokumentieren</p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
