export type FastApiValidationError = {
  loc: Array<string | number>
  msg: string
  type: string
}

export type FastApiErrorBody = {
  detail?: string | FastApiValidationError[] | Record<string, unknown>
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: FastApiErrorBody['detail']

  constructor(status: number, body: FastApiErrorBody) {
    super(errorMessage(body.detail, status))
    this.name = 'ApiError'
    this.status = status
    this.detail = body.detail
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')

function errorMessage(
  detail: FastApiErrorBody['detail'],
  status: number,
): string {
  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    const messages = detail
      .map((error) => error.msg)
      .filter(Boolean)

    if (messages.length > 0) return messages.join(', ')
  }

  if (
    detail
    && typeof detail === 'object'
    && !Array.isArray(detail)
  ) {
    const message = detail.message
    if (typeof message === 'string') return message
  }

  return `Request failed with status ${status}.`
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  })
  const body = await readJson(response)

  if (!response.ok) {
    const errorBody =
      body && typeof body === 'object'
        ? (body as FastApiErrorBody)
        : {}

    throw new ApiError(response.status, errorBody)
  }

  return body as T
}
