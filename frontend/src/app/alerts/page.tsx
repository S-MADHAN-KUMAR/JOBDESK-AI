"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Building2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppShell } from "@/components/app-shell"
import { EmptyState, PageHeader } from "@/components/page-header"
import { useProfile, useMarketAlerts } from "@/lib/hooks"
import { cn } from "@/lib/utils"

function severityClass(severity: string) {
  if (severity === "high") {
    return "border-transparent bg-red-500/10 text-red-700 dark:text-red-400"
  }
  if (severity === "medium") {
    return "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400"
  }
  return "border-transparent bg-slate-500/10 text-slate-700 dark:text-slate-300"
}

export default function AlertsPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data, isLoading: alertsLoading } = useMarketAlerts()
  const [severity, setSeverity] = useState<string>("all")

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const alerts = data?.alerts ?? []
  const filtered = useMemo(() => {
    if (severity === "all") return alerts
    return alerts.filter((a) => a.severity === severity)
  }, [alerts, severity])

  if (!me) return null

  return (
    <AppShell user={me} loading={profileLoading || alertsLoading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Market Alerts"
          description="Severity-ranked signals across roles, employers, and pipeline health"
          actions={
            <Select value={severity} onValueChange={(v) => v && setSeverity(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Alerts
              {data ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filtered.length} of {data.count})
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>Newest market and operational signals first</CardDescription>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No alerts"
                description={
                  severity === "all"
                    ? "There are no market alerts right now."
                    : `No ${severity}-severity alerts found.`
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-xl border border-border/80 bg-card p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={cn("capitalize", severityClass(alert.severity))}>
                            {alert.severity}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {alert.category}
                          </Badge>
                          {alert.role_category ? (
                            <Badge variant="outline" className="text-[10px]">
                              {alert.role_category}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">{alert.message}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {alert.company_id && alert.company_name ? (
                            <Link
                              href={`/companies/${alert.company_id}`}
                              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            >
                              <Building2 className="size-3" />
                              {alert.company_name}
                            </Link>
                          ) : alert.company_name ? (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="size-3" />
                              {alert.company_name}
                            </span>
                          ) : null}
                          {alert.metric != null ? (
                            <span className="tabular-nums">Metric: {alert.metric}</span>
                          ) : null}
                          <span>{new Date(alert.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
