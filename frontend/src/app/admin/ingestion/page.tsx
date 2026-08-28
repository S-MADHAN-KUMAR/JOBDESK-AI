"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  AlertTriangle,
  Loader2,
  RefreshCw,
  XCircle,
  Pencil,
  Search,
  Square,
  Trash2,
  Timer,
  Plus,
  X,
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
  type User,
  type JobSource,
  type IngestionRun,
  fetchJobSources,
  fetchIngestionRuns,
  triggerManualRun,
  bulkDeleteIngestionRuns,
  updateProfile,
  changePassword,
} from "@/lib/api"
import { useProfile } from "@/lib/hooks"
import { cn } from "@/lib/utils"

type RunStatus = IngestionRun["status"]

const STATUS_META: Record<
  RunStatus,
  { label: string; classes: string; icon: React.ElementType }
> = {
  pending: {
    label: "Pending",
    classes: "border-transparent bg-muted text-muted-foreground",
    icon: Clock,
  },
  running: {
    label: "Running",
    classes: "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-400",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    classes: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    classes: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
    icon: XCircle,
  },
  partial: {
    label: "Partial",
    classes: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: AlertTriangle,
  },
}

type ScheduleFrequency = "once" | "daily" | "weekly" | "monthly"

type Schedule = {
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
  frequency: ScheduleFrequency
  time: string
  dayOfWeek: number
  dayOfMonth: number
  startDate: string
  totalRuns: number
  runsCompleted: number
  enabled: boolean
  lastRun: string | null
  lastRunStatus: "success" | "error" | null
  lastError: string | null
  nextRun: string
}

function getSchedules(): Schedule[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem("demandaccel_schedules") || "[]")
  } catch {
    return []
  }
}

function saveSchedules(schedules: Schedule[]) {
  localStorage.setItem("demandaccel_schedules", JSON.stringify(schedules))
}

function parse12hTime(time12h: string): { hours24: number; minutes: number } {
  const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return { hours24: 9, minutes: 0 }
  let h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === "AM") {
    if (h === 12) h = 0
  } else {
    if (h !== 12) h += 12
  }
  return { hours24: h, minutes: m }
}

function calculateNextRun(schedule: Schedule): string {
  const now = new Date()
  const { hours24, minutes } = parse12hTime(schedule.time || "9:00 AM")

  if (schedule.frequency === "once") {
    const start = new Date(schedule.startDate)
    start.setHours(hours24, minutes, 0, 0)
    if (start <= now) {
      return new Date(now.getTime() + 60_000).toISOString()
    }
    return start.toISOString()
  }

  const next = new Date(now)
  next.setHours(hours24, minutes, 0, 0)

  if (schedule.frequency === "daily") {
    if (next <= now) next.setDate(next.getDate() + 1)
    return next.toISOString()
  }

  if (schedule.frequency === "weekly") {
    const currentDay = now.getDay()
    let daysUntil = schedule.dayOfWeek - currentDay
    if (daysUntil < 0) daysUntil += 7
    if (daysUntil === 0 && next <= now) daysUntil = 7
    next.setDate(next.getDate() + daysUntil)
    return next.toISOString()
  }

  if (schedule.frequency === "monthly") {
    next.setDate(schedule.dayOfMonth)
    if (next <= now) next.setMonth(next.getMonth() + 1)
    return next.toISOString()
  }

  return next.toISOString()
}

function formatScheduleNext(nextRun: string): string {
  const next = new Date(nextRun)
  const now = new Date()
  const diffMs = next.getTime() - now.getTime()
  if (diffMs < 0) return "Overdue"
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `in ${days}d ${hours % 24}h`
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatDuration(started: string | null, ended: string | null): string {
  if (!started) return "—"
  const start = new Date(started).getTime()
  const end = ended ? new Date(ended).getTime() : Date.now()
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

export default function AdminIngestionPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const [runs, setRuns] = useState<IngestionRun[]>([])
  const [totalRuns, setTotalRuns] = useState(0)
  const [runsPage, setRunsPage] = useState(1)
  const [runsPageSize] = useState(25)
  const [runsTotalPages, setRunsTotalPages] = useState(1)
  const [sources, setSources] = useState<JobSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setRunsPage(1)
  }, [debouncedSearch, statusFilter])

  const [autoRefresh, setAutoRefresh] = useState(false)

  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [profileOpen, setProfileOpen] = useState(false)
  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
  })
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState("")
  const [passwordSuccess, setPasswordSuccess] = useState("")

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0, label: "" })
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleForm, setScheduleForm] = useState<Partial<Schedule>>({
    frequency: "daily",
    time: "9:00 AM",
    dayOfWeek: 1,
    dayOfMonth: 1,
    startDate: new Date().toISOString().split("T")[0],
    totalRuns: 0,
    enabled: true,
    source_id: "",
    keyword: "",
    location: "",
    country: "India",
    max_pages: "5",
    min_salary: "",
    max_salary: "",
    employment_type: "",
    work_mode: "",
    role: "",
    posted_within: "",
  })

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    setSchedules(getSchedules())
  }, [])

  useEffect(() => {
    function tick() {
      const now = new Date()
      const enabled = schedules.filter(
        (s) => s.enabled && (s.totalRuns === 0 || s.runsCompleted < s.totalRuns),
      )
      if (enabled.length === 0) {
        setCountdown({ h: 0, m: 0, s: 0, label: "No active schedules" })
        return
      }
      let nearest: Date | null = null
      let nearestLabel = ""
      for (const s of enabled) {
        const next = new Date(s.nextRun)
        if (!nearest || next < nearest) {
          nearest = next
          nearestLabel = "All enabled providers"
        }
      }
      if (!nearest) {
        setCountdown({ h: 0, m: 0, s: 0, label: "No active schedules" })
        return
      }
      const diffMs = nearest.getTime() - now.getTime()
      if (diffMs <= 0) {
        setCountdown({ h: 0, m: 0, s: 0, label: `Running: ${nearestLabel}...` })
        return
      }
      const totalSec = Math.floor(diffMs / 1000)
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      const s = totalSec % 60
      setCountdown({ h, m, s, label: nearestLabel })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [schedules, sources])

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
        const [runsPageData, sourcesList] = await Promise.all([
          fetchIngestionRuns({
            status: statusFilter !== "all" ? statusFilter : undefined,
            search: debouncedSearch || undefined,
            page: runsPage,
            page_size: runsPageSize,
          }),
          fetchJobSources(),
        ])
        if (cancelled) return
        setRuns(runsPageData.results)
        setTotalRuns(runsPageData.count)
        setRunsTotalPages(Math.max(1, Math.ceil(runsPageData.count / runsPageSize)))
        setSources(sourcesList)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load ingestion data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [me, profileLoading, statusFilter, debouncedSearch, runsPage, runsPageSize, reloadKey])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [autoRefresh, refresh])

  useEffect(() => {
    const id = setInterval(() => {
      const current = getSchedules()
      const now = new Date()
      let changed = false

      const updated = current.map((s) => {
        if (!s.enabled) return s
        if (s.totalRuns > 0 && s.runsCompleted >= s.totalRuns) return s
        const nextRun = new Date(s.nextRun)
        if (nextRun <= now) {
          changed = true
          const newCompleted = s.runsCompleted + 1
          const shouldDisable = s.totalRuns > 0 && newCompleted >= s.totalRuns

          triggerManualRun({
            source_id: s.source_id,
            keyword: s.keyword.trim() || undefined,
            location: s.location.trim() || undefined,
            country: s.country.trim() || undefined,
            max_pages: Math.max(1, Number(s.max_pages) || 1),
            min_salary: s.min_salary ? Number(s.min_salary) : undefined,
            max_salary: s.max_salary ? Number(s.max_salary) : undefined,
            employment_type: s.employment_type || undefined,
            work_mode: s.work_mode || undefined,
            role: s.role.trim() || undefined,
            posted_within: s.posted_within || undefined,
          })
            .then(() => {
              const fresh = getSchedules()
              const idx = fresh.findIndex((x) => x.id === s.id)
              if (idx !== -1) {
                fresh[idx] = {
                  ...fresh[idx],
                  lastRunStatus: "success",
                  lastError: null,
                }
                saveSchedules(fresh)
                setSchedules([...fresh])
              }
            })
            .catch((err) => {
              const fresh = getSchedules()
              const idx = fresh.findIndex((x) => x.id === s.id)
              if (idx !== -1) {
                fresh[idx] = {
                  ...fresh[idx],
                  lastRunStatus: "error",
                  lastError: err instanceof Error ? err.message : "Request failed",
                }
                saveSchedules(fresh)
                setSchedules([...fresh])
              }
            })

          return {
            ...s,
            runsCompleted: newCompleted,
            lastRun: now.toISOString(),
            lastRunStatus: null,
            lastError: null,
            nextRun: calculateNextRun(s),
            enabled: !shouldDisable,
          }
        }
        return s
      })

      if (changed) {
        saveSchedules(updated)
        setSchedules(updated)
        refresh()
      }
    }, 30_000)

    return () => clearInterval(id)
  }, [refresh])

  function saveSchedule() {
    const newSchedule: Schedule = {
      id: Date.now().toString(),
      source_id: "all",
      keyword: scheduleForm.keyword || "",
      location: scheduleForm.location || "",
      country: scheduleForm.country || "India",
      max_pages: scheduleForm.max_pages || "5",
      min_salary: scheduleForm.min_salary || "",
      max_salary: scheduleForm.max_salary || "",
      employment_type: scheduleForm.employment_type || "",
      work_mode: scheduleForm.work_mode || "",
      role: scheduleForm.role || "",
      posted_within: scheduleForm.posted_within || "",
      frequency: scheduleForm.frequency || "daily",
      time: scheduleForm.time || "9:00 AM",
      dayOfWeek: scheduleForm.dayOfWeek ?? 1,
      dayOfMonth: scheduleForm.dayOfMonth ?? 1,
      startDate: scheduleForm.startDate || new Date().toISOString().split("T")[0],
      totalRuns: scheduleForm.totalRuns || 0,
      runsCompleted: 0,
      enabled: true,
      lastRun: null,
      lastRunStatus: null,
      lastError: null,
      nextRun: "",
    }
    newSchedule.nextRun = calculateNextRun(newSchedule)
    const updated = [...schedules, newSchedule]
    saveSchedules(updated)
    setSchedules(updated)
    setScheduleOpen(false)
  }

  function toggleSchedule(id: string) {
    const updated = schedules.map((s) => {
      if (s.id !== id) return s
      const toggled = { ...s, enabled: !s.enabled }
      if (toggled.enabled) {
        toggled.nextRun = calculateNextRun(toggled)
      }
      return toggled
    })
    saveSchedules(updated)
    setSchedules(updated)
  }

  function deleteSchedule(id: string) {
    const updated = schedules.filter((s) => s.id !== id)
    saveSchedules(updated)
    setSchedules(updated)
  }

  function toggleSelectRun(id: string) {
    setSelectedRuns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const pageIds = runs.map((r) => r.id)
    setSelectedRuns((prev) => {
      const allSelected = pageIds.every((id) => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        for (const id of pageIds) next.delete(id)
        return next
      }
      return new Set([...prev, ...pageIds])
    })
  }

  async function confirmDeleteRuns() {
    setDeleting(true)
    setError(null)
    try {
      await bulkDeleteIngestionRuns(Array.from(selectedRuns))
      setSelectedRuns(new Set())
      setDeleteConfirmOpen(false)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete runs")
    } finally {
      setDeleting(false)
    }
  }

  function openProfile() {
    setProfileForm({
      first_name: me?.first_name || "",
      last_name: me?.last_name || "",
      email: me?.email || "",
    })
    setPasswordForm({ current_password: "", new_password: "", confirm_password: "" })
    setProfileSuccess("")
    setPasswordSuccess("")
    setProfileOpen(true)
  }

  async function saveProfile() {
    setSavingProfile(true)
    setProfileSuccess("")
    setError(null)
    try {
      await updateProfile(profileForm)
      setProfileSuccess("Profile updated successfully")
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword() {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError("New passwords do not match")
      return
    }
    setSavingPassword(true)
    setPasswordSuccess("")
    setError(null)
    try {
      await changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      })
      setPasswordSuccess("Password changed successfully")
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password")
    } finally {
      setSavingPassword(false)
    }
  }

  const filteredRuns = runs

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
              Ingestion Runs
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor ingestion pipeline runs and manage schedules
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openProfile}
              data-icon="inline-start"
            >
              <Pencil data-icon="inline-start" />
              Edit Profile
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
              data-icon="inline-start"
            >
              <RefreshCw
                className={cn("size-4", autoRefresh && "animate-spin")}
                data-icon="inline-start"
              />
              {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
            </Button>
            {selectedRuns.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                data-icon="inline-start"
              >
                <Trash2 data-icon="inline-start" />
                Delete ({selectedRuns.size})
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Timer className="size-4" />
                Scheduled Runs {schedules.length > 0 && `(${schedules.length})`}
              </CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 font-mono text-sm">
                  <span className="text-lg font-bold tabular-nums">
                    {String(countdown.h).padStart(2, "0")}:{String(countdown.m).padStart(2, "0")}:{String(countdown.s).padStart(2, "0")}
                  </span>
                  <span className="text-xs text-muted-foreground max-w-[120px] truncate">
                    {countdown.label}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScheduleOpen(true)}
                  data-icon="inline-start"
                >
                  <Plus data-icon="inline-start" />
                  Add schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No schedules yet. Add a schedule to automate ingestion runs.
                </p>
              ) : (
              <div className="space-y-3">
                {schedules.map((s) => {
                  const source = sources.find((src) => src.id === s.source_id)
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "flex items-center justify-between rounded-xl border p-3 transition-all",
                        !s.enabled && "opacity-50",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleSchedule(s.id)}
                          className={cn(
                            "size-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            s.enabled
                              ? "border-primary bg-primary text-white"
                              : "border-muted-foreground/30",
                          )}
                        >
                          {s.enabled && <CheckCircle2 className="size-3" />}
                        </button>
                        <div>
                          <p className="text-sm font-medium">
                            All enabled providers — {s.keyword || "All jobs"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.frequency === "once"
                              ? "One-time"
                              : s.frequency === "daily"
                                ? `Daily at ${s.time}`
                                : s.frequency === "weekly"
                                  ? `Weekly on ${DAYS[s.dayOfWeek]} at ${s.time}`
                                  : `Monthly on ${s.dayOfMonth} at ${s.time}`}
                            {s.totalRuns > 0 && ` · ${s.runsCompleted}/${s.totalRuns} runs`}
                          </p>
                          {s.lastError && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                              Last run failed: {s.lastError}
                            </p>
                          )}
                          {s.lastRunStatus === "success" && s.lastRun && (
                            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                              Last run succeeded
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {s.enabled ? `Next: ${formatScheduleNext(s.nextRun)}` : "Paused"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteSchedule(s.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </CardContent>
          </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by provider name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Clock className="size-6" />
              </span>
              <div>
                <p className="font-medium">No ingestion runs found</p>
                <p className="text-sm text-muted-foreground">
                  {runs.length === 0
                    ? "Trigger a manual run or create a schedule."
                    : "No runs match the current filters."}
                </p>
              </div>
              {runs.length === 0 && (
                <Button
                  variant="outline"
                  onClick={() => setScheduleOpen(true)}
                  data-icon="inline-start"
                >
                  <Timer data-icon="inline-start" />
                  Create schedule
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-muted rounded">
                      {runs.length > 0 && runs.every((r) => selectedRuns.has(r.id)) ? (
                        <CheckSquare className="size-4" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fetched</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => {
                  const meta = STATUS_META[run.status]
                  const StatusIcon = meta.icon
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <button
                          onClick={() => toggleSelectRun(run.id)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {selectedRuns.has(run.id) ? (
                            <CheckSquare className="size-4 text-primary" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{run.provider}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {run.provider_code}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("gap-1.5", meta.classes)}
                        >
                          <StatusIcon
                            className={cn(
                              "size-3",
                              run.status === "running" && "animate-spin",
                            )}
                          />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {run.fetched_count}
                      </TableCell>
                      <TableCell className="text-right">
                        {run.error_count > 0 ? (
                          <span className="font-mono text-sm text-red-600 dark:text-red-400">
                            {run.error_count}
                          </span>
                        ) : (
                          <span className="font-mono text-sm text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {run.started_at
                          ? new Date(run.started_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {run.ended_at
                          ? new Date(run.ended_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDuration(run.started_at, run.ended_at)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {runsTotalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Page {runsPage} of {runsTotalPages} ({totalRuns} total)
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={runsPage <= 1}
                    onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={runsPage >= runsTotalPages}
                    onClick={() => setRunsPage((p) => Math.min(runsTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create ingestion schedule</DialogTitle>
            <DialogDescription>
              Set up recurring ingestion runs with custom frequency and timing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Keyword</Label>
              <Input
                value={scheduleForm.keyword || ""}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, keyword: e.target.value })
                }
                placeholder="e.g. Java Backend Developer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Location</Label>
                <Input
                  value={scheduleForm.location || ""}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, location: e.target.value })
                  }
                  placeholder="e.g. Chennai"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Country</Label>
                <Input
                  value={scheduleForm.country || "India"}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, country: e.target.value })
                  }
                  placeholder="e.g. India"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Min salary (LPA)</Label>
                <Input
                  type="number"
                  min={0}
                  value={scheduleForm.min_salary || ""}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, min_salary: e.target.value })
                  }
                  placeholder="e.g. 5"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Max salary (LPA)</Label>
                <Input
                  type="number"
                  min={0}
                  value={scheduleForm.max_salary || ""}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, max_salary: e.target.value })
                  }
                  placeholder="e.g. 25"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Employment type</Label>
                <Select
                  value={scheduleForm.employment_type || "any"}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, employment_type: !v || v === "any" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="fulltime">Full-time</SelectItem>
                    <SelectItem value="parttime">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Work mode</Label>
                <Select
                  value={scheduleForm.work_mode || "any"}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, work_mode: !v || v === "any" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Input
                  value={scheduleForm.role || ""}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, role: e.target.value })
                  }
                  placeholder="e.g. Backend Developer"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Posted within</Label>
                <Select
                  value={scheduleForm.posted_within || "any"}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, posted_within: !v || v === "any" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any time</SelectItem>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="2d">Last 2 days</SelectItem>
                    <SelectItem value="week">Last week</SelectItem>
                    <SelectItem value="10d">Last 10 days</SelectItem>
                    <SelectItem value="month">Last month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Frequency</Label>
                <Select
                  value={scheduleForm.frequency}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, frequency: v as ScheduleFrequency })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Time</Label>
                <div className="flex gap-2">
                  <Select
                    value={(() => {
                      const t = scheduleForm.time || "9:00 AM"
                      const h = parseInt(t.split(":")[0], 10)
                      return String(h)
                    })()}
                    onValueChange={(v) => {
                      const current = scheduleForm.time || "9:00 AM"
                      const period = current.includes("PM") ? "PM" : "AM"
                      const minutes = current.split(":")[1]?.split(" ")[0] || "00"
                      setScheduleForm({ ...scheduleForm, time: `${v}:${minutes} ${period}` })
                    }}
                  >
                    <SelectTrigger className="w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center text-muted-foreground">:</span>
                  <Select
                    value={(() => {
                      const t = scheduleForm.time || "9:00 AM"
                      return t.split(":")[1]?.split(" ")[0] || "00"
                    })()}
                    onValueChange={(v) => {
                      const current = scheduleForm.time || "9:00 AM"
                      const hour = current.split(":")[0]
                      const period = current.includes("PM") ? "PM" : "AM"
                      setScheduleForm({ ...scheduleForm, time: `${hour}:${v} ${period}` })
                    }}
                  >
                    <SelectTrigger className="w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={(() => {
                      const t = scheduleForm.time || "9:00 AM"
                      return t.includes("PM") ? "PM" : "AM"
                    })()}
                    onValueChange={(v) => {
                      const current = scheduleForm.time || "9:00 AM"
                      const timePart = current.split(" ")[0]
                      setScheduleForm({ ...scheduleForm, time: `${timePart} ${v}` })
                    }}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {scheduleForm.frequency === "weekly" && (
              <div className="flex flex-col gap-2">
                <Label>Day of week</Label>
                <Select
                  value={String(scheduleForm.dayOfWeek ?? 1)}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, dayOfWeek: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scheduleForm.frequency === "monthly" && (
              <div className="flex flex-col gap-2">
                <Label>Day of month (1-31)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={scheduleForm.dayOfMonth ?? 1}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value))),
                    })
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={scheduleForm.startDate || new Date().toISOString().split("T")[0]}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, startDate: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Total runs (0 = unlimited)</Label>
                <Input
                  type="number"
                  min={0}
                  value={scheduleForm.totalRuns ?? 0}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, totalRuns: Number(e.target.value) })
                  }
                  placeholder="0 = unlimited"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveSchedule}
              data-icon="inline-start"
            >
              <Timer data-icon="inline-start" />
              Create schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => !open && setDeleteConfirmOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete ingestion runs</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedRuns.size} ingestion run(s) and
              all associated raw job records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteRuns}
              disabled={deleting}
              data-icon="inline-start"
            >
              {deleting && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {deleting ? "Deleting..." : `Delete ${selectedRuns.size} run(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your account name, email, and password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-6 py-4">
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-medium text-muted-foreground">Personal Info</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>First name</Label>
                  <Input
                    value={profileForm.first_name}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, first_name: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Last name</Label>
                  <Input
                    value={profileForm.last_name}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, last_name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, email: e.target.value })
                  }
                />
              </div>
              {profileSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{profileSuccess}</p>
              )}
              <Button
                onClick={saveProfile}
                disabled={savingProfile}
                className="self-start"
                data-icon="inline-start"
              >
                {savingProfile && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Save Profile
              </Button>
            </div>

            <div className="border-t pt-4 flex flex-col gap-4">
              <h4 className="text-sm font-medium text-muted-foreground">Change Password</h4>
              <div className="flex flex-col gap-2">
                <Label>Current password</Label>
                <Input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, current_password: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>New password</Label>
                  <Input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, new_password: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Confirm new password</Label>
                  <Input
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                    }
                  />
                </div>
              </div>
              {passwordSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{passwordSuccess}</p>
              )}
              <Button
                onClick={savePassword}
                disabled={savingPassword}
                className="self-start"
                data-icon="inline-start"
              >
                {savingPassword && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Change Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
