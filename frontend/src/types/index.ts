export type UserRole = 'starter' | 'teamleiter' | 'admin'
export type UserStatus = 'pending' | 'active' | 'inactive' | 'locked'

export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: UserRole
  teamId: number | null
  status: UserStatus
  // Extended profile fields
  phoneNumber?: string | null
  employeeId?: string | null
  startDate?: string | null
  privacyConsentAt?: string | null
  termsAcceptedAt?: string | null
  // Approval tracking
  approvedById?: number | null
  approvedAt?: string | null
  adminNotes?: string | null
}

export interface Team {
  id: number
  name: string
  leadUserId: number | null
}

export interface CallEvent {
  id: number
  userId: number
  datetime: string
  contactRef: string | null
  outcome: 'answered' | 'no_answer' | 'busy' | 'voicemail' | 'wrong_number'
  notes: string | null
}

export interface AppointmentEvent {
  id: number
  userId: number
  type: 'first' | 'second'
  datetime: string
  result: 'set' | 'cancelled' | 'no_show' | 'completed'
  notes: string | null
}

export interface ClosingEvent {
  id: number
  userId: number
  datetime: string
  units: number
  productCategory: string | null
  notes: string | null
}

export interface KPIs {
  callsMade: number
  callsAnswered: number
  pickupRate: number
  firstAppointmentsSet: number
  firstApptRate: number
  secondAppointmentsSet: number
  secondApptRate: number
  closings: number
  unitsTotal: number
  avgUnitsPerClosing: number
}

export type TimePeriod = 'today' | 'week' | 'month'
