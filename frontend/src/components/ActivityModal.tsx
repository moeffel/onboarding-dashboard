import { FormEvent, useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Input from './ui/Input'
import Select from './ui/Select'

type ActivityType = 'call' | 'appointment' | 'closing'

interface ActivityModalProps {
  isOpen: boolean
  initialType?: ActivityType
  onClose: () => void
  onSuccess: () => void
}

const callOutcomeOptions = [
  { value: 'answered', label: 'Angenommen' },
  { value: 'no_answer', label: 'Keine Antwort' },
  { value: 'busy', label: 'Besetzt' },
  { value: 'voicemail', label: 'Mailbox' },
  { value: 'wrong_number', label: 'Falsche Nummer' },
]

const appointmentTypeOptions = [
  { value: 'first', label: 'Ersttermin' },
  { value: 'second', label: 'Zweittermin' },
]

const appointmentResultOptions = [
  { value: 'set', label: 'Vereinbart' },
  { value: 'completed', label: 'Durchgeführt' },
  { value: 'cancelled', label: 'Abgesagt' },
  { value: 'no_show', label: 'No-Show' },
]

function ActivityModal({
  isOpen,
  initialType = 'call',
  onClose,
  onSuccess,
}: ActivityModalProps) {
  const [activityType, setActivityType] = useState<ActivityType>(initialType)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [callData, setCallData] = useState({
    contactRef: '',
    outcome: 'answered',
    notes: '',
  })

  const [appointmentData, setAppointmentData] = useState({
    type: 'first',
    result: 'set',
    notes: '',
  })

  const [closingData, setClosingData] = useState({
    units: '',
    productCategory: '',
    notes: '',
  })

  useEffect(() => {
    if (isOpen) {
      setActivityType(initialType)
      setError(null)
    }
  }, [initialType, isOpen])

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

  if (!isOpen) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      let endpoint = ''
      let payload: Record<string, unknown> = {}

      if (activityType === 'call') {
        endpoint = 'call'
        payload = {
          contactRef: callData.contactRef || undefined,
          outcome: callData.outcome,
          notes: callData.notes || undefined,
        }
      } else if (activityType === 'appointment') {
        endpoint = 'appointment'
        payload = {
          type: appointmentData.type,
          result: appointmentData.result,
          notes: appointmentData.notes || undefined,
        }
      } else {
        endpoint = 'closing'
        payload = {
          units: closingData.units ? Number(closingData.units) : 0,
          productCategory: closingData.productCategory || undefined,
          notes: closingData.notes || undefined,
        }
      }

      const response = await fetch(`/api/events/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.detail || 'Speichern fehlgeschlagen')
      }

      onSuccess()
      onClose()
      setCallData({ contactRef: '', outcome: 'answered', notes: '' })
      setAppointmentData({ type: 'first', result: 'set', notes: '' })
      setClosingData({ units: '', productCategory: '', notes: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/15 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 relative">
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
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {activityType === 'call' && (
            <>
              <Input
                label="Kontakt (optional)"
                value={callData.contactRef}
                onChange={(e) => setCallData({ ...callData, contactRef: e.target.value })}
                placeholder="Kundenname oder Referenz"
              />
              <Select
                label="Ergebnis"
                value={callData.outcome}
                onChange={(e) => setCallData({ ...callData, outcome: e.target.value })}
                options={callOutcomeOptions}
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  Notizen (optional)
                </label>
                <textarea
                  value={callData.notes}
                  onChange={(e) => setCallData({ ...callData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Besondere Hinweise zum Gespräch"
                />
              </div>
            </>
          )}

          {activityType === 'appointment' && (
            <>
              <Select
                label="Terminart"
                value={appointmentData.type}
                onChange={(e) => setAppointmentData({ ...appointmentData, type: e.target.value })}
                options={appointmentTypeOptions}
              />
              <Select
                label="Status"
                value={appointmentData.result}
                onChange={(e) => setAppointmentData({ ...appointmentData, result: e.target.value })}
                options={appointmentResultOptions}
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  Notizen (optional)
                </label>
                <textarea
                  value={appointmentData.notes}
                  onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Was wurde vereinbart?"
                />
              </div>
            </>
          )}

          {activityType === 'closing' && (
            <>
              <Input
                label="Units"
                type="number"
                step="0.1"
                min="0"
                required
                value={closingData.units}
                onChange={(e) => setClosingData({ ...closingData, units: e.target.value })}
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
