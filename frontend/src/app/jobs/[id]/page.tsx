"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  BriefcaseBusiness,
  ExternalLink,
  Layers,
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
import { EmptyState, PageHeader } from "@/components/page-header"
import { useProfile, useJobTraceability } from "@/lib/hooks"
import { cn } from "@/lib/utils"

export default function JobTraceabilityPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const jobId = params?.id ?? ""
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data, isLoading: jobLoading, error: jobError } = useJobTraceability(jobId)

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  if (!me) return null

  const job = data?.canonical_job
  const classification = data?.classification
  const sources = data?.source_records ?? []

  return (
    <AppShell user={me} loading={profileLoading || jobLoading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title={job?.title ?? "Job Traceability"}
          description="Canonical job details, classification, and source lineage"
          actions={
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/jobs" />}
            >
              <ArrowLeft className="size-4" />
              Back to Jobs
            </Button>
          }
        />

        {jobError || (!jobLoading && !job) ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={BriefcaseBusiness}
                title="Job not found"
                description="This canonical job could not be loaded."
                action={
                  <Button
                    variant="outline"
                    render={<Link href="/jobs" />}
                  >
                    Back to Job Explorer
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : job ? (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Canonical Job</CardTitle>
                  <CardDescription>Normalized listing identity</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="text-sm font-medium">{job.company_name_raw || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium">{job.location_raw || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="secondary" className="mt-1 capitalize">
                      {job.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Job ID</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{job.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">First Seen</p>
                    <p className="text-sm">
                      {job.first_seen ? new Date(job.first_seen).toLocaleString() : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Seen</p>
                    <p className="text-sm">
                      {job.last_seen ? new Date(job.last_seen).toLocaleString() : "—"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Layers className="size-4 text-primary" />
                    Classification
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!classification ? (
                    <p className="text-sm text-muted-foreground">Not classified yet.</p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Role Category</p>
                        <p className="text-sm font-medium">{classification.role_category}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Confidence</p>
                        <p className="text-sm font-medium tabular-nums">
                          {(classification.confidence_score <= 1
                            ? classification.confidence_score * 100
                            : classification.confidence_score
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Method</p>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {classification.classification_method}
                        </Badge>
                      </div>
                      {classification.primary_technologies.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs text-muted-foreground">Primary Tech</p>
                          <div className="flex flex-wrap gap-1.5">
                            {classification.primary_technologies.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {classification.skills.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs text-muted-foreground">Skills</p>
                          <div className="flex flex-wrap gap-1.5">
                            {classification.skills.map((s) => (
                              <Badge key={s} variant="outline" className="text-[10px]">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Source Records</CardTitle>
                <CardDescription>
                  Raw provider records linked to this canonical job
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sources.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No source records linked.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Raw Title</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>Fetched</TableHead>
                        <TableHead className="text-right">Link</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sources.map((src) => {
                        const href = src.url || src.raw_url
                        return (
                          <TableRow key={src.id}>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">
                                {src.provider_code}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate font-medium">
                              {src.raw_title || "—"}
                            </TableCell>
                            <TableCell className="max-w-[140px] truncate">
                              {src.raw_company || "—"}
                            </TableCell>
                            <TableCell className="max-w-[120px] truncate text-muted-foreground">
                              {src.raw_location || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] capitalize")}
                              >
                                {src.dedup_match_type || "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {src.fetched_at
                                ? new Date(src.fetched_at).toLocaleString()
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                >
                                  Open
                                  <ExternalLink className="size-3" />
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  )
}
