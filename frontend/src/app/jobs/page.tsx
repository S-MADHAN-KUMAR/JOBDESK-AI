"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BriefcaseBusiness,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { AppShell } from "@/components/app-shell"
import { PageHeader, EmptyState } from "@/components/page-header"
import { cn } from "@/lib/utils"
import { useProfile, useRawJobs, useJobProviders } from "@/lib/hooks"
import {
  type RawJob,
  deleteRawJobs,
} from "@/lib/api"

type JobDetailView = {
  title: string
  company: string
  location: string
  description: string
  provider: string
  platform: string
  listingUrl: string
  applyLinks: { title: string; link: string }[]
  companyUrl: string
  companyWebsite: string
  companyIndustry: string
  companyLogo: string
  jobType: string
  jobLevel: string
  jobFunction: string
  experience: string
  salary: string
  postedDate: string
  applicants: string
  isRemote: string
  skills: string[]
  fetchedAt: string
  externalId: string
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function asSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim()
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        return asString(obj.name || obj.skill || obj.title)
      }
      return ""
    })
    .filter(Boolean)
    .slice(0, 24)
}

function formatSalary(payload: Record<string, unknown>): string {
  const min = payload.salary_minimum ?? payload.salary_min ?? payload.min_salary
  const max = payload.salary_maximum ?? payload.salary_max ?? payload.max_salary
  const currency = asString(payload.salary_currency || payload.currency || "")
  const period = asString(payload.salary_period || payload.salary_unit || "")
  const detected = payload.detected_extensions
  if (detected && typeof detected === "object") {
    const ext = detected as Record<string, unknown>
    const extSalary = asString(ext.salary)
    if (extSalary) return extSalary
  }
  if (min == null && max == null) return ""
  const fmt = (n: unknown) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return asString(n)
    return num.toLocaleString()
  }
  let text = ""
  if (min != null && max != null) text = `${fmt(min)} – ${fmt(max)}`
  else if (min != null) text = `From ${fmt(min)}`
  else text = `Up to ${fmt(max)}`
  if (currency) text = `${currency} ${text}`
  if (period) text = `${text} / ${period}`
  return text
}

function formatLocation(job: RawJob): string {
  if (job.location) return job.location
  const loc = job.raw_payload?.location
  if (typeof loc === "string") return loc
  if (loc && typeof loc === "object") {
    const obj = loc as Record<string, unknown>
    return (
      asString(obj.raw) ||
      [obj.locality, obj.region, obj.country].map(asString).filter(Boolean).join(", ")
    )
  }
  return ""
}

function stripUrlsFromText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function extractApplyLinks(
  payload: Record<string, unknown>,
): { title: string; link: string }[] {
  const options = payload.apply_options
  if (!Array.isArray(options)) return []
  const links: { title: string; link: string }[] = []
  for (const option of options) {
    if (!option || typeof option !== "object") continue
    const obj = option as Record<string, unknown>
    const link = asString(obj.link)
    if (!link) continue
    links.push({
      title: asString(obj.title) || "Apply",
      link,
    })
  }
  return links.slice(0, 8)
}

function extractListingUrl(job: RawJob): string {
  const p = job.raw_payload || {}
  const direct =
    asString(job.url) ||
    asString(p.official_url) ||
    asString(p.platform_url) ||
    asString(p.share_link) ||
    asString(p.source_link) ||
    asString(p.link) ||
    asString(p.apply_link)
  if (direct) return direct
  const apply = extractApplyLinks(p)
  return apply[0]?.link || ""
}

function buildJobDetail(job: RawJob): JobDetailView {
  const p = job.raw_payload || {}
  const posted =
    asString(p.posted_date) ||
    asString(p.posted_at) ||
    asString((p.detected_extensions as Record<string, unknown> | undefined)?.posted_at)
  const remote = p.is_remote
  let isRemote = ""
  if (typeof remote === "boolean") isRemote = remote ? "Remote" : "On-site"
  else if (asString(remote)) isRemote = asString(remote)

  const applyLinks = extractApplyLinks(p)
  const listingUrl = extractListingUrl(job)

  return {
    title: job.title || asString(p.title) || asString(p.job_title) || "Untitled job",
    company: job.company || asString(p.company_name) || "Unknown company",
    location: formatLocation(job) || "Location not specified",
    description: job.description || asString(p.description) || "",
    provider: job.provider_code,
    platform:
      asString(p.platform) ||
      asString(p.via) ||
      asString(p.source) ||
      job.provider_code,
    listingUrl,
    applyLinks,
    companyUrl: asString(p.company_url) || asString(p.company_link),
    companyWebsite: asString(p.company_website) || asString(p.website),
    companyIndustry: asString(p.company_industry) || asString(p.industry),
    companyLogo: asString(p.company_logo) || asString(p.thumbnail),
    jobType: asString(p.job_type) || asString(p.employment_type) || asString(p.schedule_type),
    jobLevel: asString(p.job_level) || asString(p.seniority),
    jobFunction: asString(p.job_function) || asString(p.category),
    experience: asString(p.experience_range) || asString(p.experience),
    salary: formatSalary(p),
    postedDate: posted,
    applicants:
      p.applicant_count != null && p.applicant_count !== ""
        ? `${asString(p.applicant_count)} applicants`
        : "",
    isRemote,
    skills: asSkills(p.skills || p.job_highlights),
    fetchedAt: job.fetched_at,
    externalId: job.external_id,
  }
}

function DetailFact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  )
}

function formatProviderLabel(code: string): string {
  const known: Record<string, string> = {
    serpapi: "SerpApi",
    apify: "Apify",
  }
  const key = code.trim().toLowerCase()
  if (known[key]) return known[key]
  if (!code) return "Unknown"
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase()
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatAbsoluteTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function platformLabel(job: RawJob): string {
  const p = job.raw_payload || {}
  return (
    asString(p.via) ||
    asString(p.platform) ||
    asString(p.source) ||
    ""
  )
}

export default function JobExplorerPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()

  const [query, setQuery] = useState("")
  const [provider, setProvider] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<RawJob | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const { data: providers = [] } = useJobProviders()
  const {
    data: jobsData,
    isLoading: jobsLoading,
    refetch: refetchJobs,
  } = useRawJobs({
    q: query.trim() || undefined,
    provider: provider === "all" ? undefined : provider,
    page,
  })

  const jobs = Array.isArray(jobsData) ? jobsData : (jobsData?.results ?? [])
  const total = Array.isArray(jobsData) ? jobsData.length : (jobsData?.count ?? 0)
  const hasNext = Boolean(jobsData && !Array.isArray(jobsData) && jobsData.next)
  const hasPrev = Boolean(jobsData && !Array.isArray(jobsData) && jobsData.previous)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const detailView = useMemo(
    () => (detail ? buildJobDetail(detail) : null),
    [detail],
  )

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  useEffect(() => {
    setShowRaw(false)
  }, [detail?.id])

  function applyFilters(p = 1) {
    setPage(p)
    setSelected(new Set())
  }

  function toggleJob(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === jobs.length ? new Set() : new Set(jobs.map((job) => job.id)),
    )
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteRawJobs([...selected])
      setDeleteOpen(false)
      setSelected(new Set())
      setSelectionMode(false)
      void refetchJobs()
      toast.success("Jobs deleted successfully.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete jobs")
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  if (!me) return null

  const allSelected = jobs.length > 0 && selected.size === jobs.length

  return (
    <AppShell user={me} loading={profileLoading}>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          variant="banner"
          icon={BriefcaseBusiness}
          title="Job Explorer"
          description="Browse ingested jobs, open structured details, and jump into contact enrichment."
        />

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Search across title, company, location, and description
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="job-search">Search</Label>
              <Input
                id="job-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters(1)
                }}
                placeholder="e.g. software engineer, Chennai, Accenture"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="job-provider">Source</Label>
              <Select
                value={provider}
                onValueChange={(value) => {
                  if (value === null) return
                  setProvider(value)
                  applyFilters(1)
                }}
              >
                <SelectTrigger id="job-provider" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {providers.map((code) => (
                    <SelectItem key={code} value={code}>
                      {formatProviderLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => applyFilters(1)}
              data-icon="inline-start"
              disabled={jobsLoading}
            >
              <Search data-icon="inline-start" />
              Search
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 space-y-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Job records</CardTitle>
                <CardDescription className="mt-1">
                  {selectionMode
                    ? "Select jobs to delete, then confirm."
                    : "Click a row to open full job details."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectionMode && selected.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    data-icon="inline-start"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete ({selected.size})
                  </Button>
                )}
                {selectionMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectionMode(false)
                      setSelected(new Set())
                    }}
                  >
                    Cancel
                  </Button>
                )}
                {!selectionMode && (
                  <Button
                    variant="destructive-soft"
                    size="sm"
                    onClick={() => setSelectionMode(true)}
                    data-icon="inline-start"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                )}
                <Badge variant="secondary" className="tabular-nums">
                  {total.toLocaleString()} found
                </Badge>
              </div>
            </div>
            {selectionMode && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Selection mode — tick the jobs you want to remove
                {selected.size > 0 ? ` (${selected.size} selected)` : ""}.
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {jobsLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span className="text-sm">Fetching job records…</span>
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={BriefcaseBusiness}
                title="No job records found"
                description="Try a different search, or run an ingestion from Source Management."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {selectionMode && (
                        <TableHead className="w-12 sticky left-0 z-10 bg-background">
                          <input
                            type="checkbox"
                            aria-label="Select all jobs on this page"
                            checked={allSelected}
                            onChange={toggleAll}
                            className="size-4 accent-primary"
                          />
                        </TableHead>
                      )}
                      <TableHead className="min-w-[16rem]">Job</TableHead>
                      <TableHead className="min-w-[10rem]">Company</TableHead>
                      <TableHead className="min-w-[9rem]">Location</TableHead>
                      <TableHead className="min-w-[7rem]">Source</TableHead>
                      <TableHead className="min-w-[7rem]">Fetched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => {
                      const title = job.title || "Untitled job"
                      const company = job.company || "Unknown company"
                      const location = formatLocation(job) || "—"
                      const board = platformLabel(job)
                      const isActive = detail?.id === job.id
                      const isChecked = selected.has(job.id)
                      return (
                        <TableRow
                          key={job.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            isActive && "bg-muted",
                            isChecked && "bg-destructive/5",
                          )}
                          onClick={() => setDetail(job)}
                        >
                          {selectionMode && (
                            <TableCell
                              className="sticky left-0 z-10 bg-background"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Select ${title}`}
                                checked={isChecked}
                                onChange={() => toggleJob(job.id)}
                                className="size-4 accent-primary"
                              />
                            </TableCell>
                          )}
                          <TableCell className="align-top">
                            <div className="max-w-md">
                              <p
                                className="line-clamp-2 text-sm font-semibold leading-snug text-foreground"
                                title={title}
                              >
                                {title}
                              </p>
                              {board ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  via {board}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex max-w-[14rem] items-start gap-1.5">
                              <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                              <span className="line-clamp-2 text-sm" title={company}>
                                {company}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex max-w-[12rem] items-start gap-1.5">
                              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                              <span className="line-clamp-2 text-sm" title={location}>
                                {location}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="secondary">
                              {formatProviderLabel(job.provider_code)}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            <span
                              className="whitespace-nowrap text-sm text-muted-foreground"
                              title={formatAbsoluteTime(job.fetched_at)}
                            >
                              {formatRelativeTime(job.fetched_at)}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          {(hasPrev || hasNext || total > 0) && (
            <CardContent className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page}
                {total > 0 ? ` · ${total.toLocaleString()} total` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasPrev || jobsLoading}
                  onClick={() => {
                    setSelected(new Set())
                    setPage(page - 1)
                  }}
                  data-icon="inline-start"
                >
                  <ChevronLeft data-icon="inline-start" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasNext || jobsLoading}
                  onClick={() => {
                    setSelected(new Set())
                    setPage(page + 1)
                  }}
                  data-icon="inline-end"
                >
                  Next
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog
        open={Boolean(detail && detailView)}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          {detailView && (
            <>
              <DialogHeader className="space-y-3 border-b px-6 py-5 text-left">
                <div className="flex items-start gap-3">
                  {detailView.companyLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detailView.companyLogo}
                      alt=""
                      className="mt-0.5 size-12 shrink-0 rounded-lg border bg-background object-contain p-1"
                    />
                  ) : (
                    <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Building2 className="size-5 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl leading-snug">
                      {detailView.title}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-foreground/80">
                      {detailView.company}
                      {detailView.location ? ` · ${detailView.location}` : ""}
                    </DialogDescription>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {detailView.provider}
                      </Badge>
                      {detailView.platform &&
                        detailView.platform !== detailView.provider && (
                          <Badge variant="outline">{detailView.platform}</Badge>
                        )}
                      {detailView.jobType && (
                        <Badge variant="outline">{detailView.jobType}</Badge>
                      )}
                      {detailView.isRemote && (
                        <Badge variant="outline">{detailView.isRemote}</Badge>
                      )}
                      {detailView.jobLevel && (
                        <Badge variant="outline">{detailView.jobLevel}</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() => setDetail(null)}
                    aria-label="Close details"
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {detailView.listingUrl ? (
                    <Button
                      variant="default"
                      size="sm"
                      render={
                        <a
                          href={detailView.listingUrl}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                      data-icon="inline-end"
                    >
                      Open job link
                      <ExternalLink data-icon="inline-end" />
                    </Button>
                  ) : null}
                  {detailView.company && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const params = new URLSearchParams({
                          company: detailView.company,
                          location:
                            detailView.location !== "Location not specified"
                              ? detailView.location
                              : "",
                          autoRun: "1",
                        })
                        setDetail(null)
                        router.push(`/enrichment?${params.toString()}`)
                      }}
                      data-icon="inline-start"
                    >
                      <Sparkles data-icon="inline-start" />
                      Enrich contacts
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailFact label="Salary" value={detailView.salary} />
                  <DetailFact label="Experience" value={detailView.experience} />
                  <DetailFact label="Function" value={detailView.jobFunction} />
                  <DetailFact label="Industry" value={detailView.companyIndustry} />
                  <DetailFact
                    label="Posted"
                    value={
                      detailView.postedDate
                        ? detailView.postedDate.includes("T")
                          ? new Date(detailView.postedDate).toLocaleDateString()
                          : detailView.postedDate
                        : ""
                    }
                  />
                  <DetailFact label="Applicants" value={detailView.applicants} />
                </div>

                {detailView.skills.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Skills
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailView.skills.map((skill) => (
                        <Badge key={skill} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </p>
                  {detailView.description ? (
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/20 px-4 py-3 text-sm leading-relaxed">
                      {stripUrlsFromText(detailView.description)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No description available for this listing.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    Fetched {new Date(detailView.fetchedAt).toLocaleString()}
                  </span>
                  {detailView.externalId && (
                    <span className="truncate font-mono">
                      ID: {detailView.externalId}
                    </span>
                  )}
                </div>

                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRaw((prev) => !prev)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {showRaw ? "Hide raw provider data" : "Show raw provider data"}
                  </button>
                  {showRaw && detail && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                      {JSON.stringify(detail.raw_payload, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected jobs?</DialogTitle>
            <DialogDescription>
              This permanently removes {selected.size} job record(s) from the Job
              Explorer. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
              data-icon="inline-start"
            >
              {deleting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
