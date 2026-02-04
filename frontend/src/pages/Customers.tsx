import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lead, LeadStatus } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import SortableHeader from '../components/ui/SortableHeader'
import { Phone, Calendar, Target, ArrowRight } from 'lucide-react'
import ActivityModal from '../components/ActivityModal'

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

const statusOptionsActive = [
  { value: 'all', label: 'Alle aktiven Status' },
  { value: 'new_cold', label: 'Neu / Kaltakquise' },
  { value: 'call_scheduled', label: 'Anruf geplant' },
  { value: 'contact_established', label: 'Kontakt hergestellt' },
  { value: 'first_appt_pending', label: 'Ersttermin in Klärung' },
  { value: 'first_appt_scheduled', label: 'Ersttermin vereinbart' },
  { value: 'first_appt_completed', label: 'Ersttermin durchgeführt' },
  { value: 'second_appt_scheduled', label: 'Zweittermin vereinbart' },
  { value: 'second_appt_completed', label: 'Zweittermin durchgeführt' },
]

const statusOptionsArchive = [
  { value: 'all', label: 'Alle Archivierten' },
  { value: 'closed_won', label: 'Abschluss (Won)' },
  { value: 'closed_lost', label: 'Verloren (Lost)' },
]

const isClosedStatus = (status: LeadStatus) => status === 'closed_won' || status === 'closed_lost'

// Determine next action based on lead status
function getNextAction(status: LeadStatus): 'call' | 'appointment' | 'closing' | null {
  switch (status) {
    case 'new_cold':
    case 'call_scheduled':
      return 'call'
    case 'contact_established':
    case 'first_appt_pending':
    case 'first_appt_scheduled':
    case 'first_appt_completed':
    case 'second_appt_scheduled':
      return 'appointment'
    case 'second_appt_completed':
      return 'closing'
    case 'closed_won':
    case 'closed_lost':
      return null // No action for closed leads
    default:
      return 'call'
  }
}

function getNextActionLabel(status: LeadStatus): string {
  const action = getNextAction(status)
  switch (action) {
    case 'call':
      return status === 'call_scheduled' ? 'Rückruf erfassen' : 'Anruf erfassen'
    case 'appointment':
      if (['contact_established', 'first_appt_pending', 'first_appt_scheduled'].includes(status)) {
        return 'Ersttermin erfassen'
      }
      if (['first_appt_completed', 'second_appt_scheduled'].includes(status)) {
        return 'Zweittermin erfassen'
      }
      return 'Termin erfassen'
    case 'closing':
      return 'Abschluss erfassen'
    default:
      return ''
  }
}

function getNextActionIcon(status: LeadStatus) {
  const action = getNextAction(status)
  switch (action) {
    case 'call':
      return <Phone className="h-4 w-4" />
    case 'appointment':
      return <Calendar className="h-4 w-4" />
    case 'closing':
      return <Target className="h-4 w-4" />
    default:
      return null
  }
}

async function fetchLeads(): Promise<Lead[]> {
  const response = await fetch('/api/leads', { credentials: 'include' })
  if (!response.ok) throw new Error('Kunden konnten nicht geladen werden')
  return response.json()
}

export default function Customers() {
  const { data: leads, isLoading, error } = useQuery({
    queryKey: ['leads', 'customers'],
    queryFn: fetchLeads,
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'active' | 'archive'>('active')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [leadSort, setLeadSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  })

  // Modal state
  const [isModalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'call' | 'appointment' | 'closing'>('call')
  const [modalLeadId, setModalLeadId] = useState<number | null>(null)

  const queryClient = useQueryClient()

  const selectedLead = useMemo(() => {
    if (!leads || leads.length === 0) return null
    const fallback = leads[0]
    if (!selectedId) return fallback
    return leads.find((lead) => lead.id === selectedId) || fallback
  }, [leads, selectedId])

  const filteredLeads = useMemo(() => {
    if (!leads) return []
    const needle = search.trim().toLowerCase()
    return leads.filter((lead) => {
      const isArchived = isClosedStatus(lead.currentStatus)
      const matchesView = view === 'archive' ? isArchived : !isArchived
      const matchesStatus =
        statusFilter === 'all' ? true : lead.currentStatus === statusFilter
      const matchesSearch = needle
        ? `${lead.fullName} ${lead.phone} ${lead.email || ''}`
            .toLowerCase()
            .includes(needle)
        : true
      return matchesView && matchesStatus && matchesSearch
    })
  }, [leads, search, statusFilter, view])

  const sortedLeads = useMemo(() => {
    const direction = leadSort.direction === 'asc' ? 1 : -1
    const getStatusLabel = (status: LeadStatus) => statusLabels[status] || status
    const getNextActionRank = (lead: Lead) => {
      const action = getNextAction(lead.currentStatus)
      if (action === 'call') return 1
      if (action === 'appointment') return 2
      if (action === 'closing') return 3
      return 4
    }

    const sorted = [...filteredLeads].sort((a, b) => {
      switch (leadSort.key) {
        case 'phone':
          return direction * a.phone.localeCompare(b.phone, 'de-AT')
        case 'status':
          return direction * getStatusLabel(a.currentStatus).localeCompare(getStatusLabel(b.currentStatus), 'de-AT')
        case 'next_action':
          return direction * (getNextActionRank(a) - getNextActionRank(b))
        case 'name':
        default:
          return direction * a.fullName.localeCompare(b.fullName, 'de-AT')
      }
    })
    return sorted
  }, [filteredLeads, leadSort])

  useEffect(() => {
    if (!sortedLeads.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && sortedLeads.some((lead) => lead.id === selectedId)) {
      return
    }
    setSelectedId(sortedLeads[0].id)
  }, [sortedLeads, selectedId])

  useEffect(() => {
    setStatusFilter('all')
  }, [view])

  const handleSort = (key: string) => {
    setLeadSort((prev) => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : 'asc',
    }))
  }

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail || 'Lead konnte nicht gelöscht werden')
      }
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'customers'] })
      queryClient.invalidateQueries({ queryKey: ['leads', 'calendar', 'month'] })
      setSelectedId(null)
    },
    onError: (err) => {
      alert(err instanceof Error ? err.message : 'Lead konnte nicht gelöscht werden')
    },
  })

  const handleLeadAction = (lead: Lead) => {
    const action = getNextAction(lead.currentStatus)
    if (!action) return
    setModalLeadId(lead.id)
    setModalType(action)
    setModalOpen(true)
  }

  const handleDeleteLead = (lead: Lead) => {
    if (!confirm(`Lead "${lead.fullName}" wirklich löschen?`)) return
    deleteLeadMutation.mutate(lead.id)
  }

  const handleActivitySaved = () => {
    queryClient.invalidateQueries({ queryKey: ['leads', 'customers'] })
    queryClient.invalidateQueries({ queryKey: ['kpis'] })
    queryClient.invalidateQueries({ queryKey: ['events'] })
    queryClient.invalidateQueries({ queryKey: ['leads', 'calendar', 'month'] })
  }

  if (error) {
    return (
      <div className="p-4 bg-sl-red/10 border border-sl-red/30 rounded-lg text-sl-red">
        Fehler beim Laden der Kunden: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kunden</h1>
          <p className="text-slate-500">Übersicht aller Leads und Kundendaten.</p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setView('active')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'active'
                ? 'bg-white text-slate-900 shadow'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Aktiv
          </button>
          <button
            type="button"
            onClick={() => setView('archive')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'archive'
                ? 'bg-white text-slate-900 shadow'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Archiv
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{view === 'archive' ? 'Archiv' : 'Kundenliste'}</CardTitle>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name, Telefon oder E-Mail"
              />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | LeadStatus)}
                options={view === 'archive' ? statusOptionsArchive : statusOptionsActive}
                className="w-full md:w-60"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-slate-500">Lade Kunden...</div>
            ) : sortedLeads.length > 0 ? (
              <>
                <div className="md:hidden divide-y divide-slate-100">
                  {sortedLeads.map((lead) => {
                    const isActive = lead.id === selectedLead?.id
                    const nextAction = getNextAction(lead.currentStatus)
                    return (
                      <div
                        key={lead.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(lead.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedId(lead.id)
                          }
                        }}
                        className={`px-4 py-3 transition-colors ${
                          isActive
                            ? 'bg-sl-red/10 ring-1 ring-inset ring-sl-red/30'
                            : 'hover:bg-slate-50'
                        }`}
                      >
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
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">
                            Erstellt: {new Date(lead.createdAt).toLocaleDateString('de-AT')}
                          </div>
                          <div className="text-xs text-slate-500">
                            Letzte Aktivität: {lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleDateString('de-AT') : '—'}
                          </div>
                          <div className="flex items-center gap-2">
                            {nextAction && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleLeadAction(lead)
                                }}
                                className="flex items-center gap-2"
                              >
                                {getNextActionIcon(lead.currentStatus)}
                                {getNextActionLabel(lead.currentStatus)}
                              </Button>
                            )}
                            {!nextAction && lead.currentStatus === 'closed_won' && (
                              <span className="text-xs text-green-600 font-medium">Abgeschlossen</span>
                            )}
                            {!nextAction && lead.currentStatus === 'closed_lost' && (
                              <span className="text-xs text-slate-500">Archiviert</span>
                            )}
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteLead(lead)
                              }}
                            >
                              Löschen
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[920px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70">
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Name"
                            sortKey="name"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Telefon"
                            sortKey="phone"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Status"
                            sortKey="status"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="text-left py-3 px-4">
                          <SortableHeader
                            label="Nächste Aktion"
                            sortKey="next_action"
                            activeKey={leadSort.key}
                            direction={leadSort.direction}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Erstellt am</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">Letzte Aktivität</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500">Löschen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeads.map((lead) => {
                        const isActive = lead.id === selectedLead?.id
                        const nextAction = getNextAction(lead.currentStatus)
                        return (
                          <tr
                            key={lead.id}
                            onClick={() => setSelectedId(lead.id)}
                            className={`border-b border-slate-100 cursor-pointer transition-colors ${
                              isActive
                                ? 'bg-sl-red/10 ring-1 ring-inset ring-sl-red/30'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-3 px-4 text-sm font-medium text-slate-900">
                              {lead.fullName}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">{lead.phone}</td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                  statusPillStyles[lead.currentStatus] || 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {statusLabels[lead.currentStatus] || lead.currentStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {nextAction && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleLeadAction(lead)
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  {getNextActionIcon(lead.currentStatus)}
                                  {getNextActionLabel(lead.currentStatus)}
                                  <ArrowRight className="h-3 w-3" />
                                </Button>
                              )}
                              {!nextAction && lead.currentStatus === 'closed_won' && (
                                <span className="text-xs text-green-600 font-medium">Abgeschlossen</span>
                              )}
                              {!nextAction && lead.currentStatus === 'closed_lost' && (
                                <span className="text-xs text-slate-500">Archiviert</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {new Date(lead.createdAt).toLocaleDateString('de-AT')}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleDateString('de-AT') : '—'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteLead(lead)
                                }}
                              >
                                Löschen
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-slate-500">
                {view === 'archive' ? 'Keine archivierten Leads.' : 'Noch keine Kunden erfasst.'}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Activity Modal with pre-selected lead */}
      <ActivityModal
        isOpen={isModalOpen}
        initialType={modalType}
        preSelectedLeadId={modalLeadId}
        onClose={() => {
          setModalOpen(false)
          setModalLeadId(null)
        }}
        onSuccess={handleActivitySaved}
      />
    </div>
  )
}
