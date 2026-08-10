import { useState } from 'react'
import type { FormEvent } from 'react'

import { login } from '../api/auth'
import type { TokenResponse } from '../api/auth'
import { ApiError } from '../api/client'


type LoginScreenProps = {
  onLoginSuccess: (tokens: TokenResponse) => void
}

function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Unable to sign in right now. Please try again.'
  }

  if (error.status === 401) {
    return 'The email, phone number, or password is incorrect.'
  }

  if (error.status === 403 || error.status === 422) {
    return error.message
  }

  return 'Unable to sign in right now. Please try again.'
}

export default function LoginScreen({
  onLoginSuccess,
}: LoginScreenProps) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isPending) return

    setIsPending(true)
    setErrorMessage(null)

    try {
      const tokens = await login({ identifier, password })
      onLoginSuccess(tokens)
    } catch (error) {
      setErrorMessage(loginErrorMessage(error))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title">Sign in</h1>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-identifier">Email or phone number</label>
            <input
              id="login-identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isPending}
              required
            />
          </div>

          {errorMessage && (
            <p className="login-error" role="alert">
              {errorMessage}
            </p>
          )}

          <button type="submit" disabled={isPending}>
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="login-status" aria-live="polite">
            {isPending ? 'Signing in, please wait.' : ''}
          </p>
        </form>
      </section>
    </main>
  )
}
