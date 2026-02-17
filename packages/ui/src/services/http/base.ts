export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

let authToken: string | null = null
let baseUrl: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

export function getAuthToken(): string | null {
  return authToken
}

export function setBaseUrl(url: string | null): void {
  baseUrl = url
}

export function getBaseUrl(): string {
  if (!baseUrl) throw new Error('Base URL not configured. Call setBaseUrl() first.')
  return baseUrl
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HttpError(res.status, `${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}
