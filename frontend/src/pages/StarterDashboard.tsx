import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import KPICard from '../components/KPICard'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { formatPercent, formatNumber } from '../lib/utils'
import { TimePeriod, KPIs, KPIConfigItem } from '../types'
import { Phone, Calendar, Target, Plus, Clock, Trash2 } from 'lucide-react'
import ActivityModal from '../components/ActivityModal'
import { useAuth } from '../hooks/useAuth'

type RecentEvent = {
  id: number
  type: 'call' | 'appointment' | 'closing'
  datetime: string
  title: string
  meta?: string | null
  notes?: string | null
}

async function fetchKPIs(period: TimePeriod): Promise<KPIs> {
  const response = await fetch(`/api/kpis/me?period=${period}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('KPIs konnten nicht geladen werden')
  return response.json()
}

export default function StarterDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('week')
  const [isModalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'call' | 'appointment' | 'closing'>('call')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: kpis, isLoading, error } = useQuery({
    queryKey: ['kpis', 'me', period],
    queryFn: () => fetchKPIs(period),
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
        return <Calendar className="h-4 w-4 text-indigo-500" />
      case 'closing':
        return <Target className="h-4 w-4 text-emerald-500" />
      default:
        return <Phone className="h-4 w-4 text-sky-500" />
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
          {canLogActivity && (
            <Button onClick={() => openModal('call')}>
              <Plus className="h-4 w-4 mr-2" />
              Aktivität erfassen
            </Button>
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
                title="Units gesamt"
                value={formatNumber(kpis.unitsTotal, 1)}
              />
              <KPICard
                title="Ø Units pro Abschluss"
                value={formatNumber(kpis.avgUnitsPerClosing, 2)}
                variant={getVariantFor('avg_units_per_closing', kpis.avgUnitsPerClosing)}
              />
            </div>
          </div>
        </div>
      ) : null}


      {/* Quick Actions */}
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
                <Phone className="h-5 w-5 mr-3 text-primary-600" />
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
                <Calendar className="h-5 w-5 mr-3 text-primary-600" />
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
                <Target className="h-5 w-5 mr-3 text-primary-600" />
                <div className="text-left">
                  <p className="font-medium">Abschluss erfassen</p>
                  <p className="text-xs text-slate-500">Verkauf dokumentieren</p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
