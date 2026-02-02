import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../lib/utils'
import {
  Users,
  UsersRound,
  Settings,
  FileText,
  UserCheck,
  AlertCircle,
  XCircle,
  Phone,
  Trash2,
  Save,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import { useAuth } from '../hooks/useAuth'
import type { User, Team, KPIConfigItem, AuditLogEntry, UserRole } from '../types'

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
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [approvalRole, setApprovalRole] = useState<Record<number, string>>({})
  const [approvalTeam, setApprovalTeam] = useState<Record<number, string>>({})
  const [approvalStartDate, setApprovalStartDate] = useState<Record<number, string>>({})
  const [approvalNotes, setApprovalNotes] = useState<Record<number, string>>({})
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({})
  const [showRejectForm, setShowRejectForm] = useState<Record<number, boolean>>({})
  const [userEdits, setUserEdits] = useState<Record<number, Partial<User>>>({})

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

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, payload }: { userId: number; payload: Partial<User> }) => {
      const body: Record<string, unknown> = {}
      if (payload.role) body.role = payload.role
      if (payload.status) body.status = payload.status
      if (payload.teamId !== undefined) body.teamId = payload.teamId
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update user')
      return res.json() as Promise<User>
    },
    onSuccess: (_data, variables) => {
      setUserEdits((prev) => {
        const next = { ...prev }
        delete next[variables.userId]
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'pending'] })
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete user')
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'pending'] })
    },
  })

  const roleOptions = [
    { value: 'starter', label: 'Starter' },
    { value: 'teamleiter', label: 'Teamleiter' },
    { value: 'admin', label: 'Admin' },
  ]

  const statusOptions = [
    { value: 'active', label: 'Aktiv' },
    { value: 'pending', label: 'Ausstehend' },
    { value: 'inactive', label: 'Inaktiv' },
  ]

  const teamOptions = [
    { value: '', label: 'Kein Team' },
    ...(teams?.map(t => ({ value: t.id.toString(), label: t.displayName })) || [])
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

  const handleEditChange = (userId: number, field: keyof User, value: string | null) => {
    let parsed: string | number | null = value
    if (field === 'teamId') {
      parsed = value === null || value === '' ? null : Number(value)
    }
    setUserEdits((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: parsed,
      },
    }))
  }

  const handleSave = (user: User) => {
    const edits = userEdits[user.id]
    if (!edits) return
    const payload: Partial<User> = {}
    if (edits.role && edits.role !== user.role) payload.role = edits.role
    if (edits.status && edits.status !== user.status) payload.status = edits.status
    if (edits.teamId !== undefined && edits.teamId !== user.teamId) {
      payload.teamId = edits.teamId
    }
    if (Object.keys(payload).length === 0) {
      setUserEdits((prev) => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      return
    }
    updateUserMutation.mutate({ userId: user.id, payload })
  }

  const handleDeleteUser = (user: User) => {
    if (currentUser && currentUser.id === user.id) {
      alert('Eigener Account kann nicht gelöscht werden.')
      return
    }
    if (window.confirm(`Benutzer ${user.firstName} ${user.lastName} wirklich löschen?`)) {
      deleteUserMutation.mutate(user.id)
    }
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
                          variant="danger"
                          onClick={() => handleReject(user.id)}
                          isLoading={rejectMutation.isPending}
                          disabled={!rejectReason[user.id]?.trim()}
                        >
                          Ablehnen
                        </Button>
                        <Button
                          variant="secondary"
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
                          variant="secondary"
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
                    <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Team</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Status</th>
                    <th className="text-right py-3 px-6 text-sm font-medium text-slate-500">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-6 text-sm font-medium text-slate-900">
                        {user.firstName} {user.lastName}
                      </td>
                      <td className="py-3 px-6 text-sm text-slate-600">{user.email}</td>
                      <td className="py-3 px-6 text-sm text-slate-600">
                        <Select
                          options={roleOptions}
                          value={userEdits[user.id]?.role || user.role}
                          onChange={(e) => handleEditChange(user.id, 'role', e.target.value)}
                        />
                      </td>
                      <td className="py-3 px-6 text-sm text-slate-600">
                        <Select
                          options={teamOptions}
                          value={
                            userEdits[user.id]?.teamId !== undefined
                              ? userEdits[user.id]?.teamId === null
                                ? ''
                                : String(userEdits[user.id]?.teamId)
                              : user.teamId !== null && user.teamId !== undefined
                              ? String(user.teamId)
                              : ''
                          }
                          onChange={(e) =>
                            handleEditChange(
                              user.id,
                              'teamId',
                              e.target.value === '' ? null : e.target.value
                            )
                          }
                        />
                      </td>
                      <td className="py-3 px-6 text-sm text-slate-600">
                        <Select
                          options={statusOptions}
                          value={userEdits[user.id]?.status || user.status}
                          onChange={(e) => handleEditChange(user.id, 'status', e.target.value)}
                        />
                      </td>
                      <td className="py-3 px-6 text-right text-sm text-slate-600">
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!userEdits[user.id]}
                            onClick={() => handleSave(user)}
                            isLoading={updateUserMutation.isPending}
                          >
                            <Save className="h-4 w-4 mr-1" /> Speichern
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteUser(user)}
                            isLoading={deleteUserMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> Löschen
                          </Button>
                        </div>
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
                  <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Teamname</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-slate-500">Teamleiter</th>
                </tr>
              </thead>
              <tbody>
                {teams?.map((team) => (
                  <tr key={team.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-6 text-sm text-slate-600">{team.id}</td>
                    <td className="py-3 px-6 text-sm font-medium text-slate-900">{team.displayName}</td>
                    <td className="py-3 px-6 text-sm text-slate-600">
                      {team.leadFullName || '—'}
                    </td>
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
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Partial<KPIConfigItem>>>({})
  const { data: configs, isLoading } = useQuery({
    queryKey: ['admin', 'kpi-config'],
    queryFn: async () => {
      const res = await fetch('/api/admin/kpi-config', { credentials: 'include' })
      if (!res.ok) throw new Error('KPI-Konfiguration konnte nicht geladen werden')
      return res.json() as Promise<KPIConfigItem[]>
    },
  })

  const mutation = useMutation({
    mutationFn: async ({ name, payload }: { name: string; payload: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/kpi-config/${name}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Speichern fehlgeschlagen')
      return res.json()
    },
    onSuccess: (_data, variables) => {
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[variables.name]
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['admin', 'kpi-config'] })
    },
  })

  const roleLabels: Record<UserRole, string> = {
    starter: 'Starter',
    teamleiter: 'Teamleiter',
    admin: 'Admin',
  }
  const allRoles: UserRole[] = ['starter', 'teamleiter', 'admin']

  const handleThresholdChange = (name: string, field: 'warnThreshold' | 'goodThreshold', value: string) => {
    const parsed = value === '' ? null : Number(value)
    setDrafts((prev) => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: Number.isNaN(parsed) ? null : parsed,
      },
    }))
  }

  const toggleVisibility = (name: string, role: UserRole) => {
    setDrafts((prev) => {
      const current = prev[name]?.visibility ?? configs?.find((cfg) => cfg.name === name)?.visibility ?? allRoles
      const exists = current.includes(role)
      const nextVisibility = exists ? current.filter((r) => r !== role) : [...current, role]
      return {
        ...prev,
        [name]: {
          ...prev[name],
          visibility: nextVisibility,
        },
      }
    })
  }

  const handleSave = (item: KPIConfigItem) => {
    const draft = drafts[item.name]
    if (!draft) return
    const payload: Record<string, unknown> = {}
    if (draft.label && draft.label !== item.label) payload.label = draft.label
    if (draft.description !== undefined && draft.description !== item.description) payload.description = draft.description
    if (draft.warnThreshold !== undefined && draft.warnThreshold !== item.warnThreshold) {
      payload.warnThreshold = draft.warnThreshold
    }
    if (draft.goodThreshold !== undefined && draft.goodThreshold !== item.goodThreshold) {
      payload.goodThreshold = draft.goodThreshold
    }
    if (draft.visibility) {
      payload.visibility = draft.visibility
    }
    mutation.mutate({ name: item.name, payload })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI-Konfiguration</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Laden...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">KPI</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Warnschwelle</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Grünschwelle</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Sichtbar für</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {configs?.map((item) => {
                  const draft = drafts[item.name]
                  const mergedWarn =
                    draft?.warnThreshold !== undefined ? draft.warnThreshold : item.warnThreshold
                  const mergedGood =
                    draft?.goodThreshold !== undefined ? draft.goodThreshold : item.goodThreshold
                  const warnValue = mergedWarn === null || mergedWarn === undefined ? '' : mergedWarn
                  const goodValue = mergedGood === null || mergedGood === undefined ? '' : mergedGood
                  const visibility = draft?.visibility ?? item.visibility
                  return (
                    <tr key={item.name} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-sm text-slate-900">
                        <p className="font-medium">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.description}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        <input
                          type="number"
                          step="0.01"
                          value={warnValue}
                          onChange={(e) => handleThresholdChange(item.name, 'warnThreshold', e.target.value)}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        <input
                          type="number"
                          step="0.01"
                          value={goodValue}
                          onChange={(e) => handleThresholdChange(item.name, 'goodThreshold', e.target.value)}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        <div className="flex flex-wrap gap-2">
                          {allRoles.map((role) => (
                            <label key={role} className="inline-flex items-center gap-1 text-xs font-medium">
                              <input
                                type="checkbox"
                                checked={visibility.includes(role)}
                                onChange={() => toggleVisibility(item.name, role)}
                              />
                              {roleLabels[role]}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!draft}
                          onClick={() => handleSave(item)}
                          isLoading={mutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-1" /> Speichern
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AuditLog() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs?limit=100', { credentials: 'include' })
      if (!res.ok) throw new Error('Audit-Logs konnten nicht geladen werden')
      return res.json() as Promise<AuditLogEntry[]>
    },
  })

  const formatDiff = (diff: string | null) => {
    if (!diff) return '—'
    try {
      const parsed = JSON.parse(diff)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return diff
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit-Log</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Laden...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Zeitpunkt</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">User</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Aktion</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Objekt</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs?.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {new Date(log.createdAt).toLocaleString('de-AT')}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {log.actorUserId ? `User #${log.actorUserId}` : 'System'}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900 uppercase">{log.action}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {log.objectType || '—'} {log.objectId ? `#${log.objectId}` : ''}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <pre className="whitespace-pre-wrap break-words">{formatDiff(log.diff)}</pre>
                    </td>
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
