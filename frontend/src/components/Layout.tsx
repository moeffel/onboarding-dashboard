import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  BarChart3,
  Menu,
  X
} from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['starter', 'teamleiter', 'admin'],
      children: [
        { name: 'Kunden', href: '/customers', roles: ['starter'] },
      ],
    },
    { name: 'Team', href: '/team', icon: Users, roles: ['teamleiter', 'admin'] },
    { name: 'Admin', href: '/admin', icon: Settings, roles: ['admin'] },
  ]

  const filteredNav = navigation.filter(
    (item) => user && item.roles.includes(user.role)
  )

  const activeLabel = useMemo(() => {
    const activeItem = filteredNav.find((item) => location.pathname.startsWith(item.href))
    if (!activeItem) return 'Dashboard'
    const visibleChildren =
      activeItem.children?.filter((child) => user && child.roles.includes(user.role)) || []
    const activeChild = visibleChildren.find((child) => location.pathname.startsWith(child.href))
    return activeChild?.name || activeItem.name
  }, [filteredNav, location.pathname, user])

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-transparent">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200/70">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Navigation öffnen"
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-red-600" />
            <div>
              <p className="text-[11px] uppercase tracking-widest text-slate-400">Onboarding</p>
              <p className="text-sm font-semibold text-slate-900">{activeLabel}</p>
            </div>
          </div>
          <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center text-sm font-medium text-red-700">
            {initials}
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200/70 transform transition-transform duration-200 ease-out flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="border-b border-slate-200/70">
          <div className="h-1 bg-red-600" />
          <div className="flex items-center gap-2 px-6 py-4">
            <BarChart3 className="h-8 w-8 text-red-600" />
            <span className="font-semibold text-lg text-slate-900">Onboarding</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Navigation schließen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2 overflow-y-auto flex-1">
          {filteredNav.map((item) => {
            const isActive = location.pathname.startsWith(item.href)
            const visibleChildren =
              item.children?.filter((child) => user && child.roles.includes(user.role)) || []

            return (
              <div key={item.name} className="space-y-1">
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors border-l-2',
                    isActive
                      ? 'bg-red-50 text-red-700 border-red-600'
                      : 'text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
                {visibleChildren.map((child) => {
                  const childActive = location.pathname.startsWith(child.href)
                  return (
                    <Link
                      key={child.name}
                      to={child.href}
                      className={cn(
                        'ml-9 flex items-center px-3 py-2 rounded-md text-xs font-semibold transition-colors border-l-2',
                        childActive
                          ? 'bg-red-50 text-red-700 border-red-600'
                          : 'text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-900'
                      )}
                    >
                      {child.name}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-200 mt-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-sm font-medium text-red-700">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64 pt-16 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 xl:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
