"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Cable,
  LayoutDashboard,
  Sparkles,
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
import { Loader } from "@/components/loader"
import { ROLE_LABELS, type User, fetchProfile } from "@/lib/api"
import { cn } from "@/lib/utils"

const QUICK_LINKS = [
  {
    href: "/jobs",
    title: "Job Explorer",
    description: "Browse and trace raw job records",
    icon: BriefcaseBusiness,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "bg-chart-1/15 text-chart-5",
  },
  {
    href: "/enrichment",
    title: "Contact Enrichment",
    description: "Find recruiters via the provider waterfall",
    icon: Sparkles,
    roles: ["ADMIN", "MARKET_ANALYST"],
    tile: "bg-chart-2/15 text-chart-2",
  },
  {
    href: "/admin/users",
    title: "User Management",
    description: "Create users and assign roles",
    icon: Users,
    roles: ["ADMIN"],
    tile: "bg-chart-3/15 text-chart-3",
  },
  {
    href: "/admin/sources",
    title: "Source Management",
    description: "Configure and run job ingestion",
    icon: Cable,
    roles: ["ADMIN"],
    tile: "bg-chart-4/15 text-chart-4",
  },
]

export default function Home() {
  const router = useRouter()
  const [me, setMe] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProfile()
      .then(setMe)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/30">
        <Loader label="Loading..." />
      </main>
    )
  }

  if (!me) return null

  const visibleLinks = QUICK_LINKS.filter((link) =>
    link.roles.includes(me.role),
  )

  return (
    <AppShell user={me}>
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <LayoutDashboard className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Welcome back, {me.first_name || me.username}
              </h1>
              <p className="text-sm text-muted-foreground">
                Your demand acceleration workspace
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="w-fit border-primary/30 bg-primary/10 text-primary"
          >
            {ROLE_LABELS[me.role]}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {visibleLinks.map((link) => (
            <Link key={link.href} href={link.href} className="group">
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg",
                        link.tile,
                      )}
                    >
                      <link.icon className="size-4" />
                    </span>
                    <div className="space-y-1">
                      <CardTitle className="text-sm">{link.title}</CardTitle>
                      <CardDescription>{link.description}</CardDescription>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Your access is governed by role-based permissions enforced by the
              backend (RBAC).
            </CardDescription>
          </CardHeader>
          <CardContent className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Use the sidebar to navigate. Job Explorer lets you browse raw job
            records, Enrichment finds recruiters and TA contacts, and admin
            pages manage users and data sources.
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}