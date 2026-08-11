import { requestJson } from './client'

export type LoginRequest = {
  identifier: string
  password: string
  device_name?: string
}

export type RefreshTokenRequest = {
  refresh_token: string
  device_name?: string
}

export type TokenResponse = {
  access_token: string
  refresh_token: string
  token_type: string
}

export type LogoutResponse = {
  revoked: boolean
}

export type ActiveRoleResponse = {
  id: string
  name: string
  display_name: string
}

export type CurrentUserResponse = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  active_role: ActiveRoleResponse
}

export function login(credentials: LoginRequest): Promise<TokenResponse> {
  return requestJson<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  })
}

export function getCurrentUser(
  accessToken: string,
): Promise<CurrentUserResponse> {
  return requestJson<CurrentUserResponse>('/api/v1/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export function logout(accessToken: string): Promise<LogoutResponse> {
  return requestJson<LogoutResponse>('/api/v1/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const request: RefreshTokenRequest = {
    refresh_token: refreshToken,
  }

  return requestJson<TokenResponse>('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
}
