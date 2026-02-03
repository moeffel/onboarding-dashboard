import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lead, LeadStatus } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'

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
  contact_established: 'bg-sky-100 text-sky-700',
  first_appt_pending: 'bg-indigo-100 text-indigo-700',
  first_appt_scheduled: 'bg-indigo-100 text-indigo-700',
  first_appt_completed: 'bg-emerald-100 text-emerald-700',
  second_appt_scheduled: 'bg-emerald-100 text-emerald-700',
  second_appt_completed: 'bg-emerald-100 text-emerald-700',
  closed_won: 'bg-green-100 text-green-700',
  closed_lost: 'bg-rose-100 text-rose-700',
}

const statusOptions = [
  { value: 'all', label: 'Alle Status' },
  { value: 'new_cold', label: 'Neu / Kaltakquise' },
  { value: 'call_scheduled', label: 'Anruf geplant' },
  { value: 'contact_established', label: 'Kontakt hergestellt' },
  { value: 'first_appt_pending', label: 'Ersttermin in Klärung' },
  { value: 'first_appt_scheduled', label: 'Ersttermin vereinbart' },
  { value: 'first_appt_completed', label: 'Ersttermin durchgeführt' },
  { value: 'second_appt_scheduled', label: 'Zweittermin vereinbart' },
  { value: 'second_appt_completed', label: 'Zweittermin durchgeführt' },
  { value: 'closed_won', label: 'Abschluss (Won)' },
  { value: 'closed_lost', label: 'Verloren (Lost)' },
]

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
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({})
  const [noteDraft, setNoteDraft] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteSaved, setNoteSaved] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [sortBy, setSortBy] = useState<'last_activity' | 'created_at'>('last_activity')
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
    const filtered = leads.filter((lead) => {
      const matchesStatus =
        statusFilter === 'all' ? true : lead.currentStatus === statusFilter
      const matchesSearch = needle
        ? `${lead.fullName} ${lead.phone} ${lead.email || ''}`
            .toLowerCase()
            .includes(needle)
        : true
      return matchesStatus && matchesSearch
    })
    return filtered.sort((a, b) => {
      const aValue =
        sortBy === 'created_at'
          ? new Date(a.createdAt).getTime()
          : new Date(a.lastActivityAt || a.createdAt).getTime()
      const bValue =
        sortBy === 'created_at'
          ? new Date(b.createdAt).getTime()
          : new Date(b.lastActivityAt || b.createdAt).getTime()
      return bValue - aValue
    })
  }, [leads, search, sortBy, statusFilter])

  useEffect(() => {
    if (!filteredLeads.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && filteredLeads.some((lead) => lead.id === selectedId)) {
      return
    }
    setSelectedId(filteredLeads[0].id)
  }, [filteredLeads, selectedId])

  useEffect(() => {
    setNoteDraft(selectedLead?.note || '')
    setNoteError(null)
    setNoteSaved(null)
  }, [selectedLead?.id, selectedLead?.note])

  const updateNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead) return null
      if (noteDraft.length > 1000) {
        throw new Error('Notiz darf maximal 1000 Zeichen haben')
      }
      const res = await fetch(`/api/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          note: noteDraft.trim() || null,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail || 'Notiz konnte nicht gespeichert werden')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'customers'] })
      setNoteSaved('Notiz gespeichert')
      setNoteError(null)
      setTimeout(() => setNoteSaved(null), 2500)
    },
    onError: (err) => {
      setNoteError(err instanceof Error ? err.message : 'Notiz konnte nicht gespeichert werden')
    },
  })

  const toggleNote = (id: number) => {
    setExpandedNotes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        Fehler beim Laden der Kunden: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kunden</h1>
        <p className="text-slate-500">Übersicht aller Leads und Kundendaten.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Kundenliste</CardTitle>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name, Telefon oder E-Mail"
              />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | LeadStatus)}
                options={statusOptions}
                className="w-full md:w-60"
              />
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'last_activity' | 'created_at')}
                options={[
                  { value: 'last_activity', label: 'Zuletzt aktiv' },
                  { value: 'created_at', label: 'Zuletzt erstellt' },
                ]}
                className="w-full md:w-52"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-slate-500">Lade Kunden...</div>
            ) : filteredLeads.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Telefon</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">E-Mail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => {
                      const isActive = lead.id === selectedLead?.id
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => setSelectedId(lead.id)}
                          className={`border-b border-slate-100 cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-primary-50 ring-1 ring-inset ring-primary-200'
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
                          <td className="py-3 px-4 text-sm text-slate-600">
                            {lead.email || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-sm text-slate-500">Noch keine Kunden erfasst.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kundenmenü</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedLead ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Name</p>
                  <p className="text-sm font-medium text-slate-900">{selectedLead.fullName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Telefon</p>
                  <p className="text-sm text-slate-700">{selectedLead.phone}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">E-Mail</p>
                  <p className="text-sm text-slate-700">{selectedLead.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                  <p className="text-sm text-slate-700">
                    {statusLabels[selectedLead.currentStatus] || selectedLead.currentStatus}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Erstellt am</p>
                  <p className="text-sm text-slate-700">
                    {new Date(selectedLead.createdAt).toLocaleString('de-AT')}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Letzte Aktivität</p>
                  <p className="text-sm text-slate-700">
                    {selectedLead.lastActivityAt
                      ? new Date(selectedLead.lastActivityAt).toLocaleString('de-AT')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Notizen</p>
                  {selectedLead.note ? (
                    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-sm text-slate-700">
                        {expandedNotes[selectedLead.id]
                          ? selectedLead.note
                          : selectedLead.note.length > 180
                            ? `${selectedLead.note.slice(0, 180)}...`
                            : selectedLead.note}
                      </p>
                      {selectedLead.note.length > 180 && (
                        <button
                          type="button"
                          onClick={() => toggleNote(selectedLead.id)}
                          className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                          {expandedNotes[selectedLead.id] ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Keine Notizen hinterlegt.</p>
                  )}
                  <div className="mt-3 space-y-2">
                    {noteError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {noteError}
                      </div>
                    )}
                    {noteSaved && (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                        {noteSaved}
                      </div>
                    )}
                    <textarea
                      value={noteDraft}
                      onChange={(e) => {
                        setNoteDraft(e.target.value)
                        if (noteError) setNoteError(null)
                      }}
                      maxLength={1000}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      rows={4}
                      placeholder="Notiz ergänzen oder aktualisieren"
                    />
                    <div className="text-xs text-slate-400 text-right">
                      {noteDraft.length}/1000
                    </div>
                    <button
                      type="button"
                      onClick={() => updateNoteMutation.mutate()}
                      className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                      disabled={updateNoteMutation.isPending || noteDraft.length > 1000}
                    >
                      {updateNoteMutation.isPending ? 'Speichern...' : 'Notiz speichern'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Wähle einen Kunden aus der Tabelle.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
