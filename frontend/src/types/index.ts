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
  createdAt?: string | null
}

export interface Team {
  id: number
  name: string
  leadUserId: number | null
  displayName: string
  leadFullName?: string | null
}

export interface CallEvent {
  id: number
  userId: number
  datetime: string
  contactRef: string | null
  outcome: 'answered' | 'no_answer' | 'declined' | 'busy' | 'voicemail' | 'wrong_number'
  notes: string | null
  leadId?: number | null
}

export interface AppointmentEvent {
  id: number
  userId: number
  type: 'first' | 'second'
  datetime: string
  result: 'set' | 'cancelled' | 'no_show' | 'completed'
  notes: string | null
  leadId?: number | null
  location?: string | null
}

export interface ClosingEvent {
  id: number
  userId: number
  datetime: string
  units: number
  result?: 'won' | 'no_sale'
  productCategory: string | null
  notes: string | null
  leadId?: number | null
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

export type LeadStatus =
  | 'new_cold'
  | 'call_scheduled'
  | 'contact_established'
  | 'first_appt_pending'
  | 'first_appt_scheduled'
  | 'first_appt_completed'
  | 'second_appt_scheduled'
  | 'second_appt_completed'
  | 'closed_won'
  | 'closed_lost'

export interface Lead {
  id: number
  ownerUserId: number
  teamId: number
  fullName: string
  phone: string
  email?: string | null
  currentStatus: LeadStatus
  statusUpdatedAt: string
  lastActivityAt?: string | null
  tags: string[]
  note?: string | null
  createdAt: string
}

export interface CalendarEntry {
  leadId: number
  title: string
  scheduledFor: string
  status: LeadStatus
  ownerUserId: number
  teamId: number
  location?: string | null
}

export interface FunnelKPIs {
  leadsCreated: number
  statusCounts: Record<string, number>
  conversions: Record<string, number>
  dropOffs: Record<string, number>
  timeMetrics: Record<string, number>
}

export type TimePeriod = 'today' | 'week' | 'month' | 'custom'

export interface KPIConfigItem {
  name: string
  label: string
  description?: string | null
  formula?: string | null
  warnThreshold?: number | null
  goodThreshold?: number | null
  visibility: UserRole[]
}

export interface AuditLogEntry {
  id: number
  actorUserId: number | null
  actorName?: string | null
  action: string
  objectType: string | null
  objectId: number | null
  objectLabel?: string | null
  diff: string | null
  createdAt: string
}
