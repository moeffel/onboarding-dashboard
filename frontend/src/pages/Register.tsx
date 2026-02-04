import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { BarChart3, CheckCircle } from 'lucide-react'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein')
      return
    }

    if (!privacyConsent) {
      setError('Bitte akzeptieren Sie die Datenschutzerklärung')
      return
    }

    if (!termsAccepted) {
      setError('Bitte akzeptieren Sie die Nutzungsbedingungen')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          phoneNumber: phoneNumber || null,
          privacyConsent,
          termsAccepted,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Registrierung fehlgeschlagen')
      }

      setIsSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Registrierung erfolgreich!
                </h2>
                <p className="text-slate-600 mb-6">
                  Ihr Account wurde erstellt. Ein Administrator muss Ihren Account
                  freischalten, bevor Sie sich anmelden können.
                </p>
                <Link to="/login">
                  <Button>Zur Anmeldung</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <BarChart3 className="h-10 w-10 text-red-600" />
          <span className="text-2xl font-bold text-slate-900">Onboarding Dashboard</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registrieren</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="firstName"
                  label="Vorname"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Max"
                />

                <Input
                  id="lastName"
                  label="Nachname"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Mustermann"
                />
              </div>

              <Input
                id="email"
                label="E-Mail"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
              />

              <Input
                id="password"
                label="Passwort"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
              />

              <Input
                id="confirmPassword"
                label="Passwort bestätigen"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
              />

              <Input
                id="phoneNumber"
                label="Telefonnummer (optional)"
                type="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+43 123 456 7890"
              />

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(e) => setPrivacyConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-600">
                    Ich habe die{' '}
                    <a href="/datenschutz" target="_blank" className="text-red-600 hover:underline">
                      Datenschutzerklärung
                    </a>{' '}
                    gelesen und akzeptiere diese. *
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-600">
                    Ich akzeptiere die{' '}
                    <a href="/nutzungsbedingungen" target="_blank" className="text-red-600 hover:underline">
                      Nutzungsbedingungen
                    </a>
                    . *
                  </span>
                </label>
              </div>

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Registrieren
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-500">
              Bereits registriert?{' '}
              <Link to="/login" className="text-red-600 hover:text-red-700 font-medium">
                Jetzt anmelden
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-500">
          Nach der Registrierung muss ein Administrator Ihren Account freischalten.
        </p>
      </div>
    </div>
  )
}
