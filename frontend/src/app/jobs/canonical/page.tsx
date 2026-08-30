"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Layers, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AppShell } from "@/components/app-shell"
import { EmptyState, PageHeader } from "@/components/page-header"
import { useProfile, useCanonicalJobs } from "@/lib/hooks"

export default function CanonicalJobsPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const { data, isLoading: jobsLoading } = useCanonicalJobs({
    search: query || undefined,
    page,
    page_size: 25,
  })

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  if (!me) return null

  const results = data?.results ?? []
  const total = data?.count ?? 0
  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  return (
    <AppShell user={me} loading={profileLoading || jobsLoading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Canonical Job Explorer"
          description="Browse normalized jobs and open full source traceability"
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Canonical Jobs</CardTitle>
            <CardDescription>
              {total > 0
                ? `${total.toLocaleString()} jobs · page ${page} of ${totalPages}`
                : "Search by title, company, or location"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search canonical jobs…"
                  className="pl-9"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>

            {results.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No canonical jobs"
                description="Try a different search, or wait for ingestion to normalize listings."
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Seniority</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="max-w-[240px]">
                          <Link
                            href={`/jobs/${job.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {job.title}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">
                          {job.company_name || job.company_name_raw || "—"}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate text-muted-foreground">
                          {job.location_text || job.location_raw || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {job.seniority || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {job.work_mode || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {job.last_seen
                            ? new Date(job.last_seen).toLocaleDateString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
