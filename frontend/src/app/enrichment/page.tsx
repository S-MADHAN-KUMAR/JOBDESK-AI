"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  ContactRound,
  ListChecks,
  Loader2,
  Mail,
  Phone,
  Sparkles,
  Trash2,
  UserSearch,
} from "lucide-react"
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
  type User,
  deleteEnrichedContacts,
  fetchEnrichmentContacts,
  fetchProfile,
  pollApolloPhones,
  runCompanyEnrichment,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const VERIFICATION_META: Record<
  EnrichedContact["verification_state"],
  { label: string; classes: string }
> = {
  verified: {
    label: "Verified",
    classes: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  unverified: {
    label: "Unverified",
    classes: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  failed: {
    label: "Failed",
    classes: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  },
}

const PROVIDER_LABELS: Record<string, string> = {
  pdl: "People Data Labs",
  contactout: "ContactOut",
  apollo: "Apollo",
  lusha: "Lusha",
}

const LOG_STATUS_META: Record<
  "success" | "failed" | "skipped",
  { label: string; classes: string }
> = {
  success: {
    label: "Success",
    classes: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    classes: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
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
        <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/30">
          <Loader label="Loading enrichment workspace..." />
        </main>
      }
    >
      <EnrichmentContent />
    </Suspense>
  )
}

function EnrichmentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoRunRef = useRef(false)
  const [me, setMe] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState("")
  const [titles, setTitles] = useState("")
  const [location, setLocation] = useState("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<EnrichmentRunResult | null>(null)

  const [contacts, setContacts] = useState<EnrichedContact[]>([])
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [page, setPage] = useState(1)
  const [provider, setProvider] = useState("all")
  const [verification, setVerification] = useState("all")
  const [contactsLoading, setContactsLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pollingPhones, setPollingPhones] = useState(false)

  const loadContacts = useCallback(
    async (prov: string, ver: string, p: number) => {
      setContactsLoading(true)
      try {
        const data = await fetchEnrichmentContacts({
          provider: prov === "all" ? undefined : prov,
          verification: ver === "all" ? undefined : ver,
          page: p,
        })
        setContacts(Array.isArray(data) ? data : (data.results ?? []))
        setTotal(Array.isArray(data) ? data.length : (data.count ?? 0))
        setHasNext(Array.isArray(data) ? false : Boolean(data.next))
        setHasPrev(Array.isArray(data) ? false : Boolean(data.previous))
        setSelected(new Set())
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contacts")
      } finally {
        setContactsLoading(false)
      }
    },
    [],
  )

  const executeRun = useCallback(
    async (company: string, titlesList: string[], locationValue: string) => {
      setRunning(true)
      setError(null)
      setResult(null)
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
        void loadContacts("all", "all", 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Enrichment run failed")
      } finally {
        setRunning(false)
      }
    },
    [loadContacts],
  )

  useEffect(() => {
    let cancelled = false
    fetchProfile()
      .then((profile) => {
        if (cancelled) return
        setMe(profile)
        if (profile.role !== "ADMIN" && profile.role !== "MARKET_ANALYST") {
          setError("Access denied: Enrichment is available to Market Analysts.")
          return
        }
        void loadContacts("all", "all", 1)

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
      })
      .catch(() => {
        if (!cancelled) router.push("/login")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [router, loadContacts, executeRun, searchParams])

  async function handleRun(e: React.FormEvent) {
    e.preventDefault()
    const titlesList = titles
      .split(",")
      .map((title) => title.trim())
      .filter(Boolean)
    await executeRun(companyName, titlesList, location)
  }

  function toggleContact(id: string) {
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

  function toggleAllContacts() {
    setSelected((prev) =>
      prev.size === contacts.length
        ? new Set()
        : new Set(contacts.map((contact) => contact.id)),
    )
  }

  async function handleDeleteContacts() {
    setDeleting(true)
    setError(null)
    try {
      const res = await deleteEnrichedContacts([...selected])
      setDeleteOpen(false)
      setSelected(new Set())
      void loadContacts(provider, verification, page)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contacts")
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handlePollPhones() {
    setPollingPhones(true)
    setError(null)
    try {
      const res = await pollApolloPhones()
      void loadContacts(provider, verification, page)
      if (res.success && res.updated > 0) {
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to poll phones")
    } finally {
      setPollingPhones(false)
    }
  }

  if (loading && me === null) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/30">
        <Loader label="Loading enrichment workspace..." />
      </main>
    )
  }

  if (!me) return null

  return (
    <AppShell user={me}>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contact Enrichment</h1>
          <p className="text-sm text-muted-foreground">
            Find recruiters and TA contacts via the provider waterfall
            (PDL &rarr; ContactOut &rarr; Apollo)
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
              result.success
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
            )}
          >
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{result.message}</p>
              <p className="mt-0.5 text-xs opacity-80">
                {result.stored} stored &middot; {result.error_count} errors
                {typeof result.pending_phones === "number" &&
                  result.pending_phones > 0 &&
                  ` · ${result.pending_phones} phone(s) pending (use Refresh phones)`}
                {" "}&middot; Providers used:{" "}
                {result.providers_used.length > 0
                  ? result.providers_used
                      .map((code) => PROVIDER_LABELS[code] ?? code)
                      .join(", ")
                  : "none"}
              </p>
            </div>
          </div>
        )}

        {result?.call_logs && result.call_logs.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-4" />
                Provider call logs
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                Run {result.run_id?.slice(0, 8)}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Contacts</TableHead>
                    <TableHead>Candidates</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.call_logs.map((log) => {
                    const meta = LOG_STATUS_META[log.status]
                    return (
                      <TableRow key={log.provider}>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {log.provider}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("h-5 px-1.5 text-[10px]", meta.classes)}
                          >
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <span className="block truncate text-xs">
                            {log.message || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.results ?? 0} found
                          {log.contacts ? ` · ${log.contacts} enriched` : ""}
                        </TableCell>
                        <TableCell className="max-w-56">
                          {log.candidates && log.candidates.length > 0 ? (
                            <ul className="max-h-28 space-y-1 overflow-y-auto pr-1 text-xs">
                              {log.candidates.map((candidate, index) => (
                                <li
                                  key={candidate.id ?? `${log.provider}-${index}`}
                                  className="flex flex-col leading-tight"
                                >
                                  <span className="truncate font-medium">
                                    {candidate.full_name || "—"}
                                  </span>
                                  <span className="truncate text-muted-foreground">
                                    {candidate.job_title || "—"}
                                    {candidate.email ? ` · ${candidate.email}` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.latency_ms > 0 ? `${log.latency_ms} ms` : "—"}
                        </TableCell>
                        <TableCell>
                          {log.verified ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-transparent bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-400"
                            >
                              Yes
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserSearch className="size-4" />
              Run enrichment
            </CardTitle>
            <CardDescription>
              Enter a target company; matching contacts are stored with provider
              provenance and verification state.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRun} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="enrich-company">Company</Label>
                <Input
                  id="enrich-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. TCS"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="enrich-titles">Target roles (comma separated)</Label>
                  <Input
                    id="enrich-titles"
                    value={titles}
                    onChange={(e) => setTitles(e.target.value)}
                    placeholder="e.g. Recruiter, Talent Acquisition, HR"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="enrich-location">Location</Label>
                  <Input
                    id="enrich-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Chennai"
                  />
                </div>
              </div>
              <div>
                <Button type="submit" disabled={running} data-icon="inline-start">
                  {running ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Sparkles data-icon="inline-start" />
                  )}
                  {running ? "Running waterfall..." : "Run enrichment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2">
              <ContactRound className="size-4" />
              Enriched contacts
            </CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selected.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  data-icon="inline-start"
                >
                  <Trash2 data-icon="inline-start" />
                  Delete selected ({selected.size})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePollPhones()}
                disabled={pollingPhones}
                data-icon="inline-start"
                title="Fetch phone numbers delivered asynchronously by Apollo"
              >
                {pollingPhones ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Phone data-icon="inline-start" />
                )}
                {pollingPhones ? "Fetching..." : "Refresh phones"}
              </Button>
              <span className="text-sm text-muted-foreground">{total} found</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 border-t px-4 py-3">
            <div className="flex flex-wrap gap-3">
              <Select
                value={provider}
                onValueChange={(value) => {
                  if (value === null) return
                  setProvider(value)
                  setPage(1)
                  void loadContacts(value, verification, 1)
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  <SelectItem value="pdl">People Data Labs</SelectItem>
                  <SelectItem value="contactout">ContactOut</SelectItem>
                  <SelectItem value="apollo">Apollo</SelectItem>
                  <SelectItem value="lusha">Lusha</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={verification}
                onValueChange={(value) => {
                  if (value === null) return
                  setVerification(value)
                  setPage(1)
                  void loadContacts(provider, value, 1)
                }}
              >
                <SelectTrigger className="w-40">
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
          </CardContent>
          <CardContent className="p-0">
            {contactsLoading ? (
              <div className="flex justify-center py-12">
                <Loader label="Fetching contacts..." />
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                <ContactRound className="size-8 text-muted-foreground" />
                <p className="font-medium">No contacts found</p>
                <p className="text-sm text-muted-foreground">
                  Run an enrichment against a target company to populate records.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all contacts"
                        checked={contacts.length > 0 && selected.size === contacts.length}
                        onChange={toggleAllContacts}
                        className="size-4 accent-primary"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => {
                    const verificationMeta = VERIFICATION_META[contact.verification_state]
                    return (
                      <TableRow key={contact.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Select ${contact.full_name || "contact"}`}
                            checked={selected.has(contact.id)}
                            onChange={() => toggleContact(contact.id)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell className="max-w-44">
                          <span className="block truncate font-medium">
                            {contact.full_name || "—"}
                          </span>
                          {contact.linkedin_url && (
                            <a
                              href={contact.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-xs text-muted-foreground hover:text-foreground"
                            >
                              LinkedIn
                            </a>
                          )}
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
                        <TableCell>
                          {contact.email ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Mail className="size-3 text-muted-foreground" />
                              {contact.email}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.phone ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Phone className="size-3 text-muted-foreground" />
                              {contact.phone}
                            </span>
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected contacts?</DialogTitle>
            <DialogDescription>
              This permanently removes {selected.size} enriched contact record(s).
              This action cannot be undone.
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