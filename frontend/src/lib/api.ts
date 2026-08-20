"use client"

export type UserRole =
  | "CEO_MANAGEMENT"
  | "MARKET_ANALYST"
  | "TRAINING_MANAGER"
  | "RECRUITMENT_TEAM"
  | "ADMIN"

export const ROLE_LABELS: Record<UserRole, string> = {
  CEO_MANAGEMENT: "CEO / Management",
  MARKET_ANALYST: "Market Analyst",
  TRAINING_MANAGER: "Training Manager",
  RECRUITMENT_TEAM: "Recruitment / Employer Team",
  ADMIN: "Admin",
}

export const ROLES = Object.keys(ROLE_LABELS) as UserRole[]

export type User = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: UserRole
  is_active: boolean
}

type Tokens = { access: string; refresh: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"

const ACCESS_KEY = "demandaccel_access"
const REFRESH_KEY = "demandaccel_refresh"

function getAccess(): string | null {
  return window.localStorage.getItem(ACCESS_KEY)
}

function getRefresh(): string | null {
  return window.localStorage.getItem(REFRESH_KEY)
}

function setTokens({ access, refresh }: Tokens) {
  window.localStorage.setItem(ACCESS_KEY, access)
  window.localStorage.setItem(REFRESH_KEY, refresh)
}

function clearTokens() {
  window.localStorage.removeItem(ACCESS_KEY)
  window.localStorage.removeItem(REFRESH_KEY)
}

export async function login(username: string, password: string): Promise<User> {
  const res = await fetch(`${API_URL}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail
    throw new Error(
      typeof detail === "string" ? detail : "Invalid username or password.",
    )
  }
  const tokens: Tokens = await res.json()
  setTokens(tokens)
  return fetchProfile()
}

export async function fetchProfile(): Promise<User> {
  return apiFetch<User>("/auth/profile/")
}

let refreshing: Promise<string> | null = null

async function refreshAccess(): Promise<string> {
  const refresh = getRefresh()
  if (!refresh) throw new Error("No refresh token")
  const res = await fetch(`${API_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) {
    clearTokens()
    throw new Error("Session expired")
  }
  const data: Tokens = await res.json()
  setTokens(data)
  return data.access
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const request = async (token: string | null): Promise<Response> => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  }

  let res = await request(getAccess())

  if (res.status === 401 && getRefresh()) {
    refreshing = refreshing ?? refreshAccess().catch((err) => {
      refreshing = null
      throw err
    })
    try {
      const access = await refreshing
      res = await request(access)
    } finally {
      refreshing = null
    }
  }

  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail
    throw new Error(
      typeof detail === "string" ? detail : `Request failed (${res.status})`,
    )
  }
  return res.json() as Promise<T>
}

export async function logout(): Promise<void> {
  const refresh = getRefresh()
  const access = getAccess()
  if (access && refresh) {
    try {
      await fetch(`${API_URL}/auth/logout/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({ refresh }),
      })
    } catch {
      // ignore network errors on logout
    }
  }
  clearTokens()
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, options)
}

export type RawJob = {
  id: string
  ingestion_run: string
  provider_code: string
  external_id: string
  url: string
  title: string
  company: string
  location: string
  description: string
  raw_payload: Record<string, unknown>
  fetched_at: string
}

export type RawJobPage = {
  count: number
  next: string | null
  previous: string | null
  results: RawJob[]
}

export type JobExplorerParams = {
  q?: string
  provider?: string
  page?: number
}

export function fetchRawJobs(params: JobExplorerParams = {}): Promise<RawJobPage> {
  const search = new URLSearchParams()
  if (params.q) search.set("q", params.q)
  if (params.provider) search.set("provider", params.provider)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  const qs = search.toString()
  return apiFetch<RawJobPage>(`/jobs/${qs ? `?${qs}` : ""}`)
}

export function fetchJobProviders(): Promise<string[]> {
  return apiFetch<string[]>("/jobs/providers/")
}

export type BulkDeleteResult = {
  success: boolean
  deleted: number
  message: string
}

export function deleteRawJobs(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/jobs/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

// ---------------------------------------------------------------------------
// Contact enrichment (SRS Section 7)
// ---------------------------------------------------------------------------

export type EnrichmentSource = {
  id: string
  name: string
  provider_code: string
  is_active: boolean
  base_url: string
  auth_configured: boolean
  default_params: Record<string, string | number>
  rate_limit_rpm: number
  rate_limit_daily: number
  current_daily_uses: number
  health_status: HealthStatus
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export type EnrichmentSourceInput = {
  name: string
  provider_code: string
  is_active?: boolean
  base_url?: string
  auth_config?: Record<string, string>
  default_params?: Record<string, string | number>
  rate_limit_rpm?: number
  rate_limit_daily?: number
}

export type EnrichedContact = {
  id: string
  company: string
  company_name: string
  full_name: string
  job_title: string
  email: string | null
  phone: string | null
  linkedin_url: string | null
  provider_source: string
  verification_state: "verified" | "unverified" | "failed"
  confidence_score: number
  last_verified_at: string | null
  raw_payload: Record<string, unknown>
  created_at: string
}

export type EnrichedContactPage = {
  count: number
  next: string | null
  previous: string | null
  results: EnrichedContact[]
}

export type Company = {
  id: string
  name: string
  domain: string
  location: string
  created_at: string
  updated_at: string
}

export type EnrichmentCandidate = {
  id?: string
  full_name?: string
  job_title?: string
  email?: string
  phone?: string
  linkedin_url?: string
  location?: string
  email_verified?: boolean
  provider_source?: string
}

export type EnrichmentCallLog = {
  provider: string
  status: "success" | "failed" | "skipped"
  message: string
  results: number
  contacts: number
  latency_ms: number
  verified: boolean
  candidates?: EnrichmentCandidate[]
}

export type EnrichmentRunResult = {
  success: boolean
  message: string
  run_id?: string
  contacts_found: number
  stored: number
  error_count: number
  errors?: { error: string }[]
  providers_used: string[]
  call_logs?: EnrichmentCallLog[]
  pending_phones?: number
}

export type PhonePollResult = {
  success: boolean
  updated: number
  pending: number
  message: string
}

export function pollApolloPhones(): Promise<PhonePollResult> {
  return apiFetch<PhonePollResult>("/enrichment/poll-phones/", {
    method: "POST",
  })
}

export function fetchEnrichmentSources(): Promise<EnrichmentSource[]> {
  return apiFetch<EnrichmentSource[]>("/enrichment/sources/")
}

export function createEnrichmentSource(
  data: EnrichmentSourceInput,
): Promise<EnrichmentSource> {
  return apiFetch<EnrichmentSource>("/enrichment/sources/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateEnrichmentSource(
  id: string,
  data: Partial<EnrichmentSourceInput>,
): Promise<EnrichmentSource> {
  return apiFetch<EnrichmentSource>(`/enrichment/sources/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function testEnrichmentSource(id: string): Promise<TestConnectionResult> {
  return apiFetch<TestConnectionResult>(
    `/enrichment/sources/${id}/test-connection/`,
    { method: "POST" },
  )
}

export type EnrichmentRunInput = {
  company_name: string
  titles?: string[]
  location?: string
}

export function runCompanyEnrichment(
  data: EnrichmentRunInput,
): Promise<EnrichmentRunResult> {
  return apiFetch<EnrichmentRunResult>("/enrichment/run/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function fetchEnrichmentContacts(
  params: {
    company?: string
    provider?: string
    verification?: string
    page?: number
  } = {},
): Promise<EnrichedContactPage> {
  const search = new URLSearchParams()
  if (params.company) search.set("company", params.company)
  if (params.provider) search.set("provider", params.provider)
  if (params.verification) search.set("verification", params.verification)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  const qs = search.toString()
  return apiFetch<EnrichedContactPage>(`/enrichment/contacts/${qs ? `?${qs}` : ""}`)
}

export function fetchEnrichmentCompanies(): Promise<Company[]> {
  return apiFetch<Company[]>("/enrichment/companies/")
}

export function deleteEnrichedContacts(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/enrichment/contacts/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export type ContactPhoneResult = {
  success: boolean
  phone: string
  pending: boolean
  message: string
}

export function enrichContactPhone(id: string): Promise<ContactPhoneResult> {
  return apiFetch<ContactPhoneResult>(
    `/enrichment/contacts/${id}/enrich-phone/`,
    { method: "POST" },
  )
}

export type HealthStatus = "healthy" | "degraded" | "failed" | "rate_limited"

export type JobSource = {
  id: string
  name: string
  provider_code: string
  is_active: boolean
  base_url: string
  auth_configured: boolean
  default_params: Record<string, string | number>
  rate_limit_rpm: number
  rate_limit_daily: number
  current_daily_uses: number
  health_status: HealthStatus
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export type JobSourceInput = {
  name: string
  provider_code: string
  is_active?: boolean
  base_url?: string
  auth_config?: Record<string, string>
  default_params?: Record<string, string | number>
  rate_limit_rpm?: number
  rate_limit_daily?: number
}

export type TestConnectionResult = {
  success: boolean
  provider: string
  status: HealthStatus
  message: string
  rate_limit_headroom?: number
  checked_at: string
}

export type IngestionRunResult = {
  success: boolean
  provider: string
  status: string
  message: string
  run_id?: string
  fetched_count?: number
  error_count?: number
  errors?: { error: string }[]
  started_at?: string
  ended_at?: string
}

export type JobSourceRunInput = {
  keyword?: string
  location?: string
  country?: string
  max_pages?: number
}

export function fetchJobSources(): Promise<JobSource[]> {
  return apiFetch<JobSource[]>("/admin/sources/")
}

export function createJobSource(data: JobSourceInput): Promise<JobSource> {
  return apiFetch<JobSource>("/admin/sources/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateJobSource(
  id: string,
  data: Partial<JobSourceInput>,
): Promise<JobSource> {
  return apiFetch<JobSource>(`/admin/sources/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function testJobSource(id: string): Promise<TestConnectionResult> {
  return apiFetch<TestConnectionResult>(`/admin/sources/${id}/test-connection/`, {
    method: "POST",
  })
}

export function runJobSourceIngestion(
  id: string,
  params: JobSourceRunInput,
): Promise<IngestionRunResult> {
  return apiFetch<IngestionRunResult>(`/admin/sources/${id}/run-ingestion/`, {
    method: "POST",
    body: JSON.stringify(params),
  })
}

export { getAccess }