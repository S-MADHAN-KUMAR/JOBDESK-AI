"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  Info,
  Loader2,
  RefreshCw,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { AppShell } from "@/components/app-shell"
import {
  fetchPipelineHealth,
  type PipelineHealth,
  fetchDataQuality,
  type DataQualityMetrics,
  fetchConfidenceMonitoring,
  type ConfidenceMonitoring,
  fetchRawVsNormalized,
  type RawVsNormalized,
  fetchDemandMovements,
  type DemandMovement,
  triggerSnapshot,
  purgeAllIngestionData,
  fetchLLMConfig,
  updateLLMConfig,
  type LLMConfig,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { useProfile } from "@/lib/hooks"

type Tab = "pipeline" | "quality" | "confidence" | "raw-vs-normalized" | "movements" | "llm"

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "pipeline", label: "Pipeline Health", icon: Activity },
  { key: "quality", label: "Data Quality", icon: BarChart3 },
  { key: "confidence", label: "Confidence", icon: Target },
  { key: "raw-vs-normalized", label: "Raw vs Normalized", icon: Eye },
  { key: "movements", label: "Demand Movements", icon: TrendingUp },
  { key: "llm", label: "LLM Settings", icon: Zap },
]

function qualityColor(pct: number): string {
  if (pct < 30) return "bg-emerald-500"
  if (pct < 60) return "bg-amber-500"
  return "bg-red-500"
}

function qualityText(pct: number): string {
  if (pct < 30) return "text-emerald-700 dark:text-emerald-400"
  if (pct < 60) return "text-amber-700 dark:text-amber-400"
  return "text-red-700 dark:text-red-400"
}

function confidenceBadge(score: number) {
  if (score >= 0.8)
    return "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  if (score >= 0.5)
    return "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400"
  return "border-transparent bg-red-500/10 text-red-700 dark:text-red-400"
}

export default function AdminPipelinePage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [tab, setTab] = useState<Tab>("pipeline")

  const [health, setHealth] = useState<PipelineHealth | null>(null)
  const [quality, setQuality] = useState<DataQualityMetrics | null>(null)
  const [confidence, setConfidence] = useState<ConfidenceMonitoring | null>(null)
  const [movements, setMovements] = useState<DemandMovement[]>([])
  const [movementPeriod, setMovementPeriod] = useState("30")

  const [rawSearch, setRawSearch] = useState("")
  const [rawResult, setRawResult] = useState<RawVsNormalized | null>(null)
  const [rawLoading, setRawLoading] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)

  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const [purgeOpen, setPurgeOpen] = useState(false)
  const [purging, setPurging] = useState(false)

  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null)
  const [llmProvider, setLlmProvider] = useState("none")
  const [llmModel, setLlmModel] = useState("")
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmMessage, setLlmMessage] = useState<string | null>(null)

  function refresh() {
    setReloadKey((k) => k + 1)
  }

  useEffect(() => {
    if (profileError) {
      router.push("/login")
      return
    }
  }, [profileError, router])

  useEffect(() => {
    if (!me || profileLoading) return
    let cancelled = false

    async function run() {
      try {
        if (!me || me.role !== "ADMIN") {
          setError("Access denied: Admin role required.")
          return
        }

        const [h, q, c, llm] = await Promise.all([
          fetchPipelineHealth(),
          fetchDataQuality(),
          fetchConfidenceMonitoring(),
          fetchLLMConfig().catch(() => null),
        ])
        if (cancelled) return
        setHealth(h)
        setQuality(q)
        setConfidence(c)
        if (llm) {
          setLlmConfig(llm)
          setLlmProvider(llm.provider)
          setLlmModel(llm.model)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load pipeline data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [me, profileLoading, reloadKey])

  useEffect(() => {
    if (tab !== "movements") return
    let cancelled = false

    fetchDemandMovements(movementPeriod)
      .then((res) => {
        if (!cancelled) setMovements(res.movements)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load movements")
      })

    return () => {
      cancelled = true
    }
  }, [tab, movementPeriod])

  async function handleRawSearch(e: React.FormEvent) {
    e.preventDefault()
    const id = rawSearch.trim()
    if (!id) return
    setRawLoading(true)
    setRawError(null)
    setRawResult(null)
    try {
      const result = await fetchRawVsNormalized(id)
      setRawResult(result)
    } catch (err) {
      setRawError(err instanceof Error ? err.message : "Job not found")
    } finally {
      setRawLoading(false)
    }
  }

  async function handleSnapshot() {
    setSnapshotLoading(true)
    setError(null)
    try {
      await triggerSnapshot()
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snapshot trigger failed")
    } finally {
      setSnapshotLoading(false)
    }
  }

  async function handlePurge() {
    setPurging(true)
    setError(null)
    try {
      await purgeAllIngestionData()
      setPurgeOpen(false)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purge failed")
    } finally {
      setPurging(false)
    }
  }

  async function handleSaveLLM() {
    setLlmSaving(true)
    setLlmMessage(null)
    try {
      await updateLLMConfig({ provider: llmProvider, model: llmModel })
      setLlmMessage("LLM config saved. Restart the backend for changes to take effect.")
    } catch (err) {
      setLlmMessage(err instanceof Error ? err.message : "Failed to save LLM config")
    } finally {
      setLlmSaving(false)
    }
  }

  if (!me) return null

  if (profileError) {
    return (
      <AppShell user={me} loading>
        <div className="p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Access denied: Admin role required.
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell user={me} loading={loading}>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Pipeline Health &amp; Data Quality
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor ingestion pipeline, data quality metrics, and confidence scores
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              data-icon="inline-start"
            >
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleSnapshot}
              disabled={snapshotLoading}
              data-icon="inline-start"
            >
              {snapshotLoading && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {snapshotLoading ? "Triggering..." : "Trigger Snapshot"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setPurgeOpen(true)}
              data-icon="inline-start"
            >
              <Trash2 data-icon="inline-start" />
              Purge All Data
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted p-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === "pipeline" && health && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Raw Jobs
                  </CardTitle>
                  <Database className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{health.total_raw_jobs.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Canonical Jobs
                  </CardTitle>
                  <CheckCircle2 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{health.total_canonical_jobs.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Deduplication Rate
                  </CardTitle>
                  <Zap className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{health.deduplication_rate_pct.toFixed(1)}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {health.total_source_records.toLocaleString()} source records
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Providers
                  </CardTitle>
                  <Activity className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{health.provider_stats.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Provider Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {health.provider_stats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No provider data available.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {health.provider_stats.map((p) => (
                      <div
                        key={p.provider_code}
                        className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
                      >
                        <span className="font-medium">{p.provider_code}</span>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {p.total.toLocaleString()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {health.recent_runs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Runs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provider</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Fetched</TableHead>
                          <TableHead className="text-right">Errors</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Ended</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {health.recent_runs.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium">{run.provider}</TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-xs",
                                  run.status === "completed"
                                    ? "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                    : run.status === "failed"
                                      ? "border-transparent bg-red-500/10 text-red-700 dark:text-red-400"
                                      : "",
                                )}
                              >
                                {run.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{run.fetched_count}</TableCell>
                            <TableCell className="text-right tabular-nums">{run.error_count}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {run.started_at ? new Date(run.started_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {run.ended_at ? new Date(run.ended_at).toLocaleString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === "quality" && quality && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { label: "Missing Salary", pct: quality.missing_salary_pct },
                { label: "Missing Experience", pct: quality.missing_experience_pct },
                { label: "Missing Company", pct: quality.missing_company_pct },
                { label: "Missing Location", pct: quality.missing_location_pct },
              ] as const).map((item) => (
                <Card key={item.label}>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {item.label}
                    </CardTitle>
                    {item.pct >= 60 ? (
                      <AlertTriangle className="size-4 text-red-500" />
                    ) : (
                      <Info className="size-4 text-muted-foreground" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className={cn("text-3xl font-bold", qualityText(item.pct))}>
                      {item.pct.toFixed(1)}%
                    </p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all", qualityColor(item.pct))}
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Work Mode Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {quality.work_mode_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    <div className="space-y-2">
                      {quality.work_mode_distribution.map((w) => {
                        const total = quality.total_canonical_jobs || 1
                        const pct = Math.round((w.count / total) * 100)
                        return (
                          <div key={w.work_mode} className="flex items-center justify-between text-sm">
                            <span className="truncate">{w.work_mode || "Unknown"}</span>
                            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                              {w.count.toLocaleString()} ({pct}%)
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Seniority Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {quality.seniority_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    <div className="space-y-2">
                      {quality.seniority_distribution.map((s) => {
                        const total = quality.total_canonical_jobs || 1
                        const pct = Math.round((s.count / total) * 100)
                        return (
                          <div key={s.seniority} className="flex items-center justify-between text-sm">
                            <span className="truncate">{s.seniority || "Unknown"}</span>
                            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                              {s.count.toLocaleString()} ({pct}%)
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Confidence Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {quality.confidence_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    <div className="space-y-2">
                      {quality.confidence_distribution.map((c) => (
                        <div key={c.score} className="flex items-center justify-between text-sm">
                          <span className="truncate">Score {c.score}</span>
                          <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                            {c.count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {tab === "confidence" && confidence && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Average Confidence
                  </CardTitle>
                  <Target className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {(confidence.average_confidence * 100).toFixed(1)}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {confidence.total_classified.toLocaleString()} classified jobs
                  </p>
                </CardContent>
              </Card>
              <Card className="sm:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Classification Methods</CardTitle>
                </CardHeader>
                <CardContent>
                  {confidence.method_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No method data available.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Method</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Avg Confidence</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {confidence.method_distribution.map((m) => (
                            <TableRow key={m.classification_method}>
                              <TableCell className="font-medium">{m.classification_method}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {m.count.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {(m.avg_confidence * 100).toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Low Confidence Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                {confidence.low_confidence_jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No low confidence jobs found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {confidence.low_confidence_jobs.map((job) => (
                      <div
                        key={job.id}
                        className="rounded-lg border bg-muted/30 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{job.title}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {job.company || "Unknown company"} · {job.role_category || "Unclassified"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant="outline" className={cn("text-xs", confidenceBadge(job.confidence))}>
                              {(job.confidence * 100).toFixed(0)}%
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setExpandedJob(expandedJob === job.id ? null : job.id)
                              }
                            >
                              {expandedJob === job.id ? (
                                <ChevronUp className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {expandedJob === job.id && (
                          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Job ID</p>
                              <p className="truncate font-mono text-xs">{job.id}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Company</p>
                              <p className="truncate">{job.company || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Role Category</p>
                              <p className="truncate">{job.role_category || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Method</p>
                              <p className="truncate">{job.method}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "raw-vs-normalized" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw vs Normalized Inspector</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRawSearch} className="flex gap-2">
                  <Input
                    value={rawSearch}
                    onChange={(e) => setRawSearch(e.target.value)}
                    placeholder="Enter canonical job UUID"
                    className="flex-1 font-mono"
                  />
                  <Button type="submit" disabled={rawLoading} data-icon="inline-start">
                    {rawLoading && <Loader2 className="animate-spin" data-icon="inline-start" />}
                    {rawLoading ? "Loading..." : "Inspect"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {rawError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {rawError}
              </div>
            )}

            {rawResult && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Canonical Job</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {([
                        { label: "Title", value: rawResult.canonical_job.title },
                        { label: "Normalized Title", value: rawResult.canonical_job.normalized_title },
                        { label: "Company (Raw)", value: rawResult.canonical_job.company_name_raw },
                        { label: "Company (Normalized)", value: rawResult.canonical_job.company_name },
                        { label: "Company (Master)", value: rawResult.canonical_job.company ?? rawResult.canonical_job.company_name },
                        { label: "Location (Raw)", value: rawResult.canonical_job.location_raw },
                        { label: "Location (Normalized)", value: rawResult.canonical_job.location_text },
                        { label: "Location (Master)", value: rawResult.canonical_job.location ?? rawResult.canonical_job.location_text },
                        { label: "Work Mode", value: rawResult.canonical_job.work_mode },
                        { label: "Employment Type", value: rawResult.canonical_job.employment_type },
                        { label: "Seniority", value: rawResult.canonical_job.seniority },
                        { label: "Experience", value: rawResult.canonical_job.experience_text },
                        { label: "Salary", value: rawResult.canonical_job.salary_text },
                        { label: "Posted Date", value: rawResult.canonical_job.posted_date },
                        { label: "Status", value: rawResult.canonical_job.status },
                        { label: "Confidence", value: `${(rawResult.canonical_job.classification_confidence * 100).toFixed(1)}%` },
                      ]).map((f) => (
                        <div key={f.label}>
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                          <p className="truncate text-sm">{f.value || "—"}</p>
                        </div>
                      ))}
                    </div>
                    {rawResult.canonical_job.description && (
                      <div className="mt-4">
                        <p className="text-xs text-muted-foreground">Description (truncated)</p>
                        <p className="mt-1 line-clamp-6 text-sm leading-relaxed">
                          {rawResult.canonical_job.description.slice(0, 1500)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {rawResult.classification && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Classification</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Role Category</p>
                          <p className="text-sm">{rawResult.classification.role_category}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Method</p>
                          <p className="text-sm">{rawResult.classification.method}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Confidence</p>
                          <p className="text-sm">
                            {(rawResult.classification.confidence_score * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Primary Technologies</p>
                          <p className="text-sm">
                            {rawResult.classification.primary_technologies.length > 0
                              ? rawResult.classification.primary_technologies.join(", ")
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Secondary Technologies</p>
                          <p className="text-sm">
                            {rawResult.classification.secondary_technologies.length > 0
                              ? rawResult.classification.secondary_technologies.join(", ")
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Skills</p>
                          <p className="text-sm">
                            {rawResult.classification.skills.length > 0
                              ? rawResult.classification.skills.join(", ")
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Source Records ({rawResult.source_records.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rawResult.source_records.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No source records found.</p>
                    ) : (
                      <div className="space-y-3">
                        {rawResult.source_records.map((sr) => (
                          <div
                            key={sr.id}
                            className="rounded-lg border bg-muted/30 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="font-mono text-[10px]">
                                  {sr.provider_code}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {sr.match_type}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {sr.fetched_at ? new Date(sr.fetched_at).toLocaleString() : "—"}
                              </span>
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Raw Title</p>
                                <p className="text-sm">{sr.raw_title}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Raw Company</p>
                                <p className="text-sm">{sr.raw_company}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Raw Location</p>
                                <p className="text-sm">{sr.raw_location}</p>
                              </div>
                            </div>
                            {sr.raw_description && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">Raw Description (truncated)</p>
                                <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">
                                  {sr.raw_description.slice(0, 800)}
                                </p>
                              </div>
                            )}
                            {sr.url && (
                              <div className="mt-2">
                                <a
                                  href={sr.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                  View source listing
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === "movements" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Period:</span>
              <Select value={movementPeriod} onValueChange={(v) => setMovementPeriod(v ?? "")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {movements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                    <BarChart3 className="mb-2 size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No demand movement data available for the selected period.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role Category</TableHead>
                          <TableHead className="text-right">Start</TableHead>
                          <TableHead className="text-right">End</TableHead>
                          <TableHead className="text-right">New</TableHead>
                          <TableHead className="text-right">Expired</TableHead>
                          <TableHead className="text-right">Net Change</TableHead>
                          <TableHead className="text-right">Change %</TableHead>
                          <TableHead>Period</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.role_category}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.active_jobs_start}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.active_jobs_end}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className="text-emerald-600 dark:text-emerald-400">
                                +{m.new_postings}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className="text-red-600 dark:text-red-400">
                                -{m.expired_postings}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 font-medium",
                                  m.net_change > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : m.net_change < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {m.net_change > 0 ? (
                                  <TrendingUp className="size-3" />
                                ) : m.net_change < 0 ? (
                                  <TrendingDown className="size-3" />
                                ) : null}
                                {m.net_change > 0 ? "+" : ""}
                                {m.net_change}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span
                                className={cn(
                                  "font-medium",
                                  m.change_percentage > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : m.change_percentage < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {m.change_percentage > 0 ? "+" : ""}
                                {m.change_percentage.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(m.period_start).toLocaleDateString()} –{" "}
                              {new Date(m.period_end).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "llm" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">LLM Classification Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Choose which LLM provider to use for AI-powered job classification.
                  Changes require a backend restart.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>Provider</Label>
                    <Select
                      value={llmProvider}
                      onValueChange={(v) => {
                        setLlmProvider(v ?? "none")
                        if (llmConfig?.providers) {
                          const models = llmConfig.providers[v ?? "none"]?.models || []
                          if (models.length > 0) setLlmModel(models[0])
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {llmConfig?.providers
                          ? Object.entries(llmConfig.providers).map(([key, info]) => (
                              <SelectItem key={key} value={key}>
                                {info.label}
                              </SelectItem>
                            ))
                          : (
                              <>
                                <SelectItem value="none">Disabled</SelectItem>
                                <SelectItem value="openai">OpenAI</SelectItem>
                                <SelectItem value="anthropic">Anthropic</SelectItem>
                                <SelectItem value="groq">Groq</SelectItem>
                              </>
                            )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Model</Label>
                    <Select
                      value={llmModel}
                      onValueChange={(v) => setLlmModel(v ?? "")}
                      disabled={llmProvider === "none"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {llmConfig?.providers?.[llmProvider]?.models.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        )) || (
                          <>
                            <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                            <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {llmMessage && (
                  <div
                    className={cn(
                      "rounded-lg border px-4 py-3 text-sm",
                      llmMessage.includes("saved")
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                        : "border-destructive/30 bg-destructive/5 text-destructive",
                    )}
                  >
                    {llmMessage}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={handleSaveLLM} disabled={llmSaving} data-icon="inline-start">
                    {llmSaving && <Loader2 className="animate-spin" data-icon="inline-start" />}
                    {llmSaving ? "Saving..." : "Save LLM Config"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog
        open={purgeOpen}
        onOpenChange={(open) => !open && setPurgeOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Purge All Ingestion Data</DialogTitle>
            <DialogDescription>
              This will <strong>permanently delete</strong> ALL ingestion pipeline data:
              raw jobs, canonical jobs, source records, classifications, snapshots,
              demand movements, and employer scores. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Type <strong>CONFIRM_PURGE</strong> in the box below to proceed.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handlePurge}
              disabled={purging}
              data-icon="inline-start"
            >
              {purging && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {purging ? "Purging..." : "Purge Everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
