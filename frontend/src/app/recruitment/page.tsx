"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Building2,
  Star,
  Repeat,
  Users,
  BarChart3,
  Target,
  ExternalLink,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts"
import {
  Card,
  CardContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppShell } from "@/components/app-shell"
import { useProfile, useRecurringHiring, useEmployerScores } from "@/lib/hooks"

const CHART_COLORS = ["hsl(142,55%,50%)", "hsl(35,85%,55%)", "hsl(220,65%,55%)", "hsl(270,60%,55%)", "hsl(160,50%,45%)"]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
}

export default function RecruitmentPage() {
  const router = useRouter()
  const { data: me, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: recurringResult, isLoading: recurringLoading } = useRecurringHiring()
  const [scoreFilter, setScoreFilter] = useState<string>("all")

  const scoreRange = (() => {
    if (scoreFilter === "high") return { min: 70, max: 100 }
    if (scoreFilter === "medium") return { min: 40, max: 69 }
    if (scoreFilter === "low") return { min: 0, max: 39 }
    return { min: undefined, max: undefined }
  })()
  const { data: scoresData, isLoading: scoresLoading } = useEmployerScores(scoreRange.min, scoreRange.max)

  useEffect(() => {
    if (profileError) router.push("/login")
  }, [profileError, router])

  const loading = profileLoading || recurringLoading || scoresLoading
  const recurring = recurringResult?.companies ?? []
  const scores = scoresData?.scores ?? []

  if (!me) return null

  if (profileError) {
    return (
      <AppShell user={me} loading>
        <div className="p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Access denied: Recruitment / Employer Team role required.
          </div>
        </div>
      </AppShell>
    )
  }

  const recurringChartData = recurring.slice(0, 10).map((c) => ({
    name: c.company_name_raw.substring(0, 18),
    postings: c.total_postings,
    roles: c.unique_roles,
  }))

  const scoreDistribution = [
    { name: "High (70-100)", value: scores.filter((s) => s.hiring_score >= 70).length },
    { name: "Medium (40-69)", value: scores.filter((s) => s.hiring_score >= 40 && s.hiring_score < 70).length },
    { name: "Low (0-39)", value: scores.filter((s) => s.hiring_score < 40).length },
  ].filter((d) => d.value > 0)

  const scatterData = scores.map((s) => ({
    name: s.company_name.substring(0, 15),
    score: s.hiring_score,
    postings: s.active_postings,
    roles: s.unique_roles,
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
            Recruitment Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Employer hiring patterns, opportunity scores, and outreach targets
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Repeat, label: "High-Volume Companies", value: recurring.length },
            { icon: Star, label: "Top Opportunity Score", value: scores.length > 0 ? scores[0].hiring_score.toFixed(0) : "—" },
            { icon: Users, label: "Total Scored Companies", value: scores.length },
          ].map((stat, i) => (
            <motion.div key={stat.label} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <Card className="hover:shadow-md transition-shadow duration-300">
                <CardContent className="p-4">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <stat.icon className="size-3.5" />
                    {stat.label}
                  </p>
                  <p className="mt-1 text-3xl font-bold">{stat.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {recurringChartData.length > 0 && (
            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Repeat className="size-4 text-primary" />
                    Recurring Hiring by Company
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={recurringChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(0,0%,90%)" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                      <Bar dataKey="postings" name="Total Postings" radius={[0, 6, 6, 0]}>
                        {recurringChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {scoreDistribution.length > 0 && (
            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="size-4 text-primary" />
                    Score Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={scoreDistribution}
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
                        <Cell fill="hsl(0,60%,50%)" />
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {scatterData.length > 0 && (
          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="size-4 text-primary" />
                  Score vs Active Postings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,90%)" />
                    <XAxis dataKey="postings" name="Active Postings" tick={{ fontSize: 12 }} label={{ value: "Active Postings", position: "insideBottom", offset: -5, fontSize: 11 }} />
                    <YAxis dataKey="score" name="Score" tick={{ fontSize: 12 }} label={{ value: "Score", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <ZAxis dataKey="roles" range={[60, 200]} name="Unique Roles" />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(0,0%,88%)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      formatter={(_, __, props) => [`${props.payload.name}`, "Company"]}
                    />
                    <Scatter data={scatterData} fill="hsl(142,55%,50%)" fillOpacity={0.7} strokeWidth={1} stroke="hsl(142,55%,50%)" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Repeat className="size-4" />
                  Recurring Hiring Detector
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recurring.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No high-volume hiring companies detected yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Roles</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurring.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{c.company_name_raw}</TableCell>
                          <TableCell className="text-right font-mono">{c.total_postings}</TableCell>
                          <TableCell className="text-right font-mono">{c.unique_roles}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <BarChart3 className="size-4" />
                    Employer Opportunity Scores
                  </span>
                  <Select value={scoreFilter} onValueChange={(v) => v && setScoreFilter(v)}>
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All scores</SelectItem>
                      <SelectItem value="high">High (70-100)</SelectItem>
                      <SelectItem value="medium">Medium (40-69)</SelectItem>
                      <SelectItem value="low">Low (0-39)</SelectItem>
                    </SelectContent>
                  </Select>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {scores.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No employer scores available yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                        <TableHead className="text-right">Roles</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scores.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            {s.company_id ? (
                              <Link
                                href={`/companies/${s.company_id}`}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {s.company_name}
                                <ExternalLink className="size-3 opacity-70" />
                              </Link>
                            ) : (
                              s.company_name
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              s.hiring_score >= 70 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                              s.hiring_score >= 40 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' :
                              'bg-red-500/10 text-red-700 dark:text-red-400'
                            }`}>
                              {s.hiring_score.toFixed(0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">{s.active_postings}</TableCell>
                          <TableCell className="text-right font-mono">{s.unique_roles}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </AppShell>
  )
}
