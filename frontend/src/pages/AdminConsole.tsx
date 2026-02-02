import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../lib/utils'
import { Users, UsersRound, Settings, FileText, UserCheck, AlertCircle, XCircle, Calendar, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'

interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: string
  status: string
  teamId: number | null
  phoneNumber?: string | null
  startDate?: string | null
  approvedById?: number | null
  approvedAt?: string | null
  adminNotes?: string | null
  createdAt?: string | null
}

interface Team {
  id: number
  name: string
  leadUserId: number | null
}

function AdminNav() {
  const { data: pendingUsers } = useQuery({
    queryKey: ['admin', 'users', 'pending'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users/pending', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<User[]>
    },
  })

  const pendingCount = pendingUsers?.length || 0

  const navItems = [
    { to: '/admin/users', label: 'Benutzer', icon: Users, badge: pendingCount > 0 ? pendingCount : null },
    { to: '/admin/teams', label: 'Teams', icon: UsersRound },
    { to: '/admin/kpi-config', label: 'KPI-Konfiguration', icon: Settings },
    { to: '/admin/audit', label: 'Audit-Log', icon: FileText },
  ]

  return (
    <nav className="flex gap-1 mb-6 bg-white rounded-lg p-1 border border-slate-200">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors relative',
              isActive
                ? 'bg-primary-100 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100'
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
          {item.badge && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {item.badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UsersManagement() {
  const queryClient = useQueryClient()
  const [approvalRole, setApprovalRole] = useState<Record<number, string>>({})
  const [approvalTeam, setApprovalTeam] = useState<Record<number, string>>({})
  const [approvalStartDate, setApprovalStartDate] = useState<Record<number, string>>({})
  const [approvalNotes, setApprovalNotes] = useState<Record<number, string>>({})
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({})
  const [showRejectForm, setShowRejectForm] = useState<Record<number, boolean>>({})

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<User[]>
    },
  })

  const { data: pendingUsers } = useQuery({
    queryKey: ['admin', 'users', 'pending'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users/pending', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<User[]>
    },
  })

  const { data: teams } = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      const res = await fetch('/api/admin/teams', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<Team[]>
    },
  })

  const approveMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
      teamId,
      startDate,
      adminNotes
    }: {
      userId: number
      role: string
      teamId?: number
      startDate?: string
      adminNotes?: string
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          teamId: teamId || null,
          startDate: startDate || null,
          adminNotes: adminNotes || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to approve')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: number; reason: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error('Failed to reject')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setShowRejectForm({})
      setRejectReason({})
    },
  })

  const roleOptions = [
    { value: 'starter', label: 'Starter' },
    { value: 'teamleiter', label: 'Teamleiter' },
    { value: 'admin', label: 'Admin' },
  ]

  const teamOptions = [
    { value: '', label: 'Kein Team' },
    ...(teams?.map(t => ({ value: t.id.toString(), label: t.name })) || [])
  ]

  const handleApprove = (userId: number) => {
    const role = approvalRole[userId] || 'starter'
    const teamId = approvalTeam[userId] ? parseInt(approvalTeam[userId]) : undefined
    const startDate = approvalStartDate[userId] || undefined
    const adminNotes = approvalNotes[userId] || undefined
    approveMutation.mutate({ userId, role, teamId, startDate, adminNotes })
  }

  const handleReject = (userId: number) => {
    const reason = rejectReason[userId]
    if (!reason || reason.trim() === '') {
      return
    }
    rejectMutation.mutate({ userId, reason })
  }

  return (
    <div className="space-y-6">
      {/* Pending Users */}
      {pendingUsers && pendingUsers.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-yellow-800">
                Ausstehende Freigaben ({pendingUsers.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingUsers.map((user) => (
                <div key={user.id} className="bg-white p-4 rounded-lg border border-yellow-200">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-medium text-slate-900">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                      {user.phoneNumber && (
                        <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                          <Phone className="h-3 w-3" /> {user.phoneNumber}
                        </p>
                      )}
                      {user.createdAt && (
                        <p className="text-xs text-slate-400 mt-1">
                          Registriert: {new Date(user.createdAt).toLocaleDateString('de-AT')}
                        </p>
                      )}
                    </div>
                  </div>

                  {showRejectForm[user.id] ? (
                    <div className="space-y-3">
                      <textarea
                        placeholder="Ablehnungsgrund eingeben..."
                        value={rejectReason[user.id] || ''}
                        onChange={(e) => setRejectReason({ ...rejectReason, [user.id]: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          onClick={() => handleReject(user.id)}
                          isLoading={rejectMutation.isPending}
                          disabled={!rejectReason[user.id]?.trim()}
                        >
                          Ablehnen
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowRejectForm({ ...showRejectForm, [user.id]: false })}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Select
                          options={roleOptions}
                          value={approvalRole[user.id] || 'starter'}
                          onChange={(e) => setApprovalRole({ ...approvalRole, [user.id]: e.target.value })}
                          label="Rolle"
                        />
                        <Select
                          options={teamOptions}
                          value={approvalTeam[user.id] || ''}
                          onChange={(e) => setApprovalTeam({ ...approvalTeam, [user.id]: e.target.value })}
                          label="Team"
                        />
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Start-Datum</label>
                          <input
                            type="date"
                            value={approvalStartDate[user.id] || ''}
                            onChange={(e) => setApprovalStartDate({ ...approvalStartDate, [user.id]: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Notizen</label>
                          <input
                            type="text"
                            placeholder="Optional..."
                            value={approvalNotes[user.id] || ''}
                            onChange={(e) => setApprovalNotes({ ...approvalNotes, [user.id]: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApprove(user.id)}
                          isLoading={approveMutation.isPending}
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Freischalten
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowRejectForm({ ...showRejectForm, [user.id]: true })}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Ablehnen
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Users */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Benutzer</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-slate-500">Laden...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Name</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">E-Mail</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Rolle</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-6 text-sm font-medium text-slate-900">
                        {user.firstName} {user.lastName}
                      </td>
                      <td className="py-3 px-6 text-sm text-slate-600">{user.email}</td>
                      <td className="py-3 px-6 text-sm text-slate-600 capitalize">{user.role}</td>
                      <td className="py-3 px-6 text-sm">
                        <span className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium',
                          user.status === 'active' && 'bg-green-100 text-green-700',
                          user.status === 'pending' && 'bg-yellow-100 text-yellow-700',
                          user.status === 'inactive' && 'bg-slate-100 text-slate-700',
                          user.status === 'locked' && 'bg-red-100 text-red-700'
                        )}>
                          {user.status === 'active' && 'Aktiv'}
                          {user.status === 'pending' && 'Ausstehend'}
                          {user.status === 'inactive' && 'Inaktiv'}
                          {user.status === 'locked' && 'Gesperrt'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TeamsManagement() {
  const { data: teams, isLoading } = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      const res = await fetch('/api/admin/teams', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<Team[]>
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team-Verwaltung</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Laden...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">ID</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Name</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Teamleiter ID</th>
                </tr>
              </thead>
              <tbody>
                {teams?.map((team) => (
                  <tr key={team.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-6 text-sm text-slate-600">{team.id}</td>
                    <td className="py-3 px-6 text-sm font-medium text-slate-900">{team.name}</td>
                    <td className="py-3 px-6 text-sm text-slate-600">{team.leadUserId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function KPIConfig() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI-Konfiguration</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-500">
          Schwellenwerte und Sichtbarkeit der KPIs konfigurieren.
        </p>
      </CardContent>
    </Card>
  )
}

function AuditLog() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit-Log</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-500">
          Alle Systemaktivitäten protokolliert und durchsuchbar.
        </p>
      </CardContent>
    </Card>
  )
}

export default function AdminConsole() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
        <p className="text-slate-500">System- und Benutzerverwaltung</p>
      </div>

      <AdminNav />

      <Routes>
        <Route index element={<UsersManagement />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="teams" element={<TeamsManagement />} />
        <Route path="kpi-config" element={<KPIConfig />} />
        <Route path="audit" element={<AuditLog />} />
      </Routes>
    </div>
  )
}
