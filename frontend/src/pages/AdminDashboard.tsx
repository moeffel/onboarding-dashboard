import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import KPICard from '../components/KPICard'
import SortableHeader from '../components/ui/SortableHeader'
import { formatPercent, formatNumber } from '../lib/utils'
import { TimePeriod, Team, Lead, KPIs, KPIConfigItem, FunnelKPIs } from '../types'
import { Users, ChevronRight, ArrowLeft, Phone, Calendar, Target, User } from 'lucide-react'
import JourneyKPIsPanel from '../components/JourneyKPIsPanel'

type TeamKPIs = {
  teamName: string
  aggregated: KPIs
  members: {
    userId: number
    firstName: string
    lastName: string
    kpis: KPIs
  }[]
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

async function fetchTeams(): Promise<Team[]> {
  const response = await fetch('/api/admin/teams', { credentials: 'include' })
  if (!response.ok) throw new Error('Teams konnten nicht geladen werden')
  return response.json()
}

async function fetchTeamKPIs(teamId: number, period: TimePeriod, range: DateRange): Promise<TeamKPIs> {
  const response = await fetch(`/api/kpis/team/${teamId}?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Team-KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchOverallKPIs(period: TimePeriod, range: DateRange): Promise<KPIs> {
  const response = await fetch(`/api/kpis/overview?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Gesamt-KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchJourneyKPIs(period: TimePeriod, range: DateRange): Promise<FunnelKPIs> {
  const response = await fetch(`/api/kpis/journey?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Journey-KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchUserKPIs(userId: number, period: TimePeriod, range: DateRange): Promise<KPIs> {
  const response = await fetch(`/api/kpis/user/${userId}?${buildPeriodParams(period, range)}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('User-KPIs konnten nicht geladen werden')
  return response.json()
}

async function fetchAllLeads(): Promise<Lead[]> {
  const response = await fetch('/api/leads', { credentials: 'include' })
  if (!response.ok) throw new Error('Leads konnten nicht geladen werden')
  return response.json()
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
  contact_established: 'bg-red-100 text-red-700',
  first_appt_pending: 'bg-red-100 text-red-700',
  first_appt_scheduled: 'bg-red-100 text-red-700',
  first_appt_completed: 'bg-emerald-100 text-emerald-700',
  second_appt_scheduled: 'bg-emerald-100 text-emerald-700',
  second_appt_completed: 'bg-emerald-100 text-emerald-700',
  closed_won: 'bg-green-100 text-green-700',
  closed_lost: 'bg-rose-100 text-rose-700',
}

export default function AdminDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('week')
  const [customRange, setCustomRange] = useState<DateRange>({ start: '', end: '' })
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedStarterId, setSelectedStarterId] = useState<number | null>(null)
  const [starterSearch, setStarterSearch] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [leadSort, setLeadSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  })
  const isCustomReady = period !== 'custom' || Boolean(customRange.start && customRange.end)

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: fetchTeams,
  })

  const { data: teamKpis, isLoading: teamKpisLoading } = useQuery({
    queryKey: ['kpis', 'team', selectedTeamId, period, customRange.start, customRange.end],
    queryFn: () => fetchTeamKPIs(selectedTeamId!, period, customRange),
    enabled: !!selectedTeamId && isCustomReady,
  })

  const { data: overallKpis, isLoading: overallKpisLoading } = useQuery({
    queryKey: ['kpis', 'overview', period, customRange.start, customRange.end],
    queryFn: () => fetchOverallKPIs(period, customRange),
    enabled: isCustomReady,
  })

  const { data: journeyKpis, isLoading: journeyLoading } = useQuery({
    queryKey: ['kpis', 'journey', 'admin', period, customRange.start, customRange.end],
    queryFn: () => fetchJourneyKPIs(period, customRange),
    enabled: isCustomReady,
  })

  const { data: starterKpis } = useQuery({
    queryKey: ['kpis', 'user', selectedStarterId, period, customRange.start, customRange.end],
    queryFn: () => fetchUserKPIs(selectedStarterId!, period, customRange),
    enabled: !!selectedStarterId && isCustomReady,
  })

  const { data: allLeads } = useQuery({
    queryKey: ['leads', 'all'],
    queryFn: fetchAllLeads,
    enabled: !!selectedStarterId,
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
    if (!kpiConfig) return true
    return kpiConfig.some((cfg) => cfg.name === 'journey_kpis_panel')
  }, [kpiConfig])

  const thresholdMap = useMemo(() => {
    const map: Record<string, KPIConfigItem> = {}
    kpiConfig?.forEach((cfg) => {
      map[cfg.name] = cfg
    })
    return map
  }, [kpiConfig])

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

  const selectedTeam = useMemo(
    () => teams?.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  )

  const selectedStarter = useMemo(() => {
    if (!teamKpis || !selectedStarterId) return null
    return teamKpis.members.find((m) => m.userId === selectedStarterId) ?? null
  }, [teamKpis, selectedStarterId])

  const filteredMembers = useMemo(() => {
    if (!teamKpis) return []
    const needle = starterSearch.trim().toLowerCase()
    return teamKpis.members.filter((m) =>
      needle ? `${m.firstName} ${m.lastName}`.toLowerCase().includes(needle) : true
    )
  }, [teamKpis, starterSearch])

  const starterLeads = useMemo(() => {
    if (!allLeads || !selectedStarterId) return []
    const needle = leadSearch.trim().toLowerCase()
    return allLeads
      .filter((lead) => lead.ownerUserId === selectedStarterId)
      .filter((lead) =>
        needle ? `${lead.fullName} ${lead.phone}`.toLowerCase().includes(needle) : true
      )
  }, [allLeads, selectedStarterId, leadSearch])

  const sortedStarterLeads = useMemo(() => {
    const direction = leadSort.direction === 'asc' ? 1 : -1
    const statusLabel = (status: string) => statusLabels[status] || status
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

  const handleLeadSort = (key: string) => {
    setLeadSort((prev) => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc',
    }))
  }

  const periodOptions = [
    { value: 'today', label: 'Heute' },
    { value: 'week', label: 'Diese Woche' },
    { value: 'month', label: 'Dieser Monat' },
    { value: 'custom', label: 'Benutzerdefiniert' },
  ]

  const renderPeriodControls = (selectClassName = 'w-full sm:w-40') => (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        options={periodOptions}
        value={period}
        onChange={(e) => setPeriod(e.target.value as TimePeriod)}
        className={selectClassName}
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
  )

  const handleBackToTeams = () => {
    setSelectedTeamId(null)
    setSelectedStarterId(null)
    setStarterSearch('')
    setLeadSearch('')
  }

  const handleBackToTeam = () => {
    setSelectedStarterId(null)
    setLeadSearch('')
  }

  // Level 1: Teamleiter Overview
  if (!selectedTeamId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-slate-500">Teamleiter-Übersicht</p>
          </div>
          {renderPeriodControls()}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-700">Gesamtübersicht</h2>
          </div>
          {overallKpisLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="py-5">
                    <div className="h-4 bg-slate-200 rounded w-20 mb-2"></div>
                    <div className="h-8 bg-slate-200 rounded w-16"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : overallKpis ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard title="Anrufe gesamt" value={formatNumber(overallKpis.callsMade)} />
              <KPICard
                title="Pickup-Rate (Ø)"
                value={formatPercent(overallKpis.pickupRate)}
                variant={getVariantFor('pickup_rate', overallKpis.pickupRate)}
              />
              <KPICard
                title="Ersttermine gesamt"
                value={formatNumber(overallKpis.firstAppointmentsSet)}
              />
              <KPICard
                title="Abschlüsse gesamt"
                value={formatNumber(overallKpis.closings)}
              />
            </div>
          ) : null}
        </div>

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
          <JourneyKPIsPanel data={journeyKpis} title="Journey-KPIs (Gesamt)" />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
          </CardHeader>
          <CardContent>
            {teamsLoading ? (
              <p className="text-sm text-slate-500">Laden...</p>
            ) : teams && teams.length > 0 ? (
              <div className="space-y-3">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <Users className="h-6 w-6 text-red-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{team.displayName}</p>
                        {team.leadFullName && (
                          <p className="text-sm text-slate-500">
                            Teamleiter: {team.leadFullName}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Keine Teams vorhanden.</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Level 2: Team Overview (Teamleiter Gesamtübersicht)
  if (!selectedStarterId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToTeams}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {selectedTeam?.displayName || 'Team'}
              </h1>
              <p className="text-slate-500">
                {selectedTeam?.leadFullName
                  ? `Teamleiter: ${selectedTeam.leadFullName}`
                  : 'Team-Übersicht'}
              </p>
            </div>
          </div>
          {renderPeriodControls()}
        </div>

        {/* Aggregated Team KPIs */}
        {teamKpisLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="py-5">
                  <div className="h-4 bg-slate-200 rounded w-20 mb-2"></div>
                  <div className="h-8 bg-slate-200 rounded w-16"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : teamKpis ? (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Phone className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-700">Telefonate (Team gesamt)</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard title="Anrufe getätigt" value={formatNumber(teamKpis.aggregated.callsMade)} />
                <KPICard title="Anrufe angenommen" value={formatNumber(teamKpis.aggregated.callsAnswered)} />
                <KPICard
                  title="Pickup-Rate"
                  value={formatPercent(teamKpis.aggregated.pickupRate)}
                  variant={getVariantFor('pickup_rate', teamKpis.aggregated.pickupRate)}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-700">Termine (Team gesamt)</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Ersttermine vereinbart"
                  value={formatNumber(teamKpis.aggregated.firstAppointmentsSet)}
                />
                <KPICard
                  title="Ersttermin-Rate"
                  value={formatPercent(teamKpis.aggregated.firstApptRate)}
                  variant={getVariantFor('first_appt_rate', teamKpis.aggregated.firstApptRate)}
                />
                <KPICard
                  title="Zweittermine vereinbart"
                  value={formatNumber(teamKpis.aggregated.secondAppointmentsSet)}
                />
                <KPICard
                  title="Zweittermin-Rate"
                  value={formatPercent(teamKpis.aggregated.secondApptRate)}
                  variant={getVariantFor('second_appt_rate', teamKpis.aggregated.secondApptRate)}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-700">Abschlüsse (Team gesamt)</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard title="Abschlüsse" value={formatNumber(teamKpis.aggregated.closings)} />
                <KPICard title="Einheiten gesamt" value={formatNumber(teamKpis.aggregated.unitsTotal, 1)} />
                <KPICard
                  title="Ø Einheiten pro Abschluss"
                  value={formatNumber(teamKpis.aggregated.avgUnitsPerClosing, 2)}
                  variant={getVariantFor('avg_units_per_closing', teamKpis.aggregated.avgUnitsPerClosing)}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Team Members (Starters) */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Starter im Team</CardTitle>
              <Input
                placeholder="Starter suchen..."
                value={starterSearch}
                onChange={(e) => setStarterSearch(e.target.value)}
                className="w-full md:w-64"
              />
            </div>
          </CardHeader>
          <CardContent>
            {teamKpisLoading ? (
              <p className="text-sm text-slate-500">Laden...</p>
            ) : filteredMembers.length > 0 ? (
              <div className="space-y-3">
                {filteredMembers.map((member) => (
                  <button
                    key={member.userId}
                    onClick={() => setSelectedStarterId(member.userId)}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <User className="h-5 w-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {member.firstName} {member.lastName}
                        </p>
                        <div className="flex gap-4 text-xs text-slate-500 mt-1">
                          <span>Anrufe: {member.kpis.callsMade}</span>
                          <span>Termine: {member.kpis.firstAppointmentsSet + member.kpis.secondAppointmentsSet}</span>
                          <span>Abschlüsse: {member.kpis.closings}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Keine Starter im Team gefunden.</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Level 3: Starter Detail View
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToTeam}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedStarter ? `${selectedStarter.firstName} ${selectedStarter.lastName}` : 'Starter'}
            </h1>
            <p className="text-slate-500">{selectedTeam?.displayName || 'Team'}</p>
          </div>
        </div>
        {renderPeriodControls()}
      </div>

      {/* Starter KPIs */}
      {starterKpis && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-700">Telefonate</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPICard title="Anrufe getätigt" value={formatNumber(starterKpis.callsMade)} />
              <KPICard title="Anrufe angenommen" value={formatNumber(starterKpis.callsAnswered)} />
              <KPICard
                title="Pickup-Rate"
                value={formatPercent(starterKpis.pickupRate)}
                variant={getVariantFor('pickup_rate', starterKpis.pickupRate)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-700">Termine</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard title="Ersttermine vereinbart" value={formatNumber(starterKpis.firstAppointmentsSet)} />
              <KPICard
                title="Ersttermin-Rate"
                value={formatPercent(starterKpis.firstApptRate)}
                variant={getVariantFor('first_appt_rate', starterKpis.firstApptRate)}
              />
              <KPICard title="Zweittermine vereinbart" value={formatNumber(starterKpis.secondAppointmentsSet)} />
              <KPICard
                title="Zweittermin-Rate"
                value={formatPercent(starterKpis.secondApptRate)}
                variant={getVariantFor('second_appt_rate', starterKpis.secondApptRate)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-700">Abschlüsse</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPICard title="Abschlüsse" value={formatNumber(starterKpis.closings)} />
              <KPICard title="Einheiten gesamt" value={formatNumber(starterKpis.unitsTotal, 1)} />
              <KPICard
                title="Ø Einheiten pro Abschluss"
                value={formatNumber(starterKpis.avgUnitsPerClosing, 2)}
                variant={getVariantFor('avg_units_per_closing', starterKpis.avgUnitsPerClosing)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Starter's Leads */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Kunden des Starters</CardTitle>
            <Input
              placeholder="Kunden suchen..."
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              className="w-full md:w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sortedStarterLeads.length > 0 ? (
            <>
              <div className="md:hidden divide-y divide-slate-100">
                {sortedStarterLeads.map((lead) => (
                  <div key={lead.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{lead.fullName}</p>
                        <p className="text-xs text-slate-500">{lead.phone}</p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          statusPillStyles[lead.currentStatus] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {statusLabels[lead.currentStatus] || lead.currentStatus}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Letzte Aktivität:{' '}
                      {lead.lastActivityAt
                        ? new Date(lead.lastActivityAt).toLocaleString('de-AT', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </p>
                  </div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStarterLeads.map((lead) => (
                      <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">{lead.fullName}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{lead.phone}</td>
                        <td className="py-3 px-4 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              statusPillStyles[lead.currentStatus] || 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {statusLabels[lead.currentStatus] || lead.currentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {lead.lastActivityAt
                            ? new Date(lead.lastActivityAt).toLocaleString('de-AT', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="p-4 text-sm text-slate-500">Keine Kunden vorhanden.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
