import { requestJson } from './client'

export type LoginRequest = {
  identifier: string
  password: string
  device_name?: string
}

export type TokenResponse = {
  access_token: string
  refresh_token: string
  token_type: string
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
