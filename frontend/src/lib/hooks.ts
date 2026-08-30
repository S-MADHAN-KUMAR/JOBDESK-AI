"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchProfile,
  fetchRawJobs,
  fetchJobProviders,
  fetchEnrichmentContacts,
  fetchJobSources,
  fetchEnrichmentSources,
  fetchExecutiveSummary,
  fetchCEODemandMovements,
  fetchCEOSkillSummary,
  fetchDemandTrends,
  fetchSkillMatrix,
  fetchEmergingSkills,
  fetchRecurringHiring,
  fetchEmployerScores,
  fetchIngestionRuns,
  fetchPipelineHealth,
  fetchDataQuality,
  fetchConfidenceMonitoring,
  fetchDemandMovements,
  fetchLLMConfig,
  fetchMasterCompanies,
  fetchMasterLocations,
  fetchMasterRoles,
  fetchMasterTechnologies,
  fetchMasterSkills,
  fetchEnrichmentCompanies,
  fetchDashboardOverview,
  fetchMarketAlerts,
  fetchCEODailyBrief,
  fetchDemandScores,
  fetchCompanyDetail,
  fetchTrainingRecommendations,
  fetchJobTraceability,
  fetchCanonicalJobs,
  apiFetch,
  type User,
  type RawJob,
  type JobSource,
  type EnrichmentSource,
  type EnrichedContact,
} from "@/lib/api"

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useRawJobs(params: {
  q?: string
  provider?: string
  page?: number
}) {
  return useQuery({
    queryKey: ["rawJobs", params],
    queryFn: () => fetchRawJobs(params),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useJobProviders() {
  return useQuery({
    queryKey: ["jobProviders"],
    queryFn: fetchJobProviders,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useEnrichmentContacts(params: {
  provider?: string
  verification?: string
  page?: number
}) {
  return useQuery({
    queryKey: ["enrichmentContacts", params],
    queryFn: () => fetchEnrichmentContacts(params),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useJobSources() {
  return useQuery({
    queryKey: ["jobSources"],
    queryFn: fetchJobSources,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useEnrichmentSources() {
  return useQuery({
    queryKey: ["enrichmentSources"],
    queryFn: () => fetchEnrichmentSources(),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["adminUsers"],
    queryFn: () => apiFetch<User[]>("/admin/users/"),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useInvalidatequeries() {
  const queryClient = useQueryClient()
  return (...queryKeys: string[][]) => {
    queryKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
  }
}

// CEO / Management hooks
export function useExecutiveSummary() {
  return useQuery({
    queryKey: ["executiveSummary"],
    queryFn: fetchExecutiveSummary,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useCEODemandMovements(period?: number) {
  return useQuery({
    queryKey: ["ceoDemandMovements", period],
    queryFn: () => fetchCEODemandMovements(period),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useCEOSkillSummary() {
  return useQuery({
    queryKey: ["ceoSkillSummary"],
    queryFn: fetchCEOSkillSummary,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

// Market Analyst hooks
export function useDemandTrends(period?: number, groupBy?: string) {
  return useQuery({
    queryKey: ["demandTrends", period, groupBy],
    queryFn: () => fetchDemandTrends(period, groupBy),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

// Training Manager hooks
export function useSkillMatrix() {
  return useQuery({
    queryKey: ["skillMatrix"],
    queryFn: fetchSkillMatrix,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useEmergingSkills() {
  return useQuery({
    queryKey: ["emergingSkills"],
    queryFn: fetchEmergingSkills,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

// Recruitment Team hooks
export function useRecurringHiring() {
  return useQuery({
    queryKey: ["recurringHiring"],
    queryFn: fetchRecurringHiring,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useEmployerScores(minScore?: number, maxScore?: number) {
  return useQuery({
    queryKey: ["employerScores", minScore, maxScore],
    queryFn: () => fetchEmployerScores(minScore, maxScore),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Admin – Ingestion Pipeline
// ---------------------------------------------------------------------------

export function useIngestionRuns(params: {
  provider?: string
  status?: string
  page?: number
} = {}) {
  return useQuery({
    queryKey: ["ingestionRuns", params],
    queryFn: () => fetchIngestionRuns(params),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function usePipelineHealth() {
  return useQuery({
    queryKey: ["pipelineHealth"],
    queryFn: fetchPipelineHealth,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useDataQuality() {
  return useQuery({
    queryKey: ["dataQuality"],
    queryFn: fetchDataQuality,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useConfidenceMonitoring() {
  return useQuery({
    queryKey: ["confidenceMonitoring"],
    queryFn: fetchConfidenceMonitoring,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useDemandMovementsAdmin(period?: string) {
  return useQuery({
    queryKey: ["demandMovementsAdmin", period],
    queryFn: () => fetchDemandMovements(period),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useLLMConfig() {
  return useQuery({
    queryKey: ["llmConfig"],
    queryFn: fetchLLMConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Admin – Taxonomy / Master Data
// ---------------------------------------------------------------------------

export function useMasterCompanies(q?: string) {
  return useQuery({
    queryKey: ["masterCompanies", q],
    queryFn: () => fetchMasterCompanies(q),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useMasterLocations(q?: string) {
  return useQuery({
    queryKey: ["masterLocations", q],
    queryFn: () => fetchMasterLocations(q),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useMasterRoles() {
  return useQuery({
    queryKey: ["masterRoles"],
    queryFn: fetchMasterRoles,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useMasterTechnologies() {
  return useQuery({
    queryKey: ["masterTechnologies"],
    queryFn: fetchMasterTechnologies,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useMasterSkills() {
  return useQuery({
    queryKey: ["masterSkills"],
    queryFn: fetchMasterSkills,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Enrichment – Companies
// ---------------------------------------------------------------------------

export function useEnrichmentCompanies() {
  return useQuery({
    queryKey: ["enrichmentCompanies"],
    queryFn: () => fetchEnrichmentCompanies(),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboardOverview"],
    queryFn: fetchDashboardOverview,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useMarketAlerts() {
  return useQuery({
    queryKey: ["marketAlerts"],
    queryFn: fetchMarketAlerts,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useCEODailyBrief() {
  return useQuery({
    queryKey: ["ceoDailyBrief"],
    queryFn: fetchCEODailyBrief,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useDemandScores(period?: number) {
  return useQuery({
    queryKey: ["demandScores", period],
    queryFn: () => fetchDemandScores(period),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useCompanyDetail(companyId: string) {
  return useQuery({
    queryKey: ["companyDetail", companyId],
    queryFn: () => fetchCompanyDetail(companyId),
    enabled: Boolean(companyId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useTrainingRecommendations(period?: number) {
  return useQuery({
    queryKey: ["trainingRecommendations", period],
    queryFn: () => fetchTrainingRecommendations(period),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useJobTraceability(jobId: string) {
  return useQuery({
    queryKey: ["jobTraceability", jobId],
    queryFn: () => fetchJobTraceability(jobId),
    enabled: Boolean(jobId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useCanonicalJobs(params: {
  search?: string
  work_mode?: string
  seniority?: string
  status?: string
  company?: string
  company_id?: string
  page?: number
  page_size?: number
} = {}) {
  return useQuery({
    queryKey: ["canonicalJobs", params],
    queryFn: () => fetchCanonicalJobs(params),
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}
