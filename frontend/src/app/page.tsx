"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { StatCard } from "@/components/page-header"
import { useProfile } from "@/lib/hooks"
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

const STAT_CARDS = [
  {
    label: "Total Jobs",
    value: "12,847",
    hint: "+18.5% vs last month",
    tone: "blue" as const,
    icon: BriefcaseBusiness,
  },
  {
    label: "Enriched Contacts",
    value: "3,256",
    hint: "+25.3% enrichment rate",
    tone: "amber" as const,
    icon: Sparkles,
  },
  {
    label: "Active Sources",
    value: "8",
    hint: "2 providers healthy",
    tone: "rose" as const,
    icon: Cable,
  },
  {
    label: "Demand Score",
    value: "88.4",
    hint: "Across tracked roles",
    tone: "green" as const,
    icon: TrendingUp,
  },
]

const RECENT_ACTIVITY = [
  {
    action: "Job ingestion completed",
    source: "SerpApi",
    time: "2 min ago",
    status: "success",
  },
  {
    action: "Contact enrichment run",
    source: "ContactOut",
    time: "15 min ago",
    status: "success",
  },
  {
    action: "Source rate limited",
    source: "Apollo",
    time: "1 hour ago",
    status: "warning",
  },
  {
    action: "New user created",
    source: "Admin",
    time: "3 hours ago",
    status: "info",
  },
]

export default function Home() {
  const router = useRouter()
  const { data: me, isLoading: loading, error } = useProfile()

  useEffect(() => {
    if (error) router.push("/login")
  }, [error, router])

  if (!me) return null

  const visibleLinks = QUICK_LINKS.filter((link) =>
    link.roles.includes(me.role),
  )

  return (
    <AppShell user={me} loading={loading}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STAT_CARDS.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              hint={stat.hint}
              tone={stat.tone}
              icon={stat.icon}
            />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Quick Actions
              </CardTitle>
              <CardDescription>
                Jump into the tools you use most
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="group">
                    <div
                      className={cn(
                        "flex h-full items-start justify-between gap-3 rounded-2xl border border-transparent p-4 transition-all hover:border-border hover:bg-card hover:shadow-sm",
                        link.tile,
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-white/70 dark:bg-black/20">
                          <link.icon className="size-5" />
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-sm font-semibold text-foreground">
                            {link.title}
                          </p>
                          <p className="text-xs opacity-70">{link.description}</p>
                        </div>
                      </div>
                      <ArrowUpRight className="size-4 shrink-0 opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-chart-4" />
                <CardTitle className="text-base font-semibold">
                  Recent Activity
                </CardTitle>
              </div>
              <CardDescription>Latest updates across your workspace</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {RECENT_ACTIVITY.map((activity, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        activity.status === "success" && "bg-primary",
                        activity.status === "warning" && "bg-chart-4",
                        activity.status === "info" && "bg-chart-2",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {activity.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.source} &middot; {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
