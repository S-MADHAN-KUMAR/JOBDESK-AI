"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp } from "lucide-react"
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
import { useProfile, useDemandScores } from "@/lib/hooks"
import { cn } from "@/lib/utils"

function bandClass(band: string) {
  switch (band) {
    case "hot":
      return "border-transparent bg-red-500/10 text-red-700 dark:text-red-400"
    case "warm":
      return "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400"
    case "cool":
      return "border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-400"
    default:
      return "border-transparent bg-slate-500/10 text-slate-700 dark:text-slate-300"
  }
}

function scoreBarColor(band: string) {
  switch (band) {
    case "hot":
      return "bg-red-500"
    case "warm":
      return "bg-amber-500"
    case "cool":
      return "bg-sky-500"
    default:
      return "bg-slate-400"
  }
}

export default function DemandScoresPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const [period, setPeriod] = useState(30)
  const { data, isLoading: scoresLoading } = useDemandScores(period)

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const scores = data?.scores ?? []
  const maxScore = Math.max(1, ...scores.map((s) => s.demand_score))

  if (!me) return null

  return (
    <AppShell user={me} loading={profileLoading || scoresLoading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Demand Scores"
          description="Role-level demand intensity across the selected lookback window"
          actions={
            <Select
              value={String(period)}
              onValueChange={(v) => v && setPeriod(Number(v))}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Role Demand
              {data ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({data.period_days}-day window)
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>Bands reflect relative demand heat for each role category</CardDescription>
          </CardHeader>
          <CardContent>
            {scores.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No demand scores"
                description="Demand scores will appear once role movements are computed."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">Net Change</TableHead>
                    <TableHead className="text-right">Change %</TableHead>
                    <TableHead className="text-right">New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((s) => (
                    <TableRow key={s.role_category}>
                      <TableCell className="font-medium">{s.role_category}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("capitalize", bandClass(s.band))}>
                          {s.band}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-[120px] items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex min-w-10 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              bandClass(s.band),
                            )}
                          >
                            {s.demand_score.toFixed(0)}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full", scoreBarColor(s.band))}
                              style={{
                                width: `${Math.round((s.demand_score / maxScore) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.active_jobs.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          s.net_change >= 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {s.net_change >= 0 ? "+" : ""}
                        {s.net_change}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          s.change_percentage >= 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {s.change_percentage >= 0 ? "+" : ""}
                        {s.change_percentage.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.new_postings.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
