import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import KPICard from '../components/KPICard'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { formatPercent, formatNumber } from '../lib/utils'
import { TimePeriod, KPIs, KPIConfigItem, FunnelKPIs, CalendarEntry } from '../types'
import { Phone, Calendar, Target, Clock, Trash2 } from 'lucide-react'
import ActivityModal from '../components/ActivityModal'
import { useAuth } from '../hooks/useAuth'
import JourneyKPIsPanel from '../components/JourneyKPIsPanel'
import CalendarPanel from '../components/CalendarPanel'

type RecentEvent = {
  id: number
  type: 'call' | 'appointment' | 'closing'
  datetime: string
  title: string
  meta?: string | null
  notes?: string | null
}

type DateRange = { start: string; end: string }

const buildPeriodParams = (period: TimePeriod, range: DateRange) => {
  const params = new URLSearchParams({ period })
  if (period === 'custom') {
    if (range.start) params.set('start', range.start)
    if (range.end) params.set('end', range.end)
  }
  return params.toString()
}

async function fetchKPIs(period: TimePeriod, range: DateRange): Promise<KPIs> {
  const response = await fetch(`/api/kpis/me?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchJourneyKPIs(period: TimePeriod, range: DateRange): Promise<FunnelKPIs> {
  const response = await fetch(`/api/kpis/journey?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Journey-KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchCalendarEntries(period: TimePeriod, range: DateRange): Promise<CalendarEntry[]> {
  const response = await fetch(`/api/leads/calendar?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Kalenderdaten konnten nicht geladen werden')
  return response.json()
}

export default function StarterDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('week')
  const [isModalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'call' | 'appointment' | 'closing'>('call')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [customRange, setCustomRange] = useState<DateRange>({ start: '', end: '' })
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const isCustomReady = period !== 'custom' || Boolean(customRange.start && customRange.end)

  const { data: kpis, isLoading, error } = useQuery({
    queryKey: ['kpis', 'me', period, customRange.start, customRange.end],
    queryFn: () => fetchKPIs(period, customRange),
    enabled: isCustomReady,
  })

  const { data: journeyKpis, isLoading: journeyLoading } = useQuery({
    queryKey: ['kpis', 'journey', 'me', period, customRange.start, customRange.end],
    queryFn: () => fetchJourneyKPIs(period, customRange),
    enabled: isCustomReady,
  })

  const { data: calendarEntries, isLoading: calendarLoading } = useQuery({
    queryKey: ['leads', 'calendar', period, customRange.start, customRange.end],
    queryFn: () => fetchCalendarEntries(period, customRange),
    enabled: isCustomReady,
  })

  const { data: recentEvents } = useQuery({
    queryKey: ['events', 'recent'],
    queryFn: async () => {
      const response = await fetch('/api/events/recent?limit=5', {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Aktivitäten konnten nicht geladen werden')
      return response.json() as Promise<RecentEvent[]>
    },
  })

  const { data: kpiConfig } = useQuery({
    queryKey: ['kpi-config'],
    queryFn: async () => {
      const response = await fetch('/api/kpi-config', { credentials: 'include' })
      if (!response.ok) throw new Error('KPI-Konfiguration konnte nicht geladen werden')
      return response.json() as Promise<KPIConfigItem[]>
    },
  })

  const showJourneyKPIs = useMemo(() => {
    if (!kpiConfig) return user?.role === 'admin'
    return kpiConfig.some((cfg) => cfg.name === 'journey_kpis_panel')
  }, [kpiConfig, user?.role])


  const thresholdMap = useMemo(() => {
    const map: Record<string, KPIConfigItem> = {}
    kpiConfig?.forEach((cfg) => {
      map[cfg.name] = cfg
    })
    return map
  }, [kpiConfig])

  const deleteEventMutation = useMutation({
    mutationFn: async ({ type, id }: { type: RecentEvent['type']; id: number }) => {
      const res = await fetch(`/api/events/${type}/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Löschen fehlgeschlagen')
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', 'recent'] })
      queryClient.invalidateQueries({ queryKey: ['kpis', 'me'] })
      setFeedback('Aktivität gelöscht')
      setErrorMessage(null)
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: () => {
      setErrorMessage('Aktivität konnte nicht gelöscht werden.')
    },
    meta: { requiresAdmin: true },
  })


  const periodOptions = [
    { value: 'today', label: 'Heute' },
    { value: 'week', label: 'Diese Woche' },
    { value: 'month', label: 'Dieser Monat' },
    { value: 'custom', label: 'Benutzerdefiniert' },
  ]

  const getVariantFor = (name: string, value: number) => {
    const config = thresholdMap[name]
    if (!config) return 'default'
    const good = config.goodThreshold ?? null
    const warn = config.warnThreshold ?? null
    if (good !== null && value >= good) return 'success'
    if (warn !== null && value >= warn) return 'warning'
    if (warn !== null || good !== null) return 'danger'
    return 'default'
  }

  const canLogActivity = user?.role === 'starter'
  const canDeleteActivity = user?.role === 'admin'

  const openModal = (type: 'call' | 'appointment' | 'closing') => {
    if (!canLogActivity) return
    setModalType(type)
    setModalOpen(true)
  }

  const handleActivitySaved = () => {
    queryClient.invalidateQueries({ queryKey: ['kpis', 'me'] })
    queryClient.invalidateQueries({ queryKey: ['events', 'recent'] })
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    setFeedback('Aktivität gespeichert')
    setTimeout(() => setFeedback(null), 3000)
  }

  const formatDate = (value: string) => {
    const date = new Date(value)
    return date.toLocaleString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getEventIcon = (type: RecentEvent['type']) => {
    switch (type) {
      case 'appointment':
        return <Calendar className="h-4 w-4 text-red-600" />
      case 'closing':
        return <Target className="h-4 w-4 text-emerald-500" />
      default:
        return <Phone className="h-4 w-4 text-red-600" />
    }
  }

  const handleDeleteEvent = (event: RecentEvent) => {
    if (!canDeleteActivity || deleteEventMutation.isPending) return
    if (window.confirm('Eintrag wirklich löschen?')) {
      deleteEventMutation.mutate({ type: event.type, id: event.id })
    }
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mein Dashboard</h1>
          <p className="text-slate-500">Deine Kennzahlen im Überblick</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value as TimePeriod)}
            className="w-full sm:w-48"
          />
          {period === 'custom' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
                className="w-full sm:w-40"
              />
              <span className="text-xs text-slate-500">bis</span>
              <Input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
                className="w-full sm:w-40"
              />
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {feedback}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      {!canLogActivity && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          Historie ist schreibgeschützt. Nur Starter dürfen Aktivitäten erfassen, und nur Admins dürfen Einträge löschen.
        </div>
      )}

      {/* Quick Actions - moved to top */}
      {canLogActivity && (
        <Card>
          <CardHeader>
            <CardTitle>Schnellerfassung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="secondary"
                className="justify-start h-auto py-4"
                type="button"
                onClick={() => openModal('call')}
              >
                <Phone className="h-5 w-5 mr-3 text-red-600" />
                <div className="text-left">
                  <p className="font-medium">Anruf erfassen</p>
                  <p className="text-xs text-slate-500">Telefonate dokumentieren</p>
                </div>
              </Button>
              <Button
                variant="secondary"
                className="justify-start h-auto py-4"
                type="button"
                onClick={() => openModal('appointment')}
              >
                <Calendar className="h-5 w-5 mr-3 text-red-600" />
                <div className="text-left">
                  <p className="font-medium">Termin erfassen</p>
                  <p className="text-xs text-slate-500">Erst- oder Zweittermin</p>
                </div>
              </Button>
              <Button
                variant="secondary"
                className="justify-start h-auto py-4"
                type="button"
                onClick={() => openModal('closing')}
              >
                <Target className="h-5 w-5 mr-3 text-red-600" />
                <div className="text-left">
                  <p className="font-medium">Abschluss erfassen</p>
                  <p className="text-xs text-slate-500">Verkauf dokumentieren</p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                variant={getVariantFor('pickup_rate', kpis.pickupRate)}
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
                variant={getVariantFor('first_appt_rate', kpis.firstApptRate)}
              />
              <KPICard
                title="Zweittermine vereinbart"
                value={formatNumber(kpis.secondAppointmentsSet)}
              />
              <KPICard
                title="Zweittermin-Rate"
                value={formatPercent(kpis.secondApptRate)}
                variant={getVariantFor('second_appt_rate', kpis.secondApptRate)}
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
                title="Einheiten gesamt"
                value={formatNumber(kpis.unitsTotal, 1)}
              />
              <KPICard
                title="Ø Einheiten pro Abschluss"
                value={formatNumber(kpis.avgUnitsPerClosing, 2)}
                variant={getVariantFor('avg_units_per_closing', kpis.avgUnitsPerClosing)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {journeyLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="h-4 w-32 bg-slate-200 rounded mb-3 animate-pulse"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : journeyKpis && showJourneyKPIs ? (
        <JourneyKPIsPanel data={journeyKpis} title="Journey-KPIs (Starter)" />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-slate-500" />
            <CardTitle>Kalender</CardTitle>
          </div>
          <p className="text-xs text-slate-500">Rückrufe und Termine im gewählten Zeitraum.</p>
        </CardHeader>
        <CardContent>
          {calendarLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <CalendarPanel entries={calendarEntries || []} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-500" />
            <CardTitle>Zuletzt erfasste Aktivitäten</CardTitle>
          </div>
          <p className="text-xs text-slate-500">
            Änderungen an dieser Historie dürfen nur Admins vornehmen.
          </p>
        </CardHeader>
        <CardContent>
          {recentEvents && recentEvents.length > 0 ? (
            <div className="space-y-4">
              {recentEvents.map((event) => (
                <div
                  key={`${event.type}-${event.id}`}
                  className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="mt-1">{getEventIcon(event.type)}</div>
                  <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{event.title}</p>
                          <p className="text-xs text-slate-500">{formatDate(event.datetime)}</p>
                        </div>
                        {canDeleteActivity && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEvent(event)}
                            disabled={deleteEventMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Löschen
                          </Button>
                        )}
                      </div>
                    {event.meta && (
                      <p className="text-xs text-slate-500 mt-1">{event.meta}</p>
                    )}
                    {event.notes && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {event.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Noch keine Aktivitäten erfasst.</p>
          )}
        </CardContent>
      </Card>

      {canLogActivity && (
        <ActivityModal
          isOpen={isModalOpen}
          initialType={modalType}
          onClose={() => setModalOpen(false)}
          onSuccess={handleActivitySaved}
        />
      )}
    </div>
  )
}
