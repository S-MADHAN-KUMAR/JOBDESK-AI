"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  XCircle,
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
import { AppShell } from "@/components/app-shell"
import { cn } from "@/lib/utils"
import { useProfile, useRawJobs, useJobProviders } from "@/lib/hooks"
import {
  type RawJob,
  deleteRawJobs,
  runCompanyEnrichment,
} from "@/lib/api"

type EnrichTarget = {
  company: string
  location: string
  titles: string[]
}

type EnrichState = {
  company: string
  status: "pending" | "running" | "done" | "failed"
  message: string
}

export default function JobExplorerPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [provider, setProvider] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<RawJob | null>(null)

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
  const [enrichOpen, setEnrichOpen] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichState, setEnrichState] = useState<EnrichState[]>([])

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const enrichTargets = useMemo(() => {
    const byCompany = new Map<string, { location: string; titles: Set<string> }>()
    for (const job of jobs) {
      if (!selected.has(job.id) || !job.company) continue
      const entry = byCompany.get(job.company) ?? {
        location: "",
        titles: new Set<string>(),
      }
      if (!entry.location && job.location) entry.location = job.location
      if (job.title) entry.titles.add(job.title)
      byCompany.set(job.company, entry)
    }
    const targets: EnrichTarget[] = []
    for (const [company, entry] of byCompany) {
      targets.push({
        company,
        location: entry.location,
        titles: [...entry.titles],
      })
    }
    return targets
  }, [jobs, selected])

  function applyFilters(p = 1) {
    setPage(p)
    setSelected(new Set())
  }

  function toggleJob(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === jobs.length
        ? new Set()
        : new Set(jobs.map((job) => job.id)),
    )
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteRawJobs([...selected])
      setDeleteOpen(false)
      setSelected(new Set())
      setSelectionMode(false)
      setError(null)
      void refetchJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete jobs")
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handleEnrich() {
    setEnrichOpen(true)
    setEnriching(true)
    setEnrichState(
      enrichTargets.map((target) => ({
        company: target.company,
        status: "pending",
        message: "",
      })),
    )
    for (let i = 0; i < enrichTargets.length; i++) {
      const target = enrichTargets[i]
      setEnrichState((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: "running", message: "" } : item,
        ),
      )
      try {
        const res = await runCompanyEnrichment({
          company_name: target.company,
          titles: target.titles.length > 0 ? target.titles.slice(0, 10) : undefined,
          location: target.location || undefined,
        })
        setEnrichState((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: res.success ? "done" : "failed",
                  message: res.message,
                }
              : item,
          ),
        )
      } catch (err) {
        setEnrichState((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: "failed",
                  message:
                    err instanceof Error ? err.message : "Enrichment failed",
                }
              : item,
          ),
        )
      }
    }
    setEnriching(false)
  }

  if (!me) return null

  const allSelected = jobs.length > 0 && selected.size === jobs.length

  return (
    <AppShell user={me} loading={profileLoading}>
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Job Explorer</h1>
          <p className="text-sm text-muted-foreground">
            Browse individual job records with raw-to-normalized source
            traceability
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

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
              <Label htmlFor="job-provider">Provider</Label>
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
                  <SelectItem value="all">All providers</SelectItem>
                  {providers.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
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

        <div className={cn("grid items-start gap-6", detail ? "lg:grid-cols-3" : "")}>
          <Card className={cn(detail && "lg:col-span-2")}>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Job records</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {selectionMode && selected.size > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleEnrich()}
                    disabled={enriching || enrichTargets.length === 0}
                    data-icon="inline-start"
                  >
                    <Sparkles data-icon="inline-start" />
                    Enrich ({enrichTargets.length})
                  </Button>
                )}
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
                    onClick={() => { setSelectionMode(false); setSelected(new Set()) }}
                  >
                    Cancel
                  </Button>
                )}
                {!selectionMode && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setSelectionMode(true)}
                    data-icon="inline-start"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">
                  {total} found
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {jobsLoading ? (
                <div className="flex justify-center items-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">Fetching records...</span>
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                  <BriefcaseBusiness className="size-8 text-muted-foreground" />
                  <p className="font-medium">No job records found</p>
                  <p className="text-sm text-muted-foreground">
                    Run an ingestion from Source Management to populate records.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectionMode && (
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            aria-label="Select all jobs"
                            checked={allSelected}
                            onChange={toggleAll}
                            className="size-4 accent-primary"
                          />
                        </TableHead>
                      )}
                      <TableHead>Title</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Fetched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow
                        key={job.id}
                        className={cn("cursor-pointer", detail?.id === job.id && "bg-muted")}
                        onClick={() => setDetail(job)}
                      >
                        {selectionMode && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${job.title || "job"}`}
                              checked={selected.has(job.id)}
                              onChange={() => toggleJob(job.id)}
                              className="size-4 accent-primary"
                            />
                          </TableCell>
                        )}
                        <TableCell className="max-w-64">
                          <span className="block truncate font-medium">
                            {job.title || "—"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {job.external_id}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-40">
                          <span className="block truncate">{job.company || "—"}</span>
                        </TableCell>
                        <TableCell className="max-w-40">
                          <span className="block truncate">{job.location || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {job.provider_code}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(job.fetched_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {(hasPrev || hasNext) && (
              <CardContent className="flex items-center justify-between border-t px-4 py-3">
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
                <span className="text-sm text-muted-foreground">Page {page}</span>
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
              </CardContent>
            )}
          </Card>

          {detail && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Job details</CardTitle>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDetail(null)}
                  aria-label="Close details"
                >
                  &times;
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="font-semibold leading-snug">
                      {detail.title || "Untitled job"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {detail.company || "Unknown company"}
                      {detail.location ? ` · ${detail.location}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {detail.provider_code}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(detail.fetched_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        render={<Link href={detail.url} target="_blank" />}
                        data-icon="inline-end"
                      >
                        View original listing
                        <ExternalLink data-icon="inline-end" />
                      </Button>
                    )}
                    {detail.company && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-fit"
                        onClick={() => {
                          const params = new URLSearchParams({
                            company: detail.company,
                            location: detail.location || "",
                            autoRun: "1",
                          })
                          router.push(`/enrichment?${params.toString()}`)
                        }}
                        data-icon="inline-start"
                      >
                        <Sparkles data-icon="inline-start" />
                        Enrich {detail.company}
                      </Button>
                    )}
                  </div>
                  {detail.description && (
                    <div className="max-h-48 overflow-y-auto rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                      {detail.description}
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Raw provider payload
                    </p>
                    <pre className="max-h-80 overflow-auto rounded-xl border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                      {JSON.stringify(detail.raw_payload, null, 2)}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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

      <Dialog open={enrichOpen} onOpenChange={setEnrichOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enrich selected companies</DialogTitle>
            <DialogDescription>
              Running the provider waterfall for each target company. Results are
              stored in the Enrichment workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {enrichState.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No target companies found in the selection.
              </p>
            ) : (
              enrichState.map((item) => (
                <div
                  key={item.company}
                  className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <span className="mt-0.5 shrink-0">
                    {item.status === "done" ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : item.status === "failed" ? (
                      <XCircle className="size-4 text-destructive" />
                    ) : item.status === "running" ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="block size-4 rounded-full border border-muted-foreground/40" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.company}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.status === "pending"
                        ? "Queued"
                        : item.status === "running"
                          ? "Running waterfall..."
                          : item.message || (item.status === "done" ? "Complete" : "")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrichOpen(false)}>
              {enriching ? "Enriching..." : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}