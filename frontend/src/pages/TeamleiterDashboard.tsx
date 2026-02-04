import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import KPICard from '../components/KPICard'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { formatPercent, formatNumber } from '../lib/utils'
import { TimePeriod, KPIs, Lead, LeadStatus, CalendarEntry, KPIConfigItem, FunnelKPIs } from '../types'
import { parseAppointmentLocation } from '../lib/appointments'
import { Users, TrendingUp, ChevronRight, Calendar, Search, ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import SortableHeader from '../components/ui/SortableHeader'
import JourneyKPIsPanel from '../components/JourneyKPIsPanel'
import CalendarPanel from '../components/CalendarPanel'

interface TeamMemberKPIs {
  userId: number
  firstName: string
  lastName: string
  kpis: KPIs
}

interface TeamKPIsResponse {
  teamName: string
  aggregated: KPIs
  members: TeamMemberKPIs[]
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

const statusPillStyles: Record<string, string> = {
  new_cold: 'bg-slate-100 text-slate-700',
  call_scheduled: 'bg-amber-100 text-amber-700',
  contact_established: 'bg-sl-red/10 text-sl-red',
  first_appt_pending: 'bg-sl-red/10 text-sl-red',
  first_appt_scheduled: 'bg-sl-red/10 text-sl-red',
  first_appt_completed: 'bg-emerald-100 text-emerald-700',
  second_appt_scheduled: 'bg-emerald-100 text-emerald-700',
  second_appt_completed: 'bg-emerald-100 text-emerald-700',
  closed_won: 'bg-green-100 text-green-700',
  closed_lost: 'bg-rose-100 text-rose-700',
}

async function fetchTeamKPIs(period: TimePeriod, range: DateRange): Promise<TeamKPIsResponse> {
  const response = await fetch(`/api/kpis/team?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Team-KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchTeamJourneyKPIs(period: TimePeriod, range: DateRange): Promise<FunnelKPIs> {
  const response = await fetch(`/api/kpis/journey?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Journey-KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchTeamLeads(): Promise<Lead[]> {
  const response = await fetch('/api/leads/team', { credentials: 'include' })
  if (!response.ok) throw new Error('Leads konnten nicht geladen werden')
  return response.json()
}

async function fetchCalendarEntries(period: TimePeriod, range: DateRange): Promise<CalendarEntry[]> {
  const response = await fetch(`/api/leads/calendar?${buildPeriodParams(period, range)}`, { credentials: 'include' })
  if (!response.ok) throw new Error('Kalenderdaten konnten nicht geladen werden')
  return response.json()
}

export default function TeamleiterDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('week')
  const [selectedStarterId, setSelectedStarterId] = useState<number | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [starterSearch, setStarterSearch] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [leadStatusFilter, setLeadStatusFilter] = useState<'all' | LeadStatus>('all')
  const [memberSort, setMemberSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  })
  const [leadSort, setLeadSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  })
  const { user } = useAuth()
  const [customRange, setCustomRange] = useState<DateRange>({ start: '', end: '' })

  const isCustomReady = period !== 'custom' || Boolean(customRange.start && customRange.end)

  const { data: teamData, isLoading, error } = useQuery({
    queryKey: ['kpis', 'team', period, customRange.start, customRange.end],
    queryFn: () => fetchTeamKPIs(period, customRange),
    enabled: isCustomReady,
  })

  const { data: journeyKpis, isLoading: journeyLoading } = useQuery({
    queryKey: ['kpis', 'journey', 'team', period, customRange.start, customRange.end],
    queryFn: () => fetchTeamJourneyKPIs(period, customRange),
    enabled: isCustomReady,
  })

  const { data: allLeads } = useQuery({
    queryKey: ['leads', 'team'],
    queryFn: fetchTeamLeads,
  })

  const { data: calendarEntries } = useQuery({
    queryKey: ['leads', 'calendar', period, customRange.start, customRange.end],
    queryFn: () => fetchCalendarEntries(period, customRange),
    enabled: isCustomReady,
  })

  const { data: kpiConfig } = useQuery({
    queryKey: ['kpi-config'],
    queryFn: async () => {
      const response = await fetch('/api/kpi-config', { credentials: 'include' })
      if (!response.ok) throw new Error('KPI-Konfiguration konnte nicht geladen werden')
      return response.json() as Promise<KPIConfigItem[]>
    },
  })

  const showJourneyKPIs = true

  const thresholdMap = useMemo(() => {
    const map: Record<string, KPIConfigItem> = {}
    kpiConfig?.forEach((cfg) => {
      map[cfg.name] = cfg
    })
    return map
  }, [kpiConfig])

  const periodOptions = [
    { value: 'today', label: 'Heute' },
    { value: 'week', label: 'Diese Woche' },
    { value: 'month', label: 'Dieser Monat' },
    { value: 'custom', label: 'Benutzerdefiniert' },
  ]

  const statusOptions = [
    { value: 'all', label: 'Alle Status' },
    { value: 'new_cold', label: 'Neu / Kaltakquise' },
    { value: 'call_scheduled', label: 'Anruf geplant' },
    { value: 'contact_established', label: 'Kontakt hergestellt' },
    { value: 'first_appt_scheduled', label: 'Ersttermin vereinbart' },
    { value: 'first_appt_completed', label: 'Ersttermin durchgeführt' },
    { value: 'second_appt_scheduled', label: 'Zweittermin vereinbart' },
    { value: 'second_appt_completed', label: 'Zweittermin durchgeführt' },
    { value: 'closed_won', label: 'Abschluss (Won)' },
    { value: 'closed_lost', label: 'Archiv (Lost)' },
  ]

  // Filter out teamleiter from member list (they have 0 calls typically or are the logged-in user)
  const starterMembers = useMemo(() => {
    if (!teamData) return []
    // Filter members who are starters (have activity or are not the teamleiter)
    // We identify teamleiter by checking if they have no activity data
    return teamData.members.filter((m) => {
      const needle = starterSearch.toLowerCase().trim()
      const matchesSearch = needle
        ? `${m.firstName} ${m.lastName}`.toLowerCase().includes(needle)
        : true
      const isTeamleiter = user?.role === 'teamleiter' && user.id === m.userId
      return matchesSearch && !isTeamleiter
    })
  }, [teamData, starterSearch, user?.id, user?.role])

  // Count leads per starter
  const leadsPerStarter = useMemo(() => {
    if (!allLeads) return {}
    const counts: Record<number, number> = {}
    allLeads.forEach((lead) => {
      counts[lead.ownerUserId] = (counts[lead.ownerUserId] || 0) + 1
    })
    return counts
  }, [allLeads])

  const sortedMembers = useMemo(() => {
    const direction = memberSort.direction === 'asc' ? 1 : -1
    return [...starterMembers].sort((a, b) => {
      switch (memberSort.key) {
        case 'calls':
          return direction * (a.kpis.callsMade - b.kpis.callsMade)
        case 'pickup':
          return direction * (a.kpis.pickupRate - b.kpis.pickupRate)
        case 'first_appts':
          return direction * (a.kpis.firstAppointmentsSet - b.kpis.firstAppointmentsSet)
        case 'first_rate':
          return direction * (a.kpis.firstApptRate - b.kpis.firstApptRate)
        case 'closings':
          return direction * (a.kpis.closings - b.kpis.closings)
        case 'leads':
          return direction * ((leadsPerStarter[a.userId] || 0) - (leadsPerStarter[b.userId] || 0))
        case 'name':
        default:
          return (
            direction *
            `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'de-AT')
          )
      }
    })
  }, [starterMembers, memberSort, leadsPerStarter])

  // Filter leads for selected starter
  const starterLeads = useMemo(() => {
    if (!allLeads || !selectedStarterId) return []
    const needle = leadSearch.toLowerCase().trim()
    return allLeads
      .filter((lead) => lead.ownerUserId === selectedStarterId)
      .filter((lead) => {
        const matchesStatus = leadStatusFilter === 'all' || lead.currentStatus === leadStatusFilter
        const matchesSearch = needle
          ? `${lead.fullName} ${lead.phone} ${lead.email || ''}`.toLowerCase().includes(needle)
          : true
        return matchesStatus && matchesSearch
      })
  }, [allLeads, selectedStarterId, leadSearch, leadStatusFilter])

  const sortedLeads = useMemo(() => {
    const direction = leadSort.direction === 'asc' ? 1 : -1
    const statusLabel = (status: LeadStatus) => statusLabels[status] || status
    return [...starterLeads].sort((a, b) => {
      switch (leadSort.key) {
        case 'phone':
          return direction * a.phone.localeCompare(b.phone, 'de-AT')
        case 'status':
          return direction * statusLabel(a.currentStatus).localeCompare(statusLabel(b.currentStatus), 'de-AT')
        case 'last_activity': {
          const aValue = new Date(a.lastActivityAt || a.createdAt).getTime()
          const bValue = new Date(b.lastActivityAt || b.createdAt).getTime()
          return direction * (aValue - bValue)
        }
        case 'name':
        default:
          return direction * a.fullName.localeCompare(b.fullName, 'de-AT')
      }
    })
  }, [starterLeads, leadSort])

  const selectedStarter = useMemo(() => {
    if (!teamData || !selectedStarterId) return null
    return teamData.members.find((m) => m.userId === selectedStarterId)
  }, [teamData, selectedStarterId])

  const selectedLead = useMemo(() => {
    if (!sortedLeads.length || !selectedLeadId) return null
    return sortedLeads.find((l) => l.id === selectedLeadId)
  }, [sortedLeads, selectedLeadId])

  const leadById = useMemo(() => {
    if (!allLeads) return {}
    const map: Record<number, Lead> = {}
    allLeads.forEach((lead) => {
      map[lead.id] = lead
    })
    return map
  }, [allLeads])

  // Get upcoming appointments for a starter
  const getUpcomingAppointments = (userId: number) => {
    if (!calendarEntries) return []
    const now = new Date()
    return calendarEntries
      .filter((entry) =>
        entry.ownerUserId === userId &&
        (entry.status === 'first_appt_scheduled' || entry.status === 'second_appt_scheduled') &&
        new Date(entry.scheduledFor) >= now
      )
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
      .slice(0, 3)
  }

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

  const formatDate = (value: string) =>
    new Date(value).toLocaleString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const handleMemberSort = (key: string) => {
    setMemberSort((prev) => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc',
    }))
  }

  const handleLeadSort = (key: string) => {
    setLeadSort((prev) => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc',
    }))
  }

  if (error) {
    return (
      <div className="p-4 bg-sl-red/10 border border-sl-red/30 rounded-lg text-sl-red">
        Fehler beim Laden der Team-KPIs: {error.message}
      </div>
    )
  }

  // Detail view for a selected lead
  if (selectedLead && selectedStarter) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedLeadId(null)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
            Zurück zu {selectedStarter.firstName}'s Leads
          </button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{selectedLead.fullName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Telefon</p>
                <p className="text-sm font-medium text-slate-900">{selectedLead.phone}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">E-Mail</p>
                <p className="text-sm text-slate-700">{selectedLead.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusPillStyles[selectedLead.currentStatus]}`}>
                  {statusLabels[selectedLead.currentStatus]}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Zuständig</p>
                <p className="text-sm text-slate-700">{selectedStarter.firstName} {selectedStarter.lastName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Erstellt am</p>
                <p className="text-sm text-slate-700">{new Date(selectedLead.createdAt).toLocaleString('de-AT')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Letzte Aktivität</p>
                <p className="text-sm text-slate-700">
                  {selectedLead.lastActivityAt ? new Date(selectedLead.lastActivityAt).toLocaleString('de-AT') : '—'}
                </p>
              </div>
            </div>
            {selectedLead.note && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Notizen</p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedLead.note}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Detail view for a selected starter
  if (selectedStarter) {
    const upcomingAppts = getUpcomingAppointments(selectedStarter.userId)

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedStarterId(null)
              setLeadSearch('')
              setLeadStatusFilter('all')
            }}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
            Zurück zur Team-Übersicht
          </button>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedStarter.firstName} {selectedStarter.lastName}
            </h1>
            <p className="text-slate-500">Starter-Profil und Kunden</p>
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

        {/* Starter KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard title="Anrufe" value={formatNumber(selectedStarter.kpis.callsMade)} />
          <KPICard
            title="Pickup-Rate"
            value={formatPercent(selectedStarter.kpis.pickupRate)}
            variant={getVariantFor('pickup_rate', selectedStarter.kpis.pickupRate)}
          />
          <KPICard title="Ersttermine" value={formatNumber(selectedStarter.kpis.firstAppointmentsSet)} />
          <KPICard
            title="ET-Rate"
            value={formatPercent(selectedStarter.kpis.firstApptRate)}
            variant={getVariantFor('first_appt_rate', selectedStarter.kpis.firstApptRate)}
          />
          <KPICard title="Abschlüsse" value={formatNumber(selectedStarter.kpis.closings)} />
          <KPICard
            title="Einheiten"
            value={formatNumber(selectedStarter.kpis.unitsTotal, 1)}
            variant={getVariantFor('units_total', selectedStarter.kpis.unitsTotal)}
          />
        </div>

        {/* Upcoming Appointments */}
        {upcomingAppts.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sl-red" />
                <CardTitle>Nächste Termine</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingAppts.map((entry) => {
                  const lead = leadById[entry.leadId]
                  const appointmentFormat = parseAppointmentLocation(entry.location)
                  return (
                    <div
                      key={`${entry.leadId}-${entry.scheduledFor}`}
                      onClick={() => setSelectedLeadId(entry.leadId)}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {lead?.fullName || entry.title}
                        </p>
                        <p className="text-sm text-slate-500">{formatDate(entry.scheduledFor)}</p>
                        {lead?.phone && (
                          <p className="text-xs text-slate-500">{lead.phone}</p>
                        )}
                        <p className="text-xs text-slate-500">
                          Format: {appointmentFormat.label}
                        </p>
                        {appointmentFormat.detail && (
                          <p className="text-xs text-slate-500">Ort: {appointmentFormat.detail}</p>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          statusPillStyles[entry.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {statusLabels[entry.status] || entry.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leads List */}
        <Card>
          <CardHeader>
            <CardTitle>Kunden von {selectedStarter.firstName}</CardTitle>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Suche nach Name, Telefon..."
                  className="pl-10"
                />
              </div>
              <Select
                value={leadStatusFilter}
                onChange={(e) => setLeadStatusFilter(e.target.value as 'all' | LeadStatus)}
                options={statusOptions}
                className="w-full md:w-52"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sortedLeads.length > 0 ? (
              <>
                <div className="md:hidden divide-y divide-slate-100">
                  {sortedLeads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{lead.fullName}</p>
                          <p className="text-xs text-slate-500">{lead.phone}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusPillStyles[lead.currentStatus]}`}>
                          {statusLabels[lead.currentStatus]}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Letzte Aktivität:{' '}
                        {lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleDateString('de-AT') : '—'}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70">
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Name"
                            sortKey="name"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleLeadSort}
                          />
                        </th>
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Telefon"
                            sortKey="phone"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleLeadSort}
                          />
                        </th>
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Status"
                            sortKey="status"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleLeadSort}
                          />
                        </th>
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Letzte Aktivität"
                            sortKey="last_activity"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleLeadSort}
                          />
                        </th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-3 px-4 text-sm font-medium text-slate-900">{lead.fullName}</td>
                          <td className="py-3 px-4 text-sm text-slate-600">{lead.phone}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusPillStyles[lead.currentStatus]}`}>
                              {statusLabels[lead.currentStatus]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-500">
                            {lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleDateString('de-AT') : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-slate-500">Keine Kunden gefunden.</div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main Team Overview
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Dashboard</h1>
          <p className="text-slate-500">
            {teamData?.teamName || 'Team'} - Übersicht
          </p>
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

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="py-5">
                  <div className="h-4 bg-slate-200 rounded w-20 mb-2"></div>
                  <div className="h-8 bg-slate-200 rounded w-16"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : teamData ? (
        <>
          {/* Team Aggregated KPIs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-700">Team-Gesamtübersicht</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                title="Anrufe gesamt"
                value={formatNumber(teamData.aggregated.callsMade)}
              />
              <KPICard
                title="Pickup-Rate (Ø)"
                value={formatPercent(teamData.aggregated.pickupRate)}
                variant={getVariantFor('pickup_rate', teamData.aggregated.pickupRate)}
              />
              <KPICard
                title="Ersttermine gesamt"
                value={formatNumber(teamData.aggregated.firstAppointmentsSet)}
              />
              <KPICard
                title="Abschlüsse gesamt"
                value={formatNumber(teamData.aggregated.closings)}
              />
            </div>
          </div>

          {/* Team Members */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-500" />
                <CardTitle>Meine Starter</CardTitle>
              </div>
              <div className="mt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={starterSearch}
                    onChange={(e) => setStarterSearch(e.target.value)}
                    placeholder="Starter suchen..."
                    className="pl-10 w-full sm:max-w-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="md:hidden divide-y divide-slate-100">
                {sortedMembers.map((member) => (
                  <button
                    key={member.userId}
                    onClick={() => setSelectedStarterId(member.userId)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {member.firstName} {member.lastName}
                        </p>
                        <p className="text-xs text-slate-500">Leads: {leadsPerStarter[member.userId] || 0}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <span>Anrufe: {formatNumber(member.kpis.callsMade)}</span>
                      <span>Pickup: {formatPercent(member.kpis.pickupRate)}</span>
                      <span>Ersttermine: {formatNumber(member.kpis.firstAppointmentsSet)}</span>
                      <span>Abschlüsse: {formatNumber(member.kpis.closings)}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <th className="text-left py-3 px-6">
                        <SortableHeader
                          label="Name"
                          sortKey="name"
                          activeKey={memberSort.key}
                          direction={memberSort.direction}
                          onSort={handleMemberSort}
                        />
                      </th>
                      <th className="py-3 px-6 text-right">
                        <SortableHeader
                          label="Anrufe"
                          sortKey="calls"
                          activeKey={memberSort.key}
                          direction={memberSort.direction}
                          onSort={handleMemberSort}
                          align="right"
                        />
                      </th>
                      <th className="py-3 px-6 text-right">
                        <SortableHeader
                          label="Pickup %"
                          sortKey="pickup"
                          activeKey={memberSort.key}
                          direction={memberSort.direction}
                          onSort={handleMemberSort}
                          align="right"
                        />
                      </th>
                      <th className="py-3 px-6 text-right">
                        <SortableHeader
                          label="Ersttermine"
                          sortKey="first_appts"
                          activeKey={memberSort.key}
                          direction={memberSort.direction}
                          onSort={handleMemberSort}
                          align="right"
                        />
                      </th>
                      <th className="py-3 px-6 text-right">
                        <SortableHeader
                          label="ET-Rate"
                          sortKey="first_rate"
                          activeKey={memberSort.key}
                          direction={memberSort.direction}
                          onSort={handleMemberSort}
                          align="right"
                        />
                      </th>
                      <th className="py-3 px-6 text-right">
                        <SortableHeader
                          label="Abschlüsse"
                          sortKey="closings"
                          activeKey={memberSort.key}
                          direction={memberSort.direction}
                          onSort={handleMemberSort}
                          align="right"
                        />
                      </th>
                      <th className="py-3 px-6 text-right">
                        <SortableHeader
                          label="Leads"
                          sortKey="leads"
                          activeKey={memberSort.key}
                          direction={memberSort.direction}
                          onSort={handleMemberSort}
                          align="right"
                        />
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMembers.map((member) => (
                      <tr
                        key={member.userId}
                        onClick={() => setSelectedStarterId(member.userId)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-3 px-6 text-sm font-medium text-slate-900">
                          {member.firstName} {member.lastName}
                        </td>
                        <td className="py-3 px-6 text-sm text-slate-600 text-right">
                          {formatNumber(member.kpis.callsMade)}
                        </td>
                        <td className="py-3 px-6 text-sm text-slate-600 text-right">
                          {formatPercent(member.kpis.pickupRate)}
                        </td>
                        <td className="py-3 px-6 text-sm text-slate-600 text-right">
                          {formatNumber(member.kpis.firstAppointmentsSet)}
                        </td>
                        <td className="py-3 px-6 text-sm text-slate-600 text-right">
                          {formatPercent(member.kpis.firstApptRate)}
                        </td>
                        <td className="py-3 px-6 text-sm text-slate-600 text-right">
                          {formatNumber(member.kpis.closings)}
                        </td>
                        <td className="py-3 px-6 text-sm text-slate-600 text-right">
                          {leadsPerStarter[member.userId] || 0}
                        </td>
                        <td className="py-3 px-6">
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-500" />
                <CardTitle>Team-Kalender</CardTitle>
              </div>
              <p className="text-xs text-slate-500">Rückrufe und Termine des Teams.</p>
            </CardHeader>
            <CardContent>
              {calendarEntries ? (
                <CalendarPanel entries={calendarEntries} />
              ) : (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
            <JourneyKPIsPanel data={journeyKpis} title="Journey-KPIs (Team)" />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
