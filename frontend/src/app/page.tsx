"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  ArrowUpRight as TrendUp,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Cable,
  Layers,
  LayoutDashboard,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AppShell } from "@/components/app-shell"
import { ROLE_LABELS, type User } from "@/lib/api"
import { useProfile } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const QUICK_LINKS = [
  {
    href: "/jobs",
    title: "Job Explorer",
    description: "Browse and trace raw job records",
    icon: BriefcaseBusiness,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "bg-primary/10 text-primary",
  },
  {
    href: "/enrichment",
    title: "Contact Enrichment",
    description: "Find recruiters via the provider waterfall",
    icon: Sparkles,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "bg-chart-2/10 text-chart-2",
  },
  {
    href: "/ceo",
    title: "Executive Summary",
    description: "Market overview and strategic intelligence",
    icon: BarChart3,
    roles: ["ADMIN", "CEO_MANAGEMENT"],
    tile: "bg-chart-3/10 text-chart-3",
  },
  {
    href: "/trends",
    title: "Demand Trends",
    description: "7/30/60/90-day hiring demand movements",
    icon: TrendingUp,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "bg-chart-4/10 text-chart-4",
  },
  {
    href: "/training",
    title: "Skill Intelligence",
    description: "Technology and skill matrices by role",
    icon: Layers,
    roles: ["ADMIN", "TRAINING_MANAGER"],
    tile: "bg-amber-500/10 text-amber-600",
  },
  {
    href: "/recruitment",
    title: "Employer Intelligence",
    description: "Hiring patterns and opportunity scores",
    icon: Building2,
    roles: ["ADMIN", "RECRUITMENT_TEAM"],
    tile: "bg-emerald-500/10 text-emerald-600",
  },
  {
    href: "/admin/users",
    title: "User Management",
    description: "Create users and assign roles",
    icon: Users,
    roles: ["ADMIN"],
    tile: "bg-chart-5/10 text-chart-5",
  },
  {
    href: "/admin/sources",
    title: "Source Management",
    description: "Configure and run job ingestion",
    icon: Cable,
    roles: ["ADMIN"],
    tile: "bg-rose-500/10 text-rose-600",
  },
]

const STAT_CARDS = [
  {
    label: "Total Jobs",
    value: "12,847",
    change: "+18.5%",
    trend: "up" as const,
    color: "bg-primary/10 text-primary",
  },
  {
    label: "Enriched Contacts",
    value: "3,256",
    change: "+25.3%",
    trend: "up" as const,
    color: "bg-chart-2/10 text-chart-2",
  },
  {
    label: "Active Sources",
    value: "8",
    change: "+2",
    trend: "up" as const,
    color: "bg-chart-3/10 text-chart-3",
  },
]

const RECENT_ACTIVITY = [
  { action: "Job ingestion completed", source: "SerpApi", time: "2 min ago", status: "success" },
  { action: "Contact enrichment run", source: "PDL", time: "15 min ago", status: "success" },
  { action: "Source rate limited", source: "Apollo", time: "1 hour ago", status: "warning" },
  { action: "New user created", source: "Admin", time: "3 hours ago", status: "info" },
]

export default function Home() {
  const router = useRouter()
  const { data: me, isLoading: loading, error } = useProfile()

  useEffect(() => {
    if (error) router.push("/login")
  }, [error, router])

  if (!me) return null

  const visibleLinks = me
    ? QUICK_LINKS.filter((link) => link.roles.includes(me.role))
    : []

  return (
    <AppShell user={me} loading={loading}>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {me?.first_name || me?.username}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary px-3 py-1 text-xs"
          >
            {me ? ROLE_LABELS[me.role] : ""}
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {STAT_CARDS.map((stat) => (
            <Card key={stat.label} className="card-hover overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
                      {stat.value}
                    </p>
                  </div>
                  <span className={cn("flex size-10 items-center justify-center rounded-xl", stat.color)}>
                    <TrendingUp className="size-5" />
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    <TrendUp className="size-3" />
                    {stat.change}
                  </span>
                  <span className="text-xs text-muted-foreground">last month</span>
                </div>
                <div className="mt-3 h-12 w-full overflow-hidden rounded-lg bg-muted/30">
                  <svg viewBox="0 0 200 50" className="h-full w-full" preserveAspectRatio="none">
                    <path
                      d="M0,40 Q25,35 50,30 T100,20 T150,15 T200,10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-primary/60"
                    />
                    <path
                      d="M0,40 Q25,35 50,30 T100,20 T150,15 T200,10 V50 H0 Z"
                      fill="currentColor"
                      className="text-primary/10"
                    />
                  </svg>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Access your most-used tools and features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="group">
                    <Card className="h-full transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5">
                      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "flex size-10 items-center justify-center rounded-xl",
                              link.tile,
                            )}
                          >
                            <link.icon className="size-5" />
                          </span>
                          <div className="space-y-1">
                            <CardTitle className="text-sm">{link.title}</CardTitle>
                            <CardDescription className="text-xs">
                              {link.description}
                            </CardDescription>
                          </div>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest system events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {RECENT_ACTIVITY.map((activity, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1 size-2 shrink-0 rounded-full",
                        activity.status === "success" && "bg-primary",
                        activity.status === "warning" && "bg-chart-4",
                        activity.status === "info" && "bg-chart-2",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
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

        <Card>
          <CardHeader>
            <CardTitle>Platform Overview</CardTitle>
            <CardDescription>
              Your access is governed by role-based permissions enforced by the backend (RBAC).
            </CardDescription>
          </CardHeader>
          <CardContent className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
            Use the sidebar to navigate. Job Explorer lets you browse raw job records,
            Enrichment finds recruiters and TA contacts, and admin pages manage users
            and data sources.
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
