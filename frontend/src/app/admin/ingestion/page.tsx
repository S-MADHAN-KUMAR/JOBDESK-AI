"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  AlertTriangle,
  Database,
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
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"
import {
  type User,
  type JobSource,
  type IngestionRun,
  APIFY_JOB_PLATFORMS,
  DEFAULT_APIFY_PLATFORMS,
  SERPAPI_JOB_PLATFORMS,
  DEFAULT_SERPAPI_PLATFORMS,
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

function platformKey(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "")
  for (const suffix of ["couk", "com", "net", "org"]) {
    if (slug.length > suffix.length + 2 && slug.endsWith(suffix)) {
      return slug.slice(0, -suffix.length)
    }
  }
  return slug
}

function splitLegacyPlatforms(platforms: string[]): {
  apify: string[]
  serpapi: string[]
} {
  const apify: string[] = []
  const serpapi: string[] = []
  const apifyByKey = new Map(
    APIFY_JOB_PLATFORMS.map((name) => [platformKey(name), name]),
  )
  const serpByKey = new Map(
    SERPAPI_JOB_PLATFORMS.map((name) => [platformKey(name), name]),
  )
  for (const raw of platforms) {
    const key = platformKey(raw)
    const a = apifyByKey.get(key)
    const s = serpByKey.get(key)
    if (a && !apify.includes(a)) apify.push(a)
    if (s && !serpapi.includes(s)) serpapi.push(s)
  }
  return { apify, serpapi }
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
  /** @deprecated Prefer apify_platforms / serpapi_platforms. */
  platforms: string[]
  apify_platforms?: string[]
  serpapi_platforms?: string[]
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

function platformsForSchedule(
  schedule: Pick<Schedule, "apify_platforms" | "serpapi_platforms" | "platforms">,
  providerCode: string,
): string[] {
  const code = providerCode.trim().toLowerCase()
  if (code === "apify") {
    if (schedule.apify_platforms && schedule.apify_platforms.length > 0) {
      return schedule.apify_platforms
    }
  } else if (code === "serpapi") {
    if (schedule.serpapi_platforms && schedule.serpapi_platforms.length > 0) {
      return schedule.serpapi_platforms
    }
  }
  return schedule.platforms ?? []
}

function displayPlatforms(
  schedule: Pick<Schedule, "apify_platforms" | "serpapi_platforms" | "platforms">,
): string[] {
  const merged = [
    ...(schedule.apify_platforms ?? []),
    ...(schedule.serpapi_platforms ?? []),
  ]
  if (merged.length > 0) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const name of merged) {
      const key = platformKey(name)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(name)
    }
    return out
  }
  return schedule.platforms ?? []
}

function normalizeSchedule(raw: Schedule): Schedule {
  const hasSplit =
    (raw.apify_platforms && raw.apify_platforms.length > 0) ||
    (raw.serpapi_platforms && raw.serpapi_platforms.length > 0)
  if (hasSplit) {
    const normalized = {
      ...raw,
      apify_platforms: raw.apify_platforms ?? [],
      serpapi_platforms: raw.serpapi_platforms ?? [],
    }
    return {
      ...normalized,
      platforms: displayPlatforms(normalized),
    }
  }
  const split = splitLegacyPlatforms(raw.platforms ?? [])
  return {
    ...raw,
    apify_platforms:
      split.apify.length > 0 ? split.apify : [...DEFAULT_APIFY_PLATFORMS],
    serpapi_platforms:
      split.serpapi.length > 0 ? split.serpapi : [...DEFAULT_SERPAPI_PLATFORMS],
    platforms: raw.platforms ?? [],
  }
}

function getSchedules(): Schedule[] {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(
      localStorage.getItem("demandaccel_schedules") || "[]",
    ) as Schedule[]
    return parsed
      .map(normalizeSchedule)
      .sort((a, b) => {
        const aTime = Number(a.id) || new Date(a.lastRun || 0).getTime()
        const bTime = Number(b.id) || new Date(b.lastRun || 0).getTime()
        return bTime - aTime
      })
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

function toTimeInputValue(time12h: string): string {
  const { hours24, minutes } = parse12hTime(time12h)
  return `${String(hours24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function fromTimeInputValue(value: string): string {
  const [hourStr, minuteStr] = value.split(":")
  let h = parseInt(hourStr || "9", 10)
  const m = parseInt(minuteStr || "0", 10)
  const period = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, "0")} ${period}`
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

function formatScheduleNext(nextRun: string, nowMs = Date.now()): string {
  const diffMs = new Date(nextRun).getTime() - nowMs
  if (diffMs < 0) return "Overdue"
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `in ${days}d ${hours % 24}h`
}

function getCountdownParts(nextRun: string, nowMs: number) {
  const diffMs = new Date(nextRun).getTime() - nowMs
  if (diffMs <= 0) {
    return { h: 0, m: 0, s: 0, totalMs: diffMs, overdue: true }
  }
  const totalSec = Math.floor(diffMs / 1000)
  return {
    h: Math.floor(totalSec / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
    totalMs: diffMs,
    overdue: false,
  }
}

function formatCountdownClock(parts: { h: number; m: number; s: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  if (parts.h >= 24) {
    const days = Math.floor(parts.h / 24)
    const hours = parts.h % 24
    return `${days}d ${pad(hours)}:${pad(parts.m)}:${pad(parts.s)}`
  }
  return `${pad(parts.h)}:${pad(parts.m)}:${pad(parts.s)}`
}

function formatAbsoluteNext(nextRun: string): string {
  const next = new Date(nextRun)
  return next.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function frequencyLabel(schedule: Schedule): string {
  if (schedule.frequency === "once") return "One-time"
  if (schedule.frequency === "daily") return `Daily · ${schedule.time}`
  if (schedule.frequency === "weekly") {
    return `Weekly · ${DAYS[schedule.dayOfWeek]} · ${schedule.time}`
  }
  return `Monthly · day ${schedule.dayOfMonth} · ${schedule.time}`
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const FREQUENCY_BADGE: Record<ScheduleFrequency, string> = {
  once: "border-transparent bg-slate-500/10 text-slate-700 dark:text-slate-300",
  daily: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  weekly: "border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-400",
  monthly: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
}

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
  const hasApify = sources.some((s) => s.provider_code === "apify")
  const hasSerpapi = sources.some((s) => s.provider_code === "serpapi")
  const [loading, setLoading] = useState(true)
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

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [schedulesPage, setSchedulesPage] = useState(1)
  const schedulesPageSize = 10
  const [nowMs, setNowMs] = useState(() => Date.now())
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
    platforms: [...DEFAULT_APIFY_PLATFORMS],
    apify_platforms: [...DEFAULT_APIFY_PLATFORMS],
    serpapi_platforms: [...DEFAULT_SERPAPI_PLATFORMS],
  })

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    setSchedules(getSchedules())
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const activeSchedules = schedules.filter(
    (s) => s.enabled && (s.totalRuns === 0 || s.runsCompleted < s.totalRuns),
  )
  const nextUpcoming = activeSchedules
    .slice()
    .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())[0]
  const nextUpcomingParts = nextUpcoming
    ? getCountdownParts(nextUpcoming.nextRun, nowMs)
    : null

  const schedulesNewestFirst = [...schedules].sort((a, b) => {
    const aTime = Number(a.id) || new Date(a.lastRun || 0).getTime()
    const bTime = Number(b.id) || new Date(b.lastRun || 0).getTime()
    return bTime - aTime
  })
  const schedulesTotalPages = Math.max(
    1,
    Math.ceil(schedulesNewestFirst.length / schedulesPageSize),
  )
  const safeSchedulesPage = Math.min(schedulesPage, schedulesTotalPages)
  const pageSchedules = schedulesNewestFirst.slice(
    (safeSchedulesPage - 1) * schedulesPageSize,
    safeSchedulesPage * schedulesPageSize,
  )

  useEffect(() => {
    if (schedulesPage > schedulesTotalPages) {
      setSchedulesPage(schedulesTotalPages)
    }
  }, [schedulesPage, schedulesTotalPages])

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
          toast.error("Access denied: Admin role required.")
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
        toast.error(err instanceof Error ? err.message : "Failed to load ingestion data")
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

          const basePayload = {
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
          }

          const runPromise =
            s.source_id === "all"
              ? fetchJobSources().then((list) =>
                  Promise.all(
                    list
                      .filter((src) => src.is_active)
                      .map((src) => {
                        const boards = platformsForSchedule(s, src.provider_code)
                        return triggerManualRun({
                          ...basePayload,
                          source_id: src.id,
                          platforms: boards.length > 0 ? boards : undefined,
                        })
                      }),
                  ),
                )
              : triggerManualRun({
                  ...basePayload,
                  source_id: s.source_id,
                  platforms: (() => {
                    const src = sources.find((x) => x.id === s.source_id)
                    const boards = platformsForSchedule(
                      s,
                      src?.provider_code || "",
                    )
                    return boards.length > 0 ? boards : undefined
                  })(),
                })

          runPromise
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
    const apify_platforms =
      scheduleForm.apify_platforms && scheduleForm.apify_platforms.length > 0
        ? scheduleForm.apify_platforms
        : [...DEFAULT_APIFY_PLATFORMS]
    const serpapi_platforms =
      scheduleForm.serpapi_platforms && scheduleForm.serpapi_platforms.length > 0
        ? scheduleForm.serpapi_platforms
        : [...DEFAULT_SERPAPI_PLATFORMS]
    const platforms = displayPlatforms({
      platforms: [],
      apify_platforms,
      serpapi_platforms,
    })
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
      platforms,
      apify_platforms,
      serpapi_platforms,
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
    const updated = [newSchedule, ...schedules]
    saveSchedules(updated)
    setSchedules(updated)
    setSchedulesPage(1)
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
    try {
      await bulkDeleteIngestionRuns(Array.from(selectedRuns))
      setSelectedRuns(new Set())
      setDeleteConfirmOpen(false)
      refresh()
      toast.success("Runs deleted successfully.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete runs")
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
    setProfileOpen(true)
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      await updateProfile(profileForm)
      toast.success("Profile updated successfully.")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword() {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error("New passwords do not match")
      return
    }
    setSavingPassword(true)
    try {
      await changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      })
      toast.success("Password changed successfully.")
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password")
    } finally {
      setSavingPassword(false)
    }
  }

  const filteredRuns = [...runs].sort((a, b) => {
    const aTime = new Date(a.started_at || a.created_at).getTime()
    const bTime = new Date(b.started_at || b.created_at).getTime()
    return bTime - aTime
  })

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
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          variant="banner"
          icon={Database}
          title="Ingestion Runs"
          description="Monitor pipeline runs, manage schedules, and keep provider ingestion on track."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/admin/settings")}
                data-icon="inline-start"
                className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Pencil data-icon="inline-start" />
                Settings
              </Button>
              <Button
                variant={autoRefresh ? "secondary" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh((v) => !v)}
                data-icon="inline-start"
                className={
                  autoRefresh
                    ? undefined
                    : "border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                }
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
            </>
          }
        />

        <Card>
          <CardHeader className="flex-col gap-4 space-y-0 border-b sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Timer className="size-4" />
                Ingestion schedules
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {activeSchedules.length > 0
                  ? `${activeSchedules.length} active · ${schedules.length} total`
                  : schedules.length > 0
                    ? "All schedules paused"
                    : "Automate provider ingestion on a recurring schedule"}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setScheduleOpen(true)}
              data-icon="inline-start"
            >
              <Plus data-icon="inline-start" />
              Add schedule
            </Button>
          </CardHeader>

          {nextUpcoming && nextUpcomingParts ? (
            <div className="border-b bg-muted/20 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Next run
                  </p>
                  <p className="truncate text-base font-semibold tracking-tight">
                    {nextUpcoming.keyword || "All matching jobs"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={FREQUENCY_BADGE[nextUpcoming.frequency]}
                    >
                      {nextUpcoming.frequency === "once"
                        ? "One-time"
                        : nextUpcoming.frequency.charAt(0).toUpperCase() +
                          nextUpcoming.frequency.slice(1)}
                    </Badge>
                    <span>{frequencyLabel(nextUpcoming)}</span>
                    {nextUpcoming.location ? (
                      <span>· {nextUpcoming.location}</span>
                    ) : null}
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-xl border px-4 py-3 text-center sm:min-w-[160px]",
                    nextUpcomingParts.overdue
                      ? "border-amber-500/30 bg-amber-500/5"
                      : nextUpcomingParts.totalMs < 60_000
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "bg-background",
                  )}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {nextUpcomingParts.overdue ? "Due now" : "Starts in"}
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight",
                      nextUpcomingParts.overdue
                        ? "text-amber-600 dark:text-amber-400"
                        : nextUpcomingParts.totalMs < 60_000
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-foreground",
                    )}
                  >
                    {nextUpcomingParts.overdue
                      ? "00:00:00"
                      : formatCountdownClock(nextUpcomingParts)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatAbsoluteNext(nextUpcoming.nextRun)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <CardContent className="p-4 sm:p-5">
            {schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Calendar className="size-6" />
                </span>
                <div>
                  <p className="font-medium">No schedules yet</p>
                  <p className="text-sm text-muted-foreground">
                    Create a schedule to run ingestion automatically.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setScheduleOpen(true)}
                  data-icon="inline-start"
                >
                  <Plus data-icon="inline-start" />
                  Create schedule
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {pageSchedules.map((s) => {
                    const parts = getCountdownParts(s.nextRun, nowMs)
                    const exhausted =
                      s.totalRuns > 0 && s.runsCompleted >= s.totalRuns
                    const isLive = s.enabled && !exhausted
                    const platforms = displayPlatforms(s)
                    const shownPlatforms = platforms.slice(0, 2)
                    const extraPlatforms = Math.max(
                      0,
                      platforms.length - shownPlatforms.length,
                    )

                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "flex flex-col rounded-lg border p-2.5",
                          isLive ? "bg-background" : "bg-muted/20 opacity-90",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 px-1.5 text-[10px]",
                              FREQUENCY_BADGE[s.frequency],
                            )}
                          >
                            {s.frequency === "once"
                              ? "One-time"
                              : s.frequency.charAt(0).toUpperCase() +
                                s.frequency.slice(1)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 px-1.5 text-[10px]",
                              isLive
                                ? "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : exhausted
                                  ? "border-transparent bg-muted text-muted-foreground"
                                  : "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {isLive
                              ? "Active"
                              : exhausted
                                ? "Done"
                                : "Paused"}
                          </Badge>
                          {s.lastRunStatus === "error" && (
                            <Badge
                              variant="destructive"
                              className="h-5 px-1.5 text-[10px]"
                            >
                              Failed
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 min-w-0">
                          <p className="truncate text-sm font-semibold tracking-tight">
                            {s.keyword || "All matching jobs"}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {frequencyLabel(s)}
                            {s.location ? ` · ${s.location}` : ""}
                            {s.country ? `, ${s.country}` : ""}
                          </p>
                        </div>

                        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                          {s.totalRuns > 0
                            ? `Runs ${s.runsCompleted}/${s.totalRuns}`
                            : "Unlimited"}
                          {!isLive && exhausted ? " · Finished" : ""}
                        </p>

                        {shownPlatforms.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {shownPlatforms.map((platform) => (
                              <Badge
                                key={platform}
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] font-normal"
                              >
                                {platform}
                              </Badge>
                            ))}
                            {extraPlatforms > 0 && (
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px] font-normal"
                              >
                                +{extraPlatforms}
                              </Badge>
                            )}
                          </div>
                        )}

                        <div
                          className={cn(
                            "mt-2 rounded-md border px-2 py-1.5 text-center",
                            !isLive
                              ? "bg-muted/40"
                              : parts.overdue
                                ? "border-amber-500/30 bg-amber-500/5"
                                : parts.totalMs < 60_000
                                  ? "border-emerald-500/30 bg-emerald-500/5"
                                  : "bg-muted/30",
                          )}
                        >
                          <p
                            className={cn(
                              "font-mono text-sm font-semibold tabular-nums tracking-tight",
                              !isLive && "text-muted-foreground",
                              isLive &&
                                parts.overdue &&
                                "text-amber-600 dark:text-amber-400",
                              isLive &&
                                !parts.overdue &&
                                parts.totalMs < 60_000 &&
                                "text-emerald-700 dark:text-emerald-400",
                            )}
                          >
                            {!isLive
                              ? "--:--:--"
                              : parts.overdue
                                ? "00:00:00"
                                : formatCountdownClock(parts)}
                          </p>
                        </div>

                        <div className="mt-auto flex items-center justify-end gap-1 pt-2">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => toggleSchedule(s.id)}
                            disabled={exhausted}
                            className="h-7 px-2 text-[11px]"
                          >
                            {s.enabled ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteSchedule(s.id)}
                            className="size-7 text-muted-foreground hover:text-destructive"
                            title="Delete schedule"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {schedulesTotalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t pt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {safeSchedulesPage} of {schedulesTotalPages} (
                      {schedulesNewestFirst.length} schedules)
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeSchedulesPage <= 1}
                        onClick={() =>
                          setSchedulesPage((p) => Math.max(1, p - 1))
                        }
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeSchedulesPage >= schedulesTotalPages}
                        onClick={() =>
                          setSchedulesPage((p) =>
                            Math.min(schedulesTotalPages, p + 1),
                          )
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
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
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] overflow-hidden sm:max-w-3xl lg:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Create ingestion schedule</DialogTitle>
            <DialogDescription>
              Set up recurring ingestion runs with custom frequency and timing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[min(72vh,40rem)] flex-col gap-4 overflow-y-auto py-4 pr-1">
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

            <div className="grid gap-3 sm:grid-cols-2">
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

            <div className="grid gap-4 md:grid-cols-2">
            {hasApify && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Apify job platforms</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setScheduleForm({
                          ...scheduleForm,
                          apify_platforms: [...APIFY_JOB_PLATFORMS],
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
                        setScheduleForm({
                          ...scheduleForm,
                          apify_platforms: [...DEFAULT_APIFY_PLATFORMS],
                        })
                      }
                    >
                      Defaults
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Applied only when Apify runs.
                </p>
                <div className="max-h-36 overflow-y-auto rounded-lg border p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {APIFY_JOB_PLATFORMS.map((platform) => {
                      const selected = scheduleForm.apify_platforms ?? []
                      const checked = selected.some(
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
                              const next = checked
                                ? selected.filter(
                                    (p) =>
                                      platformKey(p) !== platformKey(platform),
                                  )
                                : [...selected, platform]
                              setScheduleForm({
                                ...scheduleForm,
                                apify_platforms: next,
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
                  {(scheduleForm.apify_platforms ?? []).length} selected
                </p>
              </div>
            )}

            {hasSerpapi && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>SerpApi job platforms</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setScheduleForm({
                          ...scheduleForm,
                          serpapi_platforms: [...SERPAPI_JOB_PLATFORMS],
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
                        setScheduleForm({
                          ...scheduleForm,
                          serpapi_platforms: [...DEFAULT_SERPAPI_PLATFORMS],
                        })
                      }
                    >
                      Defaults
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Applied only when SerpApi runs (Google Jobs via).
                </p>
                <div className="max-h-36 overflow-y-auto rounded-lg border p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SERPAPI_JOB_PLATFORMS.map((platform) => {
                      const selected = scheduleForm.serpapi_platforms ?? []
                      const checked = selected.some(
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
                              const next = checked
                                ? selected.filter(
                                    (p) =>
                                      platformKey(p) !== platformKey(platform),
                                  )
                                : [...selected, platform]
                              setScheduleForm({
                                ...scheduleForm,
                                serpapi_platforms: next,
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
                  {(scheduleForm.serpapi_platforms ?? []).length} selected
                </p>
              </div>
            )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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

            <div className="grid gap-3 sm:grid-cols-3">
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

            <div className="grid gap-3 sm:grid-cols-3">
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
                <Label htmlFor="schedule-time">Time</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={toTimeInputValue(scheduleForm.time || "9:00 AM")}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      time: fromTimeInputValue(e.target.value || "09:00"),
                    })
                  }
                />
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

            <div className="grid gap-3 sm:grid-cols-2">
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
              disabled={
                (hasApify &&
                  (scheduleForm.apify_platforms ?? []).length === 0) ||
                (hasSerpapi &&
                  (scheduleForm.serpapi_platforms ?? []).length === 0)
              }
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
