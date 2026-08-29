"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@base-ui/react/switch"
import {
  Activity,
  Cable,
  Clock,
  Coins,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Trash2,
  WifiOff,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
import { AppShell } from "@/components/app-shell"
import { PageHeader, EmptyState } from "@/components/page-header"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useProfile, useJobSources } from "@/lib/hooks"
import {
  type HealthStatus,
  type JobSource,
  type JobSourceInput,
  DEFAULT_APIFY_PLATFORMS,
  platformsForProvider,
  defaultPlatformsForProvider,
  createJobSource,
  updateJobSource,
  refreshJobSourceCredits,
} from "@/lib/api"

const HEALTH_META: Record<
  HealthStatus,
  { label: string; classes: string; dot: string }
> = {
  healthy: {
    label: "Healthy",
    classes: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  degraded: {
    label: "Degraded",
    classes: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  failed: {
    label: "Failed",
    classes: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  rate_limited: {
    label: "Rate Limited",
    classes: "border-transparent bg-orange-500/10 text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
  },
}

type FormState = {
  name: string
  provider_code: string
  base_url: string
  rate_limit_rpm: string
  rate_limit_daily: string
  keyword: string
  location: string
  country: string
  max_pages: string
  platforms: string[]
}

const emptyForm: FormState = {
  name: "",
  provider_code: "",
  base_url: "",
  rate_limit_rpm: "60",
  rate_limit_daily: "1000",
  keyword: "",
  location: "",
  country: "India",
  max_pages: "5",
  platforms: [...DEFAULT_APIFY_PLATFORMS],
}

function formatCredit(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return "—"
  if (decimals > 0) {
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    })
  }
  return Number(value).toLocaleString()
}

/** "Naukri" and "Naukri.com" name the same board across providers. */
function platformKey(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "")
  for (const suffix of ["couk", "com", "net", "org"]) {
    if (slug.length > suffix.length + 2 && slug.endsWith(suffix)) {
      return slug.slice(0, -suffix.length)
    }
  }
  return slug
}

function parsePlatforms(raw: unknown, providerCode = "apify"): string[] {
  const allowed = new Map(
    platformsForProvider(providerCode).map((name) => [platformKey(name), name]),
  )
  const fallback = defaultPlatformsForProvider(providerCode)
  let candidates: string[] = []
  if (Array.isArray(raw)) {
    candidates = raw.map(String)
  } else if (typeof raw === "string" && raw.trim()) {
    candidates = raw.split(",").map((p) => p.trim())
  } else {
    return fallback
  }
  const selected: string[] = []
  for (const candidate of candidates) {
    const canonical = allowed.get(platformKey(candidate))
    if (canonical && !selected.includes(canonical)) selected.push(canonical)
  }
  return selected.length > 0 ? selected : fallback
}

function formFromSource(source: JobSource): FormState {
  const params = source.default_params
  return {
    name: source.name,
    provider_code: source.provider_code,
    base_url: source.base_url,
    rate_limit_rpm: String(source.rate_limit_rpm),
    rate_limit_daily: String(source.rate_limit_daily),
    keyword: String(params.keyword ?? ""),
    location: String(params.location ?? ""),
    country: String(params.country ?? "India"),
    max_pages: String(params.max_pages ?? ""),
    platforms: parsePlatforms(params.platforms, source.provider_code),
  }
}

function formToInput(form: FormState): JobSourceInput {
  const provider = form.provider_code.trim().toLowerCase()
  const default_params: Record<string, string | number | string[]> = {
    max_pages: Math.max(1, Number(form.max_pages) || 1),
  }
  if (form.keyword.trim()) default_params.keyword = form.keyword.trim()
  if (form.location.trim()) default_params.location = form.location.trim()
  if (form.country.trim()) default_params.country = form.country.trim()
  if (provider === "apify" || provider === "serpapi") {
    const allowed = new Map(
      platformsForProvider(provider).map((name) => [platformKey(name), name]),
    )
    const cleaned: string[] = []
    for (const item of form.platforms) {
      const canonical = allowed.get(platformKey(item))
      if (canonical && !cleaned.includes(canonical)) cleaned.push(canonical)
    }
    default_params.platforms =
      cleaned.length > 0 ? cleaned : defaultPlatformsForProvider(provider)
  }

  return {
    name: form.name.trim(),
    provider_code: provider,
    base_url: form.base_url.trim(),
    rate_limit_rpm: Math.max(1, Number(form.rate_limit_rpm) || 60),
    rate_limit_daily: Math.max(1, Number(form.rate_limit_daily) || 1000),
    default_params,
  }
}

export default function AdminSourcesPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: sources = [], isLoading: sourcesLoading, refetch: refetchSources } = useJobSources()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<JobSource | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [credTarget, setCredTarget] = useState<JobSource | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [savingCreds, setSavingCreds] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<JobSource | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [refreshingCredits, setRefreshingCredits] = useState<string | null>(null)

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEdit(source: JobSource) {
    setEditing(source)
    setForm(formFromSource(source))
    setFormOpen(true)
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await updateJobSource(editing.id, formToInput(form))
        toast.success("Provider updated successfully.")
      } else {
        await createJobSource(formToInput(form))
        toast.success("Provider created successfully.")
      }
      setFormOpen(false)
      refetchSources()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save provider")
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(source: JobSource) {
    try {
      await updateJobSource(source.id, { is_active: !source.is_active })
      refetchSources()
      toast.success(source.is_active ? "Provider disabled." : "Provider enabled.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle provider")
    }
  }

  async function refreshCredits(source: JobSource) {
    setRefreshingCredits(source.id)
    try {
      const result = await refreshJobSourceCredits(source.id)
      if (!result.success) {
        toast.error(result.message || "Failed to refresh credits")
      } else {
        toast.success(result.message || "Credits refreshed.")
      }
      refetchSources()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh credits")
    } finally {
      setRefreshingCredits(null)
    }
  }

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!credTarget) return
    setSavingCreds(true)
    try {
      await updateJobSource(credTarget.id, {
        auth_config: { api_key: apiKey.trim() },
      })
      setCredTarget(null)
      setApiKey("")
      refetchSources()
      toast.success("Credentials saved.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save credentials")
    } finally {
      setSavingCreds(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await updateJobSource(deleteTarget.id, { is_active: false })
      setDeleteTarget(null)
      refetchSources()
      toast.success("Provider disabled.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable provider")
    } finally {
      setDeleting(false)
    }
  }

  if (!me) return null

  return (
    <AppShell user={me} loading={profileLoading}>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          variant="banner"
          icon={Cable}
          title="Source Management"
          description="Configure job-source connectors, credentials, rate limits, and live API credits."
          actions={
            <Button
              variant="outline"
              onClick={openCreate}
              data-icon="inline-start"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Plus data-icon="inline-start" />
              Add provider
            </Button>
          }
        />

        {sourcesLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="flex flex-col">
                <CardHeader className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-10 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sources.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Cable}
                title="No providers configured"
                description="Add your first job-source connector to get started."
                action={
                  <Button onClick={openCreate} data-icon="inline-start">
                    <Plus data-icon="inline-start" />
                    Add provider
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((source) => {
              const health = HEALTH_META[source.health_status]
              const usagePct = Math.min(
                100,
                Math.round((source.current_daily_uses / source.rate_limit_daily) * 100),
              )
              return (
                <Card
                  key={source.id}
                  className={cn(
                    "flex flex-col",
                    !source.is_active && "opacity-75",
                  )}
                >
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="truncate">{source.name}</span>
                        <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                          {source.provider_code}
                        </Badge>
                      </CardTitle>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-4 gap-1.5 px-1.5 text-[10px]",
                            health.classes,
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", health.dot)} />
                          {health.label}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="size-3" />
                          {source.auth_configured ? "Key set" : "No key"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          source.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                        )}
                      >
                        {source.is_active ? "Active" : "Disabled"}
                      </span>
                      <Switch.Root
                        checked={source.is_active}
                        onCheckedChange={() => void toggleActive(source)}
                        aria-label={`Toggle ${source.name}`}
                        className="group inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50"
                      >
                        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform group-data-checked:translate-x-[18px] group-data-checked:bg-primary-foreground" />
                      </Switch.Root>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col gap-4 p-4 pt-0">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Activity className="size-3.5" />
                          Daily usage
                        </p>
                        <p className="mt-1 text-lg font-semibold">
                          {source.current_daily_uses}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            / {source.rate_limit_daily}
                          </span>
                        </p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              usagePct >= 90
                                ? "bg-red-500"
                                : usagePct >= 70
                                  ? "bg-amber-500"
                                  : "bg-emerald-500",
                            )}
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Gauge className="size-3.5" />
                          RPM limit
                        </p>
                        <p className="mt-1 text-lg font-semibold">
                          {source.rate_limit_rpm}
                          <span className="text-sm font-normal text-muted-foreground">
                            {" "}
                            req/min
                          </span>
                        </p>
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />
                          {source.last_run_at
                            ? `Last run ${new Date(source.last_run_at).toLocaleString()}`
                            : "Never run"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Coins className="size-3.5" />
                          Remaining credits
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={
                            !source.auth_configured ||
                            refreshingCredits === source.id
                          }
                          onClick={() => void refreshCredits(source)}
                          data-icon="inline-start"
                        >
                          {refreshingCredits === source.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                          Refresh
                        </Button>
                      </div>
                      {source.provider_code === "serpapi" ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-[11px] text-muted-foreground">
                              Searches left
                            </p>
                            <p className="font-semibold">
                              {formatCredit(source.credit_usage?.searches_remaining)}
                              {source.credit_usage?.searches_quota != null && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {" "}
                                  / {formatCredit(source.credit_usage.searches_quota)}
                                </span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">
                              Used this month
                            </p>
                            <p className="font-semibold">
                              {formatCredit(source.credit_usage?.searches_used)}
                            </p>
                          </div>
                          {source.credit_usage?.plan_name && (
                            <div className="col-span-2">
                              <p className="text-[11px] text-muted-foreground">
                                Plan
                              </p>
                              <p className="truncate font-medium">
                                {source.credit_usage.plan_name}
                                {source.credit_usage.plan_renewal_date
                                  ? ` · renews ${source.credit_usage.plan_renewal_date}`
                                  : ""}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : source.provider_code === "apify" ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-[11px] text-muted-foreground">
                              USD left
                            </p>
                            <p className="font-semibold">
                              ${formatCredit(source.credit_usage?.usd_remaining, 2)}
                              {source.credit_usage?.usd_quota != null && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {" "}
                                  / ${formatCredit(source.credit_usage.usd_quota, 2)}
                                </span>
                              )}
                            </p>
                            {source.credit_usage?.usd_used != null && (
                              <p className="text-[11px] text-muted-foreground">
                                Used ${formatCredit(source.credit_usage.usd_used, 2)}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">
                              Compute units left
                            </p>
                            <p className="font-semibold">
                              {formatCredit(source.credit_usage?.compute_remaining, 2)}
                              {source.credit_usage?.compute_quota != null && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {" "}
                                  / {formatCredit(source.credit_usage.compute_quota, 2)}
                                </span>
                              )}
                            </p>
                            {source.credit_usage?.compute_used != null && (
                              <p className="text-[11px] text-muted-foreground">
                                Used {formatCredit(source.credit_usage.compute_used, 2)} CU
                              </p>
                            )}
                          </div>
                          {(source.credit_usage?.actor_count != null ||
                            source.credit_usage?.active_actor_jobs != null) && (
                            <div className="col-span-2">
                              <p className="text-[11px] text-muted-foreground">
                                Actors
                              </p>
                              <p className="font-medium">
                                {formatCredit(source.credit_usage?.actor_count)} actors
                                {source.credit_usage?.actor_task_count != null &&
                                  ` · ${formatCredit(source.credit_usage.actor_task_count)} tasks`}
                                {source.credit_usage?.active_actor_jobs != null &&
                                  ` · ${formatCredit(source.credit_usage.active_actor_jobs)} active`}
                              </p>
                            </div>
                          )}
                          {source.credit_usage?.cycle_end && (
                            <div className="col-span-2">
                              <p className="text-[11px] text-muted-foreground">
                                Billing cycle ends{" "}
                                {new Date(
                                  source.credit_usage.cycle_end,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Credit tracking not available for this provider
                        </p>
                      )}
                      {source.credit_usage?.updated_at ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Updated{" "}
                          {new Date(source.credit_usage.updated_at).toLocaleString()}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {source.auth_configured
                            ? "Click Refresh to pull live credits"
                            : "Add API key, then refresh credits"}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border p-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">
                        Target defaults
                      </p>
                      <p className="mt-1 truncate">
                        <span className="font-medium">Keyword:</span>{" "}
                        {source.default_params.keyword || "—"}
                      </p>
                      <p className="truncate">
                        <span className="font-medium">Location:</span>{" "}
                        {source.default_params.location || "—"}
                      </p>
                      {(source.provider_code === "apify" ||
                        source.provider_code === "serpapi") && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Platforms:{" "}
                          {Array.isArray(source.default_params.platforms)
                            ? source.default_params.platforms.join(", ")
                            : defaultPlatformsForProvider(
                                source.provider_code,
                              ).join(", ")}
                        </p>
                      )}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(source)}
                        data-icon="inline-start"
                      >
                        <Settings2 data-icon="inline-start" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCredTarget(source)}
                        data-icon="inline-start"
                      >
                        <KeyRound data-icon="inline-start" />
                        Credentials
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={`Disable ${source.name}`}
                        className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(source)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="size-3.5" />
          API credentials are encrypted server-side and are never exposed to the
          frontend.
        </p>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) setFormOpen(false)
        }}
      >
        <DialogContent>
          <form onSubmit={saveForm}>
            <DialogHeader>
              <DialogTitle>
                {editing ? `Edit ${editing.name}` : "Add new provider"}
              </DialogTitle>
              <DialogDescription>
                Configure connector details and rate limits
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-name">Name</Label>
                  <Input
                    id="source-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. SerpApi Google"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-code">Provider code</Label>
                  <Input
                    id="source-code"
                    value={form.provider_code}
                    onChange={(e) => {
                      const code = e.target.value
                      setForm({
                        ...form,
                        provider_code: code,
                        platforms: defaultPlatformsForProvider(code),
                      })
                    }}
                    placeholder="e.g. serpapi"
                    disabled={editing !== null}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="source-url">Base URL</Label>
                <Input
                  id="source-url"
                  type="url"
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-rpm">Rate limit (RPM)</Label>
                  <Input
                    id="source-rpm"
                    type="number"
                    min={1}
                    value={form.rate_limit_rpm}
                    onChange={(e) =>
                      setForm({ ...form, rate_limit_rpm: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-daily">Daily limit</Label>
                  <Input
                    id="source-daily"
                    type="number"
                    min={1}
                    value={form.rate_limit_daily}
                    onChange={(e) =>
                      setForm({ ...form, rate_limit_daily: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="source-keyword">Default keyword</Label>
                <Input
                  id="source-keyword"
                  value={form.keyword}
                  onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                  placeholder="e.g. Java Backend Developer"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-location">Default location</Label>
                  <Input
                    id="source-location"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    placeholder="e.g. Chennai"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-country">Country</Label>
                  <Input
                    id="source-country"
                    value={form.country}
                    onChange={(e) =>
                      setForm({ ...form, country: e.target.value })
                    }
                    placeholder="e.g. India"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-pages">Max results</Label>
                  <Input
                    id="source-pages"
                    type="number"
                    min={1}
                    value={form.max_pages}
                    onChange={(e) =>
                      setForm({ ...form, max_pages: e.target.value })
                    }
                  />
                </div>
              </div>
              {(form.provider_code.trim().toLowerCase() === "apify" ||
                form.provider_code.trim().toLowerCase() === "serpapi") && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>
                      {form.provider_code.trim().toLowerCase() === "serpapi"
                        ? "SerpApi job platforms"
                        : "Apify job platforms"}
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setForm({
                            ...form,
                            platforms: [
                              ...platformsForProvider(form.provider_code),
                            ],
                          })
                        }
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setForm({
                            ...form,
                            platforms: defaultPlatformsForProvider(
                              form.provider_code,
                            ),
                          })
                        }
                      >
                        Defaults
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.provider_code.trim().toLowerCase() === "serpapi"
                      ? "Only boards Google Jobs reports in via. Indeed/Naukri may be sparse for India queries."
                      : "Boards supported by the Apify all-jobs scraper."}
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {platformsForProvider(form.provider_code).map((platform) => {
                        const checked = form.platforms.some(
                          (p) => platformKey(p) === platformKey(platform),
                        )
                        return (
                          <label
                            key={platform}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setForm({
                                  ...form,
                                  platforms: checked
                                    ? form.platforms.filter(
                                        (p) =>
                                          platformKey(p) !==
                                          platformKey(platform),
                                      )
                                    : [...form.platforms, platform],
                                })
                              }}
                              className="size-4 accent-primary"
                            />
                            {platform}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {
                      form.platforms.filter((p) =>
                        platformsForProvider(form.provider_code).some(
                          (allowed) =>
                            platformKey(allowed) === platformKey(p),
                        ),
                      ).length
                    }{" "}
                    platform
                    {form.platforms.length === 1 ? "" : "s"} selected
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  ((form.provider_code.trim().toLowerCase() === "apify" ||
                    form.provider_code.trim().toLowerCase() === "serpapi") &&
                    form.platforms.length === 0)
                }
                data-icon="inline-start"
              >
                {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {saving ? "Saving..." : editing ? "Save changes" : "Create provider"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={credTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCredTarget(null)
            setApiKey("")
          }
        }}
      >
        <DialogContent>
          <form onSubmit={saveCredentials}>
            <DialogHeader>
              <DialogTitle>API credentials</DialogTitle>
              <DialogDescription>
                {credTarget
                  ? `Securely store the API key for ${credTarget.name}.`
                  : ""}{" "}
                Encrypted server-side, never exposed to the browser.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-key">API key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API key / token"
                  required
                  autoComplete="off"
                />
              </div>
              {credTarget?.auth_configured && (
                <p className="text-xs text-muted-foreground">
                  A key is already configured. Saving will replace it.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCredTarget(null)
                  setApiKey("")
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingCreds} data-icon="inline-start">
                {savingCreds && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {savingCreds ? "Saving..." : "Save credentials"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable provider</DialogTitle>
            <DialogDescription>
              This pauses the connector. Existing configuration is kept and can
              be re-enabled at any time.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <WifiOff className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{deleteTarget.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {deleteTarget.provider_code} ·{" "}
                  {HEALTH_META[deleteTarget.health_status].label}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              data-icon="inline-start"
            >
              {deleting && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {deleting ? "Disabling..." : "Disable provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}