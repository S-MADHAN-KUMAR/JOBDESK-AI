"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts"
import {
  Card,
  CardContent,
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
import { useProfile, useDemandTrends } from "@/lib/hooks"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
}

export default function TrendsPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const [period, setPeriod] = useState(30)
  const { data: trends, isLoading: trendsLoading } = useDemandTrends(period, "role")

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const loading = profileLoading || trendsLoading

  function handlePeriodChange(value: string | null) {
    if (!value) return
    setPeriod(Number(value))
  }

  if (!me) return null

  if (profileError) {
    return (
      <AppShell user={me} loading>
        <div className="p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Access denied: Market Analyst role required.
          </div>
        </div>
      </AppShell>
    )
  }

  const sortedTrends = trends?.trends
    ? [...trends.trends].sort((a, b) => (b.total_net ?? 0) - (a.total_net ?? 0))
    : []

  const barData = sortedTrends.map((t) => ({
    name: t.role_category,
    net: t.total_net ?? 0,
    new: t.total_new ?? 0,
    expired: t.total_expired ?? 0,
  }))

  const areaData = sortedTrends.map((t) => ({
    name: t.role_category.substring(0, 12),
    growth: t.avg_change_pct ?? 0,
  }))

  const totalUp = sortedTrends.filter((t) => (t.total_net ?? 0) > 0).length
  const totalDown = sortedTrends.filter((t) => (t.total_net ?? 0) < 0).length

  return (
    <AppShell user={me} loading={loading}>
      <div className="p-4 sm:p-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Demand Trends
            </h1>
            <p className="text-sm text-muted-foreground">
              Hiring demand growth and decline across {period} days
            </p>
          </div>
          <Select value={String(period)} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        {sortedTrends.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <p className="text-muted-foreground">No trend data available for this period.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="size-4 text-primary" />
                    Net Change by Role
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData} margin={{ left: 0, right: 10, top: 5, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(0,0%,90%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      />
                      <ReferenceLine y={0} stroke="hsl(0,0%,60%)" strokeDasharray="3 3" />
                      <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, i) => (
                          <Cell key={i} fill={entry.net >= 0 ? "hsl(142,55%,50%)" : "hsl(0,60%,50%)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>

            {areaData.length > 0 && (
              <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Growth Rate Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={areaData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                        <defs>
                          <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(142,55%,50%)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(142,55%,50%)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(0,0%,90%)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="growth"
                          stroke="hsl(142,55%,50%)"
                          strokeWidth={2}
                          fill="url(#growthGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Growing Roles</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">{totalUp}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Declining Roles</p>
                    <p className="mt-1 text-2xl font-bold text-red-600">{totalDown}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Total Roles Tracked</p>
                    <p className="mt-1 text-2xl font-bold">{sortedTrends.length}</p>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedTrends.map((trend, i) => {
                const net = trend.total_net ?? 0
                const pct = trend.avg_change_pct ?? 0
                const isUp = net > 0
                const isDown = net < 0
                return (
                  <motion.div key={i} custom={i + 3} variants={fadeUp} initial="hidden" animate="visible">
                    <Card className="hover:shadow-md transition-shadow duration-300">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium truncate">{trend.role_category}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {trend.total_new ?? 0} new · {trend.total_expired ?? 0} expired
                            </p>
                          </div>
                          <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            isUp ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                            isDown ? 'bg-red-500/10 text-red-700 dark:text-red-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {isUp ? <ArrowUpRight className="size-3" /> :
                             isDown ? <ArrowDownRight className="size-3" /> :
                             <Minus className="size-3" />}
                            {Math.abs(pct).toFixed(1)}%
                          </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className={`text-2xl font-bold ${isUp ? 'text-emerald-600' : isDown ? 'text-red-600' : ''}`}>
                            {net >= 0 ? '+' : ''}{net}
                          </span>
                          <span className="text-xs text-muted-foreground">net change</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
