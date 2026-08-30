"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  MapPin,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AppShell } from "@/components/app-shell"
import { EmptyState, PageHeader, StatCard } from "@/components/page-header"
import { useProfile, useCompanyDetail } from "@/lib/hooks"
import { cn } from "@/lib/utils"

export default function CompanyDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const companyId = params?.id ?? ""
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data, isLoading: companyLoading, error: companyError } = useCompanyDetail(companyId)

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  if (!me) return null

  const company = data?.company
  const stats = data?.stats
  const hiring = data?.hiring_score
  const roles = data?.role_breakdown ?? []
  const recentJobs = data?.recent_jobs ?? []
  const maxRole = Math.max(1, ...roles.map((r) => r.count))

  return (
    <AppShell user={me} loading={profileLoading || companyLoading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title={company?.name ?? "Company Profile"}
          description="Hiring footprint, role mix, and recent canonical jobs"
          actions={
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/recruitment" />}
            >
              <ArrowLeft className="size-4" />
              Back to Recruitment
            </Button>
          }
        />

        {companyError || (!companyLoading && !company) ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Building2}
                title="Company not found"
                description="This employer profile could not be loaded."
                action={
                  <Button
                    variant="outline"
                    render={<Link href="/recruitment" />}
                  >
                    Back to Recruitment
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : company ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Hiring Score"
                value={hiring ? hiring.hiring_score.toFixed(0) : "—"}
                hint={
                  hiring?.period_start && hiring?.period_end
                    ? `${new Date(hiring.period_start).toLocaleDateString()} – ${new Date(hiring.period_end).toLocaleDateString()}`
                    : undefined
                }
                tone="green"
                icon={Building2}
              />
              <StatCard
                label="Active Jobs"
                value={(stats?.active_jobs ?? 0).toLocaleString()}
                hint={`${(stats?.total_jobs ?? 0).toLocaleString()} total`}
                tone="blue"
              />
              <StatCard
                label="Unique Roles"
                value={(stats?.unique_roles ?? 0).toLocaleString()}
                tone="amber"
              />
              <StatCard
                label="Active Postings (Score)"
                value={(hiring?.active_postings ?? 0).toLocaleString()}
                hint={`${(hiring?.total_postings ?? 0).toLocaleString()} in period`}
                tone="purple"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Company Profile</CardTitle>
                <CardDescription>Master employer record</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Normalized Name</p>
                  <p className="text-sm font-medium">{company.normalized_name || company.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Domain</p>
                  <p className="text-sm font-medium">{company.domain || "—"}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium">{company.location || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Globe className="mt-0.5 size-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Website</p>
                    {company.website ? (
                      <a
                        href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Visit
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <p className="text-sm">—</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Role Breakdown</CardTitle>
                  <CardDescription>Active role categories for this employer</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {roles.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No role breakdown available.
                    </p>
                  ) : (
                    roles.map((r) => (
                      <div key={r.role_category} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium">{r.role_category}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {r.count.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/80"
                            style={{
                              width: `${Math.round((r.count / maxRole) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Recent Jobs</CardTitle>
                  <CardDescription>Latest canonical listings</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentJobs.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No recent jobs.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Last Seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentJobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="max-w-[200px]">
                              <Link
                                href={`/jobs/${job.id}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {job.title}
                              </Link>
                              <p className="truncate text-xs text-muted-foreground">
                                {[job.seniority, job.work_mode, job.location_raw]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] capitalize")}
                              >
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
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  )
}
