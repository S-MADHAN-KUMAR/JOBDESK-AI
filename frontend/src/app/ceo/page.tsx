"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  BarChart3,
  Building2,
  MapPin,
  TrendingUp,
  Users,
  Briefcase,
  AlertTriangle,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AppShell } from "@/components/app-shell"
import { useProfile, useExecutiveSummary, useCEODemandMovements, useCEOSkillSummary } from "@/lib/hooks"

const CHART_COLORS = ["hsl(142,55%,50%)", "hsl(35,85%,55%)", "hsl(220,65%,55%)", "hsl(270,60%,55%)", "hsl(160,50%,45%)"]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
}

function AnimatedCounter({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const step = value / (duration * 60)
    const timer = setInterval(() => {
      start += step
      if (start >= value) {
        setCount(value)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 1000 / 60)
    return () => clearInterval(timer)
  }, [value, duration])
  return <span>{count.toLocaleString()}</span>
}

export default function CEODashboardPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: summary, isLoading: summaryLoading } = useExecutiveSummary()
  const { data: movementsData, isLoading: movementsLoading } = useCEODemandMovements(30)
  const { data: skills, isLoading: skillsLoading } = useCEOSkillSummary()

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const loading = profileLoading || summaryLoading || movementsLoading || skillsLoading
  const movements = movementsData?.movements ?? []

  if (!me) return null

  if (profileError) {
    return (
      <AppShell user={me} loading>
        <div className="p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Access denied: CEO / Management role required.
          </div>
        </div>
      </AppShell>
    )
  }

  const hubsData = summary?.top_hubs.map((h) => ({ name: h.location_raw.split(",")[0], count: h.job_count })) ?? []
  const companiesData = summary?.top_companies.map((c) => ({ name: c.company_name_raw, count: c.job_count })) ?? []
  const rolesData = summary?.top_roles.map((r) => ({ name: r.role_category, count: r.count })) ?? []
  const pieData = summary ? [
    { name: "Active", value: summary.active_jobs },
    { name: "Expired", value: summary.expired_jobs },
  ] : []
  const movementData = movements.slice(0, 10).map((m) => ({
    name: m.role_category,
    change: m.net_change,
  }))

  return (
    <AppShell user={me} loading={loading}>
      <div className="p-4 sm:p-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Executive Summary
          </h1>
          <p className="text-sm text-muted-foreground">
            High-level market oversight and strategic intelligence
          </p>
        </motion.div>

        {summary && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Briefcase, label: "Total Jobs", value: summary.total_jobs, color: "" },
              { icon: TrendingUp, label: "Active Listings", value: summary.active_jobs, color: "text-emerald-600" },
              { icon: AlertTriangle, label: "Expired Listings", value: summary.expired_jobs, color: "text-amber-600" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
              >
                <Card className="hover:shadow-md transition-shadow duration-300">
                  <CardContent className="p-4">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <stat.icon className="size-3.5" />
                      {stat.label}
                    </p>
                    <p className={`mt-1 text-3xl font-bold tabular-nums ${stat.color}`}>
                      <AnimatedCounter value={stat.value} />
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {hubsData.length > 0 && (
            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="size-4 text-primary" />
                    Top Hiring Hubs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={hubsData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(0,0%,90%)" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                        {hubsData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {pieData.length > 0 && (
            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-4 text-primary" />
                    Job Status Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        <Cell fill="hsl(142,55%,50%)" />
                        <Cell fill="hsl(35,85%,55%)" />
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)" }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {companiesData.length > 0 && (
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 text-primary" />
                    Top Hiring Companies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={companiesData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(0,0%,90%)" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="hsl(142,55%,50%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {movementData.length > 0 && (
            <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-4 text-primary" />
                    30-Day Demand Movements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={movementData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(0,0%,90%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      />
                      <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                        {movementData.map((entry, i) => (
                          <Cell key={i} fill={entry.change >= 0 ? "hsl(142,55%,50%)" : "hsl(0,60%,50%)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {rolesData.length > 0 && (
          <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-primary" />
                  Top Role Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={rolesData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(0,0%,90%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {rolesData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {skills && (
          <div className="grid gap-6 lg:grid-cols-2">
            {skills.top_technologies.length > 0 && (
              <motion.div custom={8} variants={fadeUp} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">High-Demand Technologies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {skills.top_technologies.map((t, i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05, duration: 0.3 }}
                          className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary"
                        >
                          {t.name}
                          <span className="ml-1 text-primary/70">{t.count}</span>
                        </motion.span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
            {skills.top_skills.length > 0 && (
              <motion.div custom={9} variants={fadeUp} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">In-Demand Skills</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {skills.top_skills.map((s, i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05, duration: 0.3 }}
                          className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
                        >
                          {s.name}
                          <span className="ml-1 text-muted-foreground">{s.count}</span>
                        </motion.span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
