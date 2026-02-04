import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Select from './ui/Select'
import Input from './ui/Input'
import { Lead, LeadStatus } from '../types'

const statusColumns: { value: LeadStatus; label: string }[] = [
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

const requiresSchedule = (status: LeadStatus) =>
  status === 'call_scheduled' ||
  status === 'first_appt_scheduled' ||
  status === 'second_appt_scheduled'

interface LeadBoardProps {
  leads: Lead[]
  isEditable?: boolean
  onStatusUpdate: (leadId: number, status: LeadStatus, meta?: Record<string, unknown>) => void
}

export default function LeadBoard({ leads, isEditable = false, onStatusUpdate }: LeadBoardProps) {
  const minDateTime = useMemo(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>()
    statusColumns.forEach((col) => map.set(col.value, []))
    leads.forEach((lead) => {
      map.get(lead.currentStatus)?.push(lead)
    })
    return map
  }, [leads])

  const [draftStatus, setDraftStatus] = useState<Record<number, LeadStatus>>({})
  const [draftSchedule, setDraftSchedule] = useState<Record<number, string>>({})

  const handleUpdate = (lead: Lead) => {
    const status = draftStatus[lead.id] || lead.currentStatus
    const meta: Record<string, unknown> = {}
    if (requiresSchedule(status)) {
      const scheduled = draftSchedule[lead.id]
      if (!scheduled) {
        return
      }
      meta.scheduled_for = new Date(scheduled).toISOString()
    }
    onStatusUpdate(lead.id, status, Object.keys(meta).length ? meta : undefined)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {statusColumns.map((column) => {
        const columnLeads = grouped.get(column.value) || []
        return (
          <div
            key={column.value}
            className="min-w-[240px] max-w-[280px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-700">{column.label}</p>
              <p className="text-xs text-slate-500">{columnLeads.length} Leads</p>
            </div>
            <div className="space-y-3">
              {columnLeads.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-xs text-slate-400">
                  Keine Leads
                </div>
              )}
              {columnLeads.map((lead) => {
                const selectedStatus = draftStatus[lead.id] || lead.currentStatus
                return (
                  <div key={lead.id} className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-sm font-medium text-slate-900">{lead.fullName}</p>
                    <p className="text-xs text-slate-500">{lead.phone}</p>
                    {lead.note && (
                      <p className="mt-2 text-xs text-slate-600 line-clamp-3">{lead.note}</p>
                    )}
                    {isEditable && (
                      <div className="mt-3 space-y-2">
                        <Select
                          label="Status"
                          value={selectedStatus}
                          onChange={(e) =>
                            setDraftStatus((prev) => ({
                              ...prev,
                              [lead.id]: e.target.value as LeadStatus,
                            }))
                          }
                          options={statusColumns.map((status) => ({
                            value: status.value,
                            label: status.label,
                          }))}
                        />
                        {requiresSchedule(selectedStatus) && (
                          <Input
                            label="Datum/Uhrzeit"
                            type="datetime-local"
                            value={draftSchedule[lead.id] || ''}
                            onChange={(e) =>
                              setDraftSchedule((prev) => ({
                                ...prev,
                                [lead.id]: e.target.value,
                              }))
                            }
                            min={minDateTime}
                          />
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={() => handleUpdate(lead)}
                        >
                          Status aktualisieren
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
