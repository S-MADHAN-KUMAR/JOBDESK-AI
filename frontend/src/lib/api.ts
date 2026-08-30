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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"

function clearLegacyTokens() {
  window.localStorage.removeItem("demandaccel_access")
  window.localStorage.removeItem("demandaccel_refresh")
}

export async function login(username: string, password: string): Promise<User> {
  const res = await fetch(`${API_URL}/auth/login/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail
    throw new Error(
      typeof detail === "string" ? detail : "Invalid username or password.",
    )
  }
  clearLegacyTokens()
  return fetchProfile()
}

export async function fetchProfile(): Promise<User> {
  return apiFetch<User>("/auth/profile/")
}

export async function updateProfile(data: {
  username?: string
  first_name?: string
  last_name?: string
  email?: string
}): Promise<User> {
  return apiFetch<User>("/auth/profile/", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function changePassword(data: {
  current_password: string
  new_password: string
}): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/auth/password/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

let refreshing: Promise<void> | null = null

async function refreshSession(): Promise<void> {
  const res = await fetch(`${API_URL}/auth/refresh/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    throw new Error("Session expired")
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const request = async (): Promise<Response> => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    })
  }

  let res = await request()

  if (res.status === 401 && !path.startsWith("/auth/")) {
    refreshing = refreshing ?? refreshSession().catch((err) => {
      refreshing = null
      throw err
    })
    try {
      await refreshing
      res = await request()
    } finally {
      refreshing = null
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let message = `Request failed (${res.status})`
    if (text) {
      try {
        const body = JSON.parse(text) as Record<string, unknown>
        if (typeof body.detail === "string") {
          message = body.detail
        } else if (Array.isArray(body.detail)) {
          message = body.detail.map(String).join(" · ")
        } else {
          const parts: string[] = []
          for (const [key, value] of Object.entries(body)) {
            if (key === "detail") continue
            if (Array.isArray(value)) parts.push(`${key}: ${value.join(" ")}`)
            else if (typeof value === "string") parts.push(`${key}: ${value}`)
          }
          if (parts.length) message = parts.join(" · ")
        }
      } catch {
        if (text.trim()) message = text.trim()
      }
    }
    throw new Error(message)
  }
  const text = await res.text().catch(() => "")
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  } catch {
    // ignore network errors on logout
  }
  clearLegacyTokens()
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch("/auth/forgot-password/", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

export async function confirmPasswordReset(data: {
  uid: string
  token: string
  password: string
}): Promise<void> {
  await apiFetch("/auth/reset-password/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function dismissMarketAlert(id: string): Promise<MarketAlert> {
  return apiFetch<MarketAlert>(`/alerts/${id}/dismiss/`, { method: "POST" })
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

export type EnrichmentCreditUsage = {
  provider?: string
  updated_at?: string
  email_remaining?: number | null
  email_quota?: number | null
  email_used?: number | null
  phone_remaining?: number | null
  phone_quota?: number | null
  phone_used?: number | null
  search_remaining?: number | null
  search_quota?: number | null
  search_used?: number | null
  export_remaining?: number | null
  export_quota?: number | null
  export_used?: number | null
  cycle_start?: string | null
  cycle_end?: string | null
  credit_source?: string
}

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
  credit_usage: EnrichmentCreditUsage
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
  status: "success" | "failed" | "skipped" | "degraded"
  message: string
  results: number
  contacts: number
  latency_ms: number
  verified: boolean
  emails_found?: number
  phones_found?: number
  credits_remaining?: number
  credits_quota?: number
  errors?: string[]
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

export type EnrichmentSourcePage = {
  count: number
  next: string | null
  previous: string | null
  results: EnrichmentSource[]
}

export function fetchEnrichmentSources(params: {
  page?: number
  page_size?: number
} = {}): Promise<EnrichmentSourcePage> {
  const search = new URLSearchParams()
  if (params.page && params.page > 1) search.set("page", String(params.page))
  if (params.page_size) search.set("page_size", String(params.page_size))
  const qs = search.toString()
  return apiFetch<EnrichmentSourcePage>(`/enrichment/sources/${qs ? `?${qs}` : ""}`)
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

export function refreshEnrichmentCredits(
  id: string,
): Promise<{
  success: boolean
  message: string
  credit_usage: EnrichmentCreditUsage
  provider?: string
}> {
  return apiFetch(`/enrichment/sources/${id}/refresh-credits/`, {
    method: "POST",
  })
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
    search?: string
    page?: number
  } = {},
): Promise<EnrichedContactPage> {
  const search = new URLSearchParams()
  if (params.company) search.set("company", params.company)
  if (params.provider) search.set("provider", params.provider)
  if (params.verification) search.set("verification", params.verification)
  if (params.search) search.set("search", params.search)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  const qs = search.toString()
  return apiFetch<EnrichedContactPage>(`/enrichment/contacts/${qs ? `?${qs}` : ""}`)
}

export type CompanyPage = {
  count: number
  next: string | null
  previous: string | null
  results: Company[]
}

export function fetchEnrichmentCompanies(params: {
  q?: string
  page?: number
  page_size?: number
} = {}): Promise<CompanyPage> {
  const search = new URLSearchParams()
  if (params.q) search.set("q", params.q)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  if (params.page_size) search.set("page_size", String(params.page_size))
  const qs = search.toString()
  return apiFetch<CompanyPage>(`/enrichment/companies/${qs ? `?${qs}` : ""}`)
}

export function deleteEnrichedContacts(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/enrichment/contacts/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function bulkDeleteEnrichmentRuns(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/enrichment/bulk-delete-runs/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function bulkDeleteEnrichmentCompanies(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/enrichment/companies/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function bulkDeleteEnrichmentSources(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/enrichment/bulk-delete-sources/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export type EnrichmentRunPage = {
  count: number
  next: string | null
  previous: string | null
  results: EnrichmentRunData[]
}

export type EnrichmentRunData = {
  id: string
  company: string
  company_name: string
  status: string
  providers_used: string[]
  contacts_found: number
  stored_count: number
  error_count: number
  started_at: string
  ended_at: string | null
}

export function fetchEnrichmentRuns(params: {
  company?: string
  status?: string
  search?: string
  page?: number
  page_size?: number
} = {}): Promise<EnrichmentRunPage> {
  const search = new URLSearchParams()
  if (params.company) search.set("company", params.company)
  if (params.status) search.set("status", params.status)
  if (params.search) search.set("search", params.search)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  if (params.page_size) search.set("page_size", String(params.page_size))
  const qs = search.toString()
  return apiFetch<EnrichmentRunPage>(`/enrichment/runs/${qs ? `?${qs}` : ""}`)
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

export type JobSourceCreditUsage = {
  provider?: string
  updated_at?: string
  searches_remaining?: number | null
  searches_quota?: number | null
  searches_used?: number | null
  plan_name?: string | null
  plan_renewal_date?: string | null
  extra_credits?: number | null
  usd_remaining?: number | null
  usd_quota?: number | null
  usd_used?: number | null
  compute_remaining?: number | null
  compute_quota?: number | null
  compute_used?: number | null
  actor_count?: number | null
  actor_task_count?: number | null
  active_actor_jobs?: number | null
  max_concurrent_actor_jobs?: number | null
  data_transfer_used_gb?: number | null
  data_transfer_quota_gb?: number | null
  cycle_start?: string | null
  cycle_end?: string | null
  proxy_serps_remaining?: number | null
  proxy_serps_quota?: number | null
  proxy_serps_used?: number | null
}

export type JobSource = {
  id: string
  name: string
  provider_code: string
  is_active: boolean
  base_url: string
  auth_configured: boolean
  default_params: Record<string, string | number | string[]>
  rate_limit_rpm: number
  rate_limit_daily: number
  current_daily_uses: number
  credit_usage?: JobSourceCreditUsage
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
  default_params?: Record<string, string | number | string[]>
  rate_limit_rpm?: number
  rate_limit_daily?: number
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
  min_salary?: number
  max_salary?: number
  employment_type?: string
  work_mode?: string
  role?: string
  posted_within?: string
  /** Apify-only: job boards to scrape. Ignored by SerpApi and other providers. */
  platforms?: string[]
}

/** Platforms accepted by Apify agentx/all-jobs-scraper. */
export const APIFY_JOB_PLATFORMS = [
  "LinkedIn",
  "Indeed",
  "Naukri.com",
  "ZipRecruiter",
  "Jooble",
  "France Travail",
  "Bundesagentur für Arbeit",
  "Glassdoor",
  "Jobstreet",
  "Saramin",
  "doda",
  "SAP",
  "JobKorea",
  "Mynavi Tenshoku",
  "Pracuj.pl",
  "HelloWork",
  "Stepstone",
  "InfoJobs",
  "Talent.com",
  "USAJOBS",
  "Baitoru",
  "Kariyer.net",
  "foundit",
  "Jobs2Careers",
  "OnlineJobs.ph",
  "Catho",
  "Arbetsförmedlingen",
  "Glints",
  "Totaljobs",
  "OCC",
  "Freelancer.com",
  "Jobright",
  "Job Bank",
  "jobs.ch",
  "Bayt.com",
  "Reed.co.uk",
  "CV-Library",
  "VDAB",
  "Kyujin Box",
] as const

export const DEFAULT_APIFY_PLATFORMS = [
  "LinkedIn",
  "Indeed",
  "Naukri.com",
  "Glassdoor",
] as const

/** Boards Google Jobs reports in `via`; SerpApi has no server-side board filter. */
export const SERPAPI_JOB_PLATFORMS = [
  "LinkedIn",
  "Indeed",
  "Naukri.com",
  "Glassdoor",
  "Shine",
  "foundit",
  "TimesJobs",
  "Monster",
  "SimplyHired",
  "ZipRecruiter",
  "Dice",
  "CareerBuilder",
  "Jooble",
  "Adzuna",
  "BeBee",
  "Built In",
  "Talent.com",
  "Hirist",
  "Instahyre",
  "Cutshort",
  "Wellfound",
  "Recruit.net",
  "Jobrapido",
  "WhatJobs",
  "Bayt.com",
  "Reed.co.uk",
  "Totaljobs",
] as const

export const DEFAULT_SERPAPI_PLATFORMS = [
  "LinkedIn",
  "Naukri.com",
  "Glassdoor",
  "Shine",
  "foundit",
] as const

export function platformsForProvider(providerCode: string): readonly string[] {
  return providerCode.trim().toLowerCase() === "serpapi"
    ? SERPAPI_JOB_PLATFORMS
    : APIFY_JOB_PLATFORMS
}

export function defaultPlatformsForProvider(providerCode: string): string[] {
  return providerCode.trim().toLowerCase() === "serpapi"
    ? [...DEFAULT_SERPAPI_PLATFORMS]
    : [...DEFAULT_APIFY_PLATFORMS]
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

export function refreshJobSourceCredits(
  id: string,
): Promise<{
  success: boolean
  message: string
  credit_usage: JobSourceCreditUsage
  provider?: string
}> {
  return apiFetch(`/admin/sources/${id}/refresh-credits/`, {
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

// ---------------------------------------------------------------------------
// Ingestion Pipeline Admin
// ---------------------------------------------------------------------------

export type IngestionRun = {
  id: string
  provider: string
  provider_code: string
  status: "pending" | "running" | "completed" | "failed" | "partial"
  started_at: string | null
  ended_at: string | null
  fetched_count: number
  error_count: number
  errors: { error: string }[]
  created_at: string
}

export type IngestionRunsPage = {
  count: number
  next: string | null
  previous: string | null
  results: IngestionRun[]
}

export type PipelineHealth = {
  total_raw_jobs: number
  total_canonical_jobs: number
  total_source_records: number
  deduplication_rate_pct: number
  provider_stats: { provider_code: string; total: number }[]
  recent_runs: {
    id: string
    provider: string
    status: string
    fetched_count: number
    error_count: number
    started_at: string | null
    ended_at: string | null
  }[]
}

export type DataQualityMetrics = {
  total_canonical_jobs: number
  missing_salary_pct: number
  missing_experience_pct: number
  missing_company_pct: number
  missing_location_pct: number
  confidence_distribution: { score: number; count: number }[]
  work_mode_distribution: { work_mode: string; count: number }[]
  seniority_distribution: { seniority: string; count: number }[]
}

export type ConfidenceMonitoring = {
  average_confidence: number
  total_classified: number
  method_distribution: {
    classification_method: string
    count: number
    avg_confidence: number
  }[]
  low_confidence_jobs: {
    id: string
    title: string
    company: string
    role_category: string
    confidence: number
    method: string
  }[]
}

export type CanonicalJob = {
  id: string
  canonical_url: string
  title: string
  normalized_title: string
  company_name_raw: string
  company_name: string
  company: string | null
  location_raw: string
  location_text: string
  location: string | null
  description: string
  work_mode: string
  employment_type: string
  seniority: string
  experience_text: string
  salary_text: string
  posted_date: string | null
  first_seen: string
  last_seen: string
  status: string
  classification_confidence: number
  created_at: string
  updated_at: string
}

export type RawVsNormalized = {
  canonical_job: CanonicalJob
  classification: {
    role_category: string
    primary_technologies: string[]
    secondary_technologies: string[]
    skills: string[]
    confidence_score: number
    method: string
  } | null
  source_records: {
    id: string
    provider_code: string
    external_id: string
    url: string
    match_type: string
    raw_title: string
    raw_company: string
    raw_location: string
    raw_description: string
    fetched_at: string | null
  }[]
}

export type MasterCompany = {
  id: string
  name: string
  normalized_name: string
  domain: string
  location: string
  logo_url: string
  website: string
  created_at: string
  updated_at: string
}

export type MasterLocation = {
  id: string
  raw_text: string
  city: string
  state: string
  country: string
  normalized: string
  created_at: string
}

export type MasterJobRole = {
  id: string
  name: string
  category: string
  created_at: string
}

export type MasterTechnology = {
  id: string
  name: string
  category: string
  created_at: string
}

export type MasterSkill = {
  id: string
  name: string
  technology: string | null
  technology_name: string
  created_at: string
}

// Ingestion pipeline API calls

export function fetchIngestionRuns(params: {
  provider?: string
  status?: string
  search?: string
  page?: number
  page_size?: number
} = {}): Promise<IngestionRunsPage> {
  const search = new URLSearchParams()
  if (params.provider) search.set("provider", params.provider)
  if (params.status) search.set("status", params.status)
  if (params.search) search.set("search", params.search)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  if (params.page_size) search.set("page_size", String(params.page_size))
  const qs = search.toString()
  return apiFetch<IngestionRunsPage>(`/admin/ingestion-runs/${qs ? `?${qs}` : ""}`)
}

export function triggerManualRun(data: {
  source_id: string
  keyword?: string
  location?: string
  country?: string
  max_pages?: number
  min_salary?: number
  max_salary?: number
  employment_type?: string
  work_mode?: string
  role?: string
  posted_within?: string
  platforms?: string[]
}): Promise<{ success: boolean; message: string; task_id: string; provider: string }> {
  return apiFetch("/admin/ingestion/trigger/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export type ScheduleFrequency = "once" | "daily" | "weekly" | "monthly"

export type IngestionSchedule = {
  id: string
  source_id: string
  keyword: string
  location: string
  country: string
  max_pages: string
  min_salary: string
  max_salary: string
  employment_type: string
  work_mode: string
  role: string
  posted_within: string
  platforms: string[]
  apify_platforms?: string[]
  serpapi_platforms?: string[]
  frequency: ScheduleFrequency
  time: string
  dayOfWeek: number
  dayOfMonth: number
  startDate: string | null
  totalRuns: number
  runsCompleted: number
  enabled: boolean
  lastRun: string | null
  lastRunStatus: "success" | "error" | null
  lastError: string | null
  nextRun: string | null
  created_at?: string
  updated_at?: string
}

export type IngestionScheduleInput = {
  source_id: string
  keyword?: string
  location?: string
  country?: string
  max_pages?: string | number
  min_salary?: string | number
  max_salary?: string | number
  employment_type?: string
  work_mode?: string
  role?: string
  posted_within?: string
  platforms?: string[]
  apify_platforms?: string[]
  serpapi_platforms?: string[]
  frequency: ScheduleFrequency
  time: string
  dayOfWeek?: number
  dayOfMonth?: number
  startDate?: string
  totalRuns?: number
  enabled?: boolean
}

export function fetchIngestionSchedules(): Promise<IngestionSchedule[]> {
  return apiFetch<IngestionSchedule[] | { results: IngestionSchedule[] }>(
    "/admin/ingestion-schedules/",
  ).then((data) => (Array.isArray(data) ? data : data.results ?? []))
}

export function createIngestionSchedule(
  data: IngestionScheduleInput,
): Promise<IngestionSchedule> {
  return apiFetch<IngestionSchedule>("/admin/ingestion-schedules/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function toggleIngestionSchedule(id: string): Promise<IngestionSchedule> {
  return apiFetch<IngestionSchedule>(`/admin/ingestion-schedules/${id}/toggle/`, {
    method: "POST",
  })
}

export function deleteIngestionSchedule(id: string): Promise<void> {
  return apiFetch<void>(`/admin/ingestion-schedules/${id}/`, {
    method: "DELETE",
  })
}

export function fetchPipelineHealth(): Promise<PipelineHealth> {
  return apiFetch<PipelineHealth>("/admin/ingestion/pipeline-health/")
}

export function fetchDataQuality(): Promise<DataQualityMetrics> {
  return apiFetch<DataQualityMetrics>("/admin/ingestion/data-quality/")
}

export function fetchConfidenceMonitoring(): Promise<ConfidenceMonitoring> {
  return apiFetch<ConfidenceMonitoring>("/admin/ingestion/confidence/")
}

export function fetchRawVsNormalized(
  canonicalJobId: string,
): Promise<RawVsNormalized> {
  return apiFetch<RawVsNormalized>(
    `/admin/ingestion/raw-vs-normalized/${canonicalJobId}/`,
  )
}

export function fetchDemandMovements(period?: string): Promise<{ movements: DemandMovement[] }> {
  const qs = period ? `?period=${period}` : ""
  return apiFetch<{ movements: DemandMovement[] }>(
    `/admin/ingestion/demand-movements/${qs}`,
  )
}

export function triggerSnapshot(): Promise<{ success: boolean; message: string; task_id: string }> {
  return apiFetch("/admin/ingestion/trigger-snapshot/", { method: "POST" })
}

export function bulkDeleteIngestionRuns(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/admin/ingestion/bulk-delete-runs/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function bulkDeleteCanonicalJobs(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/admin/ingestion/bulk-delete-canonicals/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function purgeAllIngestionData(): Promise<{ success: boolean; message: string; remaining: Record<string, number> }> {
  return apiFetch("/admin/ingestion/purge-all/", {
    method: "POST",
    body: JSON.stringify({ confirm: "CONFIRM_PURGE" }),
  })
}

export type CanonicalJobPage = {
  count: number
  next: string | null
  previous: string | null
  results: CanonicalJob[]
}

export function fetchCanonicalJobs(params: {
  search?: string
  work_mode?: string
  seniority?: string
  status?: string
  page?: number
  page_size?: number
} = {}): Promise<CanonicalJobPage> {
  const search = new URLSearchParams()
  if (params.search) search.set("search", params.search)
  if (params.work_mode) search.set("work_mode", params.work_mode)
  if (params.seniority) search.set("seniority", params.seniority)
  if (params.status) search.set("status", params.status)
  if (params.page && params.page > 1) search.set("page", String(params.page))
  if (params.page_size) search.set("page_size", String(params.page_size))
  const qs = search.toString()
  return apiFetch<CanonicalJobPage>(`/admin/canonical-jobs/${qs ? `?${qs}` : ""}`)
}

// Master data CRUD

export function fetchMasterCompanies(q?: string): Promise<MasterCompany[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : ""
  return apiFetch<MasterCompany[]>(`/admin/master-companies/${qs}`)
}

export function createMasterCompany(
  data: Partial<MasterCompany>,
): Promise<MasterCompany> {
  return apiFetch<MasterCompany>("/admin/master-companies/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateMasterCompany(
  id: string,
  data: Partial<MasterCompany>,
): Promise<MasterCompany> {
  return apiFetch<MasterCompany>(`/admin/master-companies/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function deleteMasterCompany(id: string): Promise<void> {
  return apiFetch(`/admin/master-companies/${id}/`, { method: "DELETE" })
}

export function bulkDeleteMasterCompanies(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/admin/master-companies/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function fetchMasterLocations(q?: string): Promise<MasterLocation[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : ""
  return apiFetch<MasterLocation[]>(`/admin/master-locations/${qs}`)
}

export function createMasterLocation(
  data: Partial<MasterLocation>,
): Promise<MasterLocation> {
  return apiFetch<MasterLocation>("/admin/master-locations/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateMasterLocation(
  id: string,
  data: Partial<MasterLocation>,
): Promise<MasterLocation> {
  return apiFetch<MasterLocation>(`/admin/master-locations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function deleteMasterLocation(id: string): Promise<void> {
  return apiFetch(`/admin/master-locations/${id}/`, { method: "DELETE" })
}

export function bulkDeleteMasterLocations(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/admin/master-locations/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function fetchMasterRoles(): Promise<MasterJobRole[]> {
  return apiFetch<MasterJobRole[]>("/admin/master-roles/")
}

export function createMasterRole(
  data: Partial<MasterJobRole>,
): Promise<MasterJobRole> {
  return apiFetch<MasterJobRole>("/admin/master-roles/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateMasterRole(
  id: string,
  data: Partial<MasterJobRole>,
): Promise<MasterJobRole> {
  return apiFetch<MasterJobRole>(`/admin/master-roles/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function deleteMasterRole(id: string): Promise<void> {
  return apiFetch(`/admin/master-roles/${id}/`, { method: "DELETE" })
}

export function bulkDeleteMasterRoles(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/admin/master-roles/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function fetchMasterTechnologies(): Promise<MasterTechnology[]> {
  return apiFetch<MasterTechnology[]>("/admin/master-technologies/")
}

export function createMasterTechnology(
  data: Partial<MasterTechnology>,
): Promise<MasterTechnology> {
  return apiFetch<MasterTechnology>("/admin/master-technologies/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateMasterTechnology(
  id: string,
  data: Partial<MasterTechnology>,
): Promise<MasterTechnology> {
  return apiFetch<MasterTechnology>(`/admin/master-technologies/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function deleteMasterTechnology(id: string): Promise<void> {
  return apiFetch(`/admin/master-technologies/${id}/`, { method: "DELETE" })
}

export function bulkDeleteMasterTechnologies(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/admin/master-technologies/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export function fetchMasterSkills(): Promise<MasterSkill[]> {
  return apiFetch<MasterSkill[]>("/admin/master-skills/")
}

export function createMasterSkill(
  data: Partial<MasterSkill>,
): Promise<MasterSkill> {
  return apiFetch<MasterSkill>("/admin/master-skills/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateMasterSkill(
  id: string,
  data: Partial<MasterSkill>,
): Promise<MasterSkill> {
  return apiFetch<MasterSkill>(`/admin/master-skills/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function deleteMasterSkill(id: string): Promise<void> {
  return apiFetch(`/admin/master-skills/${id}/`, { method: "DELETE" })
}

export function bulkDeleteMasterSkills(ids: string[]): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/admin/master-skills/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

// LLM Configuration

export type LLMProviderInfo = {
  label: string
  models: string[]
}

export type LLMConfig = {
  provider: string
  model: string
  providers: Record<string, LLMProviderInfo>
}

export function fetchLLMConfig(): Promise<LLMConfig> {
  return apiFetch<LLMConfig>("/admin/llm-config/")
}

export function updateLLMConfig(data: {
  provider: string
  model: string
}): Promise<{ success: boolean; provider: string; model: string }> {
  return apiFetch("/admin/llm-config/update/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// ---------------------------------------------------------------------------
// CEO / Management Intelligence
// ---------------------------------------------------------------------------

export type ExecutiveSummary = {
  total_jobs: number
  active_jobs: number
  expired_jobs: number
  top_hubs: { location_raw: string; job_count: number }[]
  top_companies: { company_name_raw: string; job_count: number }[]
  top_roles: { role_category: string; count: number }[]
  daily_active: Record<string, number>
}

export type DemandMovement = {
  id?: string
  role_category: string
  period_start: string
  period_end: string
  active_jobs_start: number
  active_jobs_end: number
  new_postings: number
  expired_postings: number
  net_change: number
  change_percentage: number
}

export type SkillSummary = {
  top_technologies: { name: string; count: number }[]
  top_skills: { name: string; count: number }[]
}

export function fetchExecutiveSummary(): Promise<ExecutiveSummary> {
  return apiFetch<ExecutiveSummary>("/ceo/executive-summary/")
}

export function fetchCEODemandMovements(period?: number): Promise<{ period_days: number; movements: DemandMovement[] }> {
  const qs = period ? `?period=${period}` : ""
  return apiFetch(`/ceo/demand-movements/${qs}`)
}

export function fetchCEOSkillSummary(): Promise<SkillSummary> {
  return apiFetch<SkillSummary>("/ceo/skill-summary/")
}

// ---------------------------------------------------------------------------
// Market Analyst - Trend Engine
// ---------------------------------------------------------------------------

export type TrendData = {
  period_days: number
  group_by: string
  trends: {
    role_category: string
    total_new: number | null
    total_expired: number | null
    total_net: number | null
    avg_change_pct: number | null
  }[]
}

export type JobTraceability = {
  canonical_job: {
    id: string
    title: string
    company_name_raw: string
    location_raw: string
    status: string
    first_seen: string | null
    last_seen: string | null
  }
  source_records: {
    id: string
    provider_code: string
    external_id: string
    url: string
    dedup_match_type: string
    raw_title: string
    raw_company: string
    raw_location: string
    raw_url: string
    fetched_at: string | null
  }[]
  classification: {
    role_category: string
    primary_technologies: string[]
    secondary_technologies: string[]
    skills: string[]
    confidence_score: number
    classification_method: string
  } | null
}

export function fetchDemandTrends(period?: number, groupBy?: string): Promise<TrendData> {
  const params = new URLSearchParams()
  if (period) params.set("period", String(period))
  if (groupBy) params.set("group_by", groupBy)
  const qs = params.toString()
  return apiFetch(`/analyst/trends/${qs ? `?${qs}` : ""}`)
}

export function fetchJobTraceability(jobId: string): Promise<JobTraceability> {
  return apiFetch(`/analyst/job-traceability/${jobId}/`)
}

// ---------------------------------------------------------------------------
// Training Manager - Skill Matrix
// ---------------------------------------------------------------------------

export type SkillMatrixEntry = {
  role_category: string
  total_jobs: number
  top_technologies: { name: string; count: number }[]
  top_skills: { name: string; count: number }[]
}

export type EmergingSkill = {
  name: string
  recent_count: number
  older_count: number
  change_percentage: number
  trend: "emerging" | "growing" | "stable" | "declining"
}

export function fetchSkillMatrix(): Promise<{ matrix: SkillMatrixEntry[] }> {
  return apiFetch("/training/skill-matrix/")
}

export function fetchEmergingSkills(): Promise<{ trending: EmergingSkill[]; declining: EmergingSkill[]; emerging: EmergingSkill[] }> {
  return apiFetch("/training/emerging-skills/")
}

// ---------------------------------------------------------------------------
// Recruitment Team - Employer Intelligence
// ---------------------------------------------------------------------------

export type RecurringHiringCompany = {
  company_name_raw: string
  total_postings: number
  unique_roles: number
}

export type EmployerScore = {
  id: string
  company_name: string
  company_id: string
  period_start: string
  period_end: string
  total_postings: number
  active_postings: number
  unique_roles: number
  hiring_score: number
}

export function fetchRecurringHiring(): Promise<{ companies: RecurringHiringCompany[]; total_companies: number }> {
  return apiFetch("/recruitment/recurring-hiring/")
}

export function fetchEmployerScores(minScore?: number, maxScore?: number): Promise<{ scores: EmployerScore[] }> {
  const params = new URLSearchParams()
  if (minScore !== undefined) params.set("min_score", String(minScore))
  if (maxScore !== undefined) params.set("max_score", String(maxScore))
  const qs = params.toString()
  return apiFetch(`/recruitment/employer-scores/${qs ? `?${qs}` : ""}`)
}

// ---------------------------------------------------------------------------
// Dashboard / Alerts / Demand / Company / Training recommendations
// ---------------------------------------------------------------------------

export type DashboardOverview = {
  total_jobs: number
  active_jobs: number
  expired_jobs: number
  unique_companies: number
  classified_jobs: number
  avg_confidence: number
  active_sources: number
  healthy_sources: number
  enriched_contacts: number
  avg_demand_change: number
  experience_bands: { seniority: string; count: number }[]
  top_skills: { name: string; count: number }[]
  source_mix: { provider: string; count: number }[]
  top_demand_movers: {
    role_category: string
    net_change: number
    change_percentage: number
    active_jobs_end: number
    new_postings: number
  }[]
  recent_runs: {
    id: string
    status: string
    fetched_count: number
    error_count: number
    started_at: string | null
    ended_at: string | null
    provider: string
  }[]
}

export type MarketAlert = {
  id: string
  fingerprint?: string
  severity: "high" | "medium" | "low"
  category: string
  title: string
  message: string
  role_category?: string
  company_id?: string
  company_name?: string
  provider?: string
  metric?: number
  created_at: string
  dismissed_at?: string | null
}

export type CEODailyBrief = {
  generated_at: string
  headline: string
  active_jobs: number
  total_jobs: number
  rising_roles: {
    role_category: string
    net_change: number
    change_percentage: number
    new_postings: number
  }[]
  declining_roles: {
    role_category: string
    net_change: number
    change_percentage: number
    expired_postings: number
  }[]
  priority_employers: {
    company_id: string
    company_name: string
    hiring_score: number
    active_postings: number
    unique_roles: number
  }[]
  recommended_technologies: { name: string; count: number }[]
  training_actions: string[]
}

export type DemandScore = {
  role_category: string
  period_days: number
  demand_score: number
  active_jobs: number
  net_change: number
  change_percentage: number
  new_postings: number
  band: "hot" | "warm" | "cool" | "cold"
}

export type CompanyDetail = {
  company: {
    id: string
    name: string
    normalized_name: string
    domain: string
    location: string
    website: string
  }
  stats: {
    total_jobs: number
    active_jobs: number
    unique_roles: number
  }
  hiring_score: {
    hiring_score: number
    total_postings: number
    active_postings: number
    unique_roles: number
    period_start: string | null
    period_end: string | null
  }
  role_breakdown: { role_category: string; count: number }[]
  recent_jobs: {
    id: string
    title: string
    location_raw: string
    status: string
    seniority: string
    work_mode: string
    last_seen: string | null
  }[]
}

export type TrainingRecommendation = {
  type: string
  priority: string
  title: string
  detail: string
  role_category?: string
  technology?: string
}

export function fetchDashboardOverview(): Promise<DashboardOverview> {
  return apiFetch("/dashboard/overview/")
}

export function fetchMarketAlerts(
  query = "",
): Promise<{ count: number; alerts: MarketAlert[] }> {
  return apiFetch(`/alerts/${query}`)
}

export function fetchCEODailyBrief(): Promise<CEODailyBrief> {
  return apiFetch("/ceo/daily-brief/")
}

export function fetchDemandScores(period?: number): Promise<{ period_days: number; scores: DemandScore[] }> {
  const qs = period ? `?period=${period}` : ""
  return apiFetch(`/analyst/demand-scores/${qs}`)
}

export function fetchCompanyDetail(companyId: string): Promise<CompanyDetail> {
  return apiFetch(`/recruitment/companies/${companyId}/`)
}

export function fetchTrainingRecommendations(period?: number): Promise<{
  period_days: number
  rising_roles: {
    role_category: string
    change_percentage: number
    net_change: number
    active_jobs_end: number
  }[]
  top_technologies: { name: string; count: number }[]
  recommendations: TrainingRecommendation[]
}> {
  const qs = period ? `?period=${period}` : ""
  return apiFetch(`/training/recommendations/${qs}`)
}
