"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@base-ui/react/switch"
import {
  Activity,
  Cable,
  CircleCheck,
  CircleX,
  Clock,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  Settings2,
  ShieldAlert,
  Trash2,
  WifiOff,
  Wrench,
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
import { AppShell } from "@/components/app-shell"
import { Loader } from "@/components/loader"
import {
  type HealthStatus,
  type IngestionRunResult,
  type JobSource,
  type JobSourceInput,
  type User,
  createJobSource,
  fetchJobSources,
  fetchProfile,
  runJobSourceIngestion,
  updateJobSource,
} from "@/lib/api"
import { cn } from "@/lib/utils"

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
  }
}

function formToInput(form: FormState): JobSourceInput {
  const default_params: Record<string, string | number> = {
    max_pages: Math.max(1, Number(form.max_pages) || 1),
  }
  if (form.keyword.trim()) default_params.keyword = form.keyword.trim()
  if (form.location.trim()) default_params.location = form.location.trim()
  if (form.country.trim()) default_params.country = form.country.trim()

  return {
    name: form.name.trim(),
    provider_code: form.provider_code.trim().toLowerCase(),
    base_url: form.base_url.trim(),
    rate_limit_rpm: Math.max(1, Number(form.rate_limit_rpm) || 60),
    rate_limit_daily: Math.max(1, Number(form.rate_limit_daily) || 1000),
    default_params,
  }
}

export default function AdminSourcesPage() {
  const router = useRouter()
  const [me, setMe] = useState<User | null>(null)
  const [sources, setSources] = useState<JobSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<JobSource | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [credTarget, setCredTarget] = useState<JobSource | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [savingCreds, setSavingCreds] = useState(false)

  const [testTarget, setTestTarget] = useState<JobSource | null>(null)
  const [testForm, setTestForm] = useState({
    keyword: "",
    location: "",
    country: "India",
    max_pages: "5",
  })
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<
    Record<string, IngestionRunResult>
  >({})

  const [deleteTarget, setDeleteTarget] = useState<JobSource | null>(null)
  const [deleting, setDeleting] = useState(false)

  function refresh() {
    setReloadKey((key) => key + 1)
  }

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const profile = await fetchProfile()
        if (cancelled) return
        setMe(profile)
        if (profile.role !== "ADMIN") {
          setError("Access denied: Admin role required.")
          return
        }
        const list = await fetchJobSources()
        if (!cancelled) setSources(list)
      } catch (err) {
        if (cancelled) return
        if (err instanceof Error && err.message === "Session expired") {
          router.push("/login")
        } else {
          setError(err instanceof Error ? err.message : "Failed to load sources")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [router, reloadKey])

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
    setError(null)
    try {
      if (editing) {
        await updateJobSource(editing.id, formToInput(form))
      } else {
        await createJobSource(formToInput(form))
      }
      setFormOpen(false)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider")
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(source: JobSource) {
    setError(null)
    try {
      await updateJobSource(source.id, { is_active: !source.is_active })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle provider")
    }
  }

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!credTarget) return
    setSavingCreds(true)
    setError(null)
    try {
      await updateJobSource(credTarget.id, {
        auth_config: { api_key: apiKey.trim() },
      })
      setCredTarget(null)
      setApiKey("")
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials")
    } finally {
      setSavingCreds(false)
    }
  }

  function openTest(source: JobSource) {
    setTestForm({
      keyword: String(source.default_params.keyword ?? ""),
      location: String(source.default_params.location ?? ""),
      country: String(source.default_params.country ?? "India"),
      max_pages: String(source.default_params.max_pages ?? "5"),
    })
    setTestTarget(source)
  }

  async function submitTest(e: React.FormEvent) {
    e.preventDefault()
    if (!testTarget) return
    setTesting(true)
    setError(null)
    try {
      const result = await runJobSourceIngestion(testTarget.id, {
        keyword: testForm.keyword.trim() || undefined,
        location: testForm.location.trim() || undefined,
        country: testForm.country.trim() || undefined,
        max_pages: Math.max(1, Number(testForm.max_pages) || 1),
      })
      setTestResults((prev) => ({ ...prev, [testTarget.id]: result }))
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test ingestion failed")
    } finally {
      setTesting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await updateJobSource(deleteTarget.id, { is_active: false })
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable provider")
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background">
        <Loader label="Loading providers..." />
      </main>
    )
  }

  if (!me) return null

  return (
    <AppShell user={me}>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Source Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure job-source connectors, credentials, and rate limits
            </p>
          </div>
          <Button onClick={openCreate} data-icon="inline-start">
            <Plus data-icon="inline-start" />
            Add new provider
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {sources.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Cable className="size-6" />
              </span>
              <div>
                <p className="font-medium">No providers configured</p>
                <p className="text-sm text-muted-foreground">
                  Add your first job-source connector to get started.
                </p>
              </div>
              <Button onClick={openCreate} data-icon="inline-start">
                <Plus data-icon="inline-start" />
                Add new provider
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((source) => {
              const health = HEALTH_META[source.health_status]
              const test = testResults[source.id]
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
                    </div>

                    {test && (
                      <div
                        className={cn(
                          "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                          test.success
                            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                            : "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400",
                        )}
                      >
                        {test.success ? (
                          <CircleCheck className="mt-0.5 size-4 shrink-0" />
                        ) : (
                          <CircleX className="mt-0.5 size-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span>{test.message}</span>
                          {typeof test.fetched_count === "number" && (
                            <p className="mt-0.5 text-xs opacity-80">
                              {test.fetched_count} stored · {test.error_count}{" "}
                              errors
                            </p>
                          )}
                        </div>
                      </div>
                    )}

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
                        variant="secondary"
                        size="sm"
                        onClick={() => openTest(source)}
                        data-icon="inline-start"
                      >
                        <Wrench data-icon="inline-start" />
                        Test connection
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
                    onChange={(e) =>
                      setForm({ ...form, provider_code: e.target.value })
                    }
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
        open={testTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTestTarget(null)
        }}
      >
        <DialogContent>
          <form onSubmit={submitTest}>
            <DialogHeader>
              <DialogTitle>Test ingestion</DialogTitle>
              <DialogDescription>
                {testTarget
                  ? `Fetch jobs from ${testTarget.name} with the filters below.`
                  : ""}{" "}
                Results are stored in the raw jobs table.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="test-keyword">Keyword</Label>
                <Input
                  id="test-keyword"
                  value={testForm.keyword}
                  onChange={(e) =>
                    setTestForm({ ...testForm, keyword: e.target.value })
                  }
                  placeholder="e.g. Java Backend Developer"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="test-location">Location</Label>
                  <Input
                    id="test-location"
                    value={testForm.location}
                    onChange={(e) =>
                      setTestForm({ ...testForm, location: e.target.value })
                    }
                    placeholder="e.g. Chennai"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="test-country">Country</Label>
                  <Input
                    id="test-country"
                    value={testForm.country}
                    onChange={(e) =>
                      setTestForm({ ...testForm, country: e.target.value })
                    }
                    placeholder="e.g. India"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="test-pages">Max results</Label>
                  <Input
                    id="test-pages"
                    type="number"
                    min={1}
                    value={testForm.max_pages}
                    onChange={(e) =>
                      setTestForm({ ...testForm, max_pages: e.target.value })
                    }
                  />
                </div>
              </div>
              {testTarget && testResults[testTarget.id] && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                    testResults[testTarget.id].success
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400",
                  )}
                >
                  {testResults[testTarget.id].success ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CircleX className="mt-0.5 size-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p>{testResults[testTarget.id].message}</p>
                    {typeof testResults[testTarget.id].fetched_count ===
                      "number" && (
                      <p className="mt-0.5 text-xs opacity-80">
                        {testResults[testTarget.id].fetched_count} stored ·{" "}
                        {testResults[testTarget.id].error_count} errors
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTestTarget(null)}>
                Close
              </Button>
              <Button type="submit" disabled={testing} data-icon="inline-start">
                {testing && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {testing ? "Running..." : "Run test"}
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