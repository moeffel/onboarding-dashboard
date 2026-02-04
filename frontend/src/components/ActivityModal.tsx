import { FormEvent, useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Input from './ui/Input'
import Select from './ui/Select'
import { CalendarEntry, Lead } from '../types'
import { AppointmentMode, buildAppointmentLocation, parseAppointmentLocation } from '../lib/appointments'

type ActivityType = 'call' | 'appointment' | 'closing'

interface ActivityModalProps {
  isOpen: boolean
  initialType?: ActivityType
  preSelectedLeadId?: number | null
  preSelectedLead?: Lead | null
  onLeadCreated?: (lead: Lead) => void
  onClose: () => void
  onSuccess: () => void
}

const appointmentTypeOptions = [
  { value: 'first', label: 'Ersttermin' },
  { value: 'second', label: 'Zweittermin' },
]

const appointmentResultOptions = [
  { value: 'set', label: 'Vereinbart' },
  { value: 'completed', label: 'Durchgeführt' },
  { value: 'cancelled', label: 'Abgelehnt' },
  { value: 'no_show', label: 'No-Show' },
]

const appointmentModeOptions = [
  { value: 'in_person', label: 'Persönlich' },
  { value: 'online', label: 'Online' },
]

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

const getPreferredAppointmentType = (lead: Lead | null) => {
  if (!lead) return 'first'
  if (['first_appt_completed', 'second_appt_scheduled', 'second_appt_completed'].includes(lead.currentStatus)) {
    return 'second'
  }
  return 'first'
}


const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const formatShortDateTime = (value: string) =>
  new Date(value).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const getNextStepLabel = (status?: string) => {
  switch (status) {
    case 'new_cold':
    case 'call_scheduled':
      return 'Anruf durchführen'
    case 'contact_established':
    case 'first_appt_pending':
      return 'Ersttermin vereinbaren'
    case 'first_appt_scheduled':
      return 'Ersttermin durchführen'
    case 'first_appt_completed':
      return 'Zweittermin vereinbaren'
    case 'second_appt_scheduled':
      return 'Zweittermin durchführen'
    case 'second_appt_completed':
      return 'Abschluss erfassen'
    case 'closed_won':
      return 'Abgeschlossen'
    case 'closed_lost':
      return 'Archiv'
    default:
      return '—'
  }
}

function ActivityModal({
  isOpen,
  initialType = 'call',
  preSelectedLeadId,
  preSelectedLead,
  onLeadCreated,
  onClose,
  onSuccess,
}: ActivityModalProps) {
  const [activityType, setActivityType] = useState<ActivityType>(initialType)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closingCongrats, setClosingCongrats] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>(preSelectedLead ? [preSelectedLead] : [])
  const [leadsLoaded, setLeadsLoaded] = useState(false)
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>(
    preSelectedLeadId ? String(preSelectedLeadId) : (preSelectedLead?.id ? String(preSelectedLead.id) : '')
  )

  const [callData, setCallData] = useState<{
    contactRef: string
    outcome: string
    notes: string
    nextCallAt: string
    appointmentType: string
    appointmentDatetime: string
    appointmentMode: AppointmentMode
    appointmentLocation: string
    leadOnly: boolean
  }>({
    contactRef: '',
    outcome: 'call_scheduled',
    notes: '',
    nextCallAt: '',
    appointmentType: 'first',
    appointmentDatetime: '',
    appointmentMode: 'in_person',
    appointmentLocation: '',
    leadOnly: false,
  })

  const [appointmentData, setAppointmentData] = useState<{
    type: string
    result: string
    notes: string
    datetime: string
    mode: AppointmentMode
    location: string
  }>({
    type: 'first',
    result: 'set',
    notes: '',
    datetime: '',
    mode: 'in_person',
    location: '',
  })

  const [closingData, setClosingData] = useState({
    units: '',
    result: 'won',
    productCategory: '',
    notes: '',
  })

  const [leadData, setLeadData] = useState({
    fullName: '',
    phone: '',
    email: '',
  })

  useEffect(() => {
    if (isOpen) {
      const initialLeadId = preSelectedLeadId ?? preSelectedLead?.id ?? null
      setActivityType(initialType)
      setError(null)
      setClosingCongrats(null)
      setLeadsLoaded(false)
      setCallData({
        contactRef: '',
        outcome: 'call_scheduled',
        notes: '',
        nextCallAt: '',
        appointmentType: 'first',
        appointmentDatetime: '',
        appointmentMode: 'in_person',
        appointmentLocation: '',
        leadOnly: false,
      })
      setAppointmentData({ type: 'first', result: 'set', notes: '', datetime: '', mode: 'in_person', location: '' })
      setClosingData({ units: '', result: 'won', productCategory: '', notes: '' })
      setLeadData({ fullName: '', phone: '', email: '' })
      setSelectedLeadId(initialLeadId ? String(initialLeadId) : '')
      setLeads(preSelectedLead ? [preSelectedLead] : [])
      setCalendarEntries([])
      // Pre-select lead if provided
      fetch('/api/leads', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: Lead[]) => {
          if (preSelectedLead && !data.some((lead) => lead.id === preSelectedLead.id)) {
            setLeads([preSelectedLead, ...data])
          } else {
            setLeads(data)
          }
          // Re-apply selectedLeadId after leads are loaded to ensure it's set
          if (initialLeadId) {
            setSelectedLeadId(String(initialLeadId))
          }
          setLeadsLoaded(true)
        })
        .catch(() => {
          // Even on error, keep the preSelectedLead if provided
          if (preSelectedLead) {
            setLeads([preSelectedLead])
          } else {
            setLeads([])
          }
          if (initialLeadId) {
            setSelectedLeadId(String(initialLeadId))
          }
          setLeadsLoaded(true)
        })
    }
  }, [initialType, isOpen, preSelectedLead, preSelectedLeadId])

  useEffect(() => {
    if (!selectedLeadId && callData.appointmentType === 'second') {
      setCallData((prev) => ({ ...prev, appointmentType: 'first' }))
    }
  }, [callData.appointmentType, selectedLeadId])

  useEffect(() => {
    if (!isOpen) return
    if (selectedLeadId) return
    const fallbackId = preSelectedLeadId ?? preSelectedLead?.id ?? null
    if (fallbackId) {
      setSelectedLeadId(String(fallbackId))
    }
  }, [isOpen, preSelectedLead, preSelectedLeadId, selectedLeadId])

  useEffect(() => {
    if (!isOpen) return
    const fallbackId = preSelectedLeadId ?? preSelectedLead?.id ?? null
    if (!fallbackId) return
    if (String(fallbackId) !== selectedLeadId) {
      setSelectedLeadId(String(fallbackId))
    }
  }, [isOpen, preSelectedLeadId, preSelectedLead, selectedLeadId])

  const canCreateNewLead =
    !(activityType === 'closing' || (activityType === 'appointment' && appointmentData.type === 'second'))

  const filteredLeads = useMemo(() => {
    const selected = selectedLeadId
      ? leads.find((lead) => String(lead.id) === selectedLeadId)
      : null
    if (activityType === 'appointment') {
      if (appointmentData.type === 'second') {
        const base = leads.filter((lead) =>
          ['first_appt_completed', 'second_appt_scheduled'].includes(lead.currentStatus)
        )
        return selected && !base.some((lead) => lead.id === selected.id) ? [...base, selected] : base
      }
      const base = leads.filter((lead) =>
        ['contact_established', 'first_appt_pending', 'first_appt_scheduled'].includes(lead.currentStatus)
      )
      return selected && !base.some((lead) => lead.id === selected.id) ? [...base, selected] : base
    }
    if (activityType === 'closing') {
      const base = leads.filter((lead) => lead.currentStatus === 'second_appt_completed')
      return selected && !base.some((lead) => lead.id === selected.id) ? [...base, selected] : base
    }
    return leads
  }, [activityType, appointmentData.type, leads, selectedLeadId])

  useEffect(() => {
    if (!leadsLoaded) return
    // If preSelectedLead is provided, ensure it's selected
    const fallbackId = preSelectedLeadId ?? preSelectedLead?.id ?? null
    if (!selectedLeadId) {
      if (fallbackId) {
        setSelectedLeadId(String(fallbackId))
        return
      }
      if (!canCreateNewLead && filteredLeads[0]) {
        setSelectedLeadId(String(filteredLeads[0].id))
      }
      return
    }
    if (!filteredLeads.some((lead) => String(lead.id) === selectedLeadId)) {
      const keepSelected = Boolean(preSelectedLeadId || preSelectedLead)
      if (keepSelected) return
      setSelectedLeadId(canCreateNewLead ? '' : (filteredLeads[0] ? String(filteredLeads[0].id) : ''))
    }
  }, [canCreateNewLead, filteredLeads, selectedLeadId, leadsLoaded, preSelectedLead, preSelectedLeadId])

  useEffect(() => {
    if (!isOpen) return
    if (!selectedLeadId) {
      setCalendarEntries([])
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams({
      period: 'all',
      lead_id: selectedLeadId,
    })
    fetch(`/api/leads/calendar?${params.toString()}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: CalendarEntry[]) => setCalendarEntries(data))
      .catch(() => setCalendarEntries([]))
    return () => controller.abort()
  }, [isOpen, selectedLeadId])

  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null
    return leads.find((lead) => String(lead.id) === selectedLeadId) ?? null
  }, [leads, selectedLeadId])

  const leadSelectOptions = useMemo(() => {
    const base = filteredLeads.map((lead) => ({
      value: String(lead.id),
      label: `${lead.fullName} • ${lead.phone}`,
    }))
    if (selectedLeadId && !base.some((opt) => opt.value === selectedLeadId)) {
      const fallback = selectedLead || preSelectedLead
      if (fallback) {
        base.unshift({
          value: String(fallback.id),
          label: `${fallback.fullName} • ${fallback.phone}`,
        })
      }
    }
    return base
  }, [filteredLeads, selectedLeadId, selectedLead, preSelectedLead])

  const minDateTime = useMemo(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    return toLocalDateTimeInput(now.toISOString())
  }, [isOpen])

  const preferredAppointmentType = useMemo(
    () => getPreferredAppointmentType(selectedLead),
    [selectedLead]
  )

  useEffect(() => {
    if (!selectedLead) return
    setAppointmentData((prev) => ({ ...prev, type: preferredAppointmentType }))
    setCallData((prev) => ({ ...prev, appointmentType: preferredAppointmentType }))
  }, [preferredAppointmentType, selectedLead])

  const scheduledEntry = useMemo(() => {
    if (!selectedLead) return null
    const appointmentType = activityType === 'call' ? callData.appointmentType : appointmentData.type
    const status = appointmentType === 'second' ? 'second_appt_scheduled' : 'first_appt_scheduled'
    return (
      calendarEntries
        .filter((entry) => entry.leadId === selectedLead.id && entry.status === status)
        .sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime())[0] ||
      null
    )
  }, [calendarEntries, selectedLead, appointmentData.type, callData.appointmentType, activityType])

  const scheduledCallEntry = useMemo(() => {
    if (!selectedLead) return null
    return (
      calendarEntries
        .filter((entry) => entry.leadId === selectedLead.id && entry.status === 'call_scheduled')
        .sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime())[0] ||
      null
    )
  }, [calendarEntries, selectedLead])

  const activeLabel = useMemo(() => {
    switch (activityType) {
      case 'appointment':
        return 'Termin'
      case 'closing':
        return 'Abschluss'
      default:
        return 'Anruf'
    }
  }, [activityType])

  const callOutcomeOptions = useMemo(() => {
    const appointmentLabel =
      callData.appointmentType === 'second' ? 'Zweittermin angenommen' : 'Ersttermin angenommen'
    return [
      { value: 'call_scheduled', label: 'Anruf geplant' },
      { value: 'answered_appt', label: appointmentLabel },
      { value: 'answered', label: 'Angenommen (kein Termin)' },
      { value: 'no_answer', label: 'Nicht erreicht' },
      { value: 'busy', label: 'Besetzt' },
      { value: 'voicemail', label: 'Mailbox' },
      { value: 'declined', label: 'Abgelehnt' },
      { value: 'wrong_number', label: 'Falsche Nummer' },
    ]
  }, [callData.appointmentType])

  // Check if a call needs to be scheduled (call_scheduled)
  const needsCallSchedule = !callData.leadOnly && callData.outcome === 'call_scheduled'
  // Check if callback is required (no answer, busy, voicemail)
  const needsCallback =
    !callData.leadOnly && ['no_answer', 'busy', 'voicemail'].includes(callData.outcome)
  // Check if appointment scheduling is required (answered with appointment)
  const needsAppointment = !callData.leadOnly && callData.outcome === 'answered_appt'
  // Check if lead will be archived (declined)
  const willArchive = !callData.leadOnly && callData.outcome === 'declined'
  const appointmentTypeLocked = !!selectedLead
  const callAppointmentTypeOptions = selectedLeadId
    ? appointmentTypeOptions
    : appointmentTypeOptions.filter((option) => option.value === 'first')

  useEffect(() => {
    if (!scheduledEntry) return
    if (!appointmentData.datetime) {
      setAppointmentData((prev) => ({
        ...prev,
        datetime: toLocalDateTimeInput(scheduledEntry.scheduledFor),
      }))
    }
    if (!appointmentData.location && scheduledEntry.location) {
      const parsed = parseAppointmentLocation(scheduledEntry.location)
      setAppointmentData((prev) => ({
        ...prev,
        mode: parsed.mode,
        location: parsed.detail,
      }))
    }
    if (needsAppointment && !callData.appointmentDatetime) {
      setCallData((prev) => ({
        ...prev,
        appointmentDatetime: toLocalDateTimeInput(scheduledEntry.scheduledFor),
      }))
    }
    if (needsAppointment && !callData.appointmentLocation && scheduledEntry.location) {
      const parsed = parseAppointmentLocation(scheduledEntry.location)
      setCallData((prev) => ({
        ...prev,
        appointmentMode: parsed.mode,
        appointmentLocation: parsed.detail,
      }))
    }
  }, [
    scheduledEntry,
    appointmentData.datetime,
    appointmentData.location,
    needsAppointment,
    callData.appointmentDatetime,
    callData.appointmentLocation,
  ])

  useEffect(() => {
    if (!scheduledCallEntry) return
    if (callData.outcome === 'call_scheduled' && !callData.nextCallAt) {
      setCallData((prev) => ({
        ...prev,
        nextCallAt: toLocalDateTimeInput(scheduledCallEntry.scheduledFor),
      }))
    }
  }, [scheduledCallEntry, callData.outcome, callData.nextCallAt])

  if (!isOpen) return null

  const callOutcomeHint = () => {
    if (callData.leadOnly) {
      return 'Lead wird angelegt, ohne einen Anruf zu dokumentieren.'
    }
    if (needsAppointment) {
      return callData.appointmentType === 'second'
        ? 'Zweittermin wird nach dem Gespräch direkt geplant.'
        : 'Ersttermin wird nach dem Gespräch direkt geplant.'
    }
    if (needsCallSchedule) {
      return 'Bitte Anruftermin setzen, damit der Lead im Kalender erscheint.'
    }
    if (needsCallback) {
      return 'Bitte Rückruftermin setzen, damit der Lead im Kalender erscheint.'
    }
    if (willArchive) {
      return 'Abgelehnte Leads werden automatisch archiviert.'
    }
    if (callData.outcome === 'wrong_number') {
      return 'Falsche Nummer führt zur Archivierung.'
    }
    if (callData.outcome === 'answered') {
      return 'Kontakt hergestellt. Als nächstes Ersttermin anbieten.'
    }
    return ''
  }

  const normalizeDateTime = (value: string, errorMessage: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new Error(errorMessage)
    }
    return value
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      // WORKAROUND: Use preSelectedLead.id if available, otherwise fall back to selectedLeadId
      let leadId = preSelectedLead?.id ?? (selectedLeadId ? Number(selectedLeadId) : null)
      if (!leadId) {
        if (activityType === 'closing') {
          throw new Error('Abschluss kann nur für bestehende Leads erfasst werden')
        }
        if (activityType === 'appointment' && appointmentData.type === 'second') {
          throw new Error('Zweittermin kann nur für bestehende Leads erfasst werden')
        }
        if (activityType === 'call' && callData.appointmentType === 'second') {
          throw new Error('Zweittermin kann nur für bestehende Leads erfasst werden')
        }
        if (!leadData.fullName.trim() || !leadData.phone.trim()) {
          throw new Error('Name und Telefonnummer sind Pflichtfelder')
        }
        const leadResponse = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            fullName: leadData.fullName.trim(),
            phone: leadData.phone.trim(),
            email: leadData.email.trim() || undefined,
          }),
        })
        if (!leadResponse.ok) {
          const detail = await leadResponse.json().catch(() => null)
          throw new Error(detail?.detail || 'Lead konnte nicht angelegt werden')
        }
        const createdLead = (await leadResponse.json()) as Lead
        leadId = createdLead.id
        if (activityType === 'call' && callData.leadOnly) {
          onLeadCreated?.(createdLead)
          onSuccess()
          onClose()
          resetForm()
          return
        }
      }

      let endpoint = ''
      let payload: Record<string, unknown> = {}

      if (activityType === 'call') {
        // Validate required fields based on outcome
        if (needsCallSchedule && !callData.nextCallAt) {
          throw new Error('Anrufdatum ist erforderlich bei geplanten Anrufen')
        }
        if (needsCallback && !callData.nextCallAt) {
          throw new Error('Rückrufdatum ist erforderlich wenn keine Antwort')
        }
        if (needsAppointment && !callData.appointmentDatetime) {
          throw new Error('Termindatum ist erforderlich bei Termin angenommen')
        }

        endpoint = 'call'
        // Map answered_appt back to answered for backend
        const backendOutcome =
          callData.outcome === 'answered_appt'
            ? 'answered'
            : callData.outcome === 'call_scheduled'
              ? 'no_answer'
              : callData.outcome
        payload = {
          contactRef: callData.contactRef || undefined,
          outcome: backendOutcome,
          notes: callData.notes || undefined,
          leadId,
          nextCallAt: callData.nextCallAt
            ? normalizeDateTime(callData.nextCallAt, 'Anrufdatum ist ungültig')
            : undefined,
        }

        // Submit the call first
        const callResponse = await fetch(`/api/events/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })

        if (!callResponse.ok) {
          const payload = await callResponse.json().catch(() => null)
          const detail = payload?.detail ?? payload
          const message =
            typeof detail === 'string'
              ? detail
              : Array.isArray(detail)
                ? detail.map((item) => item?.msg || JSON.stringify(item)).join(', ')
                : detail
                  ? JSON.stringify(detail)
                  : 'Speichern fehlgeschlagen'
          throw new Error(message)
        }

        // If appointment was accepted, create the appointment
        if (needsAppointment && callData.appointmentDatetime) {
          const appointmentPayload = {
            type: callData.appointmentType,
            result: 'set',
            datetime: normalizeDateTime(callData.appointmentDatetime, 'Termin Datum/Uhrzeit ist ungültig'),
            notes: callData.notes || undefined,
            location: buildAppointmentLocation(callData.appointmentMode, callData.appointmentLocation),
            leadId,
          }
          const apptResponse = await fetch('/api/events/appointment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(appointmentPayload),
          })
          if (!apptResponse.ok) {
            console.warn('Termin konnte nicht automatisch erstellt werden')
          }
        }

        // If declined, archive the lead
        if (willArchive && leadId) {
          await fetch(`/api/leads/${leadId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              toStatus: 'closed_lost',
              reason: 'declined',
            }),
          })
        }

        onSuccess()
        onClose()
        resetForm()
        return
      } else if (activityType === 'appointment') {
        if (appointmentData.result === 'set' && !appointmentData.datetime) {
          throw new Error('Datum ist für vereinbarte Termine erforderlich')
        }
        endpoint = 'appointment'
        payload = {
          type: appointmentData.type,
          result: appointmentData.result,
          notes: appointmentData.notes || undefined,
          location: buildAppointmentLocation(appointmentData.mode, appointmentData.location),
          datetime: appointmentData.datetime
            ? normalizeDateTime(appointmentData.datetime, 'Termin Datum/Uhrzeit ist ungültig')
            : undefined,
          leadId,
        }
      } else {
        endpoint = 'closing'
        payload = {
          units: closingData.result === 'no_sale' ? 0 : (closingData.units ? Number(closingData.units) : 0),
          result: closingData.result,
          productCategory: closingData.productCategory || undefined,
          notes: closingData.notes || undefined,
          leadId,
        }
      }

      const response = await fetch(`/api/events/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = payload?.detail ?? payload
        const message =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item?.msg || JSON.stringify(item)).join(', ')
              : detail
                ? JSON.stringify(detail)
                : 'Speichern fehlgeschlagen'
        throw new Error(message)
      }

      if (activityType === 'appointment') {
        if (appointmentData.type === 'second' && appointmentData.result === 'completed') {
          onSuccess()
          setActivityType('closing')
          setClosingData({ units: '', result: 'won', productCategory: '', notes: '' })
          if (leadId) setSelectedLeadId(String(leadId))
          return
        }
        if (appointmentData.type === 'first' && appointmentData.result === 'completed') {
          onSuccess()
          setActivityType('appointment')
          setAppointmentData({
            type: 'second',
            result: 'set',
            notes: '',
            datetime: '',
            mode: 'in_person',
            location: '',
          })
          return
        }
      }

      if (activityType === 'closing' && closingData.result === 'won' && Number(closingData.units || 0) > 0) {
        setClosingCongrats(`Herzlichen Glückwunsch zu ${closingData.units} Einheiten!`)
        onSuccess()
        setTimeout(() => {
          onClose()
          resetForm()
          setClosingCongrats(null)
        }, 1500)
        return
      }

      onSuccess()
      onClose()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setCallData({
      contactRef: '',
      outcome: 'call_scheduled',
      notes: '',
      nextCallAt: '',
      appointmentType: 'first',
      appointmentDatetime: '',
      appointmentMode: 'in_person',
      appointmentLocation: '',
      leadOnly: false,
    })
    setAppointmentData({ type: 'first', result: 'set', notes: '', datetime: '', mode: 'in_person', location: '' })
    setClosingData({ units: '', result: 'won', productCategory: '', notes: '' })
    setLeadData({ fullName: '', phone: '', email: '' })
    setSelectedLeadId('')
  }

  return (
    <div className="fixed inset-0 bg-black/15 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"
        >
          ✕
        </button>

        <div className="mb-4">
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">
            Aktivität erfassen
          </p>
          <h2 className="text-2xl font-semibold text-slate-900">
            {activeLabel} dokumentieren
          </h2>
        </div>

        <div className="flex gap-2 mb-6">
          {(['call', 'appointment', 'closing'] as ActivityType[]).map((type) => (
            <Button
              key={type}
              type="button"
              variant={activityType === type ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => setActivityType(type)}
            >
              {type === 'call' && 'Anruf'}
              {type === 'appointment' && 'Termin'}
              {type === 'closing' && 'Abschluss'}
            </Button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-sl-red/30 bg-sl-red/10 px-3 py-2 text-sm text-sl-red">
            {error}
          </div>
        )}
        {closingCongrats && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 text-center">
            {closingCongrats}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Lead</p>
            {/* WORKAROUND: If preSelectedLead is provided, show it directly instead of dropdown */}
            {preSelectedLead ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-sm font-medium text-slate-900">{preSelectedLead.fullName}</p>
                  <p className="text-xs text-slate-500">{preSelectedLead.phone}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 flex items-center justify-between">
                  <span>Status: {statusLabels[preSelectedLead.currentStatus] || preSelectedLead.currentStatus}</span>
                  <span>Nächster Schritt: {getNextStepLabel(preSelectedLead.currentStatus)}</span>
                </div>
              </>
            ) : (
              <>
                <Select
                  label={selectedLeadId ? 'Lead' : 'Lead auswählen'}
                  value={selectedLeadId}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  options={[
                    ...(canCreateNewLead ? [{ value: '', label: 'Neuen Lead anlegen' }] : []),
                    ...leadSelectOptions,
                  ]}
                />
                {!selectedLeadId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="Name (Pflicht)"
                      value={leadData.fullName}
                      onChange={(e) => setLeadData({ ...leadData, fullName: e.target.value })}
                      required
                    />
                    <Input
                      label="Telefonnummer (Pflicht)"
                      value={leadData.phone}
                      onChange={(e) => setLeadData({ ...leadData, phone: e.target.value })}
                      required
                    />
                    <Input
                      label="E-Mail (optional)"
                      value={leadData.email}
                      onChange={(e) => setLeadData({ ...leadData, email: e.target.value })}
                    />
                  </div>
                )}
                {selectedLead && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 flex items-center justify-between">
                    <span>Status: {statusLabels[selectedLead.currentStatus] || selectedLead.currentStatus}</span>
                    <span>Nächster Schritt: {getNextStepLabel(selectedLead.currentStatus)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {activityType === 'call' && (
            <>
              {!selectedLeadId && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    id="lead-only"
                    type="checkbox"
                    checked={callData.leadOnly}
                    onChange={(e) => setCallData({ ...callData, leadOnly: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-sl-red focus:ring-sl-red"
                  />
                  <label htmlFor="lead-only">Nur Lead anlegen (ohne Anruf)</label>
                </div>
              )}

              <Select
                label="Ergebnis"
                value={callData.outcome}
                onChange={(e) => setCallData({ ...callData, outcome: e.target.value })}
                options={callOutcomeOptions}
                disabled={callData.leadOnly}
              />
              {callOutcomeHint() && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {callOutcomeHint()}
                </div>
              )}

              {/* Show appointment field when "Termin angenommen" */}
              {needsAppointment && (
                <div className="rounded-lg border border-sl-red/30 bg-sl-red/10 p-4 space-y-3">
                  <p className="text-sm font-medium text-sl-red">
                    {callData.appointmentType === 'second' ? 'Zweittermin vereinbaren' : 'Ersttermin vereinbaren'}
                  </p>
                  {scheduledEntry && (
                    <div className="rounded-md border border-sl-red/30 bg-white px-3 py-2 text-xs text-sl-red space-y-1">
                      <p className="font-semibold">Bereits terminiert</p>
                      <p>{formatShortDateTime(scheduledEntry.scheduledFor)}</p>
                      {scheduledEntry.location && <p>Ort: {scheduledEntry.location}</p>}
                    </div>
                  )}
                  <Select
                    label="Terminart"
                    value={callData.appointmentType}
                    onChange={(e) => setCallData({ ...callData, appointmentType: e.target.value })}
                    options={callAppointmentTypeOptions}
                    disabled={appointmentTypeLocked || !selectedLeadId}
                  />
                  <Input
                    label="Termin Datum/Uhrzeit (Pflicht)"
                    type="datetime-local"
                    value={callData.appointmentDatetime}
                    onChange={(e) => setCallData({ ...callData, appointmentDatetime: e.target.value })}
                    min={minDateTime}
                    required
                  />
                  <Select
                    label="Terminformat"
                    value={callData.appointmentMode}
                    onChange={(e) =>
                      setCallData({ ...callData, appointmentMode: e.target.value as AppointmentMode })
                    }
                    options={appointmentModeOptions}
                  />
                  {callData.appointmentMode === 'in_person' && (
                    <Input
                      label="Ort (optional)"
                      value={callData.appointmentLocation}
                      onChange={(e) => setCallData({ ...callData, appointmentLocation: e.target.value })}
                      placeholder="z. B. Büro, Filiale, Café"
                    />
                  )}
                </div>
              )}

              {/* Show call scheduling field when "Anruf geplant" */}
              {needsCallSchedule && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-amber-700">
                    {scheduledCallEntry
                      ? `Anruf geplant am ${formatShortDateTime(scheduledCallEntry.scheduledFor)}`
                      : 'Anruf planen (Pflicht)'}
                  </p>
                  <Input
                    label="Anruf Datum/Uhrzeit"
                    type="datetime-local"
                    value={callData.nextCallAt}
                    onChange={(e) => setCallData({ ...callData, nextCallAt: e.target.value })}
                    min={minDateTime}
                    required
                  />
                  <p className="text-xs text-amber-700/80">
                    Bei „Anruf geplant" ist ein Anruftermin erforderlich.
                  </p>
                </div>
              )}

              {/* Show callback field when no answer/busy/voicemail */}
              {needsCallback && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-amber-700">
                    {scheduledCallEntry
                      ? `Rückruf geplant am ${formatShortDateTime(scheduledCallEntry.scheduledFor)}`
                      : 'Rückruf planen (Pflicht)'}
                  </p>
                  <Input
                    label="Rückruf Datum/Uhrzeit"
                    type="datetime-local"
                    value={callData.nextCallAt}
                    onChange={(e) => setCallData({ ...callData, nextCallAt: e.target.value })}
                    min={minDateTime}
                    required
                  />
                  <p className="text-xs text-amber-700/80">
                    Bei „Nicht erreicht", „Besetzt" oder „Mailbox" ist ein Rückruf erforderlich.
                  </p>
                </div>
              )}

              {/* Show archive warning when declined */}
              {willArchive && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-medium text-rose-700">
                    Der Lead wird ins Archiv verschoben
                  </p>
                  <p className="text-xs text-rose-600 mt-1">
                    Abgelehnte Leads werden automatisch archiviert.
                  </p>
                </div>
              )}

              {!needsCallback && !needsAppointment && callData.outcome === 'answered' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">Kontakt hergestellt</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Der Lead bleibt aktiv. Nächster Schritt: Ersttermin anbieten.
                  </p>
                </div>
              )}

              <Input
                label="Kontakt (optional)"
                value={callData.contactRef}
                onChange={(e) => setCallData({ ...callData, contactRef: e.target.value })}
                placeholder="Kundenname oder Referenz"
              />

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  Notizen (optional)
                </label>
                <textarea
                  value={callData.notes}
                  onChange={(e) => setCallData({ ...callData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sl-red"
                  rows={3}
                  placeholder="Besondere Hinweise zum Gespräch"
                />
              </div>
            </>
          )}

          {activityType === 'appointment' && (
            <>
              {scheduledEntry && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-700">Geplanter Termin</p>
                  <p>{formatShortDateTime(scheduledEntry.scheduledFor)}</p>
                  {scheduledEntry.location && <p>Ort: {scheduledEntry.location}</p>}
                </div>
              )}
              <Select
                label="Terminart"
                value={appointmentData.type}
                onChange={(e) => setAppointmentData({ ...appointmentData, type: e.target.value })}
                options={appointmentTypeOptions}
                disabled={appointmentTypeLocked}
              />
              <Select
                label="Status"
                value={appointmentData.result}
                onChange={(e) => setAppointmentData({ ...appointmentData, result: e.target.value })}
                options={appointmentResultOptions}
              />
              {appointmentData.result === 'completed' && appointmentData.type === 'first' && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                  Ersttermin abgeschlossen. Nächster Schritt: Zweittermin vereinbaren.
                </div>
              )}
              {appointmentData.result === 'completed' && appointmentData.type === 'second' && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                  Zweittermin abgeschlossen. Nächster Schritt: Abschluss erfassen.
                </div>
              )}
              {appointmentData.result === 'cancelled' && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                  Der Lead wird als verloren markiert und archiviert.
                </div>
              )}
              {appointmentData.result === 'no_show' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  No-show wird als Drop-Off gemessen. Termin bleibt als ausstehend geführt.
                </div>
              )}
              <Input
                label="Termin Datum/Uhrzeit"
                type="datetime-local"
                value={appointmentData.datetime}
                onChange={(e) => setAppointmentData({ ...appointmentData, datetime: e.target.value })}
                min={minDateTime}
                required={appointmentData.result === 'set'}
              />
              <Select
                label="Terminformat"
                value={appointmentData.mode}
                onChange={(e) =>
                  setAppointmentData({ ...appointmentData, mode: e.target.value as AppointmentMode })
                }
                options={appointmentModeOptions}
              />
              {appointmentData.mode === 'in_person' && (
                <Input
                  label="Ort (optional)"
                  value={appointmentData.location}
                  onChange={(e) => setAppointmentData({ ...appointmentData, location: e.target.value })}
                  placeholder="z. B. Büro, Filiale, Café"
                />
              )}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  Notizen (optional)
                </label>
                <textarea
                  value={appointmentData.notes}
                  onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sl-red"
                  rows={3}
                  placeholder="Was wurde vereinbart?"
                />
              </div>
            </>
          )}

          {activityType === 'closing' && (
            <>
              <Select
                label="Ergebnis"
                value={closingData.result}
                onChange={(e) => {
                  const value = e.target.value
                  setClosingData((prev) => ({
                    ...prev,
                    result: value,
                    units: value === 'no_sale' ? '' : prev.units,
                  }))
                }}
                options={[
                  { value: 'won', label: 'Verkauf' },
                  { value: 'no_sale', label: 'Kein Verkauf' },
                ]}
              />
              <Input
                label="Einheiten"
                type="number"
                step="0.1"
                min="0"
                required
                value={closingData.units}
                onChange={(e) => setClosingData({ ...closingData, units: e.target.value })}
                disabled={closingData.result === 'no_sale'}
              />
              <Input
                label="Produktkategorie (optional)"
                value={closingData.productCategory}
                onChange={(e) => setClosingData({ ...closingData, productCategory: e.target.value })}
                placeholder="z. B. Vorsorge, Investment"
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  Notizen (optional)
                </label>
                <textarea
                  value={closingData.notes}
                  onChange={(e) => setClosingData({ ...closingData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sl-red"
                  rows={3}
                  placeholder="Details zum Abschluss"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Speichern
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ActivityModal
