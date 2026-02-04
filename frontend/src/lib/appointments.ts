export type AppointmentMode = 'phone' | 'online' | 'in_person'

export const buildAppointmentLocation = (mode: AppointmentMode, detail: string) => {
  if (mode === 'phone') return 'Persönlich'
  if (mode === 'online') return 'Online'
  if (mode === 'in_person') {
    const trimmed = detail.trim()
    return trimmed ? `Persönlich • ${trimmed}` : 'Persönlich'
  }
  return detail.trim() || undefined
}

export const parseAppointmentLocation = (location?: string | null) => {
  if (!location) {
    return { mode: 'in_person' as AppointmentMode, detail: '', label: 'Persönlich' }
  }
  if (location.startsWith('Telefonisch')) {
    return { mode: 'in_person' as AppointmentMode, detail: '', label: 'Persönlich' }
  }
  if (location.startsWith('Online')) {
    return { mode: 'online' as AppointmentMode, detail: '', label: 'Online' }
  }
  if (location.startsWith('Persönlich')) {
    const detail = location.split('•')[1]?.trim() ?? ''
    return { mode: 'in_person' as AppointmentMode, detail, label: 'Persönlich' }
  }
  return { mode: 'in_person' as AppointmentMode, detail: location, label: 'Persönlich' }
}

export const formatAppointmentLabel = (location?: string | null) => {
  const parsed = parseAppointmentLocation(location)
  return parsed.detail ? `${parsed.label} • ${parsed.detail}` : parsed.label
}
