import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import KPICard from '../components/KPICard'
import Select from '../components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { formatPercent, formatNumber } from '../lib/utils'
import { TimePeriod, KPIs } from '../types'
import { Users, TrendingUp, AlertCircle } from 'lucide-react'

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

async function fetchTeamKPIs(period: TimePeriod): Promise<TeamKPIsResponse> {
  const response = await fetch(`/api/kpis/team?period=${period}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Team-KPIs konnten nicht geladen werden')
  return response.json()
}

export default function TeamleiterDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('week')
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all')

  const { data: teamData, isLoading, error } = useQuery({
    queryKey: ['kpis', 'team', period],
    queryFn: () => fetchTeamKPIs(period),
  })

  const periodOptions = [
    { value: 'today', label: 'Heute' },
    { value: 'week', label: 'Diese Woche' },
    { value: 'month', label: 'Dieser Monat' },
  ]

  // Coaching hints based on KPIs
  const getCoachingHints = (kpis: KPIs) => {
    const hints: string[] = []
    if (kpis.pickupRate < 0.2) {
      hints.push('Pickup-Rate unter 20% - Anrufzeiten und Pitch überprüfen')
    }
    if (kpis.firstApptRate < 0.1) {
      hints.push('Ersttermin-Rate unter 10% - Gesprächsleitfaden trainieren')
    }
    if (kpis.callsMade < 50 && period === 'week') {
      hints.push('Unter 50 Anrufe pro Woche - Aktivität steigern')
    }
    return hints
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        Fehler beim Laden der Team-KPIs: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Dashboard</h1>
          <p className="text-slate-500">
            {teamData?.teamName || 'Team'} - Übersicht und Coaching
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value as TimePeriod)}
            className="w-40"
          />
          {teamData && (
            <Select
              options={[
                { value: 'all', label: 'Alle Mitglieder' },
                ...teamData.members.map((member) => ({
                  value: member.userId.toString(),
                  label: `${member.firstName} ${member.lastName}`,
                })),
              ]}
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="w-48"
            />
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

          {/* Member Drill-down */}
          {selectedMemberId !== 'all' && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 mb-2">
                Fokus: {teamData.members.find((m) => m.userId.toString() === selectedMemberId)?.firstName}{' '}
                {teamData.members.find((m) => m.userId.toString() === selectedMemberId)?.lastName}
              </h3>
              {teamData.members
                .filter((member) => member.userId.toString() === selectedMemberId)
                .map((member) => (
                  <div key={member.userId} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <KPICard title="Anrufe" value={formatNumber(member.kpis.callsMade)} />
                    <KPICard title="Pickup-Rate" value={formatPercent(member.kpis.pickupRate)} />
                    <KPICard title="Ersttermine" value={formatNumber(member.kpis.firstAppointmentsSet)} />
                    <KPICard title="Ersttermin-Rate" value={formatPercent(member.kpis.firstApptRate)} />
                    <KPICard title="Abschlüsse" value={formatNumber(member.kpis.closings)} />
                    <KPICard title="Units" value={formatNumber(member.kpis.unitsTotal, 1)} />
                  </div>
                ))}
            </div>
          )}

          {/* Team Members */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-500" />
                <CardTitle>Team-Mitglieder</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Name</th>
                      <th className="text-right py-3 px-6 text-sm font-medium text-slate-500">Anrufe</th>
                      <th className="text-right py-3 px-6 text-sm font-medium text-slate-500">Pickup %</th>
                      <th className="text-right py-3 px-6 text-sm font-medium text-slate-500">Ersttermine</th>
                      <th className="text-right py-3 px-6 text-sm font-medium text-slate-500">ET-Rate</th>
                      <th className="text-right py-3 px-6 text-sm font-medium text-slate-500">Abschlüsse</th>
                      <th className="text-right py-3 px-6 text-sm font-medium text-slate-500">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedMemberId === 'all'
                      ? teamData.members
                      : teamData.members.filter((member) => member.userId.toString() === selectedMemberId)
                    ).map((member) => (
                      <tr key={member.userId} className="border-b border-slate-100 hover:bg-slate-50">
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
                          {formatNumber(member.kpis.unitsTotal, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Coaching Hints */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <CardTitle>Coaching-Empfehlungen</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {teamData.members.map((member) => {
                const hints = getCoachingHints(member.kpis)
                if (hints.length === 0) return null
                return (
                  <div key={member.userId} className="mb-4 last:mb-0">
                    <p className="font-medium text-slate-900 mb-1">
                      {member.firstName} {member.lastName}
                    </p>
                    <ul className="space-y-1">
                      {hints.map((hint, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                          {hint}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              {teamData.members.every(m => getCoachingHints(m.kpis).length === 0) && (
                <p className="text-sm text-slate-500">
                  Alle Team-Mitglieder arbeiten gut! Keine spezifischen Coaching-Empfehlungen.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
