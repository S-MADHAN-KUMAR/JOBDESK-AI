"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  ExternalLink,
  ListChecks,
  Loader2,
  Mail,
  Phone,
  Search,
  Sparkles,
  Trash2,
  UserSearch,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { PageHeader, EmptyState } from "@/components/page-header"
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
  type EnrichedContact,
  type EnrichmentRunResult,
  deleteEnrichedContacts,
  fetchEnrichmentContacts,
  pollApolloPhones,
  runCompanyEnrichment,
} from "@/lib/api"
import { useProfile } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const VERIFICATION_META: Record<
  EnrichedContact["verification_state"],
  { label: string; classes: string }
> = {
  verified: {
    label: "Verified",
    classes:
      "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  unverified: {
    label: "Unverified",
    classes:
      "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  failed: {
    label: "Failed",
    classes: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  },
}

const PROVIDER_LABELS: Record<string, string> = {
  contactout: "ContactOut",
  apollo: "Apollo",
}

const LOG_STATUS_META: Record<
  "success" | "failed" | "skipped" | "degraded",
  { label: string; classes: string }
> = {
  success: {
    label: "Success",
    classes:
      "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    classes: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  },
  degraded: {
    label: "Out of credits",
    classes:
      "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  skipped: {
    label: "Skipped",
    classes: "border-transparent bg-muted text-muted-foreground",
  },
}

export default function EnrichmentPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh flex-col items-center justify-center bg-background">
          <Loader label="Loading enrichment workspace..." />
        </main>
      }
    >
      <EnrichmentContent />
    </Suspense>
  )
}

function ContactFact({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-medium break-all">{children}</div>
    </div>
  )
}

function EnrichmentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoRunRef = useRef(false)
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()

  const [companyName, setCompanyName] = useState("")
  const [titles, setTitles] = useState("")
  const [location, setLocation] = useState("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<EnrichmentRunResult | null>(null)
  const [showLogs, setShowLogs] = useState(false)

  const [contacts, setContacts] = useState<EnrichedContact[]>([])
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [page, setPage] = useState(1)
  const [provider, setProvider] = useState("all")
  const [verification, setVerification] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [contactsLoading, setContactsLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pollingPhones, setPollingPhones] = useState(false)
  const [detail, setDetail] = useState<EnrichedContact | null>(null)

  const loadContacts = useCallback(
    async (prov: string, ver: string, p: number, q = searchQuery) => {
      setContactsLoading(true)
      try {
        const data = await fetchEnrichmentContacts({
          provider: prov === "all" ? undefined : prov,
          verification: ver === "all" ? undefined : ver,
          search: q.trim() || undefined,
          page: p,
        })
        setContacts(Array.isArray(data) ? data : (data.results ?? []))
        setTotal(Array.isArray(data) ? data.length : (data.count ?? 0))
        setHasNext(Array.isArray(data) ? false : Boolean(data.next))
        setHasPrev(Array.isArray(data) ? false : Boolean(data.previous))
        setSelected(new Set())
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load contacts")
      } finally {
        setContactsLoading(false)
      }
    },
    [searchQuery],
  )

  const executeRun = useCallback(
    async (company: string, titlesList: string[], locationValue: string) => {
      setRunning(true)
      setResult(null)
      setShowLogs(true)
      try {
        const res = await runCompanyEnrichment({
          company_name: company.trim(),
          titles: titlesList.length > 0 ? titlesList : undefined,
          location: locationValue.trim() || undefined,
        })
        setResult(res)
        setCompanyName("")
        setTitles("")
        setLocation("")
        setPage(1)
        setProvider("all")
        setVerification("all")
        void loadContacts("all", "all", 1, "")
        if (res.success) {
          toast.success(res.message || "Enrichment run completed.")
        } else {
          toast.error(res.message || "Enrichment run completed with issues.")
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Enrichment run failed")
      } finally {
        setRunning(false)
      }
    },
    [loadContacts],
  )

  useEffect(() => {
    if (profileError) {
      router.push("/login")
      return
    }
  }, [profileError, router])

  useEffect(() => {
    if (!me || profileLoading) return
    if (me.role !== "ADMIN" && me.role !== "MARKET_ANALYST") {
      toast.error("Access denied: Enrichment is available to Market Analysts.")
      return
    }
    void loadContacts("all", "all", 1, "")

    const companyParam = searchParams.get("company")
    const autoRun = searchParams.get("autoRun") === "1"
    if (autoRun && companyParam && !autoRunRef.current) {
      autoRunRef.current = true
      setCompanyName(companyParam)
      setLocation(searchParams.get("location") ?? "")
      const titlesParam = searchParams.get("titles")
      const titlesList = titlesParam
        ? titlesParam.split(",").map((title) => title.trim()).filter(Boolean)
        : []
      void executeRun(companyParam, titlesList, searchParams.get("location") ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when profile is ready
  }, [me, profileLoading])

  async function handleRun(e: React.FormEvent) {
    e.preventDefault()
    const titlesList = titles
      .split(",")
      .map((title) => title.trim())
      .filter(Boolean)
    await executeRun(companyName, titlesList, location)
  }

  function applyContactFilters(p = 1) {
    setPage(p)
    void loadContacts(provider, verification, p)
  }

  function toggleContact(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllContacts() {
    setSelected((prev) =>
      prev.size === contacts.length
        ? new Set()
        : new Set(contacts.map((contact) => contact.id)),
    )
  }

  async function handleDeleteContacts() {
    setDeleting(true)
    try {
      const res = await deleteEnrichedContacts([...selected])
      setDeleteOpen(false)
      setSelected(new Set())
      setSelectionMode(false)
      toast.success(res.message || `Deleted ${res.deleted} contact(s).`)
      void loadContacts(provider, verification, page)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete contacts")
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handlePollPhones() {
    setPollingPhones(true)
    try {
      const res = await pollApolloPhones()
      void loadContacts(provider, verification, page)
      if (res.success) {
        toast.success(
          res.updated > 0
            ? `Updated ${res.updated} phone number(s).`
            : res.message || "No new phone numbers yet.",
        )
      } else {
        toast.error(res.message || "Failed to poll phones")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to poll phones")
    } finally {
      setPollingPhones(false)
    }
  }

  if (!me) return null

  const allSelected = contacts.length > 0 && selected.size === contacts.length
  const detailVerification = detail
    ? VERIFICATION_META[detail.verification_state]
    : null

  return (
    <AppShell user={me} loading={profileLoading}>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          variant="banner"
          icon={UserSearch}
          title="Contact Enrichment"
          description="Find recruiter and TA contacts (ContactOut → Apollo), then review or bulk-delete results."
        />

        {result && (
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              result.success
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
            )}
          >
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{result.message}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{result.stored} stored</Badge>
                  <Badge variant="outline">{result.error_count} errors</Badge>
                  {typeof result.pending_phones === "number" &&
                    result.pending_phones > 0 && (
                      <Badge variant="outline">
                        {result.pending_phones} phone(s) pending
                      </Badge>
                    )}
                  <Badge variant="secondary">
                    {result.providers_used.length > 0
                      ? result.providers_used
                          .map((code) => PROVIDER_LABELS[code] ?? code)
                          .join(", ")
                      : "No providers used"}
                  </Badge>
                </div>
              </div>
              {result.call_logs && result.call_logs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setShowLogs((prev) => !prev)}
                  data-icon="inline-end"
                >
                  Logs
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      showLogs && "rotate-180",
                    )}
                  />
                </Button>
              )}
            </div>
          </div>
        )}

        {result?.call_logs && result.call_logs.length > 0 && showLogs && (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 py-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4" />
                Provider call logs
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                Run {result.run_id?.slice(0, 8)}
              </span>
            </CardHeader>
            <CardContent className="grid gap-2 p-4 pt-0 sm:grid-cols-2">
              {result.call_logs.map((log) => {
                const meta = LOG_STATUS_META[log.status]
                return (
                  <div
                    key={log.provider}
                    className="rounded-lg border bg-muted/20 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {PROVIDER_LABELS[log.provider] ?? log.provider}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn("h-5 px-1.5 text-[10px]", meta.classes)}
                      >
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {log.message || "—"}
                    </p>
                    <p className="mt-1 text-xs">
                      {log.results ?? 0} found
                      {log.contacts ? ` · ${log.contacts} enriched` : ""}
                      {log.latency_ms > 0 ? ` · ${log.latency_ms} ms` : ""}
                      {log.credits_remaining != null
                        ? ` · ${log.credits_remaining} of ${log.credits_quota ?? "?"} credits left`
                        : ""}
                    </p>
                    {log.candidates && log.candidates.length > 0 && (
                      <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t pt-2 text-xs">
                        {log.candidates.slice(0, 5).map((candidate, index) => (
                          <li key={candidate.id ?? `${log.provider}-${index}`}>
                            <span className="font-medium">
                              {candidate.full_name || "—"}
                            </span>
                            <span className="text-muted-foreground">
                              {candidate.job_title
                                ? ` · ${candidate.job_title}`
                                : ""}
                              {candidate.email ? ` · ${candidate.email}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserSearch className="size-4" />
              Run enrichment
            </CardTitle>
            <CardDescription>
              Enter a company to find contacts. Optional roles and location narrow
              the search.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleRun}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="enrich-company">Company</Label>
                <Input
                  id="enrich-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. TCS"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="enrich-titles">Roles (optional)</Label>
                <Input
                  id="enrich-titles"
                  value={titles}
                  onChange={(e) => setTitles(e.target.value)}
                  placeholder="Recruiter, TA, HR"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="enrich-location">Location (optional)</Label>
                <Input
                  id="enrich-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Chennai"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={running || !companyName.trim()}
                  data-icon="inline-start"
                >
                  {running ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Sparkles data-icon="inline-start" />
                  )}
                  {running ? "Running..." : "Run enrichment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ContactRound className="size-4" />
                Enriched contacts
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {total} contact{total === 1 ? "" : "s"}
                {selectionMode ? " · select rows to delete" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
              {selectionMode ? (
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
              ) : (
                <Button
                  variant="destructive-soft"
                  size="sm"
                  onClick={() => setSelectionMode(true)}
                  disabled={contacts.length === 0}
                  data-icon="inline-start"
                >
                  <Trash2 data-icon="inline-start" />
                  Bulk delete
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePollPhones()}
                disabled={pollingPhones}
                data-icon="inline-start"
              >
                {pollingPhones ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Phone data-icon="inline-start" />
                )}
                {pollingPhones ? "Fetching..." : "Refresh phones"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 border-t px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="contact-search">Search</Label>
                <Input
                  id="contact-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyContactFilters(1)
                  }}
                  placeholder="Name, email, title, or company"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(value) => {
                    if (value === null) return
                    setProvider(value)
                    setPage(1)
                    void loadContacts(value, verification, 1)
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    <SelectItem value="contactout">ContactOut</SelectItem>
                    <SelectItem value="apollo">Apollo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select
                  value={verification}
                  onValueChange={(value) => {
                    if (value === null) return
                    setVerification(value)
                    setPage(1)
                    void loadContacts(provider, value, 1)
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => applyContactFilters(1)}
                disabled={contactsLoading}
                data-icon="inline-start"
              >
                <Search data-icon="inline-start" />
                Search
              </Button>
            </div>
          </CardContent>

          <CardContent className="p-0">
            {contactsLoading ? (
              <div className="flex justify-center py-12">
                <Loader label="Fetching contacts..." />
              </div>
            ) : contacts.length === 0 ? (
              <EmptyState
                icon={ContactRound}
                title="No contacts found"
                description="Run an enrichment against a company to populate this list."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectionMode && (
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all contacts"
                          checked={allSelected}
                          onChange={toggleAllContacts}
                          className="size-4 accent-primary"
                        />
                      </TableHead>
                    )}
                    <TableHead>Name</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => {
                    const verificationMeta =
                      VERIFICATION_META[contact.verification_state]
                    return (
                      <TableRow
                        key={contact.id}
                        className={cn(
                          "cursor-pointer",
                          detail?.id === contact.id && "bg-muted",
                        )}
                        onClick={() => setDetail(contact)}
                      >
                        {selectionMode && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${contact.full_name || "contact"}`}
                              checked={selected.has(contact.id)}
                              onChange={() => toggleContact(contact.id)}
                              className="size-4 accent-primary"
                            />
                          </TableCell>
                        )}
                        <TableCell className="max-w-44">
                          <span className="block truncate font-medium">
                            {contact.full_name || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-40">
                          <span className="block truncate">
                            {contact.job_title || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-40">
                          <span className="block truncate">
                            {contact.company_name}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-48">
                          {contact.email ? (
                            <a
                              href={`mailto:${contact.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                            >
                              <Mail className="size-3 shrink-0" />
                              <span className="truncate">{contact.email}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.phone ? (
                            <a
                              href={`tel:${contact.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Phone className="size-3" />
                              {contact.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px]"
                          >
                            {PROVIDER_LABELS[contact.provider_source] ??
                              contact.provider_source}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 px-1.5 text-[10px]",
                              verificationMeta.classes,
                            )}
                          >
                            {verificationMeta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
          {(hasPrev || hasNext) && (
            <CardContent className="flex items-center justify-between border-t px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev || contactsLoading}
                onClick={() => {
                  const next = page - 1
                  setPage(next)
                  void loadContacts(provider, verification, next)
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
                disabled={!hasNext || contactsLoading}
                onClick={() => {
                  const next = page + 1
                  setPage(next)
                  void loadContacts(provider, verification, next)
                }}
                data-icon="inline-end"
              >
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          {detail && detailVerification && (
            <>
              <DialogHeader className="space-y-3 border-b px-6 py-5 text-left">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted">
                    <ContactRound className="size-5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl leading-snug">
                      {detail.full_name || "Unnamed contact"}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-foreground/80">
                      {detail.job_title || "No title"}
                      {detail.company_name ? ` · ${detail.company_name}` : ""}
                    </DialogDescription>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {PROVIDER_LABELS[detail.provider_source] ??
                          detail.provider_source}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 px-1.5 text-[10px]",
                          detailVerification.classes,
                        )}
                      >
                        {detailVerification.label}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDetail(null)}
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </DialogHeader>

              <div className="space-y-4 overflow-y-auto px-6 py-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <ContactFact label="Email">
                    {detail.email ? (
                      <a
                        href={`mailto:${detail.email}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mail className="size-3.5 shrink-0" />
                        {detail.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </ContactFact>
                  <ContactFact label="Phone">
                    {detail.phone ? (
                      <a
                        href={`tel:${detail.phone}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="size-3.5 shrink-0" />
                        {detail.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </ContactFact>
                  <ContactFact label="Company">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      {detail.company_name || "—"}
                    </span>
                  </ContactFact>
                  <ContactFact label="Confidence">
                    {Math.round((detail.confidence_score || 0) * 100)}%
                  </ContactFact>
                </div>

                <div className="flex flex-wrap gap-2">
                  {detail.linkedin_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <Link
                          href={detail.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                      data-icon="inline-end"
                    >
                      Open LinkedIn
                      <ExternalLink data-icon="inline-end" />
                    </Button>
                  )}
                  {selectionMode ? null : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelected(new Set([detail.id]))
                        setSelectionMode(true)
                        setDetail(null)
                        setDeleteOpen(true)
                      }}
                      data-icon="inline-start"
                    >
                      <Trash2 data-icon="inline-start" />
                      Delete contact
                    </Button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Added {new Date(detail.created_at).toLocaleString()}
                  {detail.last_verified_at
                    ? ` · Verified ${new Date(detail.last_verified_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected contacts?</DialogTitle>
            <DialogDescription>
              This permanently removes {selected.size} enriched contact
              record{selected.size === 1 ? "" : "s"}. This cannot be undone.
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
              onClick={() => void handleDeleteContacts()}
              disabled={deleting || selected.size === 0}
              data-icon="inline-start"
            >
              {deleting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              Delete {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
