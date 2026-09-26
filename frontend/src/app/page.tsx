"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Cable,
  Clock3,
  Layers,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AppShell } from "@/components/app-shell"
import { BarList, EmptyState, StatCard } from "@/components/page-header"
import { useDashboardOverview, useProfile } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const QUICK_LINKS = [
  {
    href: "/jobs",
    title: "Job Explorer",
    description: "Browse and trace raw job records",
    icon: BriefcaseBusiness,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "stat-card-blue",
  },
  {
    href: "/enrichment",
    title: "Contact Enrichment",
    description: "Find recruiters via the provider waterfall",
    icon: Sparkles,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "stat-card-amber",
  },
  {
    href: "/ceo",
    title: "Executive Summary",
    description: "Market overview and strategic intelligence",
    icon: BarChart3,
    roles: ["ADMIN", "CEO_MANAGEMENT"],
    tile: "stat-card-purple",
  },
  {
    href: "/trends",
    title: "Demand Trends",
    description: "7/30/60/90-day hiring demand movements",
    icon: TrendingUp,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "stat-card-green",
  },
  {
    href: "/training",
    title: "Skill Intelligence",
    description: "Technology and skill matrices by role",
    icon: Layers,
    roles: ["ADMIN", "TRAINING_MANAGER"],
    tile: "stat-card-amber",
  },
  {
    href: "/recruitment",
    title: "Employer Intelligence",
    description: "Hiring patterns and opportunity scores",
    icon: Building2,
    roles: ["ADMIN", "RECRUITMENT_TEAM"],
    tile: "stat-card-green",
  },
  {
    href: "/admin/users",
    title: "User Management",
    description: "Create users and assign roles",
    icon: Users,
    roles: ["ADMIN"],
    tile: "stat-card-purple",
  },
  {
    href: "/admin/sources",
    title: "Source Management",
    description: "Configure and run job ingestion",
    icon: Cable,
    roles: ["ADMIN"],
    tile: "stat-card-rose",
  },
]

function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const diff = Date.now() - then
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function Home() {
  const router = useRouter()
  const { data: me, isLoading: loading, error } = useProfile()
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview(
    Boolean(me),
  )

  useEffect(() => {
    if (error) router.replace("/login")
  }, [error, router])

  if (error) return null

  if (loading || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  const visibleLinks = QUICK_LINKS.filter((link) =>
    link.roles.includes(me.role),
  )

  const demandDelta =
    overview && overview.avg_demand_change !== 0
      ? `${overview.avg_demand_change > 0 ? "+" : ""}${overview.avg_demand_change.toFixed(1)}%`
      : undefined

  const stats = [
    {
      label: "Total Jobs",
      value: (overview?.total_jobs ?? 0).toLocaleString(),
      hint: overview
        ? `${overview.active_jobs.toLocaleString()} active`
        : "Loading…",
      delta: overview ? `${overview.expired_jobs.toLocaleString()} expired` : undefined,
      tone: "blue" as const,
      icon: BriefcaseBusiness,
    },
    {
      label: "Enriched Contacts",
      value: (overview?.enriched_contacts ?? 0).toLocaleString(),
      hint: overview
        ? `${overview.classified_jobs.toLocaleString()} classified`
        : "Loading…",
      delta: undefined,
      tone: "amber" as const,
      icon: Sparkles,
    },
    {
      label: "Active Sources",
      value: String(overview?.active_sources ?? 0),
      hint: overview
        ? `${overview.healthy_sources} healthy`
        : "Loading…",
      delta: undefined,
      tone: "rose" as const,
      icon: Cable,
    },
    {
      label: "Demand Change",
      value:
        overview && overview.avg_demand_change !== 0
          ? `${overview.avg_demand_change > 0 ? "+" : ""}${overview.avg_demand_change.toFixed(1)}%`
          : "0%",
      hint: "30-day average across roles",
      delta: demandDelta,
      tone: "green" as const,
      icon: TrendingUp,
    },
  ]

  const recentRuns = overview?.recent_runs ?? []

  return (
    <AppShell user={me} loading={loading || overviewLoading}>
      <div className="wrap section-rhythm flex flex-col gap-6">
        {/* Stat-led hero — figure leads, copy pulls weight from the number */}
        <section className="promo-card-bg overflow-hidden rounded-2xl px-6 py-8 text-banner-foreground sm:px-8">
          <div className="grid grid-cols-1 items-end gap-x-10 gap-y-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/60">
                Demand overview · {me.role.replace(/_/g, " ").toLowerCase()}
              </p>
              <p className="stat-num font-display mt-3" style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)" }}>
                {(overview?.total_jobs ?? 0).toLocaleString()}
              </p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-white/60">
                Jobs tracked
              </p>
            </div>
            <div className="lg:col-span-5 lg:pb-2">
              <p className="font-display max-w-[24ch] text-2xl leading-tight text-balance">
                Hiring demand, <em className="italic">filed by hand</em> from live postings.
              </p>
              <p className="mt-3 max-w-[44ch] text-sm leading-relaxed text-white/70">
                {(overview?.active_jobs ?? 0).toLocaleString()} active · {(overview?.enriched_contacts ?? 0).toLocaleString()} enriched contacts · {(overview?.healthy_sources ?? 0)} healthy sources
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/jobs" className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-[13px] font-semibold text-slate-900 transition-colors hover:bg-white/90">
                  Open Job Explorer
                </Link>
                <Link href="/trends" className="inline-flex h-8 items-center rounded-lg border border-white/20 px-3 text-[13px] font-medium text-white transition-colors hover:bg-white/10">
                  View trends
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stat row — 4 real numbers, tabular-nums, hairline cards */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              hint={stat.hint}
              delta={stat.delta}
              tone={stat.tone}
              icon={stat.icon}
            />
          ))}
        </div>

        {/* Bento — lead tile spans 2 cols, smaller tiles extend it */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="bento-tile shadow-none lg:col-span-2 lg:row-span-1">
            <CardHeader>
              <p className="text-meta text-muted-foreground">Workbench</p>
              <CardTitle className="font-display text-xl tracking-tight">
                Quick actions
              </CardTitle>
              <CardDescription>
                Jump into the tools you use most — {visibleLinks.length} available for your role
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="group">
                    <div
                      className={cn(
                        "flex h-full items-start justify-between gap-3 rounded-xl border border-transparent p-3.5 transition-all hover:border-border hover:bg-muted/50",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn("flex size-9 items-center justify-center rounded-lg", link.tile)}>
                          <link.icon className="size-4" />
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[13px] font-semibold text-foreground">
                            {link.title}
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{link.description}</p>
                        </div>
                      </div>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <Card className="bento-tile shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <p className="text-meta text-muted-foreground">Pipeline</p>
                  <Clock3 className="size-3.5 text-muted-foreground" />
                </div>
                <CardTitle className="font-display text-lg tracking-tight">
                  Recent activity
                </CardTitle>
                <CardDescription>Latest ingestion runs</CardDescription>
              </CardHeader>
              <CardContent>
                {recentRuns.length === 0 ? (
                  <EmptyState
                    icon={Clock3}
                    title="No recent runs"
                    description="Ingestion activity will appear here after the first pipeline run."
                  />
                ) : (
                  <div className="flex flex-col">
                    {recentRuns.slice(0, 5).map((run) => (
                      <div key={run.id} className="flex items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/50">
                        <span
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            run.status === "completed" && "bg-chart-1",
                            run.status === "failed" && "bg-destructive",
                            run.status === "partial" && "bg-chart-4",
                            (run.status === "running" || run.status === "pending") &&
                              "bg-chart-2",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {run.provider} · {run.status}
                          </p>
                          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {run.fetched_count.toLocaleString()} fetched
                            {run.error_count > 0
                              ? ` · ${run.error_count} err`
                              : ""}{" "}
                            · {relativeTime(run.started_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bento-tile shadow-none">
              <CardHeader className="pb-2">
                <p className="text-meta text-muted-foreground">Demand mix</p>
                <CardTitle className="font-display text-lg tracking-tight">
                  Where work clusters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={[
                    { label: "Active postings", value: overview?.active_jobs ?? 0 },
                    { label: "Classified", value: overview?.classified_jobs ?? 0 },
                    { label: "Enriched contacts", value: overview?.enriched_contacts ?? 0 },
                    { label: "Healthy sources", value: (overview?.healthy_sources ?? 0) * 12 },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
