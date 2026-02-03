import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import StarterDashboard from './pages/StarterDashboard'
import TeamleiterDashboard from './pages/TeamleiterDashboard'
import AdminConsole from './pages/AdminConsole'
import Customers from './pages/Customers'
import Layout from './components/Layout'

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function DashboardEntry() {
  const { user } = useAuth()
  if (user?.role === 'teamleiter') {
    return <TeamleiterDashboard />
  }
  return <StarterDashboard />
}

function AppRoutes() {
  const { user } = useAuth()

  // Redirect based on role after login
  const getDefaultRoute = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'admin':
        return '/admin'
      case 'teamleiter':
        return '/team'
      default:
        return '/dashboard'
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['starter', 'teamleiter', 'admin']}>
            <Layout>
              <DashboardEntry />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/customers"
        element={
          <ProtectedRoute allowedRoles={['starter', 'teamleiter', 'admin']}>
            <Layout>
              <Customers />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/team"
        element={
          <ProtectedRoute allowedRoles={['teamleiter', 'admin']}>
            <Layout>
              <TeamleiterDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Layout>
              <AdminConsole />
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
