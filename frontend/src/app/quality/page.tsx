"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Info, ShieldCheck } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AppShell } from "@/components/app-shell"
import { EmptyState, PageHeader, StatCard } from "@/components/page-header"
import { useProfile, useDataQuality } from "@/lib/hooks"
import { cn } from "@/lib/utils"

function qualityColor(pct: number): string {
  if (pct < 30) return "bg-emerald-500"
  if (pct < 60) return "bg-amber-500"
  return "bg-red-500"
}

function qualityText(pct: number): string {
  if (pct < 30) return "text-emerald-700 dark:text-emerald-400"
  if (pct < 60) return "text-amber-700 dark:text-amber-400"
  return "text-red-700 dark:text-red-400"
}

export default function DataQualityPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: quality, isLoading: qualityLoading } = useDataQuality()

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  if (!me) return null

  const missingItems = quality
    ? [
        { label: "Missing Salary", pct: quality.missing_salary_pct },
        { label: "Missing Experience", pct: quality.missing_experience_pct },
        { label: "Missing Company", pct: quality.missing_company_pct },
        { label: "Missing Location", pct: quality.missing_location_pct },
      ]
    : []

  const maxConfidence = Math.max(
    1,
    ...(quality?.confidence_distribution.map((c) => c.count) ?? [1]),
  )

  return (
    <AppShell user={me} loading={profileLoading || qualityLoading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Data Quality"
          description="Field coverage, classification confidence, and distribution health"
        />

        {!quality ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={ShieldCheck}
                title="No quality metrics"
                description="Data quality metrics will appear once canonical jobs are available."
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Canonical Jobs"
                value={quality.total_canonical_jobs.toLocaleString()}
                tone="blue"
                icon={ShieldCheck}
              />
              {missingItems.map((item) => (
                <Card key={item.label}>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {item.label}
                    </CardTitle>
                    {item.pct >= 60 ? (
                      <AlertTriangle className="size-4 text-red-500" />
                    ) : (
                      <Info className="size-4 text-muted-foreground" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className={cn("text-3xl font-bold", qualityText(item.pct))}>
                      {item.pct.toFixed(1)}%
                    </p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all", qualityColor(item.pct))}
                        style={{ width: `${Math.min(100, item.pct)}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Confidence Distribution</CardTitle>
                  <CardDescription>Jobs by classification confidence score</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {quality.confidence_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    quality.confidence_distribution.map((c) => (
                      <div key={c.score} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>Score {c.score}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {c.count.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/80"
                            style={{
                              width: `${Math.round((c.count / maxConfidence) * 100)}%`,
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
                  <CardTitle className="text-base font-semibold">Work Mode</CardTitle>
                  <CardDescription>Distribution across work modes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {quality.work_mode_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    quality.work_mode_distribution.map((w) => {
                      const total = quality.total_canonical_jobs || 1
                      const pct = Math.round((w.count / total) * 100)
                      return (
                        <div
                          key={w.work_mode}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="truncate">{w.work_mode || "Unknown"}</span>
                          <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                            {w.count.toLocaleString()} ({pct}%)
                          </span>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Seniority</CardTitle>
                  <CardDescription>Distribution across seniority bands</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {quality.seniority_distribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    quality.seniority_distribution.map((s) => {
                      const total = quality.total_canonical_jobs || 1
                      const pct = Math.round((s.count / total) * 100)
                      return (
                        <div
                          key={s.seniority}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="truncate">{s.seniority || "Unknown"}</span>
                          <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                            {s.count.toLocaleString()} ({pct}%)
                          </span>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
