"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@base-ui/react/switch"
import {
  Activity,
  Cable,
  ContactRound,
  Clock,
  Gauge,
  KeyRound,
  Loader2,
  Coins,
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
import { useProfile, useEnrichmentSources } from "@/lib/hooks"
import {
  type EnrichmentSource,
  type EnrichmentSourceInput,
  type HealthStatus,
  createEnrichmentSource,
  updateEnrichmentSource,
  refreshEnrichmentCredits,
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

const PROVIDER_HINT = "Provider codes: contactout, apollo"

function formatCredit(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return value.toLocaleString()
}

function formatRemaining(
  remaining: number | null | undefined,
  quota: number | null | undefined,
): string {
  if (remaining == null && quota == null) return "—"
  if (quota == null) return `${formatCredit(remaining)} remaining`
  return `${formatCredit(remaining ?? 0)} remaining of ${formatCredit(quota)}`
}

type FormState = {
  name: string
  provider_code: string
  base_url: string
  rate_limit_rpm: string
  rate_limit_daily: string
  max_results: string
  titles: string
  webhook_url: string
}

const emptyForm: FormState = {
  name: "",
  provider_code: "",
  base_url: "",
  rate_limit_rpm: "30",
  rate_limit_daily: "500",
  max_results: "25",
  titles: "Recruiter, Talent Acquisition, HR",
  webhook_url: "",
}

function formFromSource(source: EnrichmentSource): FormState {
  const params = source.default_params
  return {
    name: source.name,
    provider_code: source.provider_code,
    base_url: source.base_url,
    rate_limit_rpm: String(source.rate_limit_rpm),
    rate_limit_daily: String(source.rate_limit_daily),
    max_results: String(params.max_results ?? "25"),
    titles: String(params.titles ?? ""),
    webhook_url: String(params.webhook_url ?? ""),
  }
}

function formToInput(form: FormState): EnrichmentSourceInput {
  const default_params: Record<string, string | number> = {
    max_results: Math.max(1, Number(form.max_results) || 25),
  }
  if (form.titles.trim()) default_params.titles = form.titles.trim()
  if (form.webhook_url.trim()) default_params.webhook_url = form.webhook_url.trim()
  return {
    name: form.name.trim(),
    provider_code: form.provider_code.trim().toLowerCase(),
    base_url: form.base_url.trim(),
    rate_limit_rpm: Math.max(1, Number(form.rate_limit_rpm) || 30),
    rate_limit_daily: Math.max(1, Number(form.rate_limit_daily) || 500),
    default_params,
  }
}

export default function AdminEnrichmentSourcesPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: sourcesPage, isLoading: sourcesLoading, refetch: refetchSources } = useEnrichmentSources()
  const sources = sourcesPage?.results ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EnrichmentSource | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [credTarget, setCredTarget] = useState<EnrichmentSource | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [savingCreds, setSavingCreds] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<EnrichmentSource | null>(null)
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

  function openEdit(source: EnrichmentSource) {
    setEditing(source)
    setForm(formFromSource(source))
    setFormOpen(true)
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await updateEnrichmentSource(editing.id, formToInput(form))
        toast.success("Provider updated successfully.")
      } else {
        await createEnrichmentSource(formToInput(form))
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

  async function toggleActive(source: EnrichmentSource) {
    try {
      await updateEnrichmentSource(source.id, { is_active: !source.is_active })
      refetchSources()
      toast.success(source.is_active ? "Provider disabled." : "Provider enabled.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle provider")
    }
  }

  async function refreshCredits(source: EnrichmentSource) {
    setRefreshingCredits(source.id)
    try {
      const result = await refreshEnrichmentCredits(source.id)
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
      await updateEnrichmentSource(credTarget.id, {
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
      await updateEnrichmentSource(deleteTarget.id, { is_active: false })
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
          icon={ContactRound}
          title="Enrichment Sources"
          description="Configure ContactOut and Apollo connectors, credentials, and remaining credits for the waterfall."
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
                icon={ContactRound}
                title="No enrichment providers configured"
                description="Add your first contact-enrichment connector to get started."
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
                  className={cn("flex flex-col", !source.is_active && "opacity-75")}
                >
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="truncate">{source.name}</span>
                        <Badge
                          variant="secondary"
                          className="shrink-0 font-mono text-[10px]"
                        >
                          {source.provider_code}
                        </Badge>
                      </CardTitle>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Badge
                          variant="outline"
                          className={cn("h-4 gap-1.5 px-1.5 text-[10px]", health.classes)}
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
                          source.is_active
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground",
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
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Email remaining
                          </p>
                          <p className="font-semibold">
                            {formatRemaining(
                              source.credit_usage?.email_remaining,
                              source.credit_usage?.email_quota,
                            )}
                          </p>
                          {source.credit_usage?.email_used != null && (
                            <p className="text-[11px] text-muted-foreground">
                              {formatCredit(source.credit_usage.email_used)} used
                              this cycle
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Phone remaining
                          </p>
                          <p className="font-semibold">
                            {source.credit_usage?.phone_quota === 0 &&
                            (source.credit_usage?.email_remaining ?? 0) > 0
                              ? "Uses email credits"
                              : formatRemaining(
                                  source.credit_usage?.phone_remaining,
                                  source.credit_usage?.phone_quota,
                                )}
                          </p>
                          {source.credit_usage?.phone_used != null &&
                            (source.credit_usage.phone_quota ?? 0) > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {formatCredit(source.credit_usage.phone_used)} used
                              this cycle
                            </p>
                          )}
                        </div>
                        {(source.credit_usage?.search_remaining != null ||
                          source.credit_usage?.search_quota != null) && (
                          <div className="col-span-2">
                            <p className="text-[11px] text-muted-foreground">
                              Search
                            </p>
                            <p className="font-semibold">
                              {formatCredit(source.credit_usage?.search_remaining)}
                              {source.credit_usage?.search_quota != null && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {" "}
                                  / {formatCredit(source.credit_usage.search_quota)}
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      {source.credit_usage?.updated_at ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Updated{" "}
                          {new Date(source.credit_usage.updated_at).toLocaleString()}
                          {source.credit_usage.cycle_end
                            ? ` · cycle ends ${new Date(source.credit_usage.cycle_end).toLocaleDateString()}`
                            : ""}
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
                        <span className="font-medium">Roles:</span>{" "}
                        {source.default_params.titles || "—"}
                      </p>
                      <p className="truncate">
                        <span className="font-medium">Max results:</span>{" "}
                        {source.default_params.max_results || "—"}
                      </p>
                      <p className="truncate">
                        <span className="font-medium">Apollo webhook:</span>{" "}
                        {source.default_params.webhook_url || "not set"}
                      </p>
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
          Disabled providers are skipped by the enrichment waterfall. API
          credentials are encrypted server-side and never exposed to the
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
                    placeholder="e.g. ContactOut"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-code">Provider code</Label>
                  <Input
                    id="source-code"
                    value={form.provider_code}
                    onChange={(e) =>
                      setForm({ ...form, provider_code: e.target.value })
                    }
                    placeholder="e.g. contactout"
                    disabled={editing !== null}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{PROVIDER_HINT}</p>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-results">Max results</Label>
                  <Input
                    id="source-results"
                    type="number"
                    min={1}
                    value={form.max_results}
                    onChange={(e) =>
                      setForm({ ...form, max_results: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="source-titles">Default roles</Label>
                  <Input
                    id="source-titles"
                    value={form.titles}
                    onChange={(e) => setForm({ ...form, titles: e.target.value })}
                    placeholder="Recruiter, Talent Acquisition, HR"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="source-webhook">
                  Apollo phone webhook URL
                </Label>
                <Input
                  id="source-webhook"
                  type="url"
                  value={form.webhook_url}
                  onChange={(e) =>
                    setForm({ ...form, webhook_url: e.target.value })
                  }
                  placeholder="https://your-public-endpoint.com/apollo-webhook"
                />
                <p className="text-xs text-muted-foreground">
                  Apollo only delivers phone numbers asynchronously. Setting a
                  public HTTPS URL here enables phone reveal for Apollo and the
                  results are polled into enriched contacts.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} data-icon="inline-start">
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
                <Label htmlFor="api-key">API key / token</Label>
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
                {savingCreds && (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                )}
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